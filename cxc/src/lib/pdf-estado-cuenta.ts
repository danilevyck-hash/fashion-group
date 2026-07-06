import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { FG_LOGO_BASE64, FG_LOGO_WIDTH, FG_LOGO_HEIGHT } from "@/lib/pdf-logo";
import { fmtDate } from "@/lib/format";
import type { EstadoCuenta } from "@/app/admin/components/EstadoCuentaDrawer";

// Estado de cuenta del cliente — PDF estilo de la casa (mismo header/footer y
// paleta que pdf-cxc.ts). Es el documento que se le manda al cliente.

function money(n: number): string {
  const abs = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `-$${abs}` : `$${abs}`;
}

function hoy(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function addHeader(doc: jsPDF, nombre: string, codigo: string): number {
  const w = doc.internal.pageSize.getWidth();

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
  doc.text(`Estado de cuenta — ${hoy()}`, w - 19, 18, { align: "right" });

  // Cliente + código
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(17, 24, 39);
  doc.text(nombre, textX, 25);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(107, 114, 128);
  doc.text(codigo, w - 19, 25, { align: "right" });

  const y = 29;
  doc.setDrawColor(229, 231, 235);
  doc.setLineWidth(0.5);
  doc.line(19, y, w - 19, y);
  return y + 5;
}

function addFooter(doc: jsPDF): void {
  const pages = doc.getNumberOfPages();
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(156, 163, 175);
    doc.text(`Generado ${hoy()} · Confidencial · Fashion Group`, w / 2, h - 10, { align: "center" });
    doc.text(`${i} / ${pages}`, w - 19, h - 10, { align: "right" });
  }
}

export function buildEstadoCuentaPDF(data: EstadoCuenta, nombre: string): { doc: jsPDF; filename: string } {
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const w = doc.internal.pageSize.getWidth();
  let y = addHeader(doc, nombre, data.codigo);

  const multi = data.empresas.length > 1;

  for (const emp of data.empresas) {
    // Encabezado de empresa (solo si hay más de una)
    if (multi) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(17, 24, 39);
      doc.text(emp.empresa_nombre, 19, y);
      doc.setTextColor(107, 114, 128);
      doc.text(money(emp.subtotal), w - 19, y, { align: "right" });
      y += 2;
    }

    autoTable(doc, {
      startY: y,
      margin: { left: 19, right: 19 },
      head: [["Documento", "Tipo", "Fecha", "Días", "Monto", "Saldo"]],
      body: emp.documentos.map((d) => [
        d.numero,
        d.tipo,
        d.fecha ? fmtDate(d.fecha) : "—",
        d.dias != null ? String(d.dias) : "—",
        money(d.monto),
        money(d.saldo),
      ]),
      foot: [["", "", "", "", "Subtotal", money(emp.subtotal)]],
      styles: { font: "helvetica", fontSize: 8, cellPadding: 2, textColor: [17, 24, 39] },
      headStyles: { fillColor: [249, 250, 251], textColor: [107, 114, 128], fontStyle: "bold", fontSize: 7 },
      footStyles: { fillColor: [255, 255, 255], textColor: [17, 24, 39], fontStyle: "bold", fontSize: 8 },
      columnStyles: {
        0: { cellWidth: "auto" },
        1: { cellWidth: 26 },
        2: { cellWidth: 24 },
        3: { halign: "right", cellWidth: 14 },
        4: { halign: "right", cellWidth: 26 },
        5: { halign: "right", cellWidth: 26, fontStyle: "bold" },
      },
      alternateRowStyles: { fillColor: [249, 250, 251] },
    });

    // @ts-expect-error lastAutoTable es agregado por el plugin en runtime
    y = doc.lastAutoTable.finalY + 6;
  }

  // Total general (barra oscura estilo de la casa)
  doc.setFillColor(17, 24, 39);
  doc.rect(19, y, w - 38, 9, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text("TOTAL ADEUDADO", 23, y + 6);
  doc.text(money(data.total), w - 23, y + 6, { align: "right" });

  addFooter(doc);

  const iso = new Date().toISOString().slice(0, 10);
  const filename = `Estado-cuenta-${data.codigo}-${iso}.pdf`;
  return { doc, filename };
}
