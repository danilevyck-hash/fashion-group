// ============================================================================
// Marketing — generación de cobranza (lado cliente)
// Funciones puras que reciben data ya cargada y producen Blobs.
// ============================================================================
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import XLSX from "xlsx-js-style";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { FG_LOGO_BASE64, FG_LOGO_WIDTH, FG_LOGO_HEIGHT } from "@/lib/pdf-logo";
import { formatearMonto, formatearFecha } from "./normalizar";
import type {
  MkCobranza,
  MkFactura,
  MkMarca,
  MkAdjunto,
  ProyectoConMarcas,
} from "./types";

// ----------------------------------------------------------------------------
// Asunto / cuerpo plantilla
// ----------------------------------------------------------------------------
export function generarAsunto(
  proyecto: ProyectoConMarcas,
  marca: MkMarca,
  empresaPaga: string
): string {
  const tienda = proyecto.tienda || proyecto.nombre || "Proyecto";
  return `Cobranza coop — ${tienda} — ${empresaPaga}`;
}

export function generarCuerpo(
  proyecto: ProyectoConMarcas,
  marca: MkMarca,
  facturas: ReadonlyArray<MkFactura>,
  monto: number,
  porcentaje: number,
  subtotalTotal: number
): string {
  const tienda = proyecto.tienda || "la tienda";
  const nombreProyecto = proyecto.nombre || tienda;
  const numFacturas = facturas.length;
  const fechaHoy = formatearFecha(new Date());

  return [
    `Estimados ${marca.nombre},`,
    ``,
    `Adjunto cobranza de gastos de marketing compartidos correspondiente al proyecto "${nombreProyecto}" en ${tienda}.`,
    ``,
    `Resumen:`,
    `• Facturas incluidas: ${numFacturas}`,
    `• Subtotal del proyecto: ${formatearMonto(subtotalTotal)}`,
    `• Participación ${marca.nombre}: ${porcentaje.toFixed(2)}%`,
    `• Monto a cobrar: ${formatearMonto(monto)}`,
    ``,
    `En el ZIP encontrarán:`,
    `• PDF consolidado con detalle de facturas`,
    `• Excel de respaldo`,
    `• Copias de las facturas individuales`,
    `• Fotos del proyecto`,
    ``,
    `Quedamos atentos a confirmación de recepción y fecha estimada de pago.`,
    ``,
    `Saludos cordiales,`,
    `Fashion Group`,
    `Panamá — ${fechaHoy}`,
  ].join("\n");
}

