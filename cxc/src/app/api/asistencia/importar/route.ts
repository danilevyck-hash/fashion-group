// ─────────────────────────────────────────────────────────────────────────────
// POST /api/asistencia/importar — sube el Excel que exporta iVMS-4200.
//
// Puente mientras no se tiene la contraseña de red del reloj. Escribe en la
// MISMA tabla que va a usar el agente automático, con la misma protección
// anti-duplicados. Ver `lib/asistencia/importar-excel.ts` para el porqué del id
// derivado del contenido.
//
// Dos modos:
//   ?preview=1 → lee el archivo y devuelve QUÉ haría, sin guardar nada.
//   sin flag   → guarda.
// El preview existe porque el formato del Excel de iVMS cambia entre versiones
// e idiomas: mejor que Daniel VEA qué columnas se reconocieron y cuántas filas
// entran, antes de escribir en la tabla.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx-js-style";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { importarFilas, type FilaExcel } from "@/lib/asistencia/importar-excel";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_FILAS = 20000;

export async function POST(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Envía el archivo como formulario" }, { status: 400 });
  }

  const archivo = form.get("archivo");
  const dispositivo = String(form.get("dispositivo") ?? "").trim();
  if (!(archivo instanceof File)) {
    return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
  }
  if (!dispositivo) {
    return NextResponse.json({ error: "Falta indicar de qué reloj es" }, { status: 400 });
  }

  let filasCrudas: FilaExcel[];
  let encabezados: string[];
  try {
    const buf = Buffer.from(await archivo.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
    const hoja = wb.Sheets[wb.SheetNames[0]];
    if (!hoja) throw new Error("el archivo no tiene hojas");
    filasCrudas = XLSX.utils.sheet_to_json<FilaExcel>(hoja, { defval: null });
    // Los encabezados se leen aparte: `sheet_to_json` los pierde si la primera
    // fila tiene celdas vacías, y sin ellos no se pueden detectar las columnas.
    const cab = XLSX.utils.sheet_to_json<string[]>(hoja, { header: 1, range: 0 })[0] ?? [];
    encabezados = cab.map((c) => String(c ?? "")).filter(Boolean);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "no se pudo leer";
    return NextResponse.json({ error: `No pude leer el archivo: ${msg}` }, { status: 400 });
  }

  if (filasCrudas.length > MAX_FILAS) {
    return NextResponse.json(
      { error: `El archivo tiene ${filasCrudas.length} filas; el máximo es ${MAX_FILAS}. Súbelo por partes.` },
      { status: 400 },
    );
  }

  const { filas, descartadas, columnas } = importarFilas(dispositivo, filasCrudas, encabezados);

  const resumen = {
    dispositivo,
    encabezados,
    columnasDetectadas: columnas,
    filasEnArchivo: filasCrudas.length,
    listasParaGuardar: filas.length,
    descartadas: descartadas.length,
    // Las primeras, para que se vea el motivo sin abrir el archivo.
    ejemplosDescartados: descartadas.slice(0, 10),
    // Muestra de lo que se va a guardar: la mejor forma de cazar una fecha mal
    // interpretada es VERLA antes de escribir.
    muestra: filas.slice(0, 5).map((f) => ({
      empleado: f.empleado_nombre ?? f.empleado_codigo,
      ocurrio_en: f.ocurrio_en,
      tipo: f.tipo,
    })),
    rango: filas.length
      ? {
          desde: filas.reduce((a, f) => (f.ocurrio_en < a ? f.ocurrio_en : a), filas[0].ocurrio_en),
          hasta: filas.reduce((a, f) => (f.ocurrio_en > a ? f.ocurrio_en : a), filas[0].ocurrio_en),
        }
      : null,
  };

  if (req.nextUrl.searchParams.get("preview") === "1") {
    return NextResponse.json({ ok: true, preview: true, ...resumen });
  }

  if (filas.length === 0) {
    return NextResponse.json(
      { error: "No hay ninguna fila utilizable en el archivo", ...resumen },
      { status: 400 },
    );
  }

  // De a lotes: 20.000 filas en un solo upsert revienta el tamaño del request.
  let guardadas = 0;
  for (let i = 0; i < filas.length; i += 500) {
    const lote = filas.slice(i, i + 500);
    const { error } = await supabaseServer
      .from("asistencia_marcaciones")
      // ignoreDuplicates: subir dos veces el mismo Excel —o dos Excels con días
      // solapados— no puede duplicar marcaciones.
      .upsert(lote, { onConflict: "dispositivo,evento_id", ignoreDuplicates: true });
    if (error) {
      console.error("[asistencia/importar] upsert falló:", error.message);
      return NextResponse.json(
        { error: `Se guardaron ${guardadas} y falló el resto: ${error.message}` },
        { status: 500 },
      );
    }
    guardadas += lote.length;
  }

  await supabaseServer.from("asistencia_dispositivos").upsert(
    {
      dispositivo,
      visto_en: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      // ⚠️ NO se toca `leido_hasta`: ese campo es del agente automático y marca
      // hasta dónde leyó DEL RELOJ. Moverlo desde acá haría que el agente, al
      // arrancar, se saltee todo lo que el Excel cubrió — y si el Excel venía
      // incompleto, esas marcaciones no se recuperarían nunca.
    },
    { onConflict: "dispositivo" },
  );

  return NextResponse.json({ ok: true, guardadas, ...resumen });
}
