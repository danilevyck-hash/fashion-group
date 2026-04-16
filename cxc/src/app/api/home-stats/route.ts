import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { getVentasMensuales } from "@/lib/empresa-mapping";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria", "director", "contabilidad", "bodega", "vendedor"]); if (auth instanceof NextResponse) return auth;
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 86400000);
  const todayStr = now.toISOString().slice(0, 10);
  const weekStr = weekFromNow.toISOString().slice(0, 10);
  const staleDate = new Date(now.getTime() - 7 * 86400000).toISOString();
  const dias45 = new Date(now.getTime() - 45 * 86400000).toISOString().slice(0, 10);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
  const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;

  const [
    reclamosRes, reclamosViejosRes, reclamosResueltosRes,
    chequesRes, periodoRes, guiasRes, guiasPendientesRes, clientesRes, uploadsRes, prestamosRes,
    ventasMesRes, ventasPrevRes, cxcRes,
  ] = await Promise.all([
    supabaseServer.from("reclamos").select("*", { count: "exact", head: true })
      .eq("deleted", false)
      .not("estado", "in", '("Aplicado","Rechazado","Aplicada")'),
    supabaseServer.from("reclamos").select("*", { count: "exact", head: true })
      .eq("deleted", false)
      .not("estado", "in", '("Aplicado","Rechazado","Aplicada")')
      .lt("fecha_reclamo", dias45),
    supabaseServer.from("reclamos").select("*", { count: "exact", head: true })
      .eq("deleted", false)
      .in("estado", ["Aplicado", "Aplicada"])
      .gte("updated_at", monthStart),
    supabaseServer.from("cheques").select("fecha_deposito, monto").eq("estado", "pendiente").eq("deleted", false),
    supabaseServer.from("caja_periodos").select("fondo_inicial, id").eq("estado", "abierto").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabaseServer.from("guia_transporte").select("*", { count: "exact", head: true }).gte("created_at", monthStart),
    supabaseServer.from("guia_transporte").select("*", { count: "exact", head: true }).eq("estado", "Pendiente Bodega").eq("deleted", false),
    supabaseServer.from("directorio_clientes").select("*", { count: "exact", head: true }).eq("deleted", false),
    supabaseServer.from("cxc_uploads").select("uploaded_at").order("uploaded_at", { ascending: false }).limit(1),
    supabaseServer.from("prestamos_movimientos").select("*", { count: "exact", head: true }).eq("estado", "pendiente_aprobacion"),
    // Ventas mes actual
    getVentasMensuales(currentYear, currentMonth).then(d => ({ data: d, error: null })).catch(() => ({ data: null, error: null })),
    // Ventas mes anterior
    getVentasMensuales(prevYear, prevMonth).then(d => ({ data: d, error: null })).catch(() => ({ data: null, error: null })),
    // CxC totals
    supabaseServer.from("cxc_rows").select("total, d121_180, d181_270, d271_365, mas_365"),
  ]);

  const cheques = chequesRes.data;
  const periodoAbierto = periodoRes.data;
  const vencenSemana = (cheques || []).filter((c) => c.fecha_deposito >= todayStr && c.fecha_deposito <= weekStr);
  const vencenHoy = (cheques || []).filter((c) => c.fecha_deposito === todayStr);
  const chequesTotalPendiente = (cheques || []).reduce((s, c) => s + (Number(c.monto) || 0), 0);

  let cajaDisponible: number | null = null;
  if (periodoAbierto) {
    const { data: gastos } = await supabaseServer.from("caja_gastos").select("total").eq("periodo_id", periodoAbierto.id);
    const totalG = (gastos || []).reduce((s, g) => s + (Number(g.total) || 0), 0);
    cajaDisponible = (periodoAbierto.fondo_inicial || 200) - totalG;
  }

  const lastUpload = uploadsRes.data?.[0]?.uploaded_at || null;
  const cxcStale = lastUpload ? new Date(lastUpload) < new Date(staleDate) : true;

  // Ventas — if current month has no data, fall back to previous month
  // Then compare against the month BEFORE the one being shown
  const MESES_LABEL = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  let ventasMes = (ventasMesRes.data || []).reduce((s: number, r: { ventas_netas: number }) => s + (Number(r.ventas_netas) || 0), 0);
  let ventasPrev = (ventasPrevRes.data || []).reduce((s: number, r: { ventas_netas: number }) => s + (Number(r.ventas_netas) || 0), 0);
  let ventasMesLabel = `${MESES_LABEL[currentMonth]} ${currentYear}`;
  let shownMonth = currentMonth;
  let shownYear = currentYear;

  if (ventasMes === 0 && ventasPrev !== 0) {
    // Current month has no data — show previous month instead
    ventasMes = ventasPrev;
    ventasMesLabel = `${MESES_LABEL[prevMonth]} ${prevYear}`;
    shownMonth = prevMonth;
    shownYear = prevYear;

    // Now fetch the month BEFORE the one we're showing as the comparison
    const compMonth = shownMonth === 1 ? 12 : shownMonth - 1;
    const compYear = shownMonth === 1 ? shownYear - 1 : shownYear;
    try {
      const compData = await getVentasMensuales(compYear, compMonth);
      ventasPrev = compData.reduce((s, r) => s + (Number(r.ventas_netas) || 0), 0);
    } catch {
      ventasPrev = 0;
    }
  }

  // CxC
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
