import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { FG_LOGO_BASE64, FG_LOGO_WIDTH, FG_LOGO_HEIGHT } from "@/lib/pdf-logo";

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

const NAVY = "#1A2656";
const NAVY_RGB: [number, number, number] = [26, 38, 86];
const WHITE_RGB: [number, number, number] = [255, 255, 255];
const CREAM_RGB: [number, number, number] = [245, 240, 232];
const GRAY_TEXT: [number, number, number] = [107, 114, 128];

export async function generateReebokOrderPdf(cart: OrderItem[]): Promise<void> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const margin = 16;

  // --- Header ---
  let y = 14;

  // Logo
  try {
    doc.addImage(FG_LOGO_BASE64, "JPEG", margin, y - 4, FG_LOGO_WIDTH, FG_LOGO_HEIGHT);
  } catch { /* skip */ }

  const textX = margin + FG_LOGO_WIDTH + 3;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...NAVY_RGB);
  doc.text("FASHION GROUP", textX, y + 2);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...GRAY_TEXT);
  doc.text("fashiongr.com", textX, y + 7);

  // Right side: title + date
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...NAVY_RGB);
  doc.text("Pedido Reebok", w - margin, y + 2, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...GRAY_TEXT);
  doc.text(fmtDateShort(), w - margin, y + 7, { align: "right" });

  y += 14;
  doc.setDrawColor(229, 231, 235);
  doc.setLineWidth(0.5);
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
  const total = cart.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const imgCellSize = 10; // mm

  const tableBody = cart.map((item) => {
    const lineTotal = item.quantity * item.unit_price;
    return [
      { content: "", styles: { minCellWidth: 14, cellPadding: 2 } }, // photo placeholder
      item.sku || "-",
      item.name,
      String(item.quantity),
      `$${fmtMoney(item.unit_price)}`,
      `$${fmtMoney(lineTotal)}`,
    ];
  });

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["", "SKU", "Producto", "Cant.", "Precio Unit.", "Total"]],
    body: tableBody,
    headStyles: {
      fillColor: NAVY_RGB,
      textColor: WHITE_RGB,
      fontStyle: "bold",
      fontSize: 8,
      cellPadding: 3,
    },
    bodyStyles: {
      fontSize: 8,
      cellPadding: 3,
      textColor: [30, 30, 30],
    },
    alternateRowStyles: {
      fillColor: CREAM_RGB,
    },
    columnStyles: {
      0: { cellWidth: 14, halign: "center" },
      1: { cellWidth: 28 },
      2: { cellWidth: "auto" },
      3: { cellWidth: 14, halign: "center" },
      4: { cellWidth: 24, halign: "right" },
      5: { cellWidth: 24, halign: "right" },
    },
    foot: [
      [
        { content: "", styles: { fillColor: WHITE_RGB } },
        { content: "", styles: { fillColor: WHITE_RGB } },
        { content: "", styles: { fillColor: WHITE_RGB } },
        { content: "", styles: { fillColor: WHITE_RGB } },
        { content: "TOTAL", styles: { fontStyle: "bold", halign: "right" as const, fillColor: NAVY_RGB, textColor: WHITE_RGB, fontSize: 9 } },
        { content: `$${fmtMoney(total)}`, styles: { fontStyle: "bold", halign: "right" as const, fillColor: NAVY_RGB, textColor: WHITE_RGB, fontSize: 9 } },
      ],
    ],
    didDrawCell: (data) => {
      // Draw product images in the first column of body rows
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
            // If image fails, just leave it blank
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
  const filename = `Pedido-Reebok-${isoDate()}.pdf`;
  doc.save(filename);
}
