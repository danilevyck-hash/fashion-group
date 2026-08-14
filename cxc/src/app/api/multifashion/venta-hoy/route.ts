// ─────────────────────────────────────────────────────────────────────────────
// GET /api/multifashion/venta-hoy — la venta del día de American Classics.
//
// Sin parámetros: el día es SIEMPRE hoy en Panamá. Pedido de Daniel: ver en
// pantalla el mismo número que hoy sólo le llega por Telegram a las 8pm.
//
// El monto sale de la MISMA función que arma ese Telegram
// (`@/lib/multifashion/retail-dia`), y la lógica del día vive en
// `@/lib/multifashion/venta-hoy` — acá sólo se resuelve sesión y serialización.
//
// Los DOS comparativos (hace 7 días y ayer) se piden SIEMPRE, para todos los
// roles. Hasta el 13-ago-2026 los primeros días de cada mes se apagaban para
// `gerente_acs` porque caían fuera de su ventana; esa ventana se levantó (ver
// CLAUDE.md § Roles), así que ya no hay un rol que vea la tarjeta a medias.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { hoyPanama } from "@/lib/fecha-panama";
import { calcularVentaHoy, diasComparativos } from "@/lib/multifashion/venta-hoy";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 30;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = requireRole(req, ["admin", "secretaria", "contabilidad", "gerente_acs"]);
  if (auth instanceof NextResponse) return auth;

  const ahora = new Date();
  const fecha = hoyPanama(ahora);
  const dias = diasComparativos(fecha);

  try {
    const data = await calcularVentaHoy({
      fecha,
      ahora,
      semanaPasada: dias.semanaPasada,
      ayer: dias.ayer,
    });
    return NextResponse.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error inesperado";
    console.error("[multifashion/venta-hoy]", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
