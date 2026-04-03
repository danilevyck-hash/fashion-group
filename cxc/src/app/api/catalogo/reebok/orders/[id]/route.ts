import { NextRequest, NextResponse } from "next/server";
import { reebokServer } from "@/lib/reebok-supabase-server";
import { getSession } from "@/lib/require-auth";

const PIEZAS = 12;
const EDIT_ROLES = ["admin", "secretaria", "upload", "vendedor"];
const DELETE_ROLES = ["admin", "secretaria", "upload"];

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data, error } = await reebokServer
    .from("reebok_orders").select("*, reebok_order_items(*)").eq("id", params.id).single();
  if (error) return NextResponse.json({ error: "Error interno" }, { status: 500 });
  return NextResponse.json(data);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSession(req);
  if (!session || !EDIT_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Sin permiso para editar" }, { status: 403 });
  }

  const { client_name, vendor_name, comment, items, status } = await req.json();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (client_name !== undefined) update.client_name = client_name;
  if (vendor_name !== undefined) update.vendor_name = vendor_name;
  if (comment !== undefined) update.comment = comment;
  if (status !== undefined) update.status = status;

  if (items && Array.isArray(items)) {
    await reebokServer.from("reebok_order_items").delete().eq("order_id", params.id);
    if (items.length > 0) {
      await reebokServer.from("reebok_order_items").insert(
        items.map((i: { product_id: string; sku: string; name: string; image_url: string; quantity: number; unit_price: number }) => ({
          order_id: params.id, product_id: i.product_id, sku: i.sku || null, name: i.name || null,
          image_url: i.image_url || null, quantity: i.quantity || 1, unit_price: Number(i.unit_price) || 0,
        }))
      );
    }
    update.total = items.reduce(
      (s: number, i: { quantity: number; unit_price: number }) => s + (i.quantity || 1) * PIEZAS * Number(i.unit_price || 0), 0
    );
  }

  const { error } = await reebokServer.from("reebok_orders").update(update).eq("id", params.id);
  if (error) return NextResponse.json({ error: "Error interno" }, { status: 500 });

  // Send email notification when confirmed
  if (status === "confirmado") {
    try {
      const { data: order } = await reebokServer.from("reebok_orders").select("*, reebok_order_items(*)").eq("id", params.id).single();
      if (order) {
        const { Resend } = await import("resend");
        const resend = new Resend(process.env.RESEND_API_KEY);
        const oi = (order.reebok_order_items || []) as { name: string; sku: string; quantity: number; unit_price: number }[];
        const totalB = oi.reduce((s, i) => s + (i.quantity || 0), 0);
        const totalM = oi.reduce((s, i) => s + (i.quantity || 0) * PIEZAS * Number(i.unit_price || 0), 0);
        const itemsHtml = oi.map(i => `<tr><td style="padding:4px 8px">${i.sku || ""}</td><td style="padding:4px 8px">${i.name}</td><td style="padding:4px 8px;text-align:center">${i.quantity}</td><td style="padding:4px 8px;text-align:right">$${Number(i.unit_price).toFixed(2)}</td></tr>`).join("");
        await resend.emails.send({
          from: "Fashion Group <notificaciones@fashiongr.com>",
          to: ["daniel@fashiongr.com"],
          subject: `📦 Pedido ${order.order_number} confirmado — ${order.client_name}`,
          html: `<h2>Pedido ${order.order_number} confirmado</h2><p><strong>Cliente:</strong> ${order.client_name}<br><strong>Vendedor:</strong> ${order.vendor_name || "—"}<br><strong>Total:</strong> ${totalB} bultos · $${totalM.toFixed(2)}</p><table style="border-collapse:collapse;width:100%;font-size:13px"><tr style="background:#1a1a1a;color:white"><th style="padding:6px 8px;text-align:left">SKU</th><th style="padding:6px 8px;text-align:left">Producto</th><th style="padding:6px 8px;text-align:center">Bultos</th><th style="padding:6px 8px;text-align:right">Precio</th></tr>${itemsHtml}</table><p style="color:#888;font-size:11px;margin-top:16px">Fashion Group Panamá — Reebok</p>`,
        });
      }
    } catch { /* email failed */ }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getSession(req);
  if (!session || !DELETE_ROLES.includes(session.role)) {
    return NextResponse.json({ error: "Solo admin y secretaria pueden eliminar" }, { status: 403 });
  }

  const { error } = await reebokServer.from("reebok_orders").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: "Error interno" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
