// Correo del pedido (Resend) con PDF adjunto, dirigido por config de marca.
// Reebok separa secciones Pedido / Pre-orden (is_preorder) y ordena los items
// por categoría+SKU; Joybees es una sola tabla (sin preventa). El header y los
// colores del correo vienen de cfg.sendOrder (branding heredado por marca).

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { getMarcaConfig } from "@/lib/catalogo/marcas";
import { buildCatalogoOrderPdf } from "@/lib/catalogo/order-pdf";
import { buildOrderEmailHtml, escapeHtml } from "@/lib/catalogo/order-email";

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

  // ── Build HTML email (lib pura → se puede renderizar y medir sin enviar) ──
  const html = buildOrderEmailHtml({
    marcaLabel: cfg.label,
    // La banda de marca interpola el nombre del cliente en HTML → se escapa
    // acá (un nombre con comillas o `<` rompía el encabezado del correo).
    headerHtml: cfg.sendOrder.headerHtml(escapeHtml(orderNumber), escapeHtml(clientName), escapeHtml(fechaLabel)),
    tableHeadBg: cfg.sendOrder.tableHeadBg,
    itemsHasPreorder: cfg.itemsHasPreorder,
    items,
    bultoSize: cfg.bultoSize,
    comment,
    totalBultos,
    totalPiezas,
    total,
  });

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