// ----------------------------------------------------------------------------
// PDF consolidado
// ----------------------------------------------------------------------------
export function generarPdfConsolidado(
  cobranza: MkCobranza,
  proyecto: ProyectoConMarcas,
  marca: MkMarca,
  facturas: ReadonlyArray<MkFactura>
): Blob {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();

  // Header
  try {
    doc.addImage(FG_LOGO_BASE64, "JPEG", 19, 10, FG_LOGO_WIDTH, FG_LOGO_HEIGHT);
  } catch {
    /* skip */
  }
  const textX = 19 + FG_LOGO_WIDTH + 3;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(17, 24, 39);
  doc.text("FASHION GROUP", textX, 18);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(107, 114, 128);
  doc.text(`Cobranza marketing — ${formatearFecha(new Date())}`, w - 19, 18, {
    align: "right",
  });

  doc.setDrawColor(229, 231, 235);
  doc.setLineWidth(0.5);
  doc.line(19, 26, w - 19, 26);

  // Meta
  let y = 34;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(17, 24, 39);
  doc.text(`Cobranza ${cobranza.numero}`, 19, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(55, 65, 81);
  doc.text(`Marca: ${marca.nombre}`, 19, y);
  y += 5;
  doc.text(`Proyecto: ${proyecto.nombre ?? proyecto.tienda}`, 19, y);
  y += 5;
  doc.text(`Tienda: ${proyecto.tienda}`, 19, y);
  y += 5;
  if (cobranza.fecha_envio) {
    doc.text(`Fecha envío: ${formatearFecha(cobranza.fecha_envio)}`, 19, y);
    y += 5;
  }
  y += 2;

  // Tabla de facturas
  const body = facturas.map((f) => [
    f.numero_factura,
    formatearFecha(f.fecha_factura),
    f.proveedor,
    f.concepto,
    formatearMonto(f.subtotal),
    formatearMonto(f.itbms),
    formatearMonto(f.total),
  ]);

  autoTable(doc, {
    startY: y,
    head: [["N° Factura", "Fecha", "Proveedor", "Concepto", "Subtotal", "ITBMS", "Total"]],
    body,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: {
      fillColor: [17, 24, 39],
      textColor: 255,
      fontStyle: "bold",
    },
    columnStyles: {
      4: { halign: "right" },
      5: { halign: "right" },
      6: { halign: "right", fontStyle: "bold" },
    },
    margin: { left: 19, right: 19 },
  });

  const subtotalTotal = facturas.reduce((acc, f) => acc + f.subtotal, 0);
  const itbmsTotal = facturas.reduce((acc, f) => acc + f.itbms, 0);
  const totalTotal = facturas.reduce((acc, f) => acc + f.total, 0);

  // @ts-expect-error jspdf-autotable adjunta lastAutoTable al doc runtime
  const endY = (doc.lastAutoTable?.finalY ?? y) + 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(17, 24, 39);

  const porcentaje = proyecto.marcas.find((m) => m.marca.id === marca.id)?.porcentaje ?? 0;
  const montoCobrable = Number(((totalTotal * porcentaje) / 100).toFixed(2));

  const footerLines = [
    `Subtotal proyecto: ${formatearMonto(subtotalTotal)}`,
    `ITBMS total: ${formatearMonto(itbmsTotal)}`,
    `Total proyecto: ${formatearMonto(totalTotal)}`,
    `Participación ${marca.nombre}: ${porcentaje.toFixed(2)}%`,
  ];
  let fy = endY;
  for (const line of footerLines) {
    doc.text(line, w - 19, fy, { align: "right" });
    fy += 5;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(`Monto a cobrar: ${formatearMonto(montoCobrable)}`, w - 19, fy + 2, {
    align: "right",
  });

  return doc.output("blob");
}

// ----------------------------------------------------------------------------
// Excel de respaldo
// ----------------------------------------------------------------------------
export function generarExcelRespaldo(
  cobranza: MkCobranza,
  proyecto: ProyectoConMarcas,
  marca: MkMarca,
  facturas: ReadonlyArray<MkFactura>
): Blob {
  const wb = XLSX.utils.book_new();

  const porcentaje = proyecto.marcas.find((m) => m.marca.id === marca.id)?.porcentaje ?? 0;
  const totalTotal = facturas.reduce((acc, f) => acc + f.total, 0);
  const montoCobrable = Number(((totalTotal * porcentaje) / 100).toFixed(2));

  const headerStyle = {
    font: { bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
    fill: { fgColor: { rgb: "111827" } },
    alignment: { horizontal: "center", vertical: "center" },
  };
  const labelStyle = {
    font: { bold: true, sz: 10 },
    fill: { fgColor: { rgb: "F3F4F6" } },
  };
  const moneyFmt = '"$"#,##0.00';

  const aoa: unknown[][] = [
    ["Cobranza", cobranza.numero],
    ["Marca", marca.nombre],
    ["Proyecto", proyecto.nombre ?? proyecto.tienda],
    ["Tienda", proyecto.tienda],
    ["Fecha envío", cobranza.fecha_envio ? formatearFecha(cobranza.fecha_envio) : ""],
    [],
    ["N° Factura", "Fecha", "Proveedor", "Concepto", "Subtotal", "ITBMS", "Total"],
  ];
  for (const f of facturas) {
    aoa.push([
      f.numero_factura,
      f.fecha_factura,
      f.proveedor,
      f.concepto,
      f.subtotal,
      f.itbms,
      f.total,
    ]);
  }
  aoa.push([]);
  aoa.push(["", "", "", "Subtotal", facturas.reduce((a, f) => a + f.subtotal, 0), "", ""]);
  aoa.push(["", "", "", "ITBMS", "", facturas.reduce((a, f) => a + f.itbms, 0), ""]);
  aoa.push(["", "", "", "Total", "", "", totalTotal]);
  aoa.push(["", "", "", `Participación ${marca.nombre}`, `${porcentaje.toFixed(2)}%`, "", ""]);
  aoa.push(["", "", "", "Monto a cobrar", "", "", montoCobrable]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Style headers (fila 6, 0-indexed) y labels
  const headerRow = 6;
  for (let c = 0; c < 7; c++) {
    const addr = XLSX.utils.encode_cell({ r: headerRow, c });
    const cell = ws[addr];
    if (cell) cell.s = headerStyle;
  }
  // Labels de meta (col 0, filas 0-4)
  for (let r = 0; r < 5; r++) {
    const addr = XLSX.utils.encode_cell({ r, c: 0 });
    const cell = ws[addr];
    if (cell) cell.s = labelStyle;
  }

  // Formato moneda en columnas de dinero de la tabla + totales
  const dataStart = headerRow + 1;
  for (let r = dataStart; r < dataStart + facturas.length; r++) {
    for (const c of [4, 5, 6]) {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (ws[addr]) {
        ws[addr].t = "n";
        ws[addr].z = moneyFmt;
      }
    }
  }
  // Totales (últimas filas con números)
  const totalRows = [
    dataStart + facturas.length + 1, // subtotal
    dataStart + facturas.length + 2, // itbms
    dataStart + facturas.length + 3, // total
    dataStart + facturas.length + 5, // monto a cobrar
  ];
  for (const r of totalRows) {
    for (const c of [4, 5, 6]) {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (ws[addr] && typeof ws[addr].v === "number") {
        ws[addr].t = "n";
        ws[addr].z = moneyFmt;
        ws[addr].s = { font: { bold: true } };
      }
    }
  }

  ws["!cols"] = [
    { wch: 14 },
    { wch: 12 },
    { wch: 24 },
    { wch: 28 },
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Cobranza");

  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

// ----------------------------------------------------------------------------
// ZIP de entrega
// ----------------------------------------------------------------------------
export interface ZipCobranzaInput {
  cobranza: MkCobranza;
  proyecto: ProyectoConMarcas;
  marca: MkMarca;
  facturas: ReadonlyArray<MkFactura>;
  adjuntos: ReadonlyArray<MkAdjunto>; // PDFs / fotos de facturas
  fotos: ReadonlyArray<MkAdjunto>; // fotos del proyecto
}

export type FetchFile = (url: string) => Promise<Blob>;

function extractFilename(url: string, fallback: string): string {
  try {
    const u = new URL(url, "http://local");
    const parts = u.pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1];
    if (last && last.length > 0) return decodeURIComponent(last);
  } catch {
    // ignore
  }
  return fallback;
}

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

export async function generarZipCobranza(
  input: ZipCobranzaInput,
  fetchFile: FetchFile
): Promise<Blob> {
  const zip = new JSZip();

  // PDF consolidado
  const pdfBlob = generarPdfConsolidado(
    input.cobranza,
    input.proyecto,
    input.marca,
    input.facturas
  );
  zip.file("cobranza-consolidado.pdf", pdfBlob);

  // Excel de respaldo
  const xlsBlob = generarExcelRespaldo(
    input.cobranza,
    input.proyecto,
    input.marca,
    input.facturas
  );
  zip.file("respaldo.xlsx", xlsBlob);

  // Adjuntos de facturas
  const facturasFolder = zip.folder("facturas");
  if (facturasFolder && input.adjuntos.length > 0) {
    await Promise.all(
      input.adjuntos.map(async (adj, i) => {
        try {
          const blob = await fetchFile(adj.url);
          const ext = adj.tipo === "pdf_factura" ? "pdf" : "jpg";
          const name = adj.nombre_original
            ? extractFilename(adj.nombre_original, `factura_${i + 1}.${ext}`)
            : extractFilename(adj.url, `factura_${i + 1}.${ext}`);
          facturasFolder.file(name, blob);
        } catch {
          // Si un archivo falla, no abortar el zip completo.
        }
      })
    );
  }

  // Fotos del proyecto
  const fotosFolder = zip.folder("fotos");
  if (fotosFolder && input.fotos.length > 0) {
    await Promise.all(
      input.fotos.map(async (foto, i) => {
        try {
          const blob = await fetchFile(foto.url);
          const name = foto.nombre_original
            ? extractFilename(foto.nombre_original, `foto_${i + 1}.jpg`)
            : extractFilename(foto.url, `foto_${i + 1}.jpg`);
          fotosFolder.file(name, blob);
        } catch {
          // ignore individual failures
        }
      })
    );
  }

  return zip.generateAsync({ type: "blob" });
}

export function descargarZip(blob: Blob, filename: string): void {
  const safe = filename.endsWith(".zip") ? filename : `${filename}.zip`;
  saveAs(blob, safe);
}

export function nombreArchivoZip(
  marca: MkMarca,
  proyecto: ProyectoConMarcas,
  fecha: Date = new Date()
): string {
  const iso = fecha.toISOString().slice(0, 10);
  return `Cobranza_${slugify(marca.nombre)}_${slugify(proyecto.tienda)}_${iso}.zip`;
}
