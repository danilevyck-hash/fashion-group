// PDF de pedido de catálogo, generado EN EL SERVER (jsPDF) — mismo formato que
// el adjunto de send-order, extraído para el endpoint GET /orders/[id]/pdf que
// abre el PDF directo en una pestaña (desde el visor el usuario comparte con el
// share nativo de iOS: WhatsApp/mail). Estilo por marca: Reebok = header negro
// con logo + secciones Pedido/Pre-orden; Joybees = header navy tipográfico.

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { REEBOK_LOGO_BASE64, REEBOK_LOGO_WIDTH, REEBOK_LOGO_HEIGHT } from "@/lib/reebok-logo";
import { sortReebokOrderItems } from "@/lib/reebok-order-sort";

export interface PdfOrderItem {
  sku: string;
  name: string;
  quantity: number; // bultos
  unit_price: number;
  image_url: string;
  is_preorder?: boolean;
  category: string;
}

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function buildCatalogoOrderPdf(opts: {
  marca: "reebok" | "joybees";
  orderNumber: string;
  clientName: string;
  createdAt: string;
  items: PdfOrderItem[];
  bultoSize: (category: string | null | undefined) => number;
}): Promise<Buffer> {
  const { marca, orderNumber, clientName, createdAt, bultoSize } = opts;
  const items = marca === "reebok" ? sortReebokOrderItems(opts.items) : opts.items;

  const regularItems = items.filter((i) => !i.is_preorder);
  const preorderItems = items.filter((i) => i.is_preorder);

  const totalBultos = items.reduce((s, i) => s + i.quantity, 0);
  const totalPiezas = items.reduce((s, i) => s + i.quantity * bultoSize(i.category), 0);
  const total = items.reduce((s, i) => s + i.quantity * bultoSize(i.category) * Number(i.unit_price), 0);

  // Imágenes como base64 (mismo patrón que send-order; las que fallen se saltan).
  const imgs: Record<string, string> = {};
  await Promise.all(items.map(async (item) => {
    if (!item.image_url || imgs[item.image_url]) return;
    try {
      const res = await fetch(item.image_url);
      if (!res.ok) return;
      const buf = await res.arrayBuffer();
      const contentType = res.headers.get("content-type") || "image/jpeg";
      imgs[item.image_url] = `data:${contentType};base64,${Buffer.from(buf).toString("base64")}`;
    } catch { /* skip */ }
  }));

  const doc = new jsPDF("portrait");
  const fechaLabel = new Date(createdAt + (createdAt.includes("T") ? "" : "T12:00:00"))
    .toLocaleDateString("es-PA", { day: "numeric", month: "long", year: "numeric" });

  // Header por marca
  if (marca === "reebok") {
    doc.setFillColor(26, 26, 26);
    doc.rect(0, 0, 210, 18, "F");
    try { doc.addImage(REEBOK_LOGO_BASE64, "PNG", 14, 5, REEBOK_LOGO_WIDTH, REEBOK_LOGO_HEIGHT); } catch { /* */ }
  } else {
    doc.setFillColor(26, 38, 86);
    doc.rect(0, 0, 210, 18, "F");
    doc.setFontSize(13); doc.setTextColor(255, 228, 67); doc.setFont("helvetica", "bold");
    doc.text("JOYBEES", 14, 12);
  }
  doc.setFontSize(8); doc.setTextColor(255); doc.setFont("helvetica", "normal");
  doc.text("Fashion Group · Panama", 196, 12, { align: "right" });

  doc.setTextColor(100); doc.setFontSize(9);
  doc.text(`Cliente: ${clientName}`, 14, 26);
  doc.text(`Pedido: ${orderNumber}`, 90, 26);
  doc.text(`Fecha: ${fechaLabel}`, 150, 26);

  const headFill: [number, number, number] = marca === "reebok" ? [26, 26, 26] : [26, 38, 86];

  function drawSectionTable(title: string, startY: number, sectionItems: PdfOrderItem[]) {
    doc.setFontSize(10); doc.setTextColor(26); doc.setFont("helvetica", "bold");
    doc.text(title, 14, startY);
    autoTable(doc, {
      startY: startY + 3,
      head: [["", "Producto", "SKU", "Bultos", "Piezas", "Precio/u", "Subtotal"]],
      body: sectionItems.map((i) => {
        const bs = bultoSize(i.category);
        return ["", i.name, i.sku, String(i.quantity), String(i.quantity * bs), `$${fmt(i.unit_price)}`, `$${fmt(i.quantity * bs * Number(i.unit_price))}`];
      }),
      styles: { fontSize: 8, cellPadding: 2, minCellHeight: 12 },
      headStyles: { fillColor: headFill, textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [249, 249, 249] },
      columnStyles: { 0: { cellWidth: 12, minCellHeight: 12 }, 3: { halign: "center" }, 4: { halign: "center" }, 5: { halign: "right" }, 6: { halign: "right" } },
      didDrawCell: (data: { row: { index: number; section: string }; column: { index: number }; cell: { x: number; y: number; height: number; width: number } }) => {
        if (data.column.index === 0 && data.row.section === "body") {
          const item = sectionItems[data.row.index];
          const b64 = item?.image_url ? imgs[item.image_url] : undefined;
          if (b64) {
            const imgSize = 10;
            try { doc.addImage(b64, "JPEG", data.cell.x + (data.cell.width - imgSize) / 2, data.cell.y + (data.cell.height - imgSize) / 2, imgSize, imgSize); } catch { /* */ }
          }
        }
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (doc as any).lastAutoTable.finalY;
  }

  let cursor = 32;
  if (regularItems.length > 0) {
    cursor = drawSectionTable(preorderItems.length > 0 ? "Pedido" : "Detalle", cursor, regularItems);
    cursor += 6;
  }
  if (preorderItems.length > 0) {
    cursor = drawSectionTable("Pre-orden", cursor, preorderItems);
  }
  const fy = cursor + 8;
  doc.setFontSize(10); doc.setTextColor(26); doc.setFont("helvetica", "bold");
  doc.text(`${totalBultos} bultos · ${totalPiezas} piezas`, 14, fy);
  doc.text(`$${fmt(total)}`, 196, fy, { align: "right" });
  doc.setFontSize(7); doc.setTextColor(160); doc.setFont("helvetica", "normal");
  doc.text(
    marca === "reebok" ? "Fashion Group Panama · Reebok Authorized Distributor" : "Fashion Group Panama · Joybees",
    14,
    fy + 10,
  );

  return Buffer.from(doc.output("arraybuffer"));
}
