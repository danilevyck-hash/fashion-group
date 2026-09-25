// ─────────────────────────────────────────────────────────────────────────────
// GET /api/asistencia/marcaciones?desde=&hasta=&empresa= — lo que mandó el
// TELÉFONO, tal cual (25-sep-2026).
//
// 🔴 SOLO `admin`, Y LO DECIDE EL SERVIDOR. Cada marca trae selfie y ubicación:
// dónde estuvo una persona y qué cara tenía. Esconder la pestaña no cierra
// nada, así que la lista de roles es UNA (`MARCACIONES_ROLES`) y la miran la
// pantalla y esta ruta.
//
// 🔴 SOLO LEE. No escribe, no corrige, no borra. Corregir una hora sigue siendo
// el camino de siempre, con su motivo obligatorio y su firma.
//
// 🔴 SOLO EL TELÉFONO. Los relojes físicos mandan 8.138 de las 8.175 marcas de
// la base y no traen ni foto ni ubicación: sus filas serían renglones con «—»
// en las tres columnas por las que esta pantalla existe.
//
// ⚠️ EL LUGAR FALLA ABIERTO. Sin el nombre guardado, sin coordenada o sin punto
// de referencia, la celda dice «—» o dice menos. Nunca se afirma una distancia
// por no tener contra qué medir.
// ─────────────────────────────────────────────────────────────────────────────

import { NextResponse, type NextRequest } from "next/server";
import { requireAsistencia } from "@/lib/asistencia/guard";
import { empresaParaPedir } from "@/lib/asistencia/empresa-para-todo";
import { MARCACIONES_ROLES, MARCACIONES_PESTANA } from "@/lib/asistencia/marcaciones-pestana";
import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { DISPOSITIVO_TELEFONO } from "@/lib/marcacion/marcacion";
import { lugarDeMarca, referenciaDeLaEmpresa } from "@/lib/asistencia/lugar-de-marca";
import { leerLugaresReferencia } from "@/lib/asistencia/lugares-referencia-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PANAMA = "-05:00";

function limite(dia: string, fin: boolean): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return null;
  const ms = Date.parse(`${dia}T${fin ? "23:59:59.999" : "00:00:00.000"}${PANAMA}`);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** Una fila de `asistencia_marcaciones`, con lo que esta pantalla mira. */
interface FilaMarca {
  id: string;
  empleado_codigo: string;
  empleado_nombre: string | null;
  tipo: string | null;
  ocurrio_en: string;
  created_at: string | null;
  sin_senal: boolean | null;
  hora_telefono: string | null;
  foto_path: string | null;
  lat: number | null;
  lng: number | null;
  precision_m: number | null;
  marcada_por: string | null;
  // Las dos columnas del 25-sep-2026. Sin la migración vienen `undefined`.
  lugar_texto?: string | null;
  aparato_id?: string | null;
}

/**
 * 🔑 LAS COLUMNAS NUEVAS SE PIDEN, Y SI NO ESTÁN SE PIDE SIN ELLAS. Es la misma
 * forma de fallar ABIERTO que usa el resto del módulo: la pantalla sale igual,
 * con «Lugar» y «Aparato» en «—», hasta que Daniel corra la migración.
 */
const COLUMNAS_BASE =
  "id, empleado_codigo, empleado_nombre, tipo, ocurrio_en, created_at, sin_senal, hora_telefono, foto_path, lat, lng, precision_m, marcada_por";
const COLUMNAS_CON_NUEVAS = `${COLUMNAS_BASE}, lugar_texto, aparato_id`;

