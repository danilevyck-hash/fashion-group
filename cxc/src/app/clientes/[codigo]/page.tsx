// ─────────────────────────────────────────────────────────────────────────────
// /clientes/[codigo]  (Sprint 1 Fase 4D)
//
// Server-rendered detail. Auth + initial data fetch, después pasa al client.
// ─────────────────────────────────────────────────────────────────────────────

import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { verifySession } from "@/lib/session-cookie";
import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import ClienteDetail, { type ClienteDetailData } from "./ClienteDetail";

const ALLOWED_ROLES = ["admin", "secretaria", "vendedor", "bodega"];

export const dynamic = "force-dynamic";

interface SessionPayload {
  role?: string;
  sessionToken?: string;
}

function parseSession(raw: string | undefined): SessionPayload | null {
  return verifySession(raw);
}

async function isSessionValid(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const { data } = await supabaseServer
    .from("user_sessions")
    .select("id")
    .eq("session_token", token)
    .eq("revoked", false)
    .limit(1)
    .maybeSingle();
  return !!data;
}

export default async function ClienteDetailPage({ params }: { params: Promise<{ codigo: string }> }) {
  const cookieStore = await cookies();
  const session = parseSession(cookieStore.get("cxc_session")?.value);
  if (!session || !ALLOWED_ROLES.includes(session.role || "")) redirect("/");
  if (!(await isSessionValid(session.sessionToken)))           redirect("/");

  const { codigo: rawCodigo } = await params;
  const codigo = decodeURIComponent(rawCodigo);

  const { data: cliente } = await supabaseServer
    .from("clientes_master")
    .select("*")
    .eq("codigo", codigo)
    .eq("deleted", false)
    .maybeSingle();
  if (!cliente) notFound();

  const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);

  // Puente por ID: pares (empresa_key, cliente_switch_id) del cliente. El id es
  // por-empresa → matcheamos el par exacto, no solo el cliente_switch_id.
  const { data: pares } = await supabaseServer
    .from("switch_clientes")
    .select("empresa_key, cliente_switch_id")
    .eq("codigo", cliente.codigo);
  const cids = [...new Set((pares ?? [])
    .map(p => (p as { cliente_switch_id: number | null }).cliente_switch_id)
    .filter((x): x is number => typeof x === "number"))];
  const pairSet = new Set((pares ?? []).map(p => {
    const x = p as { empresa_key: string; cliente_switch_id: number | null };
    return `${x.empresa_key}|${x.cliente_switch_id}`;
  }));

  // Ventas YTD (switch_facturas año en curso, acotado) · última factura (switch_
  // facturas ordenada desc) · CXC · Cobrado. Dos queries switch separadas para NO
  // topar el límite de 1000 filas en clientes grandes. CXC/Cobrado ya eran switch
  // → idénticas; solo ventas/última dejan ventas_raw.
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
      .select("company_key, total, d91_120, d121_180, d181_270, d271_365, mas_365")
      .eq("codigo", cliente.codigo),
    supabaseServer
      .from("switch_recibos")
      .select("empresa_key, total")
      .eq("cliente_codigo", cliente.codigo)
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

  // Última factura: lista ordenada desc → primera fila (pairSet) por empresa = más
  // reciente; primera global = la del grupo.
  const ultimaFacturaMap = new Map<string, string>();
  let ultimaGlobal: string | null = null;
  for (const r of (ultimaRes.data ?? []) as { empresa_key: string; cliente_switch_id: number; fecha: string }[]) {
    if (!r.fecha || !pairSet.has(`${r.empresa_key}|${r.cliente_switch_id}`)) continue;
    const ymd = panamaYmd(r.fecha);
    if (!ultimaFacturaMap.has(r.empresa_key)) ultimaFacturaMap.set(r.empresa_key, ymd);
    if (!ultimaGlobal || ymd > ultimaGlobal) ultimaGlobal = ymd;
  }

  // Aging del grupo: "vencido reciente" = d91_120 (ámbar); "crítico" = +120d
  // (d121_180+d181_270+d271_365+mas_365, rojo). Mismo vocabulario que cxc-aging.ts.
  // Alimenta el pill de antigüedad de la ficha (solo display, sin migración).
  const cxcMap = new Map<string, number>();
  let cxcWatch = 0;
  let cxcCritico = 0;
  for (const r of (cxcRes.data ?? []) as {
    company_key: string; total: number;
    d91_120?: number; d121_180?: number; d181_270?: number; d271_365?: number; mas_365?: number;
  }[]) {
    cxcMap.set(r.company_key, (cxcMap.get(r.company_key) ?? 0) + Number(r.total ?? 0));
    cxcWatch += Number(r.d91_120 ?? 0);
    cxcCritico += Number(r.d121_180 ?? 0) + Number(r.d181_270 ?? 0) + Number(r.d271_365 ?? 0) + Number(r.mas_365 ?? 0);
  }
  const cxcVencido = Math.round((cxcWatch + cxcCritico) * 100) / 100;
  cxcCritico = Math.round(cxcCritico * 100) / 100;
  const cobradoMap = new Map<string, number>();
  for (const r of (cobradoRes.data ?? []) as { empresa_key: string; total: number }[]) {
    cobradoMap.set(r.empresa_key, (cobradoMap.get(r.empresa_key) ?? 0) + Number(r.total ?? 0));
  }
  const empresas = B2B_EMPRESA_KEYS.map(e => ({
    empresa: e,
    ventas_ytd:     Math.round((ventasMap.get(e) ?? 0) * 100) / 100,
    cobrado_ytd:    Math.round((cobradoMap.get(e) ?? 0) * 100) / 100,
    cxc:            Math.round((cxcMap.get(e) ?? 0) * 100) / 100,
    ultima_factura: ultimaFacturaMap.get(e) ?? null,
  }));
  const totalGrupo = {
    ventas_ytd:     Math.round(empresas.reduce((s, e) => s + e.ventas_ytd, 0) * 100) / 100,
    cobrado_ytd:    Math.round(empresas.reduce((s, e) => s + e.cobrado_ytd, 0) * 100) / 100,
    cxc:            Math.round(empresas.reduce((s, e) => s + e.cxc, 0) * 100) / 100,
    cxc_vencido:    cxcVencido,
    cxc_critico:    cxcCritico,
    ultima_factura: ultimaGlobal,
  };

  // Últimas guías del cliente (por cliente_codigo D-XXX, vínculo de Guías V2).
  // Dedupe por guía (un cliente puede tener varias líneas en la misma guía) y
  // tomamos las 3 más recientes. Link al detalle por URL: /guias/[id]/imprimir.
  const { data: guiaItemRows } = await supabaseServer
    .from("guia_items")
    .select("guia_id")
    .eq("cliente_codigo", cliente.codigo)
    .eq("deleted", false);
  const guiaIds = [...new Set(
    (guiaItemRows ?? [])
      .map(r => (r as { guia_id: string | null }).guia_id)
      .filter((x): x is string => !!x),
  )];
  let ultimasGuias: { id: string; numero: number; fecha: string }[] = [];
  if (guiaIds.length > 0) {
    const { data: gts } = await supabaseServer
      .from("guia_transporte")
      .select("id, numero, fecha")
      .in("id", guiaIds)
      .eq("deleted", false)
      .order("fecha", { ascending: false })
      .order("numero", { ascending: false })
      .limit(3);
    ultimasGuias = (gts ?? []) as { id: string; numero: number; fecha: string }[];
  }

  const data: ClienteDetailData = {
    cliente,
    empresas,
    total_grupo: totalGrupo,
    ultimas_guias: ultimasGuias,
  };

  return <ClienteDetail initialData={data} />;
}
