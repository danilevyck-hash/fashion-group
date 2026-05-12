// Endpoint para la sección "Retail recurrentes" del sub-tab Clientes Multifashion.
// Wrapper de la RPC multifashion_retail_recurrentes(p_year, p_limit).

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "director", "contabilidad"]);
  if (auth instanceof NextResponse) return auth;

  const sp = req.nextUrl.searchParams;
  const yearParam = sp.get("year");
  const limitParam = sp.get("limit");
  const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();
  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: "year inválido" }, { status: 400 });
  }
  const limit = limitParam ? parseInt(limitParam, 10) : 30;
  if (!Number.isFinite(limit) || limit < 1 || limit > 500) {
    return NextResponse.json({ error: "limit inválido (1..500)" }, { status: 400 });
  }

  const { data, error } = await supabaseServer.rpc("multifashion_retail_recurrentes", {
    p_year: year,
    p_limit: limit,
  });
  if (error) {
    console.error("[multifashion/retail-recurrentes] rpc error", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
