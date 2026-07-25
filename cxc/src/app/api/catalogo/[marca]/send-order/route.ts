// Correo del pedido (Resend) con PDF adjunto, dirigido por config de marca.
// Reebok separa secciones Pedido / Pre-orden (is_preorder) y ordena los items
// por categoría+SKU; Joybees es una sola tabla (sin preventa). El header y los
// colores del correo vienen de cfg.sendOrder (branding heredado por marca).

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { getMarcaConfig } from "@/lib/catalogo/marcas";
import { buildCatalogoOrderPdf } from "@/lib/catalogo/order-pdf";

function fmt(n: number) { return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

export async function POST(req: NextRequest, { params }: { params: { marca: string } }) {
  const cfg = getMarcaConfig(params.marca);
  if (!cfg) return NextResponse.json({ error: "Marca desconocida" }, { status: 404 });

  const auth = requireRole(req, ["admin", "secretaria", "vendedor"]);
  if (auth instanceof NextResponse) return auth;
  const body = await req.json();
  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) return NextResponse.json({ error: "RESEND_API_KEY not configured" }, { status: 500 });

  type EmailItem = { sku: string; name: string; quantity: number; unit_price: number; image_url: string; is_preorder?: boolean; category?: string };
  let clientName: string;
  let orderNumber: string;
  let items: EmailItem[];
  let totalBultos: number;
  let totalPiezas: number;
  let total: number;
  let comment: string | null = null;
  let createdAt: string = new Date().toISOString();

  if (body.orderId) {
    const db = await cfg.db();
    const itemCols = `product_id, sku, name, quantity, unit_price, image_url${cfg.itemsHasPreorder ? ", is_preorder" : ""}`;
    const { data: order, error } = await db
      .from(cfg.ordersTable)
      .select(`client_name, order_number, comment, created_at, ${cfg.itemsRelation}(${itemCols})`)
      .eq("id", body.orderId)
      .single();
    if (error || !order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    const orderRow = order as unknown as Record<string, unknown>;
    clientName = String(orderRow.client_name ?? "");
    orderNumber = String(orderRow.order_number ?? "");
    comment = (orderRow.comment as string | null) ?? null;
    createdAt = String(orderRow.created_at ?? createdAt);
    const rawItems = (orderRow[cfg.itemsRelation] || []) as { product_id: string; sku: string; name: string; quantity: number; unit_price: number; image_url?: string; is_preorder?: boolean }[];
    if (cfg.categoryLookup) {
      const categoryMap = await cfg.categoryLookup(rawItems.map((i) => i.product_id));
      items = rawItems.map((i) => ({
        sku: i.sku || "", name: i.name || "", quantity: i.quantity, unit_price: i.unit_price,
        image_url: i.image_url || "", is_preorder: i.is_preorder === true,
        category: categoryMap.get(i.product_id) || cfg.fallbackCategory || undefined,
      }));
    } else {
      items = rawItems.map((i) => ({
        sku: i.sku || "", name: i.name || "", quantity: i.quantity, unit_price: i.unit_price,
        image_url: i.image_url || "",
      }));
    }
    totalBultos = items.reduce((s, i) => s + i.quantity, 0);
    totalPiezas = items.reduce((s, i) => s + i.quantity * cfg.bultoSize(i.category), 0);
    total = items.reduce((s, i) => s + i.quantity * cfg.bultoSize(i.category) * Number(i.unit_price), 0);
  } else {
    clientName = body.clientName || "Sin nombre";
    orderNumber = "PEDIDO";
    items = (body.items || []).map((i: { productId: string; productName: string; quantity: number; price: number; image_url?: string; is_preorder?: boolean; category?: string }) => ({
      sku: i.productId?.substring(0, 12) || "", name: i.productName || "", quantity: i.quantity, unit_price: i.price || 0,
      image_url: "",
      ...(cfg.itemsHasPreorder ? { is_preorder: i.is_preorder === true } : {}),
      ...(cfg.categoryLookup ? { category: i.category || cfg.fallbackCategory || undefined } : {}),
    }));
    totalBultos = body.totalBultos || 0;
    totalPiezas = body.totalPiezas || 0;
    total = body.total || 0;
  }

  // Reebok: orden canónico por categoría + SKU (helper único compartido con el
  // detalle). Joybees no ordena.
  if (cfg.sortEmailItems) {
    items = cfg.sortEmailItems(items as (EmailItem & { sku: string })[]);
  }

  const regularItems = items.filter((i) => !i.is_preorder);
  const preorderItems = items.filter((i) => i.is_preorder);
  const hasPreorders = cfg.itemsHasPreorder && preorderItems.length > 0;

  // ── PDF adjunto — lib única de pedido (order-pdf), imágenes downscaled ──
  const fechaLabel = new Date(createdAt + (createdAt.includes("T") ? "" : "T12:00:00"))
    .toLocaleDateString("es-PA", { day: "numeric", month: "long", year: "numeric" });

  const pdfBuffer = await buildCatalogoOrderPdf({
    marca: cfg.marca,
    orderNumber,
    clientName,
    createdAt,
    items: items.map((i) => ({ ...i, category: i.category || cfg.pdfFallbackCategory })),
    bultoSize: cfg.bultoSize,
  });
  const dateStr = new Date().toISOString().slice(0, 10);
  const pdfFilename = `Pedido-${orderNumber}-${dateStr}.pdf`;

  // ── Build HTML email ──
  const renderRow = (item: EmailItem) => {
    const bs = cfg.bultoSize(item.category);
    return `<tr style="border-bottom:1px solid #eee">
      <td style="padding:8px;vertical-align:middle;width:48px">${item.image_url ? `<img src="${item.image_url}" alt="${item.name}" width="40" height="40" style="display:block;width:40px;height:40px;object-fit:cover;border-radius:4px;border:1px solid #eee">` : `<div style="display:block;width:40px;height:40px;background:#e5e7eb;border-radius:4px"></div>`}</td>
      <td style="padding:8px;vertical-align:middle"><strong>${item.name}</strong><br><span style="font-size:11px;color:#888">${item.sku}</span></td>
      <td style="padding:8px;text-align:center;vertical-align:middle">${item.quantity}</td>
      <td style="padding:8px;text-align:center;vertical-align:middle">${item.quantity * bs}</td>
      <td style="padding:8px;text-align:right;vertical-align:middle">$${fmt(item.unit_price)}</td>
      <td style="padding:8px;text-align:right;vertical-align:middle">$${fmt(item.quantity * bs * Number(item.unit_price))}</td>
    </tr>`;
  };

  const headBg = cfg.sendOrder.tableHeadBg;
  const tableHead = `<thead><tr style="background:${headBg};color:white">
        <th style="padding:8px;width:48px"></th>
        <th style="padding:8px;text-align:left">Producto</th>
        <th style="padding:8px;text-align:center">Bultos</th><th style="padding:8px;text-align:center">Piezas</th>
        <th style="padding:8px;text-align:right">Precio/u</th><th style="padding:8px;text-align:right">Subtotal</th>
      </tr></thead>`;

  const renderSection = (title: string, sectionItems: EmailItem[], accent: string) => sectionItems.length === 0 ? "" : `
    <div style="margin:16px 0 4px;display:flex;align-items:center;gap:8px">
      <span style="display:inline-block;background:${accent};color:white;font-size:11px;font-weight:bold;padding:4px 10px;border-radius:4px;letter-spacing:0.5px;text-transform:uppercase">${title}</span>
      <span style="font-size:12px;color:#666">${sectionItems.length} item${sectionItems.length !== 1 ? "s" : ""}</span>
    </div>
    <table style="width:100%;border-collapse:collapse;margin:8px 0 16px">
      ${tableHead}
      <tbody>${sectionItems.map(renderRow).join("")}</tbody>
    </table>`;

  // Reebok: secciones Pedido/Pre-orden (o "Detalle" si no hay preventa).
  // Joybees: una sola tabla sin label de sección (formato heredado).
  const sectionsHtml = cfg.itemsHasPreorder
    ? hasPreorders
      ? `${renderSection("Pedido", regularItems, headBg)}${renderSection("Pre-orden", preorderItems, "#d97706")}`
      : `${renderSection("Detalle", regularItems, headBg)}`
    : `<table style="width:100%;border-collapse:collapse;margin:8px 0 16px">
          ${tableHead}
          <tbody>${items.map(renderRow).join("")}</tbody>
        </table>`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:650px;margin:0 auto">
      ${cfg.sendOrder.headerHtml(orderNumber, clientName, fechaLabel)}
      <div style="padding:20px;border:1px solid #eee;border-top:none;border-radius:0 0 8px 8px">
        <p style="color:#333;font-size:14px;line-height:1.5;margin:0 0 16px">
          Estimado equipo Fashion Group,<br>
          Se ha recibido un nuevo pedido del catalogo ${cfg.label}. A continuacion el detalle:
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
        from: cfg.sendOrder.from,
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
