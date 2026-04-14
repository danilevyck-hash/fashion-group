import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { logActivity } from "@/lib/log-activity";
import { getSession } from "@/lib/require-auth";
import { requireRole } from "@/lib/requireRole";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GUIAS_ROLES = ["admin", "secretaria", "bodega", "director", "vendedor"];

// ── GET ──

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, GUIAS_ROLES);
  if (auth instanceof NextResponse) return auth;
  const { id } = params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });

  const { data, error } = await supabaseServer
    .from("guia_transporte").select("*, guia_items(*)").eq("id", id).eq("deleted", false).single();
  if (error) return NextResponse.json({ error: "Error interno" }, { status: 500 });
  if (data?.guia_items) {
    data.guia_items = data.guia_items.filter((i: { deleted?: boolean }) => !i.deleted);
    data.guia_items.sort((a: { orden: number }, b: { orden: number }) => a.orden - b.orden);
  }
  return NextResponse.json(data);
}

// ── PUT (bodega full dispatch with items/signatures) ──

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, GUIAS_ROLES);
  if (auth instanceof NextResponse) return auth;
  const { id } = params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  const body = await req.json();
  const { fecha, transportista, placa, observaciones, items, monto_total, estado, receptor_nombre, cedula, firma_base64, firma_entregador_base64, entregado_por, numero_guia_transp, tipo_despacho, nombre_chofer } = body;

  if (estado && (estado === "Completada" || estado === "Despachada")) {
    const { data: currentItems } = await supabaseServer.from("guia_items").select("bultos").eq("guia_id", id).eq("deleted", false);
    const itemCount = items !== undefined ? (items?.length || 0) : (currentItems?.length || 0);
    const totalBultos = items !== undefined
      ? (items || []).reduce((s: number, i: { bultos?: number }) => s + (i.bultos || 0), 0)
      : (currentItems || []).reduce((s: number, i: { bultos: number }) => s + (i.bultos || 0), 0);
    if (itemCount === 0) return NextResponse.json({ error: "No se puede despachar una guía sin items" }, { status: 400 });
    if (totalBultos === 0) return NextResponse.json({ error: "No se puede despachar una guía con 0 bultos" }, { status: 400 });
    if (!receptor_nombre) return NextResponse.json({ error: "Nombre del receptor requerido" }, { status: 400 });
    if (!cedula) return NextResponse.json({ error: "Cédula del receptor requerida" }, { status: 400 });
    if (tipo_despacho === "externo" && !placa) return NextResponse.json({ error: "Placa del vehículo requerida para transporte externo" }, { status: 400 });
    if (tipo_despacho === "directo" && !nombre_chofer) return NextResponse.json({ error: "Nombre del chofer requerido para entrega directa" }, { status: 400 });
  }

  const { data: previous } = await supabaseServer.from("guia_transporte").select("estado, placa, transportista").eq("id", id).single();

  // Block edits on dispatched guías (only dispatch flow itself can update)
  if (previous?.estado === "Completada" && estado !== "Completada") {
    return NextResponse.json({ error: "Guía ya despachada, no se puede editar" }, { status: 400 });
  }

  const updateData: Record<string, unknown> = {};
  if (fecha !== undefined) updateData.fecha = fecha;
  if (transportista !== undefined) updateData.transportista = transportista;
  if (placa !== undefined) updateData.placa = placa;
  if (observaciones !== undefined) updateData.observaciones = observaciones;
  if (monto_total !== undefined) updateData.monto_total = monto_total || 0;
  if (estado !== undefined) updateData.estado = estado;
  if (receptor_nombre !== undefined) updateData.receptor_nombre = receptor_nombre;
  if (cedula !== undefined) updateData.cedula = cedula;
  if (firma_base64 !== undefined) updateData.firma_base64 = firma_base64;
  if (entregado_por !== undefined) updateData.entregado_por = entregado_por;
  if (numero_guia_transp !== undefined) updateData.numero_guia_transp = numero_guia_transp;
  if (firma_entregador_base64 !== undefined) updateData.firma_entregador_base64 = firma_entregador_base64;
  if (tipo_despacho !== undefined) updateData.tipo_despacho = tipo_despacho;
  if (nombre_chofer !== undefined) updateData.nombre_chofer = nombre_chofer;

  const { error: guiaErr } = await supabaseServer.from("guia_transporte").update(updateData).eq("id", id);
  if (guiaErr) return NextResponse.json({ error: guiaErr.message }, { status: 500 });

  if (items !== undefined) {
    // Safe replace: insert new items first, then delete old ones
    if (items && items.length > 0) {
      const rows = items.map((item: Record<string, unknown>, i: number) => ({
        guia_id: id, orden: -(i + 1), // negative orden = new batch (temp marker)
        cliente: item.cliente || "", direccion: item.direccion || "",
        empresa: item.empresa || "", facturas: item.facturas || "",
        bultos: item.bultos || 0, numero_guia_transp: item.numero_guia_transp || "",
      }));
      const { error: itemsErr } = await supabaseServer.from("guia_items").insert(rows);
      if (itemsErr) {
        // Cleanup: remove any partially inserted new items
        await supabaseServer.from("guia_items").delete().eq("guia_id", id).lt("orden", 0);
        return NextResponse.json({ error: itemsErr.message }, { status: 500 });
      }
      // New items inserted successfully — delete old items (positive orden)
      await supabaseServer.from("guia_items").delete().eq("guia_id", id).gte("orden", 0);
      // Fix orden: flip negative to positive
      const { data: newItems } = await supabaseServer.from("guia_items").select("id, orden").eq("guia_id", id);
      if (newItems) {
        for (const ni of newItems) {
          if (ni.orden < 0) {
            await supabaseServer.from("guia_items").update({ orden: -ni.orden }).eq("id", ni.id);
          }
        }
      }
    } else {
      // Empty items array = delete all
      await supabaseServer.from("guia_items").delete().eq("guia_id", id);
    }
  }

  const { data } = await supabaseServer.from("guia_transporte").select("*, guia_items(*)").eq("id", id).single();
  if (data?.guia_items) {
    data.guia_items = data.guia_items.filter((i: { deleted?: boolean }) => !i.deleted);
    data.guia_items.sort((a: { orden: number }, b: { orden: number }) => a.orden - b.orden);
  }

  const session = getSession(req);
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  if (estado && previous?.estado !== estado) changes.estado = { from: previous?.estado, to: estado };
  if (placa && previous?.placa !== placa) changes.placa = { from: previous?.placa, to: placa };
  if (items !== undefined) changes.items = { from: "replaced", to: `${(items || []).length} items` };
  if (Object.keys(changes).length > 0) {
    await logActivity(session?.role || "unknown", estado ? "guia_dispatch" : "guia_edit", "guias", { guiaId: id, changes }, session?.userName);
  }

  // Dispatch email removed — now handled by daily summary cron at 6pm

  return NextResponse.json(data);
}

