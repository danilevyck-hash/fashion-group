// ============================================================================
// GET /api/marketing/tiendas — LA PORTADA «TIENDAS» (23-sep-2026).
//
// Todas las tiendas con gasto, con el nombre del DIRECTORIO por código, lo
// reportado como único monto y el desglose por marca; «General» al final y
// Multifashion como una tienda más. Es EXACTAMENTE el reporte por tienda del
// rediseño (`reportePorTiendaRediseno`, año «Todos»): no hay una segunda
// cuenta, y por eso «Reportes › Por tienda» pudo irse de la pantalla — esta
// lista ES ese reporte.
//
// 🔴 EL PERÍODO MANDA (23-sep-2026): además de `filas` («Todos», la lista de
// siempre) viajan `periodos` (los chips, salidos de los gastos) y
// `filasPorPeriodo` (la misma lista, por chip). La pantalla elige; acá no se
// suma nada nuevo (`periodo-manda.ts`).
//
// 🔴 Solo lee. Contabilidad entra (`ROLES_MARKETING`).
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { tiendasPorPeriodoRediseno } from "@/lib/marketing/reportes";
import { ROLES_MARKETING } from "@/lib/marketing/roles";
import { MARKETING_TIENDAS_Y_MARCAS } from "@/lib/marketing/tiendas-y-marcas";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const auth = requireRole(req, [...ROLES_MARKETING]);
  if (auth instanceof NextResponse) return auth;
  if (!MARKETING_TIENDAS_Y_MARCAS) {
    return NextResponse.json({ error: "No disponible" }, { status: 404 });
  }
  try {
    const datos = await tiendasPorPeriodoRediseno();
    const res = NextResponse.json(datos);
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    console.error("GET /api/marketing/tiendas:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