async function leerMarcas(
  columnas: string,
  iDesde: string,
  iHasta: string,
): Promise<FilaMarca[]> {
  return leerTodoPaginado<FilaMarca>(
    "asistencia_marcaciones (pestaña Marcaciones)",
    (pedirCount, from, to) =>
      supabaseServer
        .from("asistencia_marcaciones")
        .select(columnas, pedirCount ? { count: "exact" } : {})
        .eq("dispositivo", DISPOSITIVO_TELEFONO)
        .gte("ocurrio_en", iDesde)
        .lte("ocurrio_en", iHasta)
        .order("ocurrio_en", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
  );
}

export async function GET(req: NextRequest) {
  const auth = requireAsistencia(req, [...MARCACIONES_ROLES]);
  if (auth instanceof NextResponse) return auth;
  // Con el interruptor apagado la pestaña no existe ni por la URL.
  if (!MARCACIONES_PESTANA) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const iDesde = limite((sp.get("desde") ?? "").trim(), false);
  const iHasta = limite((sp.get("hasta") ?? "").trim(), true);
  if (!iDesde || !iHasta) {
    return NextResponse.json({ error: "Fechas inválidas (YYYY-MM-DD)" }, { status: 400 });
  }
  const empresaFiltro = empresaParaPedir(sp.get("empresa"));

  try {
    let filas: FilaMarca[];
    let hayColumnasNuevas = true;
    try {
      filas = await leerMarcas(COLUMNAS_CON_NUEVAS, iDesde, iHasta);
    } catch {
      hayColumnasNuevas = false;
      filas = await leerMarcas(COLUMNAS_BASE, iDesde, iHasta);
    }

    // La empresa sale de la FICHA, como en todo el módulo. Sin ficha no hay
    // empresa: esas marcas solo salen con «Todas».
    const { data: fichas } = await supabaseServer
      .from("asistencia_personas")
      .select("empleado_codigo, nombre, empresa");
    const empresaDeCodigo = new Map<string, string>();
    const nombreDeCodigo = new Map<string, string>();
    for (const f of (fichas ?? []) as Array<{ empleado_codigo: string; nombre: string | null; empresa: string | null }>) {
      const k = String(f.empleado_codigo);
      if (f.empresa) empresaDeCodigo.set(k, String(f.empresa));
      if (f.nombre) nombreDeCodigo.set(k, String(f.nombre));
    }

    const referencias = await leerLugaresReferencia();

    const marcas = filas
      .filter((f) => {
        if (!empresaFiltro) return true;
        return empresaDeCodigo.get(String(f.empleado_codigo)) === empresaFiltro;
      })
      .map((f) => {
        const codigo = String(f.empleado_codigo);
        const empresaKey = empresaDeCodigo.get(codigo) ?? null;
        const lugar = lugarDeMarca(
          { lat: f.lat, lng: f.lng, lugar_texto: f.lugar_texto ?? null },
          referenciaDeLaEmpresa(empresaKey, referencias),
        );
        return {
          id: String(f.id),
          codigo,
          nombre: String(f.empleado_nombre ?? nombreDeCodigo.get(codigo) ?? codigo),
          tipo: String(f.tipo ?? ""),
          ocurrioEn: f.ocurrio_en,
          creadoEn: f.created_at ?? null,
          sinSenal: f.sin_senal === true,
          horaTelefono: f.hora_telefono ?? null,
          tieneFoto: Boolean(f.foto_path),
          lat: typeof f.lat === "number" ? f.lat : null,
          lng: typeof f.lng === "number" ? f.lng : null,
          precisionM: typeof f.precision_m === "number" ? f.precision_m : null,
          aparatoId: f.aparato_id ?? null,
          empresaKey,
          lugar: {
            texto: lugar.texto,
            // 🔑 EL NOMBRE CRUDO, SIN LA DISTANCIA PEGADA (25-sep-2026). La
            // pantalla agrupada por día lo redacta a su manera —«Paso Canoas ·
            // 46 km de la tienda»— y parsear `texto` para separarlo sería
            // frágil. Es aditivo: `texto` no cambió un carácter.
            nombre: f.lugar_texto ?? null,
            // Se conserva el nombre del campo para la pantalla: «cerca del
            // punto de referencia de su empresa».
            enLaTienda: lugar.cercaDeLaReferencia,
            metros: lugar.metros,
          },
        };
      });

    return NextResponse.json({ marcas, hayColumnasNuevas });
  } catch (e) {
    console.error("[asistencia/marcaciones]", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: "No se pudieron leer las marcaciones. Intenta de nuevo en unos segundos." },
      { status: 500 },
    );
  }
}
