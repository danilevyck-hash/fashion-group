import { NextRequest, NextResponse } from "next/server";
import { reebokServer } from "@/lib/reebok-supabase-server";
import { requireRole } from "@/lib/requireRole";
import { getBultoSize } from "@/lib/reebok-bulto";
import { fetchReebokCategoryMap } from "@/lib/reebok-category-lookup";
import { sortReebokOrderItems } from "@/lib/reebok-order-sort";
import { buildCatalogoOrderPdf } from "@/lib/catalogo/order-pdf";

// Fallback category cuando un product_id no resuelve en `products`. Usamos
// "apparel" (bulto=6) para nunca inflar el cobro asumiendo footwear=12.
const FALLBACK_CATEGORY = "apparel";

function fmt(n: number) { return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

export async function POST(req: NextRequest) {
  const auth = requireRole(req, ["admin", "secretaria", "vendedor"]);
  if (auth instanceof NextResponse) return auth;
  const body = await req.json();
  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) return NextResponse.json({ error: "RESEND_API_KEY not configured" }, { status: 500 });

  type EmailItem = { sku: string; name: string; quantity: number; unit_price: number; image_url: string; is_preorder?: boolean; category: string };
  let clientName: string;
  let orderNumber: string;
  let items: EmailItem[];
  let totalBultos: number;
  let totalPiezas: number;
  let total: number;
  let comment: string | null = null;
  let createdAt: string = new Date().toISOString();

  if (body.orderId) {
    const { data: order, error } = await reebokServer
      .from("reebok_orders")
      .select(
        "client_name, order_number, comment, created_at, reebok_order_items(product_id, sku, name, quantity, unit_price, image_url, is_preorder)",
      )
      .eq("id", body.orderId)
      .single();
    if (error || !order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    clientName = order.client_name;
    orderNumber = order.order_number;
    comment = order.comment;
    createdAt = order.created_at;
    const rawItems = (order.reebok_order_items || []) as { product_id: string; sku: string; name: string; quantity: number; unit_price: number; image_url?: string; is_preorder?: boolean }[];
    const categoryMap = await fetchReebokCategoryMap(rawItems.map((i) => i.product_id));
    items = rawItems.map((i) => ({
      sku: i.sku || "", name: i.name || "", quantity: i.quantity, unit_price: i.unit_price,
      image_url: i.image_url || "", is_preorder: i.is_preorder === true,
      category: categoryMap.get(i.product_id) || FALLBACK_CATEGORY,
    }));
    totalBultos = items.reduce((s, i) => s + i.quantity, 0);
    totalPiezas = items.reduce((s, i) => s + i.quantity * getBultoSize(i.category), 0);
    total = items.reduce((s, i) => s + i.quantity * getBultoSize(i.category) * Number(i.unit_price), 0);
  } else {
    clientName = body.clientName || "Sin nombre";
    orderNumber = "PEDIDO";
    items = (body.items || []).map((i: { productId: string; productName: string; quantity: number; price: number; image_url?: string; is_preorder?: boolean; category?: string }) => ({
      sku: i.productId?.substring(0, 12) || "", name: i.productName || "", quantity: i.quantity, unit_price: i.price || 0,
      image_url: "", is_preorder: i.is_preorder === true,
      category: i.category || FALLBACK_CATEGORY,
    }));
    totalBultos = body.totalBultos || 0;
    totalPiezas = body.totalPiezas || 0;
    total = body.total || 0;
  }

  // Orden canonico por categoria + SKU (helper unico compartido con el detalle).
  items = sortReebokOrderItems(items);

  const regularItems = items.filter((i) => !i.is_preorder);
  const preorderItems = items.filter((i) => i.is_preorder);
  const hasPreorders = preorderItems.length > 0;

  // ── PDF adjunto — lib única de pedido (order-pdf), imágenes downscaled ──
  const fechaLabel = new Date(createdAt + (createdAt.includes("T") ? "" : "T12:00:00"))
    .toLocaleDateString("es-PA", { day: "numeric", month: "long", year: "numeric" });

  const pdfBuffer = await buildCatalogoOrderPdf({
    marca: "reebok",
    orderNumber,
    clientName,
    createdAt,
    items,
    bultoSize: (c) => getBultoSize(c || FALLBACK_CATEGORY),
  });
  const dateStr = new Date().toISOString().slice(0, 10);
  const pdfFilename = `Pedido-${orderNumber}-${dateStr}.pdf`;

  // ── Build HTML email ──
  const renderRow = (item: EmailItem) => {
    const bs = getBultoSize(item.category);
    return `<tr style="border-bottom:1px solid #eee">
      <td style="padding:8px;vertical-align:middle;width:48px">${item.image_url ? `<img src="${item.image_url}" alt="${item.name}" width="40" height="40" style="display:block;width:40px;height:40px;object-fit:cover;border-radius:4px;border:1px solid #eee">` : `<div style="display:block;width:40px;height:40px;background:#e5e7eb;border-radius:4px"></div>`}</td>
      <td style="padding:8px;vertical-align:middle"><strong>${item.name}</strong><br><span style="font-size:11px;color:#888">${item.sku}</span></td>
      <td style="padding:8px;text-align:center;vertical-align:middle">${item.quantity}</td>
      <td style="padding:8px;text-align:center;vertical-align:middle">${item.quantity * bs}</td>
      <td style="padding:8px;text-align:right;vertical-align:middle">$${fmt(item.unit_price)}</td>
      <td style="padding:8px;text-align:right;vertical-align:middle">$${fmt(item.quantity * bs * Number(item.unit_price))}</td>
    </tr>`;
  };

  const renderSection = (title: string, sectionItems: EmailItem[], accent: string) => sectionItems.length === 0 ? "" : `
    <div style="margin:16px 0 4px;display:flex;align-items:center;gap:8px">
      <span style="display:inline-block;background:${accent};color:white;font-size:11px;font-weight:bold;padding:4px 10px;border-radius:4px;letter-spacing:0.5px;text-transform:uppercase">${title}</span>
      <span style="font-size:12px;color:#666">${sectionItems.length} item${sectionItems.length !== 1 ? "s" : ""}</span>
    </div>
    <table style="width:100%;border-collapse:collapse;margin:8px 0 16px">
      <thead><tr style="background:#1a1a1a;color:white">
        <th style="padding:8px;width:48px"></th>
        <th style="padding:8px;text-align:left">Producto</th>
        <th style="padding:8px;text-align:center">Bultos</th><th style="padding:8px;text-align:center">Piezas</th>
        <th style="padding:8px;text-align:right">Precio/u</th><th style="padding:8px;text-align:right">Subtotal</th>
      </tr></thead>
      <tbody>${sectionItems.map(renderRow).join("")}</tbody>
    </table>`;

  const sectionsHtml = hasPreorders
    ? `${renderSection("Pedido", regularItems, "#1a1a1a")}${renderSection("Pre-orden", preorderItems, "#d97706")}`
    : `${renderSection("Detalle", regularItems, "#1a1a1a")}`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:650px;margin:0 auto">
      <div style="background:#1a1a1a;color:white;padding:16px 20px;border-radius:8px 8px 0 0">
        <img src="https://fashiongr.com/reebok/reebok-logo.png" alt="Reebok" width="60" height="17" style="display:block;margin-bottom:8px" />
        <h2 style="margin:0;font-size:18px">Pedido ${orderNumber} — ${clientName}</h2>
        <p style="margin:4px 0 0;font-size:12px;opacity:0.7">Fashion Group · Panama — ${fechaLabel}</p>
      </div>
      <div style="padding:20px;border:1px solid #eee;border-top:none;border-radius:0 0 8px 8px">
        <p style="color:#333;font-size:14px;line-height:1.5;margin:0 0 16px">
          Estimado equipo Fashion Group,<br>
          Se ha recibido un nuevo pedido del catalogo Reebok. A continuacion el detalle:
        </p>
        ${comment ? `<p style="color:#666;font-size:13px;margin:0 0 12px"><strong>Nota:</strong> ${comment}</p>` : ""}
        ${sectionsHtml}
        ${hasPreorders ? `<p style="background:#fef3c7;border-left:3px solid #d97706;padding:10px 14px;color:#92400e;font-size:12px;margin:8px 0 16px">Los items en <strong>Pre-orden</strong> aun no tienen stock disponible. No deben mezclarse con el pedido regular en bodega.</p>` : ""}
        <div style="background:#f5f5f5;padding:12px 16px;border-radius:6px;margin:16px 0">
          <strong style="font-size:14px">Total: ${totalBultos} bultos (${totalPiezas} piezas) — $${fmt(total)}</strong>
        </div>
        <p style="color:#999;font-size:11px;margin:16px 0 0;border-top:1px solid #eee;padding-top:12px">
          Este pedido fue generado automaticamente desde fashiongr.com
        </p>
      </div>
    </div>`;

  const to = body.clientEmail ? [body.clientEmail] : ["daniel@fashiongr.com"];

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_KEY}` },
      body: JSON.stringify({
        from: "Reebok Panama <pedidos@fashiongr.com>",
        to,
        subject: `Nuevo pedido ${orderNumber} — ${clientName} — $${fmt(total)}`,
        html,
        attachments: [{ filename: pdfFilename, content: pdfBuffer.toString("base64") }],
      }),
    });
    if (!res.ok) { const err = await res.json(); return NextResponse.json({ error: err.message }, { status: 500 }); }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err); return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
