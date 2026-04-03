import { NextRequest, NextResponse } from "next/server";
import { reebokServer } from "@/lib/reebok-supabase-server";
import { requireRole } from "@/lib/requireRole";

const P = 12;

export async function POST(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria", "vendedor"]);
  if (auth instanceof NextResponse) return auth;
  const body = await req.json();
  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) return NextResponse.json({ error: "RESEND_API_KEY not configured" }, { status: 500 });

  let clientName: string;
  let orderNumber: string;
  let items: { sku: string; name: string; quantity: number; unit_price: number; image_url: string }[];
  let totalBultos: number;
  let totalPiezas: number;
  let total: number;
  let comment: string | null = null;

  if (body.orderId) {
    // Fetch from DB
    const { data: order, error } = await reebokServer
      .from("reebok_orders")
      .select("*, reebok_order_items(*)")
      .eq("id", body.orderId)
      .single();
    if (error || !order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    clientName = order.client_name;
    orderNumber = order.order_number;
    comment = order.comment;
    items = (order.reebok_order_items || []).map((i: { sku: string; name: string; quantity: number; unit_price: number; image_url?: string }) => ({
      sku: i.sku || "", name: i.name || "", quantity: i.quantity, unit_price: i.unit_price, image_url: i.image_url || "",
    }));
    totalBultos = items.reduce((s, i) => s + i.quantity, 0);
    totalPiezas = totalBultos * P;
    total = items.reduce((s, i) => s + i.quantity * P * Number(i.unit_price), 0);
  } else {
    // Legacy: direct data in body
    clientName = body.clientName || "Sin nombre";
    orderNumber = "PEDIDO";
    items = (body.items || []).map((i: { productId: string; productName: string; quantity: number; piezas: number; price: number; subtotal: number; image_url?: string }) => ({
      sku: i.productId?.substring(0, 12) || "", name: i.productName || "", quantity: i.quantity, unit_price: i.price || 0, image_url: "",
    }));
    totalBultos = body.totalBultos || 0;
    totalPiezas = body.totalPiezas || 0;
    total = body.total || 0;
  }

  const imgCell = (url: string) => url
    ? `<img src="${url}" alt="" width="60" height="60" style="display:block;border-radius:4px;object-fit:contain;background:#f5f5f5" />`
    : `<div style="width:60px;height:60px;background:#f0f0f0;border-radius:4px;display:flex;align-items:center;justify-content:center"><span style="font-size:9px;color:#999">Sin foto</span></div>`;

  const rows = items.map((item) =>
    `<tr style="border-bottom:1px solid #eee">
      <td style="padding:8px;width:68px;vertical-align:middle">${imgCell(item.image_url)}</td>
      <td style="padding:8px;vertical-align:middle"><strong>${item.name}</strong><br><span style="font-size:11px;color:#888">${item.sku}</span></td>
      <td style="padding:8px;text-align:center;vertical-align:middle">${item.quantity}</td>
      <td style="padding:8px;text-align:center;vertical-align:middle">${item.quantity * P}</td>
      <td style="padding:8px;text-align:right;vertical-align:middle">$${Number(item.unit_price).toFixed(2)}</td>
      <td style="padding:8px;text-align:right;vertical-align:middle">$${(item.quantity * P * Number(item.unit_price)).toFixed(2)}</td>
    </tr>`
  ).join("");

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:650px">
      <div style="background:#CC0000;color:white;padding:16px 20px;border-radius:8px 8px 0 0">
        <h2 style="margin:0;font-size:18px">Pedido ${orderNumber} — ${clientName}</h2>
      </div>
      <div style="padding:20px;border:1px solid #eee;border-top:none;border-radius:0 0 8px 8px">
        <p><strong>Fecha:</strong> ${new Date().toLocaleDateString("es-PA")}</p>
        ${comment ? `<p><strong>Nota:</strong> ${comment}</p>` : ""}
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <thead><tr style="background:#CC0000;color:white">
            <th style="padding:8px;width:68px"></th><th style="padding:8px;text-align:left">Producto</th>
            <th style="padding:8px;text-align:center">Bultos</th><th style="padding:8px;text-align:center">Piezas</th>
            <th style="padding:8px;text-align:right">Precio/u</th><th style="padding:8px;text-align:right">Subtotal</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div style="background:#f5f5f5;padding:12px 16px;border-radius:6px">
          <strong>Total: ${totalBultos} bultos (${totalPiezas} piezas) — $${total.toFixed(2)}</strong>
        </div>
      </div>
    </div>`;

  // If clientEmail provided, send to client only (share flow).
  // Otherwise send to admin (internal confirmation flow).
  const to = body.clientEmail ? [body.clientEmail] : ["daniel@fashiongr.com"];

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_KEY}` },
      body: JSON.stringify({
        from: "Reebok Panama <pedidos@fashiongr.com>",
        to,
        subject: `Nuevo pedido ${orderNumber} — ${clientName} — $${total.toFixed(2)}`,
        html,
      }),
    });
    if (!res.ok) { const err = await res.json(); return NextResponse.json({ error: err.message }, { status: 500 }); }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err); return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
