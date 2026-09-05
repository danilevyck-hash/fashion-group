import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { FG_LOGO_BASE64, FG_LOGO_WIDTH, FG_LOGO_HEIGHT } from "@/lib/pdf-logo";
import { fmtDate } from "@/lib/format";
import type { EstadoCuenta } from "@/app/cxc/components/EstadoCuentaDrawer";

// Estado de cuenta del cliente — PDF estilo de la casa (mismo header/footer y
// paleta que pdf-cxc.ts). Es el documento que se le manda al cliente.

function money(n: number): string {
  const abs = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `-$${abs}` : `$${abs}`;
}

/** Fecha de hoy en el formato de la casa ("5 abr 2026"), el mismo que usa la
 *  columna Fecha de la tabla — antes el encabezado y el pie iban en 26/07/2026 y
 *  la tabla en "10 ene 2026", dos formatos en el MISMO documento del cliente. */
function hoy(): string {
  const d = new Date(); // fecha LOCAL, no UTC (si no, de madrugada adelanta un día)
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return fmtDate(iso);
}

function addHeader(doc: jsPDF, nombre: string, codigo: string, empresaNombre: string | null): number {
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

  // Empresa acreedora: el cliente debe saber A QUIÉN le debe este estado de
  // cuenta. Solo cuando el PDF es de una sola empresa (el caso del correo); si
  // trae varias, cada grupo ya lleva su propio encabezado más abajo.
  let y = 25;
  if (empresaNombre) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(17, 24, 39);
    doc.text(empresaNombre, textX, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(107, 114, 128);
    doc.text("Empresa acreedora", w - 19, y, { align: "right" });
    y += 6;
  }

  // Cliente + código
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(17, 24, 39);
  doc.text(nombre, textX, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(107, 114, 128);
  doc.text(codigo, w - 19, y, { align: "right" });

  y += 4;
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

/** Alto (mm) reservado abajo para el pie ("Generado … · Confidencial" + N/N). */
const FOOTER_RESERVA_MM = 16;

/**
 * Alto de la barra "TOTAL ADEUDADO". Si no cabe entera por encima del pie, el
 * total se pasa a una página nueva. Sin este guard la barra se dibujaba pegada
 * al borde inferior TAPANDO el pie (a partir de ~29 documentos por empresa) en
 * el PDF que se le adjunta al cliente.
 */
const TOTAL_BAR_H = 9;

/** Y de arranque de la barra del total, saltando de página si no cabe. */
export function yParaTotal(doc: jsPDF, y: number): number {
  const h = doc.internal.pageSize.getHeight();
  if (y + TOTAL_BAR_H > h - FOOTER_RESERVA_MM) {
    doc.addPage();
    return 20;
  }
  return y;
}

export function buildEstadoCuentaPDF(data: EstadoCuenta, nombre: string): { doc: jsPDF; filename: string } {
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const w = doc.internal.pageSize.getWidth();

  const multi = data.empresas.length > 1;
  // Un solo grupo → la empresa va en el header (correo: un PDF por empresa).
  const empresaHeader = multi ? null : (data.empresas[0]?.empresa_nombre ?? null);
  let y = addHeader(doc, nombre, data.codigo, empresaHeader);

  for (const emp of data.empresas) {
    // Encabezado de empresa (solo si hay más de una)
    if (multi) {
      // Mismo guard que el total: un encabezado de empresa pegado al borde
      // quedaba encima del pie y su tabla arrancaba en la página siguiente.
      if (y + 12 > doc.internal.pageSize.getHeight() - FOOTER_RESERVA_MM) {
        doc.addPage();
        y = 20;
      }
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
  y = yParaTotal(doc, y);
  doc.setFillColor(17, 24, 39);
  doc.rect(19, y, w - 38, TOTAL_BAR_H, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  // 🔴 "Total", no "TOTAL ADEUDADO" (12-ago-2026). Es el MISMO número que el
  // cliente ve rotulado "Total" en la fila final de la tabla del correo que
  // lleva este PDF adjunto (`buildResumenHtml`), y el mismo que Daniel ve
  // rotulado "Total" en el pie del drawer de Estado de cuenta desde donde se
  // manda. El papel era la única de las tres superficies que le decía otra
  // cosa —y a los gritos— al mismo número.
  doc.text("Total", 23, y + 6);
  doc.text(money(data.total), w - 23, y + 6, { align: "right" });

  addFooter(doc);

  const iso = new Date().toISOString().slice(0, 10);
  const filename = `Estado-cuenta-${data.codigo}-${iso}.pdf`;
  return { doc, filename };
}

// ─────────────────────────────────────────────────────────────────────────────
// EL PDF DE UN CORREO COMPARTIDO — UNA HOJA POR CLIENTE Y UN TOTAL AL FINAL.
//
// 🔴 POR QUÉ EXISTE (5-sep-2026). Trece clientes distintos comparten
// `oficina@citymoda.store` y deben $402.376,67 entre todos; los dos City Mall
// comparten `contabilidad@citymall.com.pa` con $480.784,72. Mandar un correo
// por CLIENTE le pone trece mensajes en la bandeja a la misma persona el mismo
// minuto, cada uno con un pedazo del saldo y ninguno con la cuenta completa.
//
// Lo que sale es UN correo por DIRECCIÓN con UN PDF: cada cliente arranca en su
// propia hoja (encabezado con su nombre y su código, sus documentos, su
// subtotal) y al final va el TOTAL de todos.
//
// ⚠️ Los números salen de `fetchEstadoCuentaData`, exactamente los mismos que
// el PDF de un cliente solo: acá no se recalcula nada, solo se ordena en hojas.
// ─────────────────────────────────────────────────────────────────────────────

export interface ClienteDelLote {
  data: EstadoCuenta;
  nombre: string;
}

export function buildEstadoCuentaLotePDF(
  clientes: ClienteDelLote[],
): { doc: jsPDF; filename: string } {
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const w = doc.internal.pageSize.getWidth();
  let total = 0;

  clientes.forEach((cliente, i) => {
    // Cada cliente empieza en su propia hoja: quien recibe el correo tiene que
    // poder arrancarle la página a uno sin cortar a otro por la mitad.
    if (i > 0) doc.addPage();
    const { data, nombre } = cliente;
    total += data.total;
    const multi = data.empresas.length > 1;
    let y = addHeader(doc, nombre, data.codigo, multi ? null : (data.empresas[0]?.empresa_nombre ?? null));

    for (const emp of data.empresas) {
      if (multi) {
        if (y + 12 > doc.internal.pageSize.getHeight() - FOOTER_RESERVA_MM) {
          doc.addPage();
          y = 20;
        }
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

    // Total DE ESE CLIENTE.
    y = yParaTotal(doc, y);
    doc.setFillColor(55, 65, 81);
    doc.rect(19, y, w - 38, TOTAL_BAR_H, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text(`Total ${nombre}`, 23, y + 6);
    doc.text(money(data.total), w - 23, y + 6, { align: "right" });
  });

  // El TOTAL DE TODOS, solo si hay más de uno: con un cliente sería el mismo
  // número dos veces seguidas.
  if (clientes.length > 1) {
    doc.addPage();
    let y = 20;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(17, 24, 39);
    doc.text("Resumen", 19, y);
    y += 6;
    autoTable(doc, {
      startY: y,
      margin: { left: 19, right: 19 },
      head: [["Cliente", "Código", "Total"]],
      body: clientes.map((c) => [c.nombre, c.data.codigo, money(c.data.total)]),
      styles: { font: "helvetica", fontSize: 8, cellPadding: 2, textColor: [17, 24, 39] },
      headStyles: { fillColor: [249, 250, 251], textColor: [107, 114, 128], fontStyle: "bold", fontSize: 7 },
      columnStyles: {
        0: { cellWidth: "auto" },
        1: { cellWidth: 26 },
        2: { halign: "right", cellWidth: 30, fontStyle: "bold" },
      },
      alternateRowStyles: { fillColor: [249, 250, 251] },
    });
    // @ts-expect-error lastAutoTable es agregado por el plugin en runtime
    y = doc.lastAutoTable.finalY + 6;
    y = yParaTotal(doc, y);
    doc.setFillColor(17, 24, 39);
    doc.rect(19, y, w - 38, TOTAL_BAR_H, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text("Total", 23, y + 6);
    doc.text(money(Math.round(total * 100) / 100), w - 23, y + 6, { align: "right" });
  }

  addFooter(doc);

  const iso = new Date().toISOString().slice(0, 10);
  const filename = clientes.length === 1
    ? `Estado-cuenta-${clientes[0].data.codigo}-${iso}.pdf`
    : `Estado-cuenta-${clientes.length}-clientes-${iso}.pdf`;
  return { doc, filename };
}
