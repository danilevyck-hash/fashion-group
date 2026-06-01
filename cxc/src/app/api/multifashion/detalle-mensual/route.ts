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

  // Detalle mensual + ventas por hora (hora pico) en paralelo. La hora pico es
  // aditiva: si su RPC falla, el detalle igual responde (la sección de horas
  // simplemente no se renderiza) — no bloquea el resto del subtab.
  const [detalleRes, horasRes] = await Promise.all([
    supabaseServer.rpc("multifashion_detalle_mensual_v1", { p_year: year, p_mes: mes }),
    supabaseServer.rpc("multifashion_horas_pico_v1", { p_year: year, p_mes: mes }),
  ]);

  if (detalleRes.error) {
    console.error("[multifashion/detalle-mensual] rpc error", detalleRes.error);
    return NextResponse.json({ error: detalleRes.error.message }, { status: 500 });
  }

  if (horasRes.error) {
    console.error("[multifashion/detalle-mensual] horas rpc error", horasRes.error);
  }
  const horas = horasRes.error
    ? { horas: [], hora_pico: null, hora_pico_ventas: null }
    : (horasRes.data ?? { horas: [], hora_pico: null, hora_pico_ventas: null });

  return NextResponse.json({
    ...(detalleRes.data as Record<string, unknown>),
    ...(horas as Record<string, unknown>),
  });
}
