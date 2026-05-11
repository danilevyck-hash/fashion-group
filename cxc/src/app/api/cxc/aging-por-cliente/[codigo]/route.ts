// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cxc/aging-por-cliente/[codigo]?empresa={empresaKey}
//
// Devuelve el saldo CXC del cliente colapsado a 3 buckets de aging:
//   - 0-90    (d0_30 + d31_60 + d61_90)
//   - 91-120  (d91_120)
//   - 121+    (d121_180 + d181_270 + d271_365 + mas_365)
//
// El chip CXC del HoverCard de Ventas → Clientes deriva su color de la
// presencia/ausencia de saldo en cada bucket (reglas binarias, no %).
//
// [codigo] = código Switch Soft (ej. "D-04"), matchea cxc_aging.codigo.
// empresa: si se pasa, filtra por company_key. Si se omite → suma sobre
// todas las empresas con ese código (modo "Todas" del filtro de Ventas).
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAuth } from "@/lib/require-auth";
import { ALL_EMPRESA_KEYS } from "@/lib/empresa-mapping";

export const dynamic = "force-dynamic";

const READ_ROLES = ["admin", "director", "contabilidad", "secretaria", "vendedor"];

interface AgingRow {
  d0_30: number | string | null;
  d31_60: number | string | null;
  d61_90: number | string | null;
  d91_120: number | string | null;
  d121_180: number | string | null;
  d181_270: number | string | null;
  d271_365: number | string | null;
  mas_365: number | string | null;
}

function toNum(v: number | string | null | undefined): number {
  return typeof v === "number" ? v : Number(v ?? 0) || 0;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ codigo: string }> }) {
  const authError = requireAuth(req, READ_ROLES);
  if (authError) return authError;

  const { codigo } = await ctx.params;
  if (!codigo) {
    return NextResponse.json({ error: "codigo requerido" }, { status: 400 });
  }

  const empresaParam = req.nextUrl.searchParams.get("empresa") ?? "";
  const isTodas = !empresaParam || empresaParam === "todas";
  if (!isTodas && !(ALL_EMPRESA_KEYS as readonly string[]).includes(empresaParam)) {
    return NextResponse.json({ error: "empresa inválida" }, { status: 400 });
  }

  let query = supabaseServer
    .from("cxc_aging")
    .select("d0_30, d31_60, d61_90, d91_120, d121_180, d181_270, d271_365, mas_365")
    .eq("codigo", codigo);

  if (!isTodas) query = query.eq("company_key", empresaParam);

  const { data, error } = await query;
  if (error) {
    console.error("[cxc/aging-por-cliente] query error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let monto_0_90 = 0;
  let monto_91_120 = 0;
  let monto_121_plus = 0;
  for (const r of (data ?? []) as AgingRow[]) {
    monto_0_90    += toNum(r.d0_30) + toNum(r.d31_60) + toNum(r.d61_90);
    monto_91_120  += toNum(r.d91_120);
    monto_121_plus += toNum(r.d121_180) + toNum(r.d181_270) + toNum(r.d271_365) + toNum(r.mas_365);
  }
  const saldo_total = monto_0_90 + monto_91_120 + monto_121_plus;

  const round = (n: number) => Math.round(n * 100) / 100;

  return NextResponse.json({
    saldo_total:    round(saldo_total),
    monto_0_90:     round(monto_0_90),
    monto_91_120:   round(monto_91_120),
    monto_121_plus: round(monto_121_plus),
  });
}
