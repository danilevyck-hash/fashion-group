// GET /api/asistencia/reporte?desde=&hasta=&dispositivo=&q=
//
// El reporte completo: marcaciones + horarios + justificaciones + feriados,
// pasados por el motor de `lib/asistencia/reporte.ts`. Toda la regla vive allá;
// acá solo se junta el dato.

import { NextRequest, NextResponse } from "next/server";
import { asistenciaRoles } from "@/lib/asistencia/roles";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import {
  armarReporte,
  type Marcacion,
  type HorarioPersona,
  type Justificacion,
} from "@/lib/asistencia/reporte";
import { leerReglas } from "@/lib/asistencia/config-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PANAMA = "-05:00";

function limite(dia: string, fin: boolean): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return null;
  const ms = Date.parse(`${dia}T${fin ? "23:59:59.999" : "00:00:00.000"}${PANAMA}`);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

export async function GET(req: NextRequest) {
  const auth = requireRole(req, asistenciaRoles());
  if (auth instanceof NextResponse) return auth;

  const sp = req.nextUrl.searchParams;
  const desde = (sp.get("desde") ?? "").trim();
  const hasta = (sp.get("hasta") ?? "").trim();
  const iDesde = limite(desde, false);
  const iHasta = limite(hasta, true);
  if (!iDesde || !iHasta) {
    return NextResponse.json({ error: "Fechas inválidas (YYYY-MM-DD)" }, { status: 400 });
  }
  if (desde > hasta) {
    return NextResponse.json({ error: "La fecha inicial es posterior a la final" }, { status: 400 });
  }
  const dispositivo = (sp.get("dispositivo") ?? "").trim();
  const q = (sp.get("q") ?? "").trim().toLowerCase();

  try {
    // Paginado con verificación contra el COUNT: un mes de dos relojes con 4
    // marcas diarias pasa de 1.000 filas, y PostgREST corta ahí EN SILENCIO.
    // Un reporte de horas recortado sin avisar es peor que uno que falla.
    const marcaciones = await leerTodoPaginado<Marcacion>(
      "asistencia_marcaciones (reporte)",
      (pedirCount, from, to) => {
        let sel = supabaseServer
          .from("asistencia_marcaciones")
          .select("empleado_codigo, empleado_nombre, ocurrio_en", pedirCount ? { count: "exact" } : {})
          .gte("ocurrio_en", iDesde)
          .lte("ocurrio_en", iHasta);
        if (dispositivo) sel = sel.eq("dispositivo", dispositivo);
        return sel.order("ocurrio_en", { ascending: true }).order("id", { ascending: true }).range(from, to);
      },
    );

    // Las reglas configuradas. Sin la migración corrida devuelve los valores por
    // defecto en vez de tirar: el reporte tiene que salir igual.
    const { reglas } = await leerReglas();

    const [hRes, jRes, fRes] = await Promise.all([
      supabaseServer.from("asistencia_horarios").select("empleado_codigo, entrada, salida, almuerzo_minutos"),
      supabaseServer.from("asistencia_justificaciones").select("empleado_codigo, desde, hasta, motivo")
        .lte("desde", hasta).gte("hasta", desde),
      supabaseServer.from("asistencia_feriados").select("fecha, nombre").gte("fecha", desde).lte("fecha", hasta),
    ]);
    if (hRes.error) throw new Error(hRes.error.message);
    if (jRes.error) throw new Error(jRes.error.message);
    if (fRes.error) throw new Error(fRes.error.message);

    const visibles = q
      ? marcaciones.filter(
          (m) =>
            (m.empleado_codigo ?? "").toLowerCase().includes(q) ||
            (m.empleado_nombre ?? "").toLowerCase().includes(q),
        )
      : marcaciones;

    const personas = armarReporte({
      marcaciones: visibles,
      horarios: (hRes.data ?? []).map((h) => ({
        ...h,
        // Postgres devuelve time como "08:00:00"; el motor compara "HH:MM".
        entrada: String(h.entrada).slice(0, 5),
        salida: String(h.salida).slice(0, 5),
      })) as HorarioPersona[],
      justificaciones: (jRes.data ?? []) as Justificacion[],
      feriados: new Map((fRes.data ?? []).map((f) => [String(f.fecha), String(f.nombre)])),
      desde,
      hasta,
      reglas,
    });

    return NextResponse.json({
      personas,
      desde,
      hasta,
      // Se devuelven para que la pantalla, el Excel y el PDF digan los MISMOS
      // números que usó el motor. Un pie de página que dice "5 de tolerancia"
      // mientras el cálculo usa 10 es peor que no decir nada.
      reglas,
      // Para que la pantalla pueda avisar si alguien no tiene horario fijado:
      // sin él se asume 17:00 y el número puede estar mal.
      sinHorario: personas.filter((p) => !(hRes.data ?? []).some((h) => h.empleado_codigo === p.codigo)).length,
      marcaciones: visibles.length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[asistencia/reporte]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
