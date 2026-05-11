// Endpoint del sub-tab Vendedoras (/ventas → Multifashion → Vendedoras).
// Llama a la RPC multifashion_vendedoras_v2 y devuelve el jsonb tal cual.
//
// Query params:
//   year       int   — año fiscal (default: año actual)
//   periodo    text  — 'mes' | 'trimestre' | 'ytd' (default: 'mes')
//   mes        int   — 1..12 (requerido si periodo='mes')
//   trimestre  int   — 1..4  (requerido si periodo='trimestre')
//
// Mismos roles que /api/ventas/* (admin/director/contabilidad).
//
// Nota: el RPC se llama `multifashion_vendedoras_v2` (no `_vendedoras`)
// por bug de runtime de Vercel/PostgREST que servía data vieja a pesar de
// la migration aplicada. Ver migration 20260511150000_multifashion_vendedoras_v2.sql.

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import type { VendedorasPeriodo } from "@/components/ventas/types";

export const dynamic = "force-dynamic";

type Periodo = "mes" | "trimestre" | "ytd";

function parseIntParam(v: string | null): number | null {
  if (v == null || v === "") return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "director", "contabilidad"]);
  if (auth instanceof NextResponse) return auth;

  const sp = req.nextUrl.searchParams;
  const year = parseIntParam(sp.get("year")) ?? new Date().getFullYear();
  const periodoRaw = (sp.get("periodo") ?? "mes") as Periodo;
  if (periodoRaw !== "mes" && periodoRaw !== "trimestre" && periodoRaw !== "ytd") {
    return NextResponse.json({ error: "periodo inválido (mes|trimestre|ytd)" }, { status: 400 });
  }
  if (!Number.isFinite(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: "year inválido" }, { status: 400 });
  }

  const mes = parseIntParam(sp.get("mes"));
  const trimestre = parseIntParam(sp.get("trimestre"));

  if (periodoRaw === "mes" && (mes == null || mes < 1 || mes > 12)) {
    return NextResponse.json({ error: "mes requerido (1..12) cuando periodo=mes" }, { status: 400 });
  }
  if (periodoRaw === "trimestre" && (trimestre == null || trimestre < 1 || trimestre > 4)) {
    return NextResponse.json({ error: "trimestre requerido (1..4) cuando periodo=trimestre" }, { status: 400 });
  }

  const { data, error } = await supabaseServer.rpc("multifashion_vendedoras_v2", {
    p_year: year,
    p_periodo: periodoRaw,
    p_mes: periodoRaw === "mes" ? mes : null,
    p_trimestre: periodoRaw === "trimestre" ? trimestre : null,
  });

  if (error) {
    console.error("[multifashion/vendedoras] rpc error", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data as VendedorasPeriodo);
}

// force rebuild 1778539855
