// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ventas/utilidad-cliente?year=YYYY
//
// Tab Utilidad de Ventas: utilidad real por cliente. Lee la RPC
// utilidad_por_cliente(p_anio) sobre switch_factura_utilidad (reporte web, la
// misma fuente que Comisiones — cuadra al centavo). Alcance: 2026 + 5 B2B.
// Las NC se guardan negativas → ventas/utilidad netas pueden ser negativas
// (devoluciones > ventas): dato válido, se pasa tal cual al cliente.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { empresaNombre, type UtilidadClienteResponse, type UtilidadClienteRow } from "@/lib/ventas/utilidad-cliente";

export const dynamic = "force-dynamic";

interface RpcRow {
  empresa_key: string | null;
  cliente_switch_id: number | null;
  cliente: string | null;
  n_docs: number | string;
  total_subtotal: number | string;
  total_costo: number | string;
  total_utilidad: number | string;
  pct_utilidad: number | string | null;
}

const num = (v: number | string | null | undefined): number =>
  typeof v === "number" ? v : Number(v ?? 0) || 0;

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const year = parseInt(req.nextUrl.searchParams.get("year") ?? "", 10);
  if (!Number.isInteger(year) || year < 2024 || year > 2100) {
    return NextResponse.json({ error: "year inválido" }, { status: 400 });
  }

  const { data, error } = await supabaseServer.rpc("utilidad_por_cliente", { p_anio: year });
  if (error) {
    console.error("[api/ventas/utilidad-cliente]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows: UtilidadClienteRow[] = ((data ?? []) as RpcRow[]).map((r) => {
    const ventas = num(r.total_subtotal);
    const costo = num(r.total_costo);
    const utilidad = num(r.total_utilidad);
    const ek = r.empresa_key ?? "";
    return {
      clienteSwitchId: r.cliente_switch_id ?? null,
      cliente: r.cliente ?? "(Sin nombre)",
      empresaKey: ek,
      empresa: empresaNombre(ek),
      nDocs: num(r.n_docs),
      ventas,
      costo,
      utilidad,
      // margen como fracción; null si no hay base de venta positiva (evita % engañoso).
      margen: ventas > 0 ? utilidad / ventas : null,
    };
  });

  const tV = rows.reduce((s, r) => s + r.ventas, 0);
  const tC = rows.reduce((s, r) => s + r.costo, 0);
  const tU = rows.reduce((s, r) => s + r.utilidad, 0);

  const body: UtilidadClienteResponse = {
    year,
    totales: { ventas: tV, costo: tC, utilidad: tU, margen: tV > 0 ? tU / tV : null },
    rows,
  };
  return NextResponse.json(body);
}
