// Endpoint del sub-tab Clientes Multifashion — sección Retail recurrentes.
// Wrapper de la RPC multifashion_retail_recurrentes_v2(p_fecha_inicio, p_fecha_fin, p_limit).
// v2 excluye clientes intercompañía / empresas del grupo (ver migración 20260604190000).
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
  // Multifashion es módulo admin-only por ahora (los demás roles se definen
  // después). overview queda compartido con Ventas, pero los sub-tabs son admin.
  const auth = requireRole(req, ["admin", "secretaria", "gerente_acs"]);
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

  // El rango viaja tal como lo pidió la pantalla. La ventana acotada de
  // `gerente_acs` se levantó el 13-ago-2026 (ver CLAUDE.md § Roles); lo que
  // sigue vigente es la validación de formato, de orden y el tope de `limit`.
  const { data, error } = await supabaseServer.rpc("multifashion_retail_recurrentes_v2", {
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
