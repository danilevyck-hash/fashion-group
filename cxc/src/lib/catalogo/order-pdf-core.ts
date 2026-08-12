// ─────────────────────────────────────────────────────────────────────────────
// PDF de pedido de catálogo — CORE ISOMORFO (browser + server).
//
// Fuente ÚNICA del layout del PDF de pedido Reebok/Joybees. Antes había 6
// generadores (2 libs cliente, 2 inline en send-order, 1 inline en el detalle
// de pedido Reebok, 1 lib server); todos consolidados aquí. Los wrappers:
//   - order-pdf.ts        → server: fetch + downscale con sharp, retorna Buffer
//   - order-pdf-client.ts → browser: fetch + downscale con canvas, descarga
//
// Estilo por marca: Reebok = banda negra con logo + secciones Pedido/Pre-orden;
// Joybees = banda navy con el logo blanco. El TOTAL se dibuja UNA sola
// vez con doc.text al final (nunca foot de autotable → no se repite por página).
// ─────────────────────────────────────────────────────────────────────────────

import { jsPDF } from "jspdf";
import { resolverLineas, resumirPedido } from "./lineas-pedido";
import autoTable from "jspdf-autotable";
import { REEBOK_LOGO_BASE64, REEBOK_LOGO_WIDTH, REEBOK_LOGO_HEIGHT } from "@/lib/reebok-logo";
import { TOMMY_LOGO_BLANCO_BASE64, TOMMY_LOGO_WIDTH, TOMMY_LOGO_HEIGHT } from "@/lib/tommy-logo";
import { CALVIN_LOGO_BLANCO_BASE64, CALVIN_LOGO_WIDTH, CALVIN_LOGO_HEIGHT } from "@/lib/calvin-logo";
import { JOYBEES_LOGO_BLANCO_BASE64, JOYBEES_LOGO_WIDTH, JOYBEES_LOGO_HEIGHT } from "@/lib/joybees-logo";
import { sortReebokOrderItems } from "@/lib/reebok-order-sort";
import { precioTexto } from "@/lib/catalogo/precio";

export interface PdfOrderItem {
  sku: string;
  name: string;
  quantity: number; // bultos
  unit_price: number;
  image_url: string;
  is_preorder?: boolean;
  category: string;
  /** Tommy: piezas por bulto del estilo. Vacío = el default de la marca. */
  bulto_pzas?: number | null;
}

export interface OrderPdfOpts {
  marca: "reebok" | "joybees" | "tommy" | "calvin";
  orderNumber: string;
  clientName: string;
  createdAt: string;
  items: PdfOrderItem[];
  bultoSize: (category: string | null | undefined, bultoPzas?: number | null) => number;
  /** image_url → dataURL ya preparado (downscaled). Las ausentes se saltan. */
  images: Record<string, string>;
}

/** Lado máximo (px) al que se reduce cada foto antes de embeberla: se pinta a
 *  10 mm (~57 px) — 200 px da margen de sobra y reduce el PDF ~10-20x. */
export const ORDER_PDF_IMG_PX = 200;

// Precio del catálogo: `35` / `12.50` / `4,422` — sin `.00` y sin redondear.
const fmt = precioTexto;

/** Ancho útil (mm) del nombre del cliente antes de chocar con "Pedido:" (x=90),
 *  descontando la etiqueta "Cliente: " y 2 mm de aire. */
export const CLIENT_NAME_MAX_MM = 90 - 14 - 2;

/** Recorta el nombre del cliente con "…" para que quepa en su columna. */
export function fitClientName(doc: jsPDF, name: string): string {
  const label = doc.getTextWidth("Cliente: ");
  const max = CLIENT_NAME_MAX_MM - label;
  if (doc.getTextWidth(name) <= max) return name;
  let out = name;
  while (out.length > 1 && doc.getTextWidth(out + "…") > max) out = out.slice(0, -1);
  return out.trimEnd() + "…";
}

