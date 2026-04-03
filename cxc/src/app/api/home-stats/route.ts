import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";

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
      .not("estado", "in", '("Resuelto con NC","Rechazado","Aplicada")'),
    supabaseServer.from("reclamos").select("*", { count: "exact", head: true })
      .eq("deleted", false)
      .not("estado", "in", '("Resuelto con NC","Rechazado","Aplicada")')
      .lt("fecha_reclamo", dias45),
    supabaseServer.from("reclamos").select("*", { count: "exact", head: true })
      .eq("deleted", false)
      .in("estado", ["Resuelto con NC", "Aplicada"])
      .gte("updated_at", monthStart),
    supabaseServer.from("cheques").select("fecha_deposito, monto").eq("estado", "pendiente").eq("deleted", false),
    supabaseServer.from("caja_periodos").select("fondo_inicial, id").eq("estado", "abierto").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabaseServer.from("guia_transporte").select("*", { count: "exact", head: true }).gte("created_at", monthStart),
    supabaseServer.from("guia_transporte").select("*", { count: "exact", head: true }).eq("estado", "Pendiente Bodega").eq("deleted", false),
    supabaseServer.from("directorio_clientes").select("*", { count: "exact", head: true }).eq("deleted", false),
    supabaseServer.from("cxc_uploads").select("uploaded_at").order("uploaded_at", { ascending: false }).limit(1),
    supabaseServer.from("prestamos_movimientos").select("*", { count: "exact", head: true }).eq("estado", "pendiente_aprobacion"),
    // Ventas mes actual
    supabaseServer.from("ventas_mensuales").select("ventas_brutas, notas_credito").eq("año", currentYear).eq("mes", currentMonth),
    // Ventas mes anterior
    supabaseServer.from("ventas_mensuales").select("ventas_brutas, notas_credito").eq("año", prevYear).eq("mes", prevMonth),
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

  // Ventas
  const ventasMes = (ventasMesRes.data || []).reduce((s, r) => s + (Number(r.ventas_brutas) || 0) - (Number(r.notas_credito) || 0), 0);
  const ventasPrev = (ventasPrevRes.data || []).reduce((s, r) => s + (Number(r.ventas_brutas) || 0) - (Number(r.notas_credito) || 0), 0);

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
    ventasPrev,
    cxcTotal,
    cxcVencida,
  });
}
