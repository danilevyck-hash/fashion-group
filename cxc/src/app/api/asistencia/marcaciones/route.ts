// GET /api/asistencia/marcaciones?desde=&hasta=&dispositivo=&empleado=
//
// Devuelve las marcaciones del rango ya convertidas en JORNADAS (día por
// empleado, con horas). La conversión vive en `lib/asistencia/jornadas.ts`.

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { armarJornadas, resumir, type MarcacionCruda } from "@/lib/asistencia/jornadas";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PANAMA_OFFSET = "-05:00";

/** `YYYY-MM-DD` → instante del inicio (o fin) de ese día en Panamá. */
function limite(dia: string, fin: boolean): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return null;
  const iso = `${dia}T${fin ? "23:59:59.999" : "00:00:00.000"}${PANAMA_OFFSET}`;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;

  const sp = req.nextUrl.searchParams;
  const desde = limite(sp.get("desde") ?? "", false);
  const hasta = limite(sp.get("hasta") ?? "", true);
  if (!desde || !hasta) {
    return NextResponse.json({ error: "Fechas inválidas (usa YYYY-MM-DD)" }, { status: 400 });
  }
  if (desde > hasta) {
    return NextResponse.json({ error: "La fecha inicial es posterior a la final" }, { status: 400 });
  }
  const dispositivo = (sp.get("dispositivo") ?? "").trim();
  const empleado = (sp.get("empleado") ?? "").trim().toLowerCase();

  let filas: MarcacionCruda[];
  try {
    // Paginado con verificación contra el COUNT: un mes de dos relojes puede
    // pasar de 1.000 filas, y PostgREST corta ahí EN SILENCIO. Un reporte de
    // horas recortado sin avisar es peor que uno que falla.
    filas = await leerTodoPaginado<MarcacionCruda>(
      "asistencia_marcaciones (consulta)",
      (pedirCount, from, to) => {
        let q = supabaseServer
          .from("asistencia_marcaciones")
          .select(
            "empleado_codigo, empleado_nombre, ocurrio_en, tipo",
            pedirCount ? { count: "exact" } : {},
          )
          .gte("ocurrio_en", desde)
          .lte("ocurrio_en", hasta);
        if (dispositivo) q = q.eq("dispositivo", dispositivo);
        // Orden estable y único para paginar sin repetir ni saltear filas.
        return q.order("ocurrio_en", { ascending: true }).order("id", { ascending: true }).range(from, to);
      },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[asistencia/marcaciones]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // El filtro por empleado va en memoria: acepta código o parte del nombre, y
  // el universo del rango ya está acotado por fecha.
  const visibles = empleado
    ? filas.filter(
        (f) =>
          (f.empleado_codigo ?? "").toLowerCase().includes(empleado) ||
          (f.empleado_nombre ?? "").toLowerCase().includes(empleado),
      )
    : filas;

  const jornadas = armarJornadas(visibles);
  return NextResponse.json({
    jornadas,
    resumen: resumir(jornadas),
    marcaciones: visibles.length,
  });
}
