// Endpoint del sub-tab "Detalle mensual" de Multifashion.
// Wrapper de la RPC multifashion_detalle_mensual_v1(p_year, p_mes).
//
// Soporta cualquier mes histórico (no solo mes en curso). Reemplaza al
// endpoint /api/multifashion/mes-en-curso anterior.
//
// Query params:
//   year  int  default: año calendario actual
//   mes   int  default: si year=currentYear → mes actual, si no → 12
//
// La RPC v1 es independiente de multifashion_dia_a_dia_v4, que sigue viva
// pero solo cubre el mes en curso. v1 cubre mes en curso + histórico + YoY.

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "director", "contabilidad"]);
  if (auth instanceof NextResponse) return auth;

  const sp = req.nextUrl.searchParams;
  const yearParam = sp.get("year");
  const mesParam = sp.get("mes");
  const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: "year inválido" }, { status: 400 });
  }

  const now = new Date();
  const isCurrent = year === now.getFullYear();
  const mesFallback = isCurrent ? now.getMonth() + 1 : 12;
  const mes = mesParam ? parseInt(mesParam, 10) : mesFallback;
  if (!Number.isFinite(mes) || mes < 1 || mes > 12) {
    return NextResponse.json({ error: "mes inválido (1..12)" }, { status: 400 });
  }

  const { data, error } = await supabaseServer.rpc("multifashion_detalle_mensual_v1", {
    p_year: year,
    p_mes: mes,
  });
  if (error) {
    console.error("[multifashion/detalle-mensual] rpc error", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
