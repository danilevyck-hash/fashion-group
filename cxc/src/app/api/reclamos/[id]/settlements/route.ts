// ─────────────────────────────────────────────────────────────────────────────
// Settlement de un reclamo (tabla hija reclamo_settlements). 1 o N NCs por reclamo.
//
// POST  body { settlements: [{ monto, nota_credito?, fecha }], markPaid?: boolean }
//   - Inserta las filas de settlement.
//   - Si markPaid: marca el reclamo como Pagado (solo desde "Creado") y congela
//     el snapshot del reclamado. Atómico-best-effort: si el flip falla, borra los
//     settlements recién insertados (compensación) → reintento seguro.
// DELETE ?sid=<id>  → soft-delete de un settlement.
//
// Auth: admin/secretaria (igual que editar reclamos).
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";
import { getSession } from "@/lib/require-auth";
import { logActivity } from "@/lib/log-activity";
import { FACTOR_TOTAL } from "@/app/reclamos/components/constants";

export const dynamic = "force-dynamic";

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ymd = /^\d{4}-\d{2}-\d{2}$/;

interface InputSettlement {
  monto: number;
  nota_credito?: string | null;
  fecha: string;
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;
  const { id } = params;
  if (!uuidRegex.test(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const rawList: unknown = body?.settlements;
  const markPaid: boolean = body?.markPaid === true;

  if (!Array.isArray(rawList) || rawList.length === 0) {
    return NextResponse.json({ error: "Agrega al menos una nota de crédito (monto)." }, { status: 400 });
  }

  // Validar + normalizar cada settlement.
  const rows: { reclamo_id: string; monto: number; nota_credito: string | null; fecha: string }[] = [];
  for (const s of rawList as InputSettlement[]) {
    const monto = Number(s?.monto);
    if (!Number.isFinite(monto) || monto <= 0) {
      return NextResponse.json({ error: "El monto recuperado debe ser mayor a 0." }, { status: 400 });
    }
    const fecha = String(s?.fecha ?? "");
    if (!ymd.test(fecha)) {
      return NextResponse.json({ error: "Fecha inválida (YYYY-MM-DD)." }, { status: 400 });
    }
    const nc = typeof s?.nota_credito === "string" ? s.nota_credito.trim() : "";
    rows.push({ reclamo_id: id, monto, nota_credito: nc || null, fecha });
  }

  // 1. Insertar settlements.
  const { data: inserted, error: insErr } = await supabaseServer
    .from("reclamo_settlements")
    .insert(rows)
    .select("id");
  if (insErr) {
    console.error("[settlements] insert:", insErr.message);
    return NextResponse.json({ error: "No se pudo guardar el settlement." }, { status: 500 });
  }

  // 2. Si es el flip a Pagado: validar transición + snapshot + actualizar reclamo.
  if (markPaid) {
    const { data: rec } = await supabaseServer
      .from("reclamos")
      .select("estado, reclamo_items(cantidad, precio_unitario, deleted)")
      .eq("id", id)
      .single();

    const compensar = async () => {
      const ids = (inserted ?? []).map((r) => r.id);
      if (ids.length) await supabaseServer.from("reclamo_settlements").delete().in("id", ids);
    };

    if (!rec || rec.estado !== "Creado") {
      await compensar();
      return NextResponse.json(
        { error: `Solo se puede marcar Pagado desde "Creado" (estado actual: ${rec?.estado ?? "?"}).` },
        { status: 400 },
      );
    }

    // Snapshot del reclamado = Σ(items vivos) × FACTOR_TOTAL.
    const items = (rec.reclamo_items ?? []).filter((i: { deleted?: boolean }) => !i.deleted);
    const sub = items.reduce(
      (acc: number, i: { cantidad?: number; precio_unitario?: number }) =>
        acc + (Number(i.cantidad) || 0) * (Number(i.precio_unitario) || 0),
      0,
    );
    const snapshot = Math.round(sub * FACTOR_TOTAL * 100) / 100;

    const { error: updErr } = await supabaseServer
      .from("reclamos")
      .update({ estado: "Pagado", monto_reclamado_snapshot: snapshot, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (updErr) {
      await compensar();
      console.error("[settlements] flip Pagado:", updErr.message);
      return NextResponse.json({ error: "No se pudo marcar como Pagado." }, { status: 500 });
    }
  }

  const session = getSession(req);
  await logActivity(
    session?.role || "unknown",
    markPaid ? "reclamo_settle_pagado" : "reclamo_settlement_add",
    "reclamos",
    { reclamoId: id, settlements: rows.length },
    session?.userName,
  );

  return NextResponse.json({ ok: true, inserted: inserted?.length ?? 0 });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;
  const { id } = params;
  if (!uuidRegex.test(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const sid = req.nextUrl.searchParams.get("sid");
  if (!sid || !uuidRegex.test(sid)) return NextResponse.json({ error: "sid inválido" }, { status: 400 });

  const { error } = await supabaseServer
    .from("reclamo_settlements")
    .update({ deleted: true })
    .eq("id", sid)
    .eq("reclamo_id", id);
  if (error) {
    console.error("[settlements] delete:", error.message);
    return NextResponse.json({ error: "No se pudo eliminar." }, { status: 500 });
  }

  const session = getSession(req);
  await logActivity(session?.role || "unknown", "reclamo_settlement_delete", "reclamos", { reclamoId: id, sid }, session?.userName);
  return NextResponse.json({ ok: true });
}
