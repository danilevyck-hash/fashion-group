import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { getBultoSize } from "@/lib/joybees-bulto";

interface OrderItem {
  product_id: string;
  sku: string;
  name: string;
  image_url: string;
  quantity: number;
  unit_price: number;
}

function fmtMoney(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDateShort() {
  const d = new Date();
  return d.toLocaleDateString("es-PA", { day: "numeric", month: "short", year: "numeric" }).replace(".", "");
}

function isoDate() {
  return new Date().toISOString().slice(0, 10);
}

/** Convert a remote image URL to a base64 data URL. Returns null on failure. */
async function imageToBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// Marca Joybees: navy #1A2656, amarillo #FFE443, gris #404041.
const NAVY_RGB: [number, number, number] = [26, 38, 86];
const YELLOW_RGB: [number, number, number] = [255, 228, 67];
const WHITE_RGB: [number, number, number] = [255, 255, 255];
const YELLOW_TINT: [number, number, number] = [255, 250, 224];
const GRAY_TEXT: [number, number, number] = [107, 114, 128];

export async function generateJoybeesOrderPdf(cart: OrderItem[]): Promise<void> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const margin = 16;

  // --- Header (sin logo) ---
  let y = 14;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...NAVY_RGB);
  doc.text("JOYBEES", margin, y + 2);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...GRAY_TEXT);
  doc.text("Panamá", margin, y + 7);

  // Right side: title + date
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...NAVY_RGB);
  doc.text("Pedido Joybees", w - margin, y + 2, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...GRAY_TEXT);
  doc.text(fmtDateShort(), w - margin, y + 7, { align: "right" });

  y += 12;
  // Acento amarillo Joybees bajo el header
  doc.setDrawColor(...YELLOW_RGB);
  doc.setLineWidth(1);
  doc.line(margin, y, w - margin, y);
  y += 6;

  // --- Pre-load images ---
  const imageMap = new Map<string, string>();
  const imagePromises = cart.map(async (item) => {
    if (!item.image_url) return;
    const b64 = await imageToBase64(item.image_url);
    if (b64) imageMap.set(item.product_id, b64);
  });
  await Promise.all(imagePromises);

  // --- Table ---
  // Joybees es todo footwear → bulto siempre 12 (getBultoSize).
  const total = cart.reduce((s, i) => s + i.quantity * getBultoSize() * i.unit_price, 0);
  const imgCellSize = 10; // mm

  const body = cart.map((item) => {
    const bs = getBultoSize();
    const lineTotal = item.quantity * bs * item.unit_price;
    const qtyLabel = `${item.quantity} bulto${item.quantity !== 1 ? "s" : ""} (${item.quantity * bs} pzas)`;
    return [
      { content: "", styles: { minCellWidth: 14, cellPadding: 2 } },
      item.sku || "-",
      item.name,
      qtyLabel,
      // Precio unitario = protagonista (negrita, navy, mayor)
      { content: `$${fmtMoney(item.unit_price)}`, styles: { fontStyle: "bold" as const, fontSize: 9, textColor: NAVY_RGB } },
      // Total del bulto = secundario (menor, gris)
      { content: `$${fmtMoney(lineTotal)}`, styles: { fontSize: 7, textColor: GRAY_TEXT } },
    ];
  });

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["", "SKU", "Producto", "Cantidad", "Precio Unit.", "Total"]],
    body,
    headStyles: { fillColor: NAVY_RGB, textColor: WHITE_RGB, fontStyle: "bold", fontSize: 8, cellPadding: 3 },
    bodyStyles: { fontSize: 8, cellPadding: 3, textColor: [30, 30, 30] },
    alternateRowStyles: { fillColor: YELLOW_TINT },
    columnStyles: {
      0: { cellWidth: 14, halign: "center" as const },
      1: { cellWidth: 28 },
      2: { cellWidth: "auto" as const },
      3: { cellWidth: 32, halign: "center" as const },
      4: { cellWidth: 24, halign: "right" as const },
      5: { cellWidth: 24, halign: "right" as const },
    },
    foot: [
      [
        { content: "", styles: { fillColor: WHITE_RGB } },
        { content: "", styles: { fillColor: WHITE_RGB } },
        { content: "", styles: { fillColor: WHITE_RGB } },
        { content: "", styles: { fillColor: WHITE_RGB } },
        { content: "TOTAL", styles: { fontStyle: "bold", halign: "right" as const, fillColor: YELLOW_RGB, textColor: NAVY_RGB, fontSize: 9 } },
        { content: `$${fmtMoney(total)}`, styles: { fontStyle: "bold", halign: "right" as const, fillColor: YELLOW_RGB, textColor: NAVY_RGB, fontSize: 9 } },
      ],
    ],
    didDrawCell: (data) => {
      if (data.section === "body" && data.column.index === 0) {
        const item = cart[data.row.index];
        if (!item) return;
        const b64 = imageMap.get(item.product_id);
        if (b64) {
          try {
            const x = data.cell.x + (data.cell.width - imgCellSize) / 2;
            const yImg = data.cell.y + (data.cell.height - imgCellSize) / 2;
            doc.addImage(b64, "JPEG", x, yImg, imgCellSize, imgCellSize);
          } catch {
            // skip
          }
        }
      }
    },
  });

  // --- Footer ---
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...GRAY_TEXT);
  doc.text("Enviado desde fashiongr.com", w / 2, pageHeight - 10, { align: "center" });

  // --- Download ---
  const filename = `Pedido-Joybees-${isoDate()}.pdf`;
  doc.save(filename);
}
