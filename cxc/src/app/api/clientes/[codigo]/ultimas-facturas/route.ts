// ─────────────────────────────────────────────────────────────────────────────
// GET /api/clientes/[codigo]/ultimas-facturas?empresa={empresaScope}
//
// Devuelve las últimas 5 FACTURAS (más reciente primero) del cliente, para el
// detalle del tab Clientes (HoverCard desktop / Sheet mobile).
//
// Fuente: switch_facturas, puenteado por ID vía switch_clientes (NO por nombre):
//   codigo D-XXX → switch_clientes.(empresa_key, cliente_switch_id) → switch_facturas
//
// Scope empresa (respeta el filtro activo del tab):
//   - "todas" / ausente → 5 facturas más recientes cross-empresa del cliente.
//   - empresa key específica → solo facturas de esa empresa.
//
// Filtros fijos:
//   - tipo_comprobante = 'Factura' (excluye Notas de Crédito/Débito, Tiquetes, etc.)
//   - monto = subtotal_descuento (misma base pre-impuesto del resto del módulo)
//
// Cliente sin puente / sin facturas (huérfanos, sin ventas Switch) → { facturas: [] }
// (200, no error) para que el detalle muestre un estado vacío limpio.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAuth } from "@/lib/require-auth";

export const dynamic = "force-dynamic";

const READ_ROLES = ["admin", "contabilidad", "secretaria", "vendedor"];
const MAX_FACTURAS = 5;

interface ParBridge {
  empresa_key: string;
  cliente_switch_id: number;
}

interface FacturaRow {
  fecha: string | null;
  subtotal_descuento: number | string | null;
  empresa_key: string;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ codigo: string }> }) {
  const authError = requireAuth(req, READ_ROLES);
  if (authError) return authError;

  const { codigo } = await ctx.params;
  if (!codigo) {
    return NextResponse.json({ error: "codigo requerido" }, { status: 400 });
  }

  const empresa = req.nextUrl.searchParams.get("empresa") ?? "todas";
  const scopeAll = !empresa || empresa === "todas";

  // 1. Puente por ID: pares (empresa_key, cliente_switch_id) del codigo.
  let bridgeQuery = supabaseServer
    .from("switch_clientes")
    .select("empresa_key, cliente_switch_id")
    .eq("codigo", codigo);
  if (!scopeAll) bridgeQuery = bridgeQuery.eq("empresa_key", empresa);

  const { data: pares, error: bErr } = await bridgeQuery;
  if (bErr) {
    console.error("[ultimas-facturas] bridge query error:", bErr.message);
    return NextResponse.json({ error: bErr.message }, { status: 500 });
  }

  const validPairs = ((pares ?? []) as ParBridge[]).filter(
    p => p.empresa_key && typeof p.cliente_switch_id === "number"
  );
  if (validPairs.length === 0) {
    // Cliente sin registro en el puente (huérfano / no-B2B / sin ventas Switch).
    return NextResponse.json({ facturas: [] });
  }

  // 2. Facturas de esos pares. El OR de tuplas (empresa_key, cliente_switch_id)
  //    evita el cross-product inseguro de .in()×.in() (un mismo cid puede ser
  //    cliente distinto en otra empresa).
  const orFilter = validPairs
    .map(p => `and(empresa_key.eq.${p.empresa_key},cliente_switch_id.eq.${p.cliente_switch_id})`)
    .join(",");

  const { data: facs, error: fErr } = await supabaseServer
    .from("switch_facturas")
    .select("fecha, subtotal_descuento, empresa_key")
    .eq("tipo_comprobante", "Factura")
    .or(orFilter)
    .order("fecha", { ascending: false })
    .limit(MAX_FACTURAS);

  if (fErr) {
    console.error("[ultimas-facturas] facturas query error:", fErr.message);
    return NextResponse.json({ error: fErr.message }, { status: 500 });
  }

  const facturas = ((facs ?? []) as FacturaRow[]).map(f => ({
    // fecha es timestamptz; recortamos a YYYY-MM-DD para fmtDate en el cliente.
    fecha: f.fecha ? String(f.fecha).slice(0, 10) : null,
    monto: Number(f.subtotal_descuento ?? 0),
    empresa_key: f.empresa_key,
  }));

  return NextResponse.json({ facturas });
}
