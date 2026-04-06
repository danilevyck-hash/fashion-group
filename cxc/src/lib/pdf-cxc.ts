import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { ConsolidatedClient } from "@/lib/types";
import type { Company } from "@/lib/companies";
import { FG_LOGO_BASE64, FG_LOGO_WIDTH, FG_LOGO_HEIGHT } from "@/lib/pdf-logo";

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function isoDate() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

function addHeader(doc: jsPDF, subtitle?: string) {
  const w = doc.internal.pageSize.getWidth();

  // Logo
  try {
    doc.addImage(FG_LOGO_BASE64, "JPEG", 19, 10, FG_LOGO_WIDTH, FG_LOGO_HEIGHT);
  } catch { /* skip if logo fails */ }

  const textX = 19 + FG_LOGO_WIDTH + 3;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(17, 24, 39);
  doc.text("FASHION GROUP", textX, 18);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(107, 114, 128);
  doc.text(`Reporte CXC — ${fmtDate()}`, w - 19, 18, { align: "right" });

  if (subtitle) {
    doc.setFontSize(9);
    doc.text(subtitle, textX, 24);
  }

  // Line under header
  const y = subtitle ? 28 : 24;
  doc.setDrawColor(229, 231, 235);
  doc.setLineWidth(0.5);
  doc.line(19, y, w - 19, y);
  return y + 4;
}

function addFooter(doc: jsPDF) {
  const pages = doc.getNumberOfPages();
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(156, 163, 175);
    doc.text(`Generado ${fmtDate()} · Confidencial · Fashion Group`, w / 2, h - 10, { align: "center" });
    doc.text(`${i} / ${pages}`, w - 19, h - 10, { align: "right" });
  }
}

