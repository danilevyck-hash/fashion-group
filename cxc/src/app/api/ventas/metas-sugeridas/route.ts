// Devuelve la meta sugerida automática por empresa para el año pedido.
// Wrapper directo de la RPC ventas_meta_sugerida_v1.
//
// Query params:
//   anio  int  (requerido)
//
// La page /ventas/metas consume esto para mostrar "Sugerida: $X · Aplicar"
// al lado del input de cada empresa, y para detectar zona crítica
// (ritmo_actual < 0.85) — el ritmo_actual viene del endpoint paralelo
// /api/ventas/proyeccion-cierre.

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "contabilidad"]);
  if (auth instanceof NextResponse) return auth;

  const anioParam = req.nextUrl.searchParams.get("anio");
  if (!anioParam) return NextResponse.json({ error: "anio requerido" }, { status: 400 });
  const anio = parseInt(anioParam, 10);
  if (!Number.isFinite(anio) || anio < 2020 || anio > 2100) {
    return NextResponse.json({ error: "anio inválido" }, { status: 400 });
  }

  // _v2: cap del ritmo histórico a [-0.30, +0.50] antes del factor.
  const { data, error } = await supabaseServer.rpc("ventas_meta_sugerida_v2", { p_anio: anio });
  if (error) {
    console.error("[ventas/metas-sugeridas]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ empresas: data ?? [] });
}
