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
import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";

export const dynamic = "force-dynamic";

const READ_ROLES = ["admin", "secretaria", "vendedor", "bodega"];
const WRITE_ROLES = ["admin", "secretaria"];

interface EmpresaTotals {
  empresa: string;
  ventas_ytd: number;
  cobrado_ytd: number;
  cxc: number;
  ultima_factura: string | null;
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

  const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);

  // Puente por ID: pares (empresa_key, cliente_switch_id) del cliente. El id es
  // por-empresa → matcheamos el par exacto, no solo el cliente_switch_id.
  const { data: pares } = await supabaseServer
    .from("switch_clientes")
    .select("empresa_key, cliente_switch_id")
    .eq("codigo", codigo);
  const cids = [...new Set((pares ?? [])
    .map(p => (p as { cliente_switch_id: number | null }).cliente_switch_id)
    .filter((x): x is number => typeof x === "number"))];
  const pairSet = new Set((pares ?? []).map(p => {
    const x = p as { empresa_key: string; cliente_switch_id: number | null };
    return `${x.empresa_key}|${x.cliente_switch_id}`;
  }));

  // 2. Ventas YTD (switch_facturas año en curso, acotado) · última factura
  //    (switch_facturas ordenada desc) · CXC (switch_estadocuenta_aging) · Cobrado
  //    (switch_recibos). Dos queries switch separadas para NO topar el límite de
  //    1000 filas en clientes grandes (una sola .in() sin acotar las perdía). Las
  //    dos últimas YA eran switch → idénticas; solo ventas/última dejan ventas_raw.
  const [ventasRes, ultimaRes, cxcRes, cobradoRes] = await Promise.all([
    cids.length > 0
      ? supabaseServer
          .from("switch_facturas")
          .select("empresa_key, cliente_switch_id, fecha, tipo_comprobante, total")
          .in("cliente_switch_id", cids)
          .gte("fecha", yearStart)
      : Promise.resolve({ data: [] as unknown[] }),
    cids.length > 0
      ? supabaseServer
          .from("switch_facturas")
          .select("empresa_key, cliente_switch_id, fecha")
          .in("cliente_switch_id", cids)
          .in("tipo_comprobante", ["Factura", "Tiquete", "Transacción"])
          .order("fecha", { ascending: false })
      : Promise.resolve({ data: [] as unknown[] }),
    supabaseServer
      .from("switch_estadocuenta_aging")
      .select("company_key, total")
      .eq("codigo", codigo),
    // Cobrado YTD = pagos del año (switch_recibos) EXCLUYENDO retenciones.
    supabaseServer
      .from("switch_recibos")
      .select("empresa_key, total")
      .eq("cliente_codigo", codigo)
      .eq("es_retencion", false)
      .gte("fecha", yearStart),
  ]);

  // Ventas YTD (base CON ITBMS = total, igual que antes → solo cambia por frescura),
  // neto firmado por tipo, re-filtrada a hora-Panamá del año en curso.
  const POS = new Set(["Factura", "Tiquete", "Transacción", "Nota de Débito"]);
  const panamaYmd = (iso: string) => new Date(Date.parse(iso) - 5 * 3600 * 1000).toISOString().slice(0, 10);
  const ventasMap = new Map<string, number>();
  for (const r of (ventasRes.data ?? []) as {
    empresa_key: string; cliente_switch_id: number; fecha: string;
    tipo_comprobante: string; total: number | string;
  }[]) {
    if (!pairSet.has(`${r.empresa_key}|${r.cliente_switch_id}`)) continue;
    if (!r.fecha || panamaYmd(r.fecha) < yearStart) continue;
    const base = Number(r.total ?? 0);
    const signed = POS.has(r.tipo_comprobante) ? base : (r.tipo_comprobante === "Nota de Crédito" ? -base : 0);
    ventasMap.set(r.empresa_key, (ventasMap.get(r.empresa_key) ?? 0) + signed);
  }

  // Última factura: la lista viene ordenada desc → la primera fila (pairSet match)
  // de cada empresa es su fecha más reciente; la primera global = la del grupo.
  const ultimaFacturaMap = new Map<string, string>();
  let ultimaGlobal: string | null = null;
  for (const r of (ultimaRes.data ?? []) as { empresa_key: string; cliente_switch_id: number; fecha: string }[]) {
    if (!r.fecha || !pairSet.has(`${r.empresa_key}|${r.cliente_switch_id}`)) continue;
    const ymd = panamaYmd(r.fecha);
    if (!ultimaFacturaMap.has(r.empresa_key)) ultimaFacturaMap.set(r.empresa_key, ymd);
    if (!ultimaGlobal || ymd > ultimaGlobal) ultimaGlobal = ymd;
  }

  // CXC + Cobrado: sin cambio (ya eran switch). CXC `total` ya viene firmado.
  const cxcMap = new Map<string, number>();
  for (const r of (cxcRes.data ?? []) as { company_key: string; total: number }[]) {
    cxcMap.set(r.company_key, (cxcMap.get(r.company_key) ?? 0) + Number(r.total ?? 0));
  }
  const cobradoMap = new Map<string, number>();
  for (const r of (cobradoRes.data ?? []) as { empresa_key: string; total: number }[]) {
    cobradoMap.set(r.empresa_key, (cobradoMap.get(r.empresa_key) ?? 0) + Number(r.total ?? 0));
  }

  const empresas: EmpresaTotals[] = B2B_EMPRESA_KEYS.map(e => ({
    empresa: e,
    ventas_ytd: Math.round((ventasMap.get(e) ?? 0) * 100) / 100,
    cobrado_ytd: Math.round((cobradoMap.get(e) ?? 0) * 100) / 100,
    cxc: Math.round((cxcMap.get(e) ?? 0) * 100) / 100,
    ultima_factura: ultimaFacturaMap.get(e) ?? null,
  }));

  const totalGrupo = {
    ventas_ytd:  empresas.reduce((s, e) => s + e.ventas_ytd, 0),
    cobrado_ytd: empresas.reduce((s, e) => s + e.cobrado_ytd, 0),
    cxc:         empresas.reduce((s, e) => s + e.cxc, 0),
  };

  return NextResponse.json({
    cliente,
    empresas,
    total_grupo: {
      ventas_ytd:  Math.round(totalGrupo.ventas_ytd * 100) / 100,
      cobrado_ytd: Math.round(totalGrupo.cobrado_ytd * 100) / 100,
      cxc:         Math.round(totalGrupo.cxc * 100) / 100,
      ultima_factura: ultimaGlobal,
    },
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
