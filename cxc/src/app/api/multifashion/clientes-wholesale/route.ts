// Endpoint del sub-tab Clientes Multifashion — sección Wholesale.
// Wrapper de la RPC multifashion_wholesale_clientes(p_fecha_inicio, p_fecha_fin).
//
// Query params:
//   fecha_inicio  YYYY-MM-DD (default: 1 ene del año actual)
//   fecha_fin     YYYY-MM-DD (default: today)
//
// Reemplaza la firma anterior basada en `year`. El frontend calcula los
// rangos según el pill activo (último mes, 3m, 6m, 12m, año X).

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

  if (!ISO_DATE.test(fecha_inicio) || !ISO_DATE.test(fecha_fin)) {
    return NextResponse.json({ error: "fecha_inicio / fecha_fin deben ser YYYY-MM-DD" }, { status: 400 });
  }
  if (fecha_inicio > fecha_fin) {
    return NextResponse.json({ error: "fecha_inicio > fecha_fin" }, { status: 400 });
  }

  const { data, error } = await supabaseServer.rpc("multifashion_wholesale_clientes", {
    p_fecha_inicio: fecha_inicio,
    p_fecha_fin: fecha_fin,
  });
  if (error) {
    console.error("[multifashion/clientes-wholesale] rpc error", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
