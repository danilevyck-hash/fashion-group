// Endpoint del sub-tab Vendedoras (/ventas → Multifashion → Vendedoras).
// Llama a la RPC multifashion_vendedoras_v3 y devuelve el jsonb tal cual.
//
// Query params:
//   year       int   — año fiscal (default: año actual)
//   periodo    text  — 'mes' | 'trimestre' | 'ytd' (default: 'mes')
//   mes        int   — 1..12 (requerido si periodo='mes')
//   trimestre  int   — 1..4  (requerido si periodo='trimestre')
//
// Mismos roles que /api/ventas/* (admin/director/contabilidad).
//
// Nota: el RPC se llama `multifashion_vendedoras_v3` por dos rondas del
// mismo bug de runtime stale en Vercel/PostgREST: data vieja servida a
// pesar de migrations aplicadas (v1→v2 en 20260511150000, v2→v3 en
// 20260511170000). Ver esas migrations para el historial completo.

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import type { VendedorasPeriodo } from "@/components/ventas/types";

export const dynamic = "force-dynamic";

type Periodo = "mes" | "trimestre" | "ytd" | "ultimos";

function parseIntParam(v: string | null): number | null {
  if (v == null || v === "") return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: NextRequest) {
  // Multifashion es módulo admin-only por ahora (los demás roles se definen
  // después). overview queda compartido con Ventas, pero los sub-tabs son admin.
  const auth = requireRole(req, ["admin", "secretaria", "gerente_acs"]);
  if (auth instanceof NextResponse) return auth;

  const sp = req.nextUrl.searchParams;
  const year = parseIntParam(sp.get("year")) ?? new Date().getFullYear();
  const periodoRaw = (sp.get("periodo") ?? "mes") as Periodo;
  if (periodoRaw !== "mes" && periodoRaw !== "trimestre" && periodoRaw !== "ytd" && periodoRaw !== "ultimos") {
    return NextResponse.json({ error: "periodo inválido (mes|trimestre|ytd|ultimos)" }, { status: 400 });
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

  const nParam = parseIntParam(sp.get("n"));

  // Trimestre, YTD y las ventanas rolling de 3/6/12 meses valen para TODOS los
  // roles que entran al módulo: la ventana acotada de `gerente_acs` se levantó
  // el 13-ago-2026 (ver CLAUDE.md § Roles). Las validaciones de arriba se
  // quedan — `n` fuera de {3,6,12} sigue siendo un 400.

  // periodo=ultimos → ventana rolling de N meses (3/6/12) terminando en `mes`,
  // vía multifashion_vendedoras_range (Δ vs misma ventana del año anterior, sin bono).
  if (periodoRaw === "ultimos") {
    const n = nParam;
    if (n !== 3 && n !== 6 && n !== 12) {
      return NextResponse.json({ error: "n requerido (3|6|12) cuando periodo=ultimos" }, { status: 400 });
    }
    if (mes == null || mes < 1 || mes > 12) {
      return NextResponse.json({ error: "mes (fin de ventana) requerido (1..12)" }, { status: 400 });
    }
    const { data, error } = await supabaseServer.rpc("multifashion_vendedoras_range", {
      p_year: year,
      p_fin_mes: mes,
      p_n_meses: n,
    });
    if (error) {
      console.error("[multifashion/vendedoras] range rpc error", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data as VendedorasPeriodo);
  }

  const { data, error } = await supabaseServer.rpc("multifashion_vendedoras_v3", {
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
