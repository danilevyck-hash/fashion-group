import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { logActivity } from "@/lib/log-activity";
import { getSession } from "@/lib/require-auth";
import { requireRole } from "@/lib/requireRole";

const CAJA_ROLES = ["admin", "secretaria"];

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, CAJA_ROLES);
  if (auth instanceof NextResponse) return auth;
  const { data, error } = await supabaseServer
    .from("caja_periodos").select("*, caja_gastos(*)").eq("id", params.id).single();
  if (error) return NextResponse.json({ error: "Error interno" }, { status: 500 });
  if (data?.caja_gastos) {
    data.caja_gastos = data.caja_gastos.filter((g: { deleted?: boolean }) => !g.deleted);
    data.caja_gastos.sort((a: { fecha: string; created_at: string }, b: { fecha: string; created_at: string }) =>
      a.fecha.localeCompare(b.fecha) || a.created_at.localeCompare(b.created_at));
  }
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, CAJA_ROLES);
  if (auth instanceof NextResponse) return auth;
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body = close period */ }

  const session = getSession(req);

  if (body.action === "repuesto") {
    const { error } = await supabaseServer.from("caja_periodos").update({ repuesto: true, repuesto_at: new Date().toISOString() }).eq("id", params.id);
    if (error) return NextResponse.json({ error: "Error interno" }, { status: 500 });
    await logActivity(session?.role || "unknown", "caja_periodo_repuesto", "caja", { periodoId: params.id }, session?.userName);
    return NextResponse.json({ ok: true });
  }

  // Default action: close the period. Block if saldo != 0 (tolerance 0.005).
  const { data: periodo } = await supabaseServer
    .from("caja_periodos")
    .select("fondo_inicial, estado, deleted")
    .eq("id", params.id)
    .maybeSingle();
  if (!periodo || periodo.deleted) return NextResponse.json({ error: "Este período ya no existe." }, { status: 404 });
  if (periodo.estado === "cerrado") return NextResponse.json({ error: "Este período ya está cerrado." }, { status: 400 });

  const { data: gastos } = await supabaseServer
    .from("caja_gastos")
    .select("total")
    .eq("periodo_id", params.id)
    .eq("deleted", false);
  const totalGastos = (gastos || []).reduce((s: number, g: { total: number | null }) => s + (Number(g.total) || 0), 0);
  const fondo = Number(periodo.fondo_inicial) || 0;
  const saldo = Math.round((fondo - totalGastos) * 100) / 100;

  if (Math.abs(saldo) > 0.005) {
    const saldoStr = saldo >= 0 ? `$${saldo.toFixed(2)}` : `-$${Math.abs(saldo).toFixed(2)}`;
    return NextResponse.json({
      error: `No se puede cerrar con saldo ${saldoStr}. Reabastece o ajusta los gastos.`,
    }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabaseServer.from("caja_periodos").update({ estado: "cerrado", fecha_cierre: today }).eq("id", params.id).select().single();
  if (error) return NextResponse.json({ error: "Error interno" }, { status: 500 });
  await logActivity(session?.role || "unknown", "caja_periodo_close", "caja", { periodoId: params.id, fecha_cierre: today }, session?.userName);
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  const { data: existing } = await supabaseServer.from("caja_periodos").select("id, numero").eq("id", params.id).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Período no encontrado" }, { status: 404 });

  const { error } = await supabaseServer.from("caja_periodos").update({ deleted: true }).eq("id", params.id);
  if (error) return NextResponse.json({ error: "Error interno" }, { status: 500 });

  const session = getSession(req);
  await logActivity(session?.role || "unknown", "caja_periodo_delete", "caja", { periodoId: params.id, numero: existing.numero }, session?.userName);
  return NextResponse.json({ ok: true });
}
