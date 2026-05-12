// Endpoint del sub-tab Clientes Multifashion — sección Retail recurrentes.
// Wrapper de la RPC multifashion_retail_recurrentes(p_fecha_inicio, p_fecha_fin, p_limit).
//
// Query params:
//   fecha_inicio  YYYY-MM-DD (default: 1 ene del año actual)
//   fecha_fin     YYYY-MM-DD (default: today)
//   limit         int 1..500 (default: 50)

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "director", "contabilidad"]);
  if (auth instanceof NextResponse) return auth;

  const sp = req.nextUrl.searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const ene1 = `${new Date().getFullYear()}-01-01`;
  const fecha_inicio = sp.get("fecha_inicio") ?? ene1;
  const fecha_fin = sp.get("fecha_fin") ?? today;
  const limitParam = sp.get("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : 50;

  if (!ISO_DATE.test(fecha_inicio) || !ISO_DATE.test(fecha_fin)) {
    return NextResponse.json({ error: "fecha_inicio / fecha_fin deben ser YYYY-MM-DD" }, { status: 400 });
  }
  if (fecha_inicio > fecha_fin) {
    return NextResponse.json({ error: "fecha_inicio > fecha_fin" }, { status: 400 });
  }
  if (!Number.isFinite(limit) || limit < 1 || limit > 500) {
    return NextResponse.json({ error: "limit inválido (1..500)" }, { status: 400 });
  }

  const { data, error } = await supabaseServer.rpc("multifashion_retail_recurrentes", {
    p_fecha_inicio: fecha_inicio,
    p_fecha_fin: fecha_fin,
    p_limit: limit,
  });
  if (error) {
    console.error("[multifashion/retail-recurrentes] rpc error", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
