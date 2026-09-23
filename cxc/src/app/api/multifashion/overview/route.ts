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
import { ROLES_MULTIFASHION } from "@/lib/multifashion/acceso";
import { fetchMultifashion } from "@/lib/ventas/queries";
import { hoyPanama } from "@/lib/fecha-panama";

export const dynamic = "force-dynamic";
// Overview anual cruza el empalme switch_facturas/ventas_raw (blend pesado); el
// año 2025 tarda ~5s. Sin maxDuration, un cold-start tras un deploy lo empuja
// sobre el timeout default → 500 transitorio. 60s da headroom.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ROLES_MULTIFASHION);
  if (auth instanceof NextResponse) return auth;

  const sp = req.nextUrl.searchParams;
  const yearParam = sp.get("year");
  const mesParam = sp.get("mes");
  // 🔴 «Hoy» es el de PANAMÁ (23-sep-2026): Vercel corre en UTC y de 7 pm a
  // medianoche el año/mes del servidor ya es «mañana».
  const hoy = hoyPanama();
  const anioHoy = Number(hoy.slice(0, 4));
  const mesHoy = Number(hoy.slice(5, 7));
  const yearPedido = yearParam ? parseInt(yearParam, 10) : anioHoy;
  if (!Number.isFinite(yearPedido) || yearPedido < 2000 || yearPedido > 2100) {
    return NextResponse.json({ error: "year inválido" }, { status: 400 });
  }

  // Default mes: si year es actual → mes en curso (Panamá). Si year es
  // cerrado → 12 (todo el año).
  const isCurrent = yearPedido === anioHoy;
  const mesFallback = isCurrent ? mesHoy : 12;
  const mesPedido = mesParam ? parseInt(mesParam, 10) : mesFallback;
  if (!Number.isFinite(mesPedido) || mesPedido < 1 || mesPedido > 12) {
    return NextResponse.json({ error: "mes inválido (1..12)" }, { status: 400 });
  }

  // `gerente_acs` ve el histórico COMPLETO desde el 13-ago-2026 (decisión de
  // Daniel: *"abrile Multifashion completo"*). Lo que queda arriba es la
  // validación de rango del parámetro, que protege a la base de un `year=99999`
  // y NO tiene nada que ver con el rol. Ver CLAUDE.md § Roles.
  const year = yearPedido;
  const mes = mesPedido;

  try {
    const multi = await fetchMultifashion({ year, mes });
    return NextResponse.json(multi);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "error inesperado";
    console.error("[multifashion/overview] fetch failed", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
