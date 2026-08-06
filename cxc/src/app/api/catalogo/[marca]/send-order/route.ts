// Correo del pedido (Resend) con PDF adjunto, dirigido por config de marca.
// Reebok separa secciones Pedido / Pre-orden (is_preorder) y ordena los items
// por categoría+SKU; Joybees es una sola tabla (sin preventa). El header y los
// colores del correo vienen de cfg.sendOrder (branding heredado por marca).

import { NextRequest, NextResponse } from "next/server";
import { leerCategoriaYBulto } from "@/lib/catalogo/bulto-productos";
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

  type EmailItem = { sku: string; name: string; quantity: number; unit_price: number; image_url: string; is_preorder?: boolean; category?: string;
    /** Tommy: piezas por bulto del estilo. Vacío = el default de la marca. */
    bulto_pzas?: number | null };
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
    // Categoría + piezas por bulto SIEMPRE, no solo si la marca tiene
    // `categoryLookup`: Tommy lo tiene en null y sus items llegaban pelados al
    // correo y al PDF, o sea con el bulto por default (bug de TOM-003).
    {
      const categoryByProduct = cfg.categoryLookup
        ? await cfg.categoryLookup(rawItems.map((i) => i.product_id))
        : new Map<string, string>();
      const { bultoPzasByProduct } = await leerCategoriaYBulto(
        db as never,
        cfg.productsTable,
        rawItems.map((i) => i.product_id),
      );
      items = rawItems.map((i) => ({
        sku: i.sku || "", name: i.name || "", quantity: i.quantity, unit_price: i.unit_price,
        image_url: i.image_url || "", is_preorder: i.is_preorder === true,
        category: categoryByProduct.get(i.product_id) || cfg.fallbackCategory || undefined,
        bulto_pzas: bultoPzasByProduct.get(i.product_id) ?? null,
      }));
    }
    totalBultos = items.reduce((s, i) => s + i.quantity, 0);
    totalPiezas = items.reduce((s, i) => s + i.quantity * cfg.bultoSize(i.category, i.bulto_pzas), 0);
    total = items.reduce((s, i) => s + i.quantity * cfg.bultoSize(i.category, i.bulto_pzas) * Number(i.unit_price), 0);
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

  // ── A quién le va ─────────────────────────────────────────────────────────
  // Este endpoint sirve a DOS botones del detalle de pedido: "Confirmar
  // pedido" (sin clientEmail → aviso interno) y "Enviar por email al cliente"
  // (con clientEmail → le llega al mayorista). Hasta el 26-jul-2026 los dos
  // mandaban el correo escrito para adentro, así que el cliente recibía
  // "Estimado equipo Fashion Group" e instrucciones de bodega. El destinatario
  // define la audiencia y con ella el texto, la banda de marca y el asunto.
  const to = body.clientEmail ? [body.clientEmail] : ["daniel@fashiongr.com"];
  const esCliente = Boolean(body.clientEmail);

  // La banda de marca interpola datos del pedido en HTML → se escapan acá (un
  // nombre con comillas o `<` rompía el encabezado del correo).
  const headerHtml = esCliente
    ? cfg.sendOrder.headerClienteHtml(escapeHtml(orderNumber), escapeHtml(fechaLabel))
    : cfg.sendOrder.headerHtml(escapeHtml(orderNumber), escapeHtml(clientName), escapeHtml(fechaLabel));

  // ── Build HTML email (lib pura → se puede renderizar y medir sin enviar) ──
  const html = buildOrderEmailHtml({
    audiencia: esCliente ? "cliente" : "equipo",
    marcaLabel: cfg.label,
    clientName,
    headerHtml,
    tableHeadBg: cfg.sendOrder.tableHeadBg,
    itemsHasPreorder: cfg.itemsHasPreorder,
    items,
    bultoSize: cfg.bultoSize,
    comment,
    totalBultos,
    totalPiezas,
    total,
  });

  // Asunto: el del equipo triagea (quién, cuánto); el del cliente confirma.
  const subject = esCliente
    ? `Recibimos tu pedido ${orderNumber} — ${cfg.label}`
    : `Nuevo pedido ${orderNumber} — ${clientName} — $${fmt(total)}`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_KEY}` },
      body: JSON.stringify({
        from: cfg.sendOrder.from,
        to,
        subject,
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
