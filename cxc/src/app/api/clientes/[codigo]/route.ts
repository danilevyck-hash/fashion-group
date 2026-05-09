// ─────────────────────────────────────────────────────────────────────────────
// GET    /api/clientes/[codigo]   (Sprint 1 Fase 4D)
// PATCH  /api/clientes/[codigo]
//
// GET devuelve cliente + ventas YTD por empresa + CXC actual por empresa
//   + última factura. PATCH solo permite editar telefono/celular/email/notas.
//   Los campos fiscales (nombre, razon_social, identificacion, dv, provincia,
//   codigo) NUNCA se editan acá — sync semanal de Switch los pisa.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAuth } from "@/lib/require-auth";

export const dynamic = "force-dynamic";

const READ_ROLES = ["admin", "director", "secretaria", "vendedor", "bodega"];
const WRITE_ROLES = ["admin", "director", "secretaria"];

const B2B_EMPRESAS = [
  "vistana", "fashion_wear", "fashion_shoes",
  "active_shoes", "active_wear", "joystep",
] as const;

interface EmpresaTotals {
  empresa: string;
  ventas_ytd: number;
  cxc: number;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ codigo: string }> }) {
  const authError = requireAuth(req, READ_ROLES);
  if (authError) return authError;

  const { codigo } = await ctx.params;
  if (!codigo) return NextResponse.json({ error: "codigo requerido" }, { status: 400 });

  // 1. Cliente
  const { data: cliente, error: cErr } = await supabaseServer
    .from("clientes_master")
    .select("*")
    .eq("codigo", codigo)
    .eq("deleted", false)
    .maybeSingle();
  if (cErr) {
    console.error("[api/clientes/codigo] lookup error:", cErr.message);
    return NextResponse.json({ error: cErr.message }, { status: 500 });
  }
  if (!cliente) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });

  const clienteId = cliente.id as string;
  const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);

  // 2. Ventas YTD por empresa, CXC saldo por empresa, última factura
  const [ventasRes, cxcRes, ultimaRes] = await Promise.all([
    supabaseServer
      .from("ventas_raw")
      .select("empresa, total")
      .eq("cliente_id", clienteId)
      .gte("fecha", yearStart),
    supabaseServer
      .from("cxc_rows")
      .select("company_key, debito, credito")
      .eq("cliente_id", clienteId),
    supabaseServer
      .from("ventas_raw")
      .select("fecha")
      .eq("cliente_id", clienteId)
      .in("tipo", ["Factura", "Tiquete", "Transacción"])
      .order("fecha", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const ventasMap = new Map<string, number>();
  for (const r of (ventasRes.data ?? []) as { empresa: string; total: number }[]) {
    ventasMap.set(r.empresa, (ventasMap.get(r.empresa) ?? 0) + Number(r.total ?? 0));
  }

  const cxcMap = new Map<string, number>();
  for (const r of (cxcRes.data ?? []) as { company_key: string; debito: number; credito: number }[]) {
    const net = Number(r.debito ?? 0) - Number(r.credito ?? 0);
    cxcMap.set(r.company_key, (cxcMap.get(r.company_key) ?? 0) + net);
  }

  const empresas: EmpresaTotals[] = B2B_EMPRESAS.map(e => ({
    empresa: e,
    ventas_ytd: Math.round((ventasMap.get(e) ?? 0) * 100) / 100,
    cxc: Math.round((cxcMap.get(e) ?? 0) * 100) / 100,
  }));

  const totalGrupo = {
    ventas_ytd: empresas.reduce((s, e) => s + e.ventas_ytd, 0),
    cxc:        empresas.reduce((s, e) => s + e.cxc, 0),
  };

  return NextResponse.json({
    cliente,
    empresas,
    total_grupo: {
      ventas_ytd: Math.round(totalGrupo.ventas_ytd * 100) / 100,
      cxc:        Math.round(totalGrupo.cxc * 100) / 100,
    },
    ultima_factura: (ultimaRes.data as { fecha: string } | null)?.fecha ?? null,
  });
}

interface PatchBody {
  telefono?: string | null;
  celular?: string | null;
  email?: string | null;
  notas?: string | null;
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ codigo: string }> }) {
  const authError = requireAuth(req, WRITE_ROLES);
  if (authError) return authError;

  const { codigo } = await ctx.params;
  if (!codigo) return NextResponse.json({ error: "codigo requerido" }, { status: 400 });

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  // Whitelist estricta — el sync semanal del Sprint 4 pisa los demás campos.
  const allowed: PatchBody = {};
  if ("telefono" in body) allowed.telefono = (body.telefono ?? "").toString().trim() || null;
  if ("celular"  in body) allowed.celular  = (body.celular  ?? "").toString().trim() || null;
  if ("email"    in body) allowed.email    = (body.email    ?? "").toString().trim() || null;
  if ("notas"    in body) allowed.notas    = (body.notas    ?? "").toString().trim() || null;

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: "Ningún campo editable provisto" }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .from("clientes_master")
    .update(allowed)
    .eq("codigo", codigo)
    .eq("deleted", false)
    .select()
    .maybeSingle();

  if (error) {
    console.error("[api/clientes/codigo] patch error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });

  return NextResponse.json({ ok: true, cliente: data });
}
