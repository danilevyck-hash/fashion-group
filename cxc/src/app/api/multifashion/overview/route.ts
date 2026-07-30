// Endpoint del tab Overview de Multifashion. Wrapper de fetchMultifashion
// para que VentasShell pueda refetchear cuando cambia el selector global de
// año. Path alineado con /api/multifashion/vendedoras.
//
// Query params:
//   year  int  — año fiscal (default: año actual)
//   mes   int  — 1..12 (default: para año actual = mes en curso; para año
//                cerrado = 12). El cliente lo determina, este endpoint solo
//                lo pasa al RPC.

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { fetchMultifashion } from "@/lib/ventas/queries";
import { clampAnioMes } from "@/lib/multifashion/ventana-gerente";

export const dynamic = "force-dynamic";
// Overview anual cruza el empalme switch_facturas/ventas_raw (blend pesado); el
// año 2025 tarda ~5s. Sin maxDuration, un cold-start tras un deploy lo empuja
// sobre el timeout default → 500 transitorio. 60s da headroom.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "contabilidad", "gerente_acs"]);
  if (auth instanceof NextResponse) return auth;

  const sp = req.nextUrl.searchParams;
  const yearParam = sp.get("year");
  const mesParam = sp.get("mes");
  const yearPedido = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
  if (!Number.isFinite(yearPedido) || yearPedido < 2000 || yearPedido > 2100) {
    return NextResponse.json({ error: "year inválido" }, { status: 400 });
  }

  // Default mes: si year es actual → mes en curso (now.getMonth() + 1).
  // Si year es cerrado → 12 (todo el año).
  const now = new Date();
  const isCurrent = yearPedido === now.getFullYear();
  const mesFallback = isCurrent ? now.getMonth() + 1 : 12;
  const mesPedido = mesParam ? parseInt(mesParam, 10) : mesFallback;
  if (!Number.isFinite(mesPedido) || mesPedido < 1 || mesPedido > 12) {
    return NextResponse.json({ error: "mes inválido (1..12)" }, { status: 400 });
  }

  // CANDADO gerente_acs: año en {actual, anterior} y mes = mes en curso. Admin
  // no cambia. Ver src/lib/multifashion/ventana-gerente.ts.
  // OJO (documentado en el PR): el RPC multifashion_overview_serie_v1 devuelve
  // la serie del AÑO completo, así que acotar year/mes limita QUÉ años se
  // pueden pedir, no recorta el payload a un mes. Recortar la serie es una
  // decisión de producto aparte — vaciaría el gráfico anual del Resumen.
  const acotado = clampAnioMes(auth.role, { year: yearPedido, mes: mesPedido }, now);
  const year = acotado.year;
  const mes = acotado.mes as number;

  try {
    const multi = await fetchMultifashion({ year, mes });
    return NextResponse.json(multi);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error inesperado";
    console.error("[multifashion/overview] fetch failed", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
