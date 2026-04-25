import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAuth } from "@/lib/require-auth";
import { mapEmpresaName } from "@/lib/empresa-mapping";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardSummaryRow {
  empresa: string;
  mes: number;
  total_subtotal: number | string;
  total_costo: number | string;
  total_utilidad: number | string;
  total_facturado: number | string;
  filas: number;
}

interface TopClienteRow {
  cliente: string;
  total_subtotal: number | string;
  total_utilidad: number | string;
}

interface ClienteDetalleEmpresaRow {
  empresa: string;
  subtotal: number | string;
  utilidad: number | string;
}

interface ClienteDetalleRow {
  cliente: string;
  subtotal_actual: number | string;
  utilidad_actual: number | string;
  prev_subtotal: number | string;
  last_fecha: string | null;
  last12m_total: number | string;
  is_inactive: boolean;
  empresas: ClienteDetalleEmpresaRow[];
}

// ─── Route ────────────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const authError = requireAuth(req, ["admin", "director", "contabilidad"]);
  if (authError) return authError;

  const params = req.nextUrl.searchParams;
  const añoParam = params.get("anio");
  const desdeParam = params.get("desde");

  if (!añoParam) return NextResponse.json({ error: "año requerido" }, { status: 400 });
  const año = parseInt(añoParam, 10);
  if (isNaN(año)) return NextResponse.json({ error: "año inválido" }, { status: 400 });

  const twelveMonthsAgo = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
  const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);

  const [currentRes, prevRes, topRes, detalleRes] = await Promise.all([
    supabaseServer.rpc("ventas_dashboard_summary", { p_anio: año }),
    supabaseServer.rpc("ventas_dashboard_summary", { p_anio: año - 1 }),
    supabaseServer.rpc("ventas_topclientes_summary", { p_anio: año, p_top: 10 }),
    supabaseServer.rpc("ventas_clientes_detalle_summary", {
      p_anio: año,
      p_desde: desdeParam || null,
      p_twelve_months_ago: twelveMonthsAgo,
      p_sixty_days_ago: sixtyDaysAgo,
    }),
  ]);

  const errors = [currentRes.error, prevRes.error, topRes.error, detalleRes.error].filter(Boolean);
  if (errors.length > 0) {
    console.error("[ventas/v2] RPC errors", errors.map(e => `${e!.code}: ${e!.message}`).join(" | "));
    return NextResponse.json(
      { error: "Error al cargar datos de ventas", details: errors.map(e => e!.message) },
      { status: 500 },
    );
  }

  // byEmpresaMes — aplicar mapEmpresa (key → display) y normalizar shape al frontend
  const byEmpresaMes = (currentRes.data as DashboardSummaryRow[] | null ?? []).map(r => ({
    empresa: mapEmpresaName(r.empresa),
    mes: r.mes,
    subtotal: Number(r.total_subtotal) || 0,
    costo: Number(r.total_costo) || 0,
    utilidad: Number(r.total_utilidad) || 0,
  }));

  const prevYear = (prevRes.data as DashboardSummaryRow[] | null ?? []).map(r => ({
    empresa: mapEmpresaName(r.empresa),
    mes: r.mes,
    subtotal: Number(r.total_subtotal) || 0,
    utilidad: Number(r.total_utilidad) || 0,
  }));

  // topClientes — shape esperada por el frontend: { cliente, subtotal, utilidad }
  const topClientes = (topRes.data as TopClienteRow[] | null ?? []).map(r => ({
    cliente: r.cliente,
    subtotal: Number(r.total_subtotal) || 0,
    utilidad: Number(r.total_utilidad) || 0,
  }));

  // clientesDetalle — renombrar campos y mapEmpresa en sub-array
  const clientesDetalle = (detalleRes.data as ClienteDetalleRow[] | null ?? []).map(r => ({
    cliente: r.cliente,
    subtotal: Number(r.subtotal_actual) || 0,
    utilidad: Number(r.utilidad_actual) || 0,
    lastFecha: r.last_fecha ?? "",
    prevSubtotal: Number(r.prev_subtotal) || 0,
    last12mTotal: Number(r.last12m_total) || 0,
    isInactive: !!r.is_inactive,
    empresas: (r.empresas ?? []).map(e => ({
      empresa: mapEmpresaName(e.empresa),
      subtotal: Number(e.subtotal) || 0,
      utilidad: Number(e.utilidad) || 0,
      lastFecha: "",
    })),
  }));

  return NextResponse.json({ byEmpresaMes, topClientes, prevYear, clientesDetalle });
}
