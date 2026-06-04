// Endpoint de Bonos Multifashion (/multifashion → subtab Vendedoras).
// Llama a la RPC multifashion_bonos_v1 y devuelve el jsonb tal cual.
//
// Query params:
//   year  int  — año a evaluar (default: año actual)
//   mes   int  — 1..12 (opcional). Si se omite, el RPC usa el último mes
//                elegible del año (sync-aware).
//
// Año-contra-año (YoY). Mismo rol admin que el resto de sub-tabs de Multifashion.

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import type { BonosMultifashion } from "@/components/ventas/types";

export const dynamic = "force-dynamic";

function parseIntParam(v: string | null): number | null {
  if (v == null || v === "") return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const sp = req.nextUrl.searchParams;
  const year = parseIntParam(sp.get("year")) ?? new Date().getFullYear();
  const mes = parseIntParam(sp.get("mes"));

  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: "year inválido" }, { status: 400 });
  }
  if (mes != null && (mes < 1 || mes > 12)) {
    return NextResponse.json({ error: "mes inválido (1..12)" }, { status: 400 });
  }

  const { data, error } = await supabaseServer.rpc("multifashion_bonos_v3", {
    p_year: year,
    p_mes: mes,
  });

  if (error) {
    console.error("[multifashion/bonos] rpc error", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data as BonosMultifashion);
}
