import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { logActivity } from "@/lib/log-activity";
import { getRole, requireAdmin } from "@/lib/api-auth";
import { getSession } from "@/lib/require-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const role = getRole(req);
  if (!role || !['admin', 'secretaria', 'upload', 'director'].includes(role)) {
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
  const { empresa, proveedor, marca, nro_factura, nro_orden_compra, fecha_reclamo, notas, items } = body;

  if (!empresa || !nro_factura || !fecha_reclamo) {
    return NextResponse.json({ error: "Campos requeridos faltantes" }, { status: 400 });
  }

  // Generate nro_reclamo with retry to avoid UNIQUE conflicts
  const year = new Date().getFullYear();
  let nro_reclamo = "";
  let attempts = 0;
  while (!nro_reclamo && attempts < 5) {
    attempts++;
    const { count } = await supabaseServer
      .from("reclamos")
      .select("*", { count: "exact", head: true })
      .then((r) => ({ count: r.count ?? 0 }));
    const seq = (count || 0) + attempts;
    const candidate = `REC-${year}-${String(seq).padStart(4, "0")}`;
    const { data: existing } = await supabaseServer
      .from("reclamos")
      .select("id")
      .eq("nro_reclamo", candidate)
      .maybeSingle();
    if (!existing) nro_reclamo = candidate;
  }
  if (!nro_reclamo) {
    // Fallback: use MAX sequence + random to guarantee uniqueness
    const { data: maxRow } = await supabaseServer
      .from("reclamos")
      .select("nro_reclamo")
      .like("nro_reclamo", `REC-${year}-%`)
      .order("nro_reclamo", { ascending: false })
      .limit(1)
      .maybeSingle();
    const maxSeq = maxRow ? parseInt(maxRow.nro_reclamo.split("-").pop() || "0", 10) : 0;
    const rand = Math.floor(1000 + Math.random() * 9000);
    nro_reclamo = `REC-${year}-${String(maxSeq + rand).padStart(4, "0")}`;
  }

  const { data: reclamo, error: recErr } = await supabaseServer
    .from("reclamos")
    .insert({
      nro_reclamo,
      empresa,
      proveedor: proveedor || "",
      marca: marca || "",
      nro_factura,
      nro_orden_compra: nro_orden_compra || "",
      fecha_reclamo,
      estado: "Borrador",
      notas: notas || "",
    })
    .select()
    .single();

  if (recErr) return NextResponse.json({
    error: recErr.message,
    code: recErr.code,
    details: recErr.details,
    hint: recErr.hint,
    attempted_nro: nro_reclamo,
  }, { status: 500 });

  let itemsWarning = "";
  if (items && items.length > 0) {
    // First attempt: with subtotal
    const rowsFull = items.map((item: Record<string, unknown>) => ({
      reclamo_id: reclamo.id,
      referencia: String(item.referencia || ""),
      descripcion: String(item.descripcion || ""),
      talla: String(item.talla || ""),
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
