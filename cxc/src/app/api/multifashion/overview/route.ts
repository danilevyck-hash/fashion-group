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
  //
  // LA SERIE ANUAL SE DEJA COMPLETA A PROPÓSITO — esto NO es un olvido.
  // `multifashion_overview_serie_v1(p_year)` devuelve los 12 meses del año, así
  // que el clamp limita QUÉ años se pueden pedir pero no recorta el payload a un
  // mes. Y así se queda: la ventana que pidió Daniel es sobre QUÉ PERÍODO se
  // puede consultar, y el gráfico anual del año en curso es parte de ver el mes
  // en curso (es el contexto donde se lee — sin él el número del mes no dice si
  // fue bueno o malo). Recortar la serie vaciaría el gráfico del Resumen: le
  // sacaría una pantalla que hoy funciona, sin cerrar nada que importe — los dos
  // años pedibles siguen siendo {actual, anterior} y ningún año viejo entra.
  // Si alguna vez se decide lo contrario, es una decisión de PRODUCTO de Daniel,
  // no una fuga que quedó abierta.
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
