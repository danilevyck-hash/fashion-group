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
  const auth = requireRole(req, ["admin", "secretaria", "director", "contabilidad", "bodega", "vendedor"]);
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
    console.warn("[home-stats] RPC fallback:", rpcRes.error.message);
    return await legacyHandler(now, todayStr, weekStr, staleDate, dias45, monthStart, currentMonth, currentYear, prevMonth, prevYear);
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
    const { data: compData } = await supabaseServer
      .from("ventas_raw")
      .select("subtotal")
      .eq("anio", compYear)
      .eq("mes", compMonth);
    ventasPrev = (compData || []).reduce((s, x) => s + (Number(x.subtotal) || 0), 0);
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

// Fallback: si el RPC no existe (migration pendiente), usar Promise.all viejo.
// Eliminar este fallback una vez confirmado que home_dashboard_summary está activo.
async function legacyHandler(
  now: Date, todayStr: string, weekStr: string, staleDate: string, dias45: string,
  monthStart: string, currentMonth: number, currentYear: number,
  prevMonth: number, prevYear: number
): Promise<NextResponse> {
  const { getVentasMensuales } = await import("@/lib/empresa-mapping");

  const [
    reclamosRes, reclamosViejosRes, reclamosResueltosRes,
    chequesRes, periodoRes, guiasRes, guiasPendientesRes, clientesRes, uploadsRes, prestamosRes,
    ventasMesRes, ventasPrevRes, cxcRes,
  ] = await Promise.all([
    supabaseServer.from("reclamos").select("*", { count: "exact", head: true })
      .eq("deleted", false).not("estado", "in", '("Aplicado","Rechazado","Aplicada")'),
    supabaseServer.from("reclamos").select("*", { count: "exact", head: true })
      .eq("deleted", false).not("estado", "in", '("Aplicado","Rechazado","Aplicada")').lt("fecha_reclamo", dias45),
    supabaseServer.from("reclamos").select("*", { count: "exact", head: true })
      .eq("deleted", false).in("estado", ["Aplicado", "Aplicada"]).gte("updated_at", monthStart),
    supabaseServer.from("cheques").select("fecha_deposito, monto").eq("estado", "pendiente").eq("deleted", false),
    supabaseServer.from("caja_periodos").select("fondo_inicial, id").eq("estado", "abierto").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabaseServer.from("guia_transporte").select("*", { count: "exact", head: true }).gte("created_at", monthStart),
    supabaseServer.from("guia_transporte").select("*", { count: "exact", head: true }).eq("estado", "Pendiente Bodega").eq("deleted", false),
    supabaseServer.from("directorio_clientes").select("*", { count: "exact", head: true }).eq("deleted", false),
    supabaseServer.from("cxc_uploads").select("uploaded_at").order("uploaded_at", { ascending: false }).limit(1),
    supabaseServer.from("prestamos_movimientos").select("*", { count: "exact", head: true }).eq("estado", "pendiente_aprobacion").or("deleted.is.null,deleted.eq.false"),
    getVentasMensuales(currentYear, currentMonth).then(d => ({ data: d, error: null })).catch(() => ({ data: null, error: null })),
    getVentasMensuales(prevYear, prevMonth).then(d => ({ data: d, error: null })).catch(() => ({ data: null, error: null })),
    supabaseServer.from("cxc_rows").select("total, d121_180, d181_270, d271_365, mas_365"),
  ]);

  const cheques = chequesRes.data;
  const periodoAbierto = periodoRes.data;
  const vencenSemana = (cheques || []).filter((c) => c.fecha_deposito >= todayStr && c.fecha_deposito <= weekStr);
  const vencenHoy = (cheques || []).filter((c) => c.fecha_deposito === todayStr);
  const chequesTotalPendiente = (cheques || []).reduce((s, c) => s + (Number(c.monto) || 0), 0);

  let cajaDisponible: number | null = null;
  if (periodoAbierto) {
    const { data: gastos } = await supabaseServer.from("caja_gastos").select("total").eq("periodo_id", periodoAbierto.id).eq("deleted", false);
    const totalG = (gastos || []).reduce((s, g) => s + (Number(g.total) || 0), 0);
    cajaDisponible = (periodoAbierto.fondo_inicial || 200) - totalG;
  }

  const lastUpload = uploadsRes.data?.[0]?.uploaded_at || null;
  const cxcStale = lastUpload ? new Date(lastUpload) < new Date(staleDate) : true;

  const MESES_LABEL = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  let ventasMes = (ventasMesRes.data || []).reduce((s: number, r: { ventas_netas: number }) => s + (Number(r.ventas_netas) || 0), 0);
  let ventasPrev = (ventasPrevRes.data || []).reduce((s: number, r: { ventas_netas: number }) => s + (Number(r.ventas_netas) || 0), 0);
  let ventasMesLabel = `${MESES_LABEL[currentMonth]} ${currentYear}`;
  let shownMonth = currentMonth;
  let shownYear = currentYear;

  if (ventasMes === 0 && ventasPrev !== 0) {
    ventasMes = ventasPrev;
    ventasMesLabel = `${MESES_LABEL[prevMonth]} ${prevYear}`;
    shownMonth = prevMonth;
    shownYear = prevYear;
    const compMonth = shownMonth === 1 ? 12 : shownMonth - 1;
    const compYear = shownMonth === 1 ? shownYear - 1 : shownYear;
    try {
      const compData = await getVentasMensuales(compYear, compMonth);
      ventasPrev = compData.reduce((s, r) => s + (Number(r.ventas_netas) || 0), 0);
    } catch {
      ventasPrev = 0;
    }
  }

  const cxcRows = cxcRes.data || [];
  const cxcTotal = cxcRows.reduce((s, r) => s + (Number(r.total) || 0), 0);
  const cxcVencida = cxcRows.reduce((s, r) => s + (Number(r.d121_180) || 0) + (Number(r.d181_270) || 0) + (Number(r.d271_365) || 0) + (Number(r.mas_365) || 0), 0);

  return NextResponse.json({
    reclamosPendientes: reclamosRes.count || 0,
    reclamosViejos: reclamosViejosRes.count || 0,
    reclamosResueltosEsteMes: reclamosResueltosRes.count || 0,
    vencenEstaSemana: vencenSemana.length,
    vencenHoy: vencenHoy.length,
    chequesTotalPendiente,
    cajaDisponible,
    cajaFondo: periodoAbierto?.fondo_inicial || null,
    guiasEsteMes: guiasRes.count || 0,
    guiasPendientes: guiasPendientesRes.count || 0,
    totalClientes: clientesRes.count || 0,
    prestamosPendientes: prestamosRes.count || 0,
    cxcStale,
    lastUpload,
    ventasMes,
    ventasMesLabel,
    ventasPrev,
    cxcTotal,
    cxcVencida,
  });
}
