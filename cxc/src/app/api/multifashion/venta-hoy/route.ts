// ─────────────────────────────────────────────────────────────────────────────
// GET /api/multifashion/venta-hoy — la venta del día de American Classics.
//
// Sin parámetros: el día es SIEMPRE hoy en Panamá. Pedido de Daniel: ver en
// pantalla el mismo número que hoy sólo le llega por Telegram a las 8pm.
//
// El monto sale de la MISMA función que arma ese Telegram
// (`@/lib/multifashion/retail-dia`), y la lógica del día vive en
// `@/lib/multifashion/venta-hoy` — acá sólo se resuelve sesión, ventana y
// serialización.
//
// ── CANDADO gerente_acs ──────────────────────────────────────────────────────
// "Hoy" cae dentro del mes en curso, así que para Jennifer SIEMPRE está dentro
// de su ventana y el clamp nunca lo mueve. Igual va: la regla del módulo es que
// TODA ruta de /api/multifashion/* acota sus fechas con `auth.role` ANTES de
// tocar la base, y una ruta que se salta el clamp "porque su fecha siempre
// entra" es exactamente la que se rompe el día que alguien le agregue un
// parámetro. Los DÍAS COMPARATIVOS sí se caen de la ventana los primeros días
// de cada mes (el 3 de agosto, "hace 7 días" es julio): `clampDiaComparable`
// devuelve null y ese comparativo no se consulta ni se muestra.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { hoyPanama } from "@/lib/fecha-panama";
import { calcularVentaHoy, diasComparativos } from "@/lib/multifashion/venta-hoy";
import { clampFechaDia, clampDiaComparable } from "@/lib/multifashion/ventana-gerente";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 30;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = requireRole(req, ["admin", "secretaria", "contabilidad", "gerente_acs"]);
  if (auth instanceof NextResponse) return auth;

  const ahora = new Date();
  const hoy = hoyPanama(ahora);

  // El día reportado pasa por el clamp igual que cualquier otra fecha del
  // módulo (para el rol acotado es un no-op: hoy siempre está en su ventana).
  const fecha = clampFechaDia(auth.role, hoy, ahora).fecha;
  const dias = diasComparativos(fecha);

  try {
    const data = await calcularVentaHoy({
      fecha,
      ahora,
      semanaPasada: clampDiaComparable(auth.role, dias.semanaPasada, ahora),
      ayer: clampDiaComparable(auth.role, dias.ayer, ahora),
    });
    return NextResponse.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error inesperado";
    console.error("[multifashion/venta-hoy]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