export function buildOrderPdfDoc(opts: OrderPdfOpts): jsPDF {
  const { marca, orderNumber, clientName, createdAt, bultoSize, images } = opts;
  const items = marca === "reebok" ? sortReebokOrderItems(opts.items) : opts.items;

  const regularItems = items.filter((i) => !i.is_preorder);
  const preorderItems = items.filter((i) => i.is_preorder);

  const totalBultos = items.reduce((s, i) => s + i.quantity, 0);
  // Las piezas y el total NO se calculan acá: salen de la resolución única del
  // pedido (ver `lineas-pedido.ts`). Este archivo solo DIBUJA.
  const resumen = resumirPedido(resolverLineas(items, { bultoSize }));
  const totalPiezas = resumen.piezas;
  const total = resumen.total;

  const doc = new jsPDF("portrait");
  const fechaLabel = new Date(createdAt + (createdAt.includes("T") ? "" : "T12:00:00"))
    .toLocaleDateString("es-PA", { day: "numeric", month: "long", year: "numeric" });

  // Header por marca
  if (marca === "reebok") {
    doc.setFillColor(26, 26, 26);
    doc.rect(0, 0, 210, 18, "F");
    try { doc.addImage(REEBOK_LOGO_BASE64, "PNG", 14, 5, REEBOK_LOGO_WIDTH, REEBOK_LOGO_HEIGHT); } catch { /* */ }
  } else if (marca === "tommy") {
    // Banda navy Tommy + wordmark BLANCO (el oscuro no se ve sobre navy).
    doc.setFillColor(21, 35, 66);
    doc.rect(0, 0, 210, 18, "F");
    try { doc.addImage(TOMMY_LOGO_BLANCO_BASE64, "PNG", 14, 9 - TOMMY_LOGO_HEIGHT / 2, TOMMY_LOGO_WIDTH, TOMMY_LOGO_HEIGHT); } catch { /* */ }
  } else if (marca === "calvin") {
    // Banda negra Calvin + wordmark BLANCO (blanco/negro minimalista).
    doc.setFillColor(10, 10, 10);
    doc.rect(0, 0, 210, 18, "F");
    try { doc.addImage(CALVIN_LOGO_BLANCO_BASE64, "PNG", 14, 9 - CALVIN_LOGO_HEIGHT / 2, CALVIN_LOGO_WIDTH, CALVIN_LOGO_HEIGHT); } catch { /* */ }
  } else {
    // Banda navy Joybees + logo BLANCO (el wordmark #404041 no se ve sobre navy).
    doc.setFillColor(26, 38, 86);
    doc.rect(0, 0, 210, 18, "F");
    try { doc.addImage(JOYBEES_LOGO_BLANCO_BASE64, "PNG", 14, 9 - JOYBEES_LOGO_HEIGHT / 2, JOYBEES_LOGO_WIDTH, JOYBEES_LOGO_HEIGHT); } catch { /* */ }
  }
  doc.setFontSize(8); doc.setTextColor(255); doc.setFont("helvetica", "normal");
  doc.text("Fashion Group · Panamá", 196, 12, { align: "right" });

  // Cliente / Pedido / Fecha en columnas FIJAS (14 / 90 / 150 mm): el nombre del
  // cliente se recorta al ancho disponible o se montaba encima de "Pedido:"
  // ("COMERCIAL EL MACHETAZO, S.A. — SUCURSAL VÍA ESPAÑA" pisaba el número de
  // pedido en el PDF que recibe el cliente).
  doc.setTextColor(100); doc.setFontSize(9);
  doc.text(`Cliente: ${fitClientName(doc, clientName)}`, 14, 26);
  doc.text(`Pedido: ${orderNumber}`, 90, 26);
  doc.text(`Fecha: ${fechaLabel}`, 150, 26);

  const headFill: [number, number, number] =
    marca === "reebok"
      ? [26, 26, 26]
      : marca === "tommy"
        ? [21, 35, 66]
        : marca === "calvin"
          ? [10, 10, 10]
          : [26, 38, 86];

  function drawSectionTable(title: string, startY: number, sectionItems: PdfOrderItem[]) {
    doc.setFontSize(10); doc.setTextColor(26); doc.setFont("helvetica", "bold");
    doc.text(title, 14, startY);
    autoTable(doc, {
      startY: startY + 3,
      head: [["", "Producto", "SKU", "Bultos", "Piezas", "Precio/u", "Subtotal"]],
      // Cada celda LEE de la línea resuelta: acá no se multiplica nada.
      body: resolverLineas(sectionItems, { bultoSize }).map((l) => [
        "", l.name, l.sku, String(l.bultos), String(l.piezas), `$${fmt(l.unit_price)}`, `$${fmt(l.subtotal)}`,
      ]),
      styles: { fontSize: 8, cellPadding: 2, minCellHeight: 12 },
      headStyles: { fillColor: headFill, textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [249, 249, 249] },
      columnStyles: { 0: { cellWidth: 12, minCellHeight: 12 }, 3: { halign: "center" }, 4: { halign: "center" }, 5: { halign: "right" }, 6: { halign: "right" } },
      didDrawCell: (data: { row: { index: number; section: string }; column: { index: number }; cell: { x: number; y: number; height: number; width: number } }) => {
        if (data.column.index === 0 && data.row.section === "body") {
          const item = sectionItems[data.row.index];
          const b64 = item?.image_url ? images[item.image_url] : undefined;
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
  // Total al pie — con guard de salto: si la tabla terminó pegada al borde,
  // el total pasa a una página nueva en vez de desaparecer fuera del A4.
  let fy = cursor + 8;
  if (fy + 12 > 290) { doc.addPage(); fy = 20; }
  doc.setFontSize(10); doc.setTextColor(26); doc.setFont("helvetica", "bold");
  doc.text(`${totalBultos} bultos · ${totalPiezas} piezas`, 14, fy);
  doc.text(`$${fmt(total)}`, 196, fy, { align: "right" });
  doc.setFontSize(7); doc.setTextColor(160); doc.setFont("helvetica", "normal");
  doc.text(
    marca === "reebok"
      ? "Fashion Group Panamá · Reebok Authorized Distributor"
      : marca === "tommy"
        ? "Fashion Group Panamá · Tommy Hilfiger"
        : marca === "calvin"
          ? "Fashion Group Panamá · Calvin Klein"
          : "Fashion Group Panamá · Joybees",
    14,
    fy + 10,
  );

  return doc;
}
