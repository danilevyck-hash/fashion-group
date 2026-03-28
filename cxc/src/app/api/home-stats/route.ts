import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET() {
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 86400000);
  const todayStr = now.toISOString().slice(0, 10);
  const weekStr = weekFromNow.toISOString().slice(0, 10);
  const staleDate = new Date(now.getTime() - 7 * 86400000).toISOString();
  const dias45 = new Date(now.getTime() - 45 * 86400000).toISOString().slice(0, 10);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [reclamosRes, reclamosViejosRes, chequesRes, periodoRes, guiasRes, clientesRes, uploadsRes, prestamosRes] = await Promise.all([
    supabaseServer.from("reclamos").select("*", { count: "exact", head: true })
      .not("estado", "in", '("Resuelto con NC","Rechazado","Aplicada")'),
    supabaseServer.from("reclamos").select("*", { count: "exact", head: true })
      .not("estado", "in", '("Resuelto con NC","Rechazado","Aplicada")')
      .lt("fecha_reclamo", dias45),
    supabaseServer.from("cheques").select("fecha_deposito, monto").eq("estado", "pendiente"),
    supabaseServer.from("caja_periodos").select("fondo_inicial, id").eq("estado", "abierto").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabaseServer.from("guia_transporte").select("*", { count: "exact", head: true }).gte("created_at", monthStart),
    supabaseServer.from("directorio_clientes").select("*", { count: "exact", head: true }),
    supabaseServer.from("cxc_uploads").select("uploaded_at").order("uploaded_at", { ascending: false }).limit(1),
    supabaseServer.from("prestamos_movimientos").select("*", { count: "exact", head: true }).eq("estado", "pendiente_aprobacion"),
  ]);

  const cheques = chequesRes.data;
  const periodoAbierto = periodoRes.data;
  const vencenSemana = (cheques || []).filter((c) => c.fecha_deposito >= todayStr && c.fecha_deposito <= weekStr);
  const vencenHoy = (cheques || []).filter((c) => c.fecha_deposito === todayStr);

  let cajaDisponible: number | null = null;
  if (periodoAbierto) {
    const { data: gastos } = await supabaseServer.from("caja_gastos").select("total").eq("periodo_id", periodoAbierto.id);
    const totalG = (gastos || []).reduce((s, g) => s + (Number(g.total) || 0), 0);
    cajaDisponible = (periodoAbierto.fondo_inicial || 200) - totalG;
  }

  // Check CXC data freshness
  const lastUpload = uploadsRes.data?.[0]?.uploaded_at || null;
  const cxcStale = lastUpload ? new Date(lastUpload) < new Date(staleDate) : true;

  return NextResponse.json({
    reclamosPendientes: reclamosRes.count || 0,
    reclamosViejos: reclamosViejosRes.count || 0,
    vencenEstaSemana: vencenSemana.length,
    vencenHoy: vencenHoy.length,
    cajaDisponible,
    cajaFondo: periodoAbierto?.fondo_inicial || null,
    guiasEsteMes: guiasRes.count || 0,
    totalClientes: clientesRes.count || 0,
    prestamosPendientes: prestamosRes.count || 0,
    cxcStale,
    lastUpload,
  });
}
