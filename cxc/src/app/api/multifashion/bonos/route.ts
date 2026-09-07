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
import { ROLES_VENDEDORAS_ESPEJO } from "@/lib/multifashion/acceso";
import { supabaseServer } from "@/lib/supabase-server";
import type { BonosMultifashion } from "@/components/ventas/types";

export const dynamic = "force-dynamic";

function parseIntParam(v: string | null): number | null {
  if (v == null || v === "") return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ROLES_VENDEDORAS_ESPEJO);
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

  // `mes` puede venir nulo a propósito: el RPC lo lee como "último mes
  // elegible". Todos los roles con acceso al módulo piden lo mismo — la ventana
  // acotada de `gerente_acs` se levantó el 13-ago-2026 (ver CLAUDE.md § Roles).
  // v4 = v3 con el amarre de códigos de `multifashion_vendedora_alias`: las
  // vendedoras con DOS códigos en Switch se juntan antes de elegir a la del
  // bono. Mientras la migración `20261009120000_multifashion_vendedora_alias.sql`
  // no corra, la v4 no existe y se cae a la v3 — el bono se calcula igual que
  // hasta hoy. ⚠️ El MONTO y la REGLA del bono no se tocaron.
  const { data, error } = await (async () => {
    const args = { p_year: year, p_mes: mes };
    const v4 = await supabaseServer.rpc("multifashion_bonos_v4", args);
    if (!v4.error) return v4;
    return supabaseServer.rpc("multifashion_bonos_v3", args);
  })();

  if (error) {
    console.error("[multifashion/bonos] rpc error", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data as BonosMultifashion);
}
