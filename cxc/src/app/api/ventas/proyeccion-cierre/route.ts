// Wrapper directo de ventas_proyeccion_cierre_v1. Consumido por Configurar
// Metas para detectar empresas en "zona crítica" (ritmo_actual < 0.85) y
// también disponible para flows futuros que necesiten la proyección sin
// pasar por el shape completo de /api/ventas/resumen.

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

  // _v5: agrega cierre_anio_anterior + delta_vs_anio_anterior (% y absoluto).
  const { data, error } = await supabaseServer.rpc("ventas_proyeccion_cierre_v5", { p_anio: anio });
  if (error) {
    console.error("[ventas/proyeccion-cierre]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? {});
}
