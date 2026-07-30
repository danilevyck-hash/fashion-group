// ─────────────────────────────────────────────────────────────────────────────
// /clientes/[codigo]  (Sprint 1 Fase 4D)
//
// Server-rendered detail. Auth + initial data fetch, después pasa al client.
// ─────────────────────────────────────────────────────────────────────────────

import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { idsFueraDelDirectorio } from "@/lib/clientes/directorio-exclusiones";
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

  const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);

  // Todo lo que solo depende del `codigo` de la URL corre EN PARALELO (antes:
  // cliente → switch_clientes → Promise.all → guia_items en serie). ventas YTD +
  // última factura vienen de un RPC con SUM server-side: mata el corte silencioso
  // de 1000 filas que truncaba el YTD de clientes grandes Y baja el payload
  // (≤6 filas en vez de traer miles).
  const [cliente, ventasRpc, cxcRes, cobradoRes, guiaItemRows] = await Promise.all([
    supabaseServer
      .from("clientes_master")
      .select("*")
      .eq("codigo", codigo)
      .eq("deleted", false)
      .maybeSingle()
      .then((r) => r.data),
    supabaseServer.rpc("cliente_ficha_ventas", { p_codigo: codigo }),
    supabaseServer
      .from("switch_estadocuenta_aging")
      .select("company_key, total, d91_120, d121_180, d181_270, d271_365, mas_365")
      .eq("codigo", codigo),
    // `.in(empresa)` NO es decorativo: sin él esta query trae los recibos de
    // CUALQUIER empresa que comparta el código de cliente. Hoy la suma se salva
    // aguas abajo porque el `.map(B2B_EMPRESA_KEYS)` de más abajo descarta las
    // claves que no son del grupo — o sea que la separación depende de una
    // proyección a 60 líneas de distancia, no de la consulta. Se hace explícito
    // acá para que traer una empresa nueva a switch_recibos (confecciones_boston
    // es la candidata) no pueda contaminar el "Cobrado YTD" ni el total del grupo.
    supabaseServer
      .from("switch_recibos")
      .select("empresa_key, total")
      .in("empresa_key", B2B_EMPRESA_KEYS)
      .eq("cliente_codigo", codigo)
      .eq("es_retencion", false)
      .gte("fecha", yearStart),
    supabaseServer
      .from("guia_items")
      .select("guia_id")
      .eq("cliente_codigo", codigo)
      .eq("deleted", false),
  ]);
  if (!cliente) notFound();

  // Un cliente que no se lista en el Directorio tampoco se abre por URL directa:
  // si no, "no está en ningún lado" duraría hasta que alguien pegara un enlace.
  // Mismo criterio y mismo lugar que la lista — `directorio-exclusiones`.
  if ((await idsFueraDelDirectorio()).has(cliente.id)) notFound();

  // ventas YTD (firmada, base con ITBMS, hora-Panamá) + última factura por empresa,
  // ya agregadas server-side. Si el RPC aún no está aplicado (ventana de deploy),
  // degrada a vacío en vez de romper la ficha.
  if (ventasRpc.error) {
    console.error("[clientes/ficha] cliente_ficha_ventas:", ventasRpc.error.message);
  }
  const ventasMap = new Map<string, number>();
  const ultimaFacturaMap = new Map<string, string>();
  let ultimaGlobal: string | null = null;
  for (const r of (ventasRpc.data ?? []) as {
    empresa_key: string; ventas_ytd: number | string; ultima_factura: string | null;
  }[]) {
    ventasMap.set(r.empresa_key, Math.round(Number(r.ventas_ytd ?? 0) * 100) / 100);
    if (r.ultima_factura) {
      ultimaFacturaMap.set(r.empresa_key, r.ultima_factura);
      if (!ultimaGlobal || r.ultima_factura > ultimaGlobal) ultimaGlobal = r.ultima_factura;
    }
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

  // Últimas guías del cliente (guia_items ya traído en paralelo arriba). Dedupe
  // por guía (un cliente puede tener varias líneas en la misma guía) y tomamos
  // las 3 más recientes. Link al detalle por URL: /guias/[id]/imprimir.
  const guiaIds = [...new Set(
    (guiaItemRows.data ?? [])
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