export function generatePDFResumen(data: ConsolidatedClient[], subtitle?: string): string {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });

  const totalCxc = data.reduce((s, c) => s + c.total, 0);
  const totalCurrent = data.reduce((s, c) => s + c.current, 0);
  const totalWatch = data.reduce((s, c) => s + c.watch, 0);
  const totalOverdue = data.reduce((s, c) => s + c.overdue, 0);
  const pctCur = totalCxc > 0 ? (totalCurrent / totalCxc) * 100 : 0;
  const pctWat = totalCxc > 0 ? (totalWatch / totalCxc) * 100 : 0;
  const pctOvr = totalCxc > 0 ? (totalOverdue / totalCxc) * 100 : 0;

  let y = addHeader(doc, subtitle ? `${subtitle} · ${data.length} clientes` : `${data.length} clientes`);

  // Summary boxes
  const w = doc.internal.pageSize.getWidth();
  const boxW = (w - 38 - 9) / 4; // 4 boxes with 3mm gaps
  const boxes = [
    { label: "Total CXC", value: `$${fmt(totalCxc)}`, bg: [249, 250, 251] },
    { label: "Corriente 0-90d", value: `$${fmt(totalCurrent)}`, bg: [236, 253, 245] },
    { label: "Vigilancia 91-120d", value: `$${fmt(totalWatch)}`, bg: [255, 251, 235] },
    { label: "Vencido +121d", value: `$${fmt(totalOverdue)}`, bg: [254, 242, 242] },
  ];
  boxes.forEach((box, i) => {
    const x = 19 + i * (boxW + 3);
    doc.setFillColor(box.bg[0], box.bg[1], box.bg[2]);
    doc.roundedRect(x, y, boxW, 14, 1.5, 1.5, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(107, 114, 128);
    doc.text(box.label, x + 3, y + 5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(17, 24, 39);
    doc.text(box.value, x + 3, y + 11);
  });
  y += 18;

  // Aging bar
  const barX = 19;
  const barW = w - 38;
  const barH = 4;
  // Green
  doc.setFillColor(5, 150, 105);
  doc.roundedRect(barX, y, barW * (pctCur / 100), barH, 1, 1, "F");
  // Yellow
  if (pctWat > 0) {
    doc.setFillColor(217, 119, 6);
    doc.rect(barX + barW * (pctCur / 100), y, barW * (pctWat / 100), barH, "F");
  }
  // Red
  if (pctOvr > 0) {
    doc.setFillColor(220, 38, 38);
    const redX = barX + barW * ((pctCur + pctWat) / 100);
    doc.roundedRect(redX, y, barW * (pctOvr / 100), barH, 1, 1, "F");
  }
  y += 6;
  doc.setFontSize(6);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(107, 114, 128);
  doc.text(`Corriente ${pctCur.toFixed(0)}%`, barX, y + 2.5);
  doc.text(`Vigilancia ${pctWat.toFixed(0)}%`, barX + barW / 2, y + 2.5, { align: "center" });
  doc.text(`Vencido ${pctOvr.toFixed(0)}%`, barX + barW, y + 2.5, { align: "right" });
  y += 6;

  // Table
  const tableData = data.map((c) => [
    c.nombre_normalized,
    `$${fmt(c.current)}`,
    `$${fmt(c.watch)}`,
    `$${fmt(c.overdue)}`,
    `$${fmt(c.total)}`,
  ]);

  autoTable(doc, {
    startY: y,
    margin: { left: 19, right: 19 },
    head: [["Cliente", "Corriente 0-90d", "Vigilancia 91-120d", "Vencido 121d+", "Total"]],
    body: tableData,
    foot: [["TOTAL", `$${fmt(totalCurrent)}`, `$${fmt(totalWatch)}`, `$${fmt(totalOverdue)}`, `$${fmt(totalCxc)}`]],
    styles: { font: "helvetica", fontSize: 8, cellPadding: 2, textColor: [17, 24, 39] },
    headStyles: { fillColor: [249, 250, 251], textColor: [107, 114, 128], fontStyle: "bold", fontSize: 7 },
    footStyles: { fillColor: [17, 24, 39], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { halign: "right", textColor: [5, 150, 105] },
      2: { halign: "right", textColor: [217, 119, 6] },
      3: { halign: "right", textColor: [220, 38, 38] },
      4: { halign: "right", fontStyle: "bold" },
    },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    didDrawPage: () => {},
  });

  addFooter(doc);
  const filename = `CXC_Resumen_${isoDate()}.pdf`;
  doc.save(filename);
  return filename;
}

export function generatePDFDetallado(
  data: ConsolidatedClient[],
  companies: Company[],
  subtitle?: string
): string {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "letter" });

  let y = addHeader(doc, subtitle ? `${subtitle} · Detallado · ${data.length} clientes` : `Detallado · ${data.length} clientes`);

  const clientsWithData = data.filter((c) => c.total > 0);

  const tableBody: (string | { content: string; styles?: Record<string, unknown> })[][] = [];

  for (const c of clientsWithData) {
    // Client header row
    tableBody.push([
      { content: c.nombre_normalized, styles: { fontStyle: "bold" as const, fillColor: [243, 244, 246] } },
      { content: "", styles: { fillColor: [243, 244, 246] } },
      { content: "", styles: { fillColor: [243, 244, 246] } },
      { content: "", styles: { fillColor: [243, 244, 246] } },
      { content: "", styles: { fillColor: [243, 244, 246] } },
      { content: "", styles: { fillColor: [243, 244, 246] } },
      { content: "", styles: { fillColor: [243, 244, 246] } },
      { content: "", styles: { fillColor: [243, 244, 246] } },
      { content: "", styles: { fillColor: [243, 244, 246] } },
      { content: `$${fmt(c.total)}`, styles: { fontStyle: "bold" as const, fillColor: [243, 244, 246], halign: "right" as const } },
    ]);

    // Company rows
    for (const co of companies) {
      const d = c.companies[co.key];
      if (!d || d.total === 0) continue;
      tableBody.push([
        `  ${co.name}`,
        `$${fmt(d.d0_30)}`,
        `$${fmt(d.d31_60)}`,
        `$${fmt(d.d61_90)}`,
        `$${fmt(d.d91_120)}`,
        `$${fmt(d.d121_180)}`,
        `$${fmt(d.d181_270)}`,
        `$${fmt(d.d271_365)}`,
        `$${fmt(d.mas_365)}`,
        `$${fmt(d.total)}`,
      ]);
    }
  }

  autoTable(doc, {
    startY: y,
    margin: { left: 19, right: 19 },
    head: [["Cliente / Empresa", "0-30", "31-60", "61-90", "91-120", "121-180", "181-270", "271-365", "+365", "Total"]],
    body: tableBody,
    styles: { font: "helvetica", fontSize: 7, cellPadding: 1.5, textColor: [17, 24, 39] },
    headStyles: { fillColor: [17, 24, 39], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 6.5 },
    columnStyles: {
      0: { cellWidth: 50 },
      1: { halign: "right" },
      2: { halign: "right" },
      3: { halign: "right" },
      4: { halign: "right", textColor: [217, 119, 6] },
      5: { halign: "right", textColor: [217, 119, 6] },
      6: { halign: "right", textColor: [220, 38, 38] },
      7: { halign: "right", textColor: [220, 38, 38] },
      8: { halign: "right", textColor: [220, 38, 38] },
      9: { halign: "right", fontStyle: "bold" },
    },
  });

  addFooter(doc);
  const filename = `CXC_Detallado_${isoDate()}.pdf`;
  doc.save(filename);
  return filename;
}