// ── PATCH (quick dispatch from list / bodega partial update) ──

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, GUIAS_ROLES);
  if (auth instanceof NextResponse) return auth;
  if (!UUID_RE.test(params.id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  const body = await req.json();
  const allowed = ["placa", "observaciones", "estado", "receptor_nombre", "cedula", "firma_base64", "firma_entregador_base64", "entregado_por", "numero_guia_transp", "nombre_entregador", "cedula_entregador", "firma_transportista", "tipo_despacho", "nombre_chofer", "motivo_rechazo"];
  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (body[key] !== undefined) update[key] = body[key];
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: "No fields to update" }, { status: 400 });

  // Block double-dispatch: if guia is already Completada, reject state changes
  if (body.estado) {
    const { data: current } = await supabaseServer.from("guia_transporte").select("estado").eq("id", params.id).single();
    if (current?.estado === "Completada" && body.estado === "Completada") {
      return NextResponse.json({ error: "Esta guía ya fue despachada" }, { status: 400 });
    }
    if (current?.estado === "Completada" && body.estado !== "Completada") {
      return NextResponse.json({ error: "Guía ya despachada, no se puede editar" }, { status: 400 });
    }
  }

  const session = getSession(req);
  await logActivity(session?.role || "unknown", "guia_patch", "guias", { guiaId: params.id, fields: Object.keys(update) }, session?.userName);

  // If setting to Completada, add condition to prevent race: only update if NOT already Completada
  let query = supabaseServer.from("guia_transporte").update(update).eq("id", params.id);
  if (body.estado === "Completada") {
    query = query.neq("estado", "Completada");
  }
  const { data: updated, error } = await query.select("id").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!updated) return NextResponse.json({ error: "Guía no encontrada o ya fue despachada" }, { status: 404 });

  // Dispatch email removed — now handled by daily summary cron at 6pm

  return NextResponse.json({ ok: true });
}

// ── DELETE (soft delete) ──

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, ["admin", "secretaria"]);
  if (auth instanceof NextResponse) return auth;
  const { id } = params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  const { error } = await supabaseServer.from("guia_transporte").update({ deleted: true }).eq("id", id);
  if (error) return NextResponse.json({ error: "Error interno" }, { status: 500 });
  const session = getSession(req);
  await logActivity(session?.role || "unknown", "guia_delete", "guias", { guiaId: id }, session?.userName);
  return NextResponse.json({ ok: true });
}
