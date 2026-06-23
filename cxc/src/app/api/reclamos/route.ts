import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { logActivity } from "@/lib/log-activity";
import { getRole, requireAdmin } from "@/lib/api-auth";
import { getSession } from "@/lib/require-auth";
import { validateReclamoFull } from "@/lib/reclamos/validate";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const role = getRole(req);
  if (!role || !['admin', 'secretaria', 'upload'].includes(role)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });
  }
  const { data, error } = await supabaseServer
    .from("reclamos")
    .select("*, reclamo_items(*), reclamo_fotos(*), reclamo_seguimiento(*)")
    .eq("deleted", false)
    .order("created_at", { ascending: false });

  if (error) { console.error(error); return NextResponse.json({ error: "Error interno" }, { status: 500 }); }
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req); if (denied) return denied;
  const body = await req.json();
  const { empresa, proveedor, marca, nro_factura, nro_orden_compra, fecha_reclamo, notas, items, factura_pdf_path } = body;

  // Obligatoriedad (cabecera + ítems). Solo notas / factura PDF / fotos opcionales.
  const vErr = validateReclamoFull({ empresa, nro_factura, fecha_reclamo, nro_orden_compra }, items);
  if (vErr) return NextResponse.json({ error: vErr }, { status: 400 });

  // Número REC-{año}-{correlativo} que REINICIA por año: el correlativo es el MAX
  // del sufijo entre los reclamos cuyo nro_reclamo empieza con REC-{año}- (no un
  // COUNT global). Concurrencia: el INSERT se reintenta ante violación de
  // unicidad (23505) recalculando el siguiente correlativo — nro_reclamo es
  // UNIQUE, esa es la garantía real (no el COUNT+SELECT no atómico de antes).
  const year = new Date().getFullYear();
  const prefix = `REC-${year}-`;

  async function nextNroReclamo(): Promise<string> {
    const { data } = await supabaseServer
      .from("reclamos")
      .select("nro_reclamo")
      .like("nro_reclamo", `${prefix}%`);
    let max = 0;
    for (const row of data ?? []) {
      const suf = parseInt(String(row.nro_reclamo).slice(prefix.length), 10);
      if (Number.isFinite(suf) && suf > max) max = suf;
    }
    // padStart(4): 0001. Si supera 9999, String() crece a 5 dígitos sin truncar.
    return `${prefix}${String(max + 1).padStart(4, "0")}`;
  }

  let reclamo: { id: string } | null = null;
  let lastErr: { message?: string; code?: string; details?: string; hint?: string } | null = null;
  let attemptedNro = "";
  for (let attempt = 0; attempt < 6; attempt++) {
    attemptedNro = await nextNroReclamo();
    const ins = await supabaseServer
      .from("reclamos")
      .insert({
        nro_reclamo: attemptedNro,
        empresa,
        proveedor: proveedor || "",
        marca: marca || "",
        nro_factura,
        nro_orden_compra,
        fecha_reclamo,
        estado: "Creado",
        notas: notas || "",
        factura_pdf_path: factura_pdf_path || null,
      })
      .select()
      .single();
    if (!ins.error) { reclamo = ins.data; break; }
    lastErr = ins.error;
    // 23505 = unique_violation: otro request tomó ese número → reintenta con MAX recalculado.
    if (ins.error.code !== "23505") break;
  }

  if (!reclamo) return NextResponse.json({
    error: lastErr?.message || "No se pudo crear el reclamo.",
    code: lastErr?.code,
    details: lastErr?.details,
    hint: lastErr?.hint,
    attempted_nro: attemptedNro,
  }, { status: 500 });

  let itemsWarning = "";
  if (items && items.length > 0) {
    // First attempt: with subtotal
    const rowsFull = items.map((item: Record<string, unknown>) => ({
      reclamo_id: reclamo.id,
      referencia: String(item.referencia || ""),
      descripcion: String(item.descripcion || ""),
      talla: String(item.talla || ""),
      genero: item.genero ? String(item.genero) : null,
      cantidad: Number(item.cantidad) || 1,
      precio_unitario: Number(item.precio_unitario) || 0,
      subtotal: (Number(item.cantidad) || 1) * (Number(item.precio_unitario) || 0),
      motivo: String(item.motivo || "Faltante de Mercancía"),
      nro_factura: String(item.nro_factura || ""),
      nro_orden_compra: String(item.nro_orden_compra || ""),
    }));
    const { error: err1 } = await supabaseServer.from("reclamo_items").insert(rowsFull);
    if (err1) {
      console.error("Items insert error:", JSON.stringify(err1));
      // Retry without subtotal in case column type mismatch
      const rowsMin = items.map((item: Record<string, unknown>) => ({
        reclamo_id: reclamo.id,
        referencia: String(item.referencia || ""),
        descripcion: String(item.descripcion || ""),
        talla: String(item.talla || ""),
        genero: item.genero ? String(item.genero) : null,
        cantidad: Number(item.cantidad) || 1,
        precio_unitario: Number(item.precio_unitario) || 0,
        motivo: String(item.motivo || "Faltante de Mercancía"),
        nro_factura: String(item.nro_factura || ""),
        nro_orden_compra: String(item.nro_orden_compra || ""),
      }));
      const { error: err2 } = await supabaseServer.from("reclamo_items").insert(rowsMin);
      if (err2) {
        console.error("Items retry error:", JSON.stringify(err2));
        // Rollback: delete the orphan reclamo
        await supabaseServer.from("reclamos").delete().eq("id", reclamo.id);
        return NextResponse.json({ error: "Error al crear items del reclamo. No se guardo el reclamo." }, { status: 500 });
      }
    }
  }

  const { data: full } = await supabaseServer
    .from("reclamos")
    .select("*, reclamo_items(*)")
    .eq("id", reclamo.id)
    .single();

  const session = getSession(req);
  await logActivity(session?.role || "system", "reclamo_create", "reclamos", { reclamoId: reclamo.id, empresa, nro_factura }, session?.userName);
  return NextResponse.json({ ...(full || reclamo), items_warning: itemsWarning || undefined });
}
