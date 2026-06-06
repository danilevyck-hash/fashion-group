import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { getVencenSemanaRange } from "@/lib/cheques-dates";

export const dynamic = "force-dynamic";

interface HomeRpcResult {
  reclamosPendientes: number;
  reclamosViejos: number;
  reclamosResueltosEsteMes: number;
  guiasEsteMes: number;
  guiasPendientes: number;
  totalClientes: number;
  prestamosPendientes: number;
  lastUpload: string | null;
  cxcTotal: number;
  cxcVencida: number;
  ventasMes: number;
  ventasPrev: number;
  cajaPeriodoId: string | null;
  cajaFondo: number | null;
  cajaGastosTotal: number;
}

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria", "contabilidad", "bodega", "vendedor"]);
  if (auth instanceof NextResponse) return auth;

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const weekStr = getVencenSemanaRange(todayStr).end;
  const staleDate = new Date(now.getTime() - 7 * 86400000).toISOString();
  const dias45 = new Date(now.getTime() - 45 * 86400000).toISOString().slice(0, 10);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
  const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;

  // 1 RPC consolidado + 1 query a cheques (necesita filtro por fecha en JS)
  const [rpcRes, chequesRes] = await Promise.all([
    supabaseServer.rpc("home_dashboard_summary", {
      p_dias_45: dias45,
      p_month_start: monthStart,
      p_current_year: currentYear,
      p_current_month: currentMonth,
      p_prev_year: prevYear,
      p_prev_month: prevMonth,
    }),
    supabaseServer.from("cheques").select("fecha_deposito, monto").eq("estado", "pendiente").eq("deleted", false),
  ]);

  // Si el RPC no existe (migration pendiente), fallback al patrón viejo
  if (rpcRes.error) {
    console.error("[home-stats] RPC error:", rpcRes.error.message);
    return NextResponse.json({ error: "Error al cargar dashboard" }, { status: 500 });
  }

  const r = rpcRes.data as HomeRpcResult;

  // Cheques: filtrar en JS porque necesita comparación de fechas exactas
  const cheques = chequesRes.data || [];
  const vencenSemana = cheques.filter((c) => c.fecha_deposito >= todayStr && c.fecha_deposito <= weekStr);
  const vencenHoy = cheques.filter((c) => c.fecha_deposito === todayStr);
  const chequesTotalPendiente = cheques.reduce((s, c) => s + (Number(c.monto) || 0), 0);

  // Caja: cálculo trivial
  const cajaDisponible = r.cajaPeriodoId
    ? (Number(r.cajaFondo) || 200) - Number(r.cajaGastosTotal || 0)
    : null;

  // Ventas: si mes actual sin data, usar mes previo
  const MESES_LABEL = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  let ventasMes = Number(r.ventasMes) || 0;
  let ventasPrev = Number(r.ventasPrev) || 0;
  let ventasMesLabel = `${MESES_LABEL[currentMonth]} ${currentYear}`;

  if (ventasMes === 0 && ventasPrev !== 0) {
    ventasMes = ventasPrev;
    ventasMesLabel = `${MESES_LABEL[prevMonth]} ${prevYear}`;
    const compMonth = prevMonth === 1 ? 12 : prevMonth - 1;
    const compYear = prevMonth === 1 ? prevYear - 1 : prevYear;
    // Fuente única switch_facturas (vía la vista unificada switch-only del Paso 2).
    const compMonthStart = `${compYear}-${String(compMonth).padStart(2, "0")}-01`;
    const { data: compData } = await supabaseServer
      .from("switch_ventas_unificado_vw")
      .select("ventas_netas")
      .eq("mes", compMonthStart);
    ventasPrev = (compData || []).reduce((s, x) => s + (Number(x.ventas_netas) || 0), 0);
  }

  const cxcStale = r.lastUpload ? new Date(r.lastUpload) < new Date(staleDate) : true;

  return NextResponse.json({
    reclamosPendientes: r.reclamosPendientes,
    reclamosViejos: r.reclamosViejos,
    reclamosResueltosEsteMes: r.reclamosResueltosEsteMes,
    vencenEstaSemana: vencenSemana.length,
    vencenHoy: vencenHoy.length,
    chequesTotalPendiente,
    cajaDisponible,
    cajaFondo: r.cajaFondo,
    guiasEsteMes: r.guiasEsteMes,
    guiasPendientes: r.guiasPendientes,
    totalClientes: r.totalClientes,
    prestamosPendientes: r.prestamosPendientes,
    cxcStale,
    lastUpload: r.lastUpload,
    ventasMes,
    ventasMesLabel,
    ventasPrev,
    cxcTotal: Number(r.cxcTotal) || 0,
    cxcVencida: Number(r.cxcVencida) || 0,
  });
}

