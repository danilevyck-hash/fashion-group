import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET() {
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 86400000);
  const todayStr = now.toISOString().slice(0, 10);
  const weekStr = weekFromNow.toISOString().slice(0, 10);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [reclamosRes, chequesRes, periodoRes, guiasRes, clientesRes] = await Promise.all([
    supabaseServer.from("reclamos").select("*", { count: "exact", head: true }).neq("estado", "Aplicada"),
    supabaseServer.from("cheques").select("fecha_deposito, monto").eq("estado", "pendiente"),
    supabaseServer.from("caja_periodos").select("fondo_inicial, id").eq("estado", "abierto").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabaseServer.from("guia_transporte").select("*", { count: "exact", head: true }).gte("created_at", monthStart),
    supabaseServer.from("directorio_clientes").select("*", { count: "exact", head: true }),
  ]);

  const reclamosPendientes = reclamosRes.count;
  const cheques = chequesRes.data;
  const periodoAbierto = periodoRes.data;
  const guiasEsteMes = guiasRes.count;
  const totalClientes = clientesRes.count;

  const vencenSemana = (cheques || []).filter((c) => c.fecha_deposito >= todayStr && c.fecha_deposito <= weekStr);
  const vencenHoy = (cheques || []).filter((c) => c.fecha_deposito === todayStr);

  let cajaDisponible: number | null = null;
  if (periodoAbierto) {
    const { data: gastos } = await supabaseServer.from("caja_gastos").select("total").eq("periodo_id", periodoAbierto.id);
    const totalG = (gastos || []).reduce((s, g) => s + (Number(g.total) || 0), 0);
    cajaDisponible = (periodoAbierto.fondo_inicial || 200) - totalG;
  }

  return NextResponse.json({
    reclamosPendientes: reclamosPendientes || 0,
    vencenEstaSemana: vencenSemana.length,
    vencenHoy: vencenHoy.length,
    cajaDisponible,
    cajaFondo: periodoAbierto?.fondo_inicial || null,
    guiasEsteMes: guiasEsteMes || 0,
    totalClientes: totalClientes || 0,
  });
}
