// ─────────────────────────────────────────────────────────────────────────────
// /clientes/[codigo]  (Sprint 1 Fase 4D)
//
// Server-rendered detail. Auth + initial data fetch, después pasa al client.
// ─────────────────────────────────────────────────────────────────────────────

import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-server";
import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import ClienteDetail, { type ClienteDetailData } from "./ClienteDetail";

const ALLOWED_ROLES = ["admin", "secretaria", "vendedor", "bodega"];

export const dynamic = "force-dynamic";

interface SessionPayload {
  role?: string;
  sessionToken?: string;
}

function parseSession(raw: string | undefined): SessionPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf-8"));
    if (!parsed.role) return null;
    return parsed as SessionPayload;
  } catch {
    return null;
  }
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
  const [ventasRes, cxcRes, ultimaRes] = await Promise.all([
    supabaseServer
      .from("ventas_raw")
      .select("empresa, total")
      .eq("cliente_id", cliente.id)
      .gte("fecha", yearStart),
    supabaseServer
      .from("cxc_rows")
      .select("company_key, debito, credito")
      .eq("cliente_id", cliente.id),
    supabaseServer
      .from("ventas_raw")
      .select("fecha")
      .eq("cliente_id", cliente.id)
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
    cxcMap.set(r.company_key, (cxcMap.get(r.company_key) ?? 0) + (Number(r.debito ?? 0) - Number(r.credito ?? 0)));
  }
  const empresas = B2B_EMPRESA_KEYS.map(e => ({
    empresa: e,
    ventas_ytd: Math.round((ventasMap.get(e) ?? 0) * 100) / 100,
    cxc:        Math.round((cxcMap.get(e) ?? 0) * 100) / 100,
  }));
  const totalGrupo = {
    ventas_ytd: Math.round(empresas.reduce((s, e) => s + e.ventas_ytd, 0) * 100) / 100,
    cxc:        Math.round(empresas.reduce((s, e) => s + e.cxc, 0) * 100) / 100,
  };
  const ultimaFactura = (ultimaRes.data as { fecha: string } | null)?.fecha ?? null;

  const data: ClienteDetailData = {
    cliente,
    empresas,
    total_grupo: totalGrupo,
    ultima_factura: ultimaFactura,
  };

  return <ClienteDetail initialData={data} />;
}
