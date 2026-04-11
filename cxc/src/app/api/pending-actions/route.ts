import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";

interface PendingAction {
  id: string;
  module: string;
  icon: string;
  description: string;
  timeContext: string;
  href: string;
  urgency: number; // higher = more urgent
}

function daysAgo(dateStr: string): number {
  const now = new Date();
  const d = new Date(dateStr);
  return Math.floor((now.getTime() - d.getTime()) / 86400000);
}

function formatMonto(monto: number): string {
  return monto.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria", "director", "contabilidad"]);
  if (auth instanceof NextResponse) return auth;

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const weekStr = new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10);
  const dias45 = new Date(now.getTime() - 45 * 86400000).toISOString().slice(0, 10);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000).toISOString();

  const [
    chequesHoyRes,
    chequesSemanaRes,
    reclamosViejosRes,
    guiasPendientesRes,
    prestamosRes,
    periodoRes,
    cxcUploadsRes,
    cxcFollowupsRes,
  ] = await Promise.all([
    // Cheques that expire today
    supabaseServer
      .from("cheques")
      .select("id, numero_cheque, monto, fecha_deposito, cliente")
      .eq("estado", "pendiente")
      .eq("deleted", false)
      .eq("fecha_deposito", todayStr),

    // Cheques that expire this week (not today)
    supabaseServer
      .from("cheques")
      .select("id, numero_cheque, monto, fecha_deposito, cliente")
      .eq("estado", "pendiente")
      .eq("deleted", false)
      .gt("fecha_deposito", todayStr)
      .lte("fecha_deposito", weekStr),

    // Old unresolved reclamos (45+ days)
    supabaseServer
      .from("reclamos")
      .select("id, nro_reclamo, proveedor, fecha_reclamo, estado")
      .eq("deleted", false)
      .not("estado", "in", '("Aplicado","Rechazado","Aplicada")')
      .lt("fecha_reclamo", dias45)
      .order("fecha_reclamo", { ascending: true })
      .limit(3),

    // Guias pending dispatch
    supabaseServer
      .from("guia_transporte")
      .select("id, numero, created_at, transportista")
      .eq("estado", "Pendiente Bodega")
      .eq("deleted", false)
      .order("created_at", { ascending: true })
      .limit(3),

    // Prestamos pending approval
    supabaseServer
      .from("prestamos_movimientos")
      .select("id, created_at")
      .eq("estado", "pendiente_aprobacion"),

    // Open caja periodo
    supabaseServer
      .from("caja_periodos")
      .select("id, fondo_inicial, numero")
      .eq("estado", "abierto")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),

    // CXC uploads to check staleness
    supabaseServer
      .from("cxc_uploads")
      .select("uploaded_at")
      .order("uploaded_at", { ascending: false })
      .limit(1),

    // CXC rows with overdue follow-ups
    supabaseServer
      .from("cxc_rows")
      .select("id, cliente, proximo_seguimiento")
      .not("proximo_seguimiento", "is", null)
      .lt("proximo_seguimiento", todayStr)
      .order("proximo_seguimiento", { ascending: true })
      .limit(50),
  ]);

  const actions: PendingAction[] = [];

  // 1. Cheques vencen hoy
  const chequesHoy = chequesHoyRes.data || [];
  if (chequesHoy.length > 0) {
    const totalMonto = chequesHoy.reduce((s, c) => s + (Number(c.monto) || 0), 0);
    actions.push({
      id: "cheques-hoy",
      module: "cheques",
      icon: "🏦",
      description: `${chequesHoy.length} cheque${chequesHoy.length > 1 ? "s" : ""} vence${chequesHoy.length > 1 ? "n" : ""} hoy — $${formatMonto(totalMonto)} total`,
      timeContext: "Vence hoy",
      href: "/cheques?filtro=vencen_hoy",
      urgency: 100,
    });
  }

  // 2. Cheques vencen esta semana
  const chequesSemana = chequesSemanaRes.data || [];
  if (chequesSemana.length > 0) {
    const totalMonto = chequesSemana.reduce((s, c) => s + (Number(c.monto) || 0), 0);
    actions.push({
      id: "cheques-semana",
      module: "cheques",
      icon: "🏦",
      description: `${chequesSemana.length} cheque${chequesSemana.length > 1 ? "s" : ""} vence${chequesSemana.length > 1 ? "n" : ""} esta semana — $${formatMonto(totalMonto)}`,
      timeContext: "Esta semana",
      href: "/cheques?filtro=vencen_semana",
      urgency: 80,
    });
  }

  // 3. Guias pending dispatch
  const guiasPend = guiasPendientesRes.data || [];
  for (const g of guiasPend) {
    const days = daysAgo(g.created_at);
    actions.push({
      id: `guia-${g.id}`,
      module: "guias",
      icon: "🚚",
      description: `Guía #${g.numero} pendiente de despacho${g.transportista ? ` — ${g.transportista}` : ""}`,
      timeContext: days === 0 ? "Hoy" : days === 1 ? "Hace 1 día" : `Hace ${days} días`,
      href: `/guias?expand=${g.id}`,
      urgency: 70 + Math.min(days * 5, 25),
    });
  }

  // 4. Reclamos viejos (45+ days)
  const reclamosViejos = reclamosViejosRes.data || [];
  for (const r of reclamosViejos) {
    const days = daysAgo(r.fecha_reclamo);
    actions.push({
      id: `reclamo-${r.id}`,
      module: "reclamos",
      icon: "📝",
      description: `Reclamo ${r.nro_reclamo} lleva ${days} días sin resolver${r.proveedor ? ` — ${r.proveedor}` : ""}`,
      timeContext: `${days} días`,
      href: `/reclamos/${r.id}`,
      urgency: 60 + Math.min(days - 45, 30),
    });
  }

  // 5. CXC follow-ups overdue
  const cxcFollowups = cxcFollowupsRes.data || [];
  if (cxcFollowups.length > 0) {
    actions.push({
      id: "cxc-seguimientos",
      module: "cxc",
      icon: "📊",
      description: `${cxcFollowups.length} seguimiento${cxcFollowups.length > 1 ? "s" : ""} CXC vencido${cxcFollowups.length > 1 ? "s" : ""}`,
      timeContext: "Vencidos",
      href: "/admin?sort=seguimiento",
      urgency: 65,
    });
  }

  // 6. Caja periodo low balance
  if (periodoRes.data) {
    const periodo = periodoRes.data;
    const { data: gastos } = await supabaseServer
      .from("caja_gastos")
      .select("total")
      .eq("periodo_id", periodo.id);
    const totalGastos = (gastos || []).reduce((s, g) => s + (Number(g.total) || 0), 0);
    const fondo = periodo.fondo_inicial || 200;
    const disponible = fondo - totalGastos;
    const pct = disponible / fondo;
    if (pct < 0.1) {
      actions.push({
        id: `caja-${periodo.id}`,
        module: "caja",
        icon: "💵",
        description: `Período de caja${periodo.numero ? ` #${periodo.numero}` : ""} con saldo bajo — $${formatMonto(disponible)} disponible`,
        timeContext: `${Math.round(pct * 100)}% del fondo`,
        href: `/caja/periodo/${periodo.id}`,
        urgency: 75,
      });
    }
  }

  // 7. Prestamos pending
  const prestamosPend = prestamosRes.data || [];
  if (prestamosPend.length > 0) {
    actions.push({
      id: "prestamos-pendientes",
      module: "prestamos",
      icon: "🤝",
      description: `${prestamosPend.length} aprobación${prestamosPend.length > 1 ? "es" : ""} de préstamo pendiente${prestamosPend.length > 1 ? "s" : ""}`,
      timeContext: "Pendiente",
      href: "/prestamos?pendientes=1",
      urgency: 55,
    });
  }

  // 8. CXC stale data
  const lastUpload = cxcUploadsRes.data?.[0]?.uploaded_at || null;
  if (!lastUpload || new Date(lastUpload) < new Date(sevenDaysAgo)) {
    const days = lastUpload ? daysAgo(lastUpload) : 0;
    actions.push({
      id: "cxc-stale",
      module: "upload",
      icon: "📤",
      description: lastUpload
        ? `Datos de cartera sin actualizar hace ${days} días`
        : "Datos de cartera nunca cargados",
      timeContext: lastUpload ? `Hace ${days} días` : "Sin datos",
      href: "/upload",
      urgency: 50,
    });
  }

  // Sort by urgency descending, limit to 8
  actions.sort((a, b) => b.urgency - a.urgency);
  const limited = actions.slice(0, 8);

  return NextResponse.json({
    actions: limited,
    totalCount: actions.length,
  });
}
