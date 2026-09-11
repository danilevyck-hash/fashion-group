import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
// Forma FUNCIONAL de jspdf-autotable v5 —`autoTable(doc, …)`— igual que
// `lib/catalogo/order-pdf-core.ts`. El `import "jspdf-autotable"` a secas solo
// parcha `jsPDF.API.autoTable` en el build CJS: resuelto como ESM el método no
// existe y el PDF explota. Por eso este papel no tenía un solo test que lo
// generara de verdad, y por eso el rótulo del ITBMS pudo mentir a gusto.
import { supabaseServer } from "@/lib/supabase-server";
import { FG_LOGO_BASE64, FG_LOGO_WIDTH, FG_LOGO_HEIGHT } from "@/lib/pdf-logo";
import { reclamoTaxes, TASA_IMPORTACION, TASA_ITBMS, FACTOR_TOTAL } from "@/lib/reclamos/tax";
import { facturasEnPantalla } from "@/lib/reclamos/facturas";
import { fmtDate as fmtDiaLargo } from "@/lib/format";
import {
  columnasDelPapel,
  datosDelPapel,
  fechaDeLaCabecera,
  itemsDelPapel,
  PIE_PAPEL,
  totalesDelPapel,
  valorDeCelda,
  type ColumnaPapel,
  type ContactoDePapel,
} from "@/lib/reclamos/papel";

const PAGE_W = 216;
const PAGE_H = 279;
const MARGIN = 15;

interface ReclamoItem {
  referencia?: string;
  descripcion?: string;
  talla?: string;
  cantidad?: number;
  precio_unitario?: number;
  motivo?: string;
  nro_factura?: string;
  nro_orden_compra?: string;
  deleted?: boolean;
}

interface ReclamoFoto {
  storage_path: string;
}

interface ReclamoSettlement {
  id?: string;
  monto?: number;
  nota_credito?: string | null;
  fecha?: string;
  deleted?: boolean;
}

export interface ReclamoFull {
  id: string;
  nro_reclamo?: string;
  empresa?: string;
  proveedor?: string;
  marca?: string;
  nro_factura?: string;
  nro_orden_compra?: string;
  fecha_reclamo?: string;
  /** La fecha de la FACTURA del proveedor — la que mide los días desde el
   *  rediseño del 10-sep-2026. Es la que sale en la cabecera del papel. */
  fecha_factura?: string | null;
  estado?: string;
  notas?: string;
  monto_reclamado_snapshot?: number | null;
  reclamo_items?: ReclamoItem[];
  reclamo_fotos?: ReclamoFoto[];
  reclamo_settlements?: ReclamoSettlement[];
}

// Items vigentes (no borrados) — evita sobrecontar líneas soft-deleted. La
// regla vive en `papel.ts`, que es también la que usa el Excel: dos papeles del
// mismo reclamo no pueden contar renglones distintos.
function itemsVivos(rec: ReclamoFull): ReclamoItem[] {
  return itemsDelPapel(rec) as ReclamoItem[];
}

function subtotalDe(rec: ReclamoFull): number {
  return itemsVivos(rec).reduce(
    (s, i) => s + (Number(i.cantidad) || 0) * (Number(i.precio_unitario) || 0),
    0,
  );
}

function fmt(n: number): string {
  return (n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: string | undefined): string {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

async function downloadFoto(storagePath: string): Promise<{ base64: string; ext: string } | null> {
  try {
    const { data, error } = await supabaseServer.storage.from("reclamo-fotos").download(storagePath);
    if (error || !data) return null;
    const ab = await data.arrayBuffer();
    const base64 = Buffer.from(ab).toString("base64");
    const ext = storagePath.split(".").pop()?.toLowerCase() || "jpeg";
    const norm = ext === "jpg" ? "JPEG" : ext.toUpperCase();
    return { base64, ext: norm };
  } catch {
    return null;
  }
}

function drawCoverHeader(doc: jsPDF, empresa: string, count: number, grandTotal: number) {
  doc.setFillColor(27, 58, 92);
  doc.rect(0, 0, PAGE_W, 26, "F");
  try {
    doc.addImage(FG_LOGO_BASE64, "JPEG", 8, 4, FG_LOGO_WIDTH + 4, FG_LOGO_HEIGHT + 4);
  } catch { /* skip */ }
  const titleX = 8 + FG_LOGO_WIDTH + 4 + 6;
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("FASHION GROUP", titleX, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Resumen de reclamos — ${empresa}`, titleX, 19);

  doc.setTextColor(120, 120, 120);
  doc.setFontSize(9);
  doc.text(`Generado el ${new Date().toLocaleDateString("es-PA")}`, MARGIN, 34);
  doc.text(`${count} reclamo${count === 1 ? "" : "s"}`, MARGIN, 39);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(27, 58, 92);
  doc.text(`Total a acreditar: $${fmt(grandTotal)}`, MARGIN, 44);
  doc.setFont("helvetica", "normal");
}

/**
 * 🔴 LA CABECERA DEL PAPEL, EN EL ORDEN DE LA PANTALLA (mockup 11-sep-2026):
 * a la izquierda el logo, «FASHION GROUP» y la empresa debajo; a la derecha el
 * N° de reclamo y la FECHA DE LA FACTURA. Reemplaza a la banda azul con el
 * número adentro y a la rejilla de metadatos en tres columnas.
 */
function drawCabecera(doc: jsPDF, rec: ReclamoFull, startY: number): number {
  let y = startY;
  try {
    doc.addImage(FG_LOGO_BASE64, "JPEG", MARGIN, y, FG_LOGO_WIDTH, FG_LOGO_HEIGHT);
  } catch { /* el papel sale igual sin el logo */ }
  const xTexto = MARGIN + FG_LOGO_WIDTH + 4;

  doc.setTextColor(20, 20, 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("FASHION GROUP", xTexto, y + 5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(110, 110, 110);
  doc.text(rec.empresa || "", xTexto, y + 10.5);

  const xDer = PAGE_W - MARGIN;
  doc.setTextColor(20, 20, 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(`Reclamo ${rec.nro_reclamo || ""}`.trim(), xDer, y + 5, { align: "right" });
  const fecha = fechaDeLaCabecera(rec);
  if (fecha) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(110, 110, 110);
    doc.text(fmtDiaLargo(fecha), xDer, y + 10.5, { align: "right" });
  }

  y += FG_LOGO_HEIGHT + 2;
  doc.setDrawColor(190, 190, 190);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  return y + 6;
}

/** Una línea: `Proveedor X · Marca Y · Factura Z · Contacto W`. Lo que no
 *  existe no se escribe — un «Marca —» es un renglón para no decir nada. */
function drawLineaDatos(doc: jsPDF, rec: ReclamoFull, contacto: ContactoDePapel | null, startY: number): number {
  const datos = datosDelPapel(rec, contacto);
  if (datos.length === 0) return startY;
  const texto = datos.map((d) => `${d.rotulo} ${d.valor}`).join("   ·   ");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(70, 70, 70);
  const lineas = doc.splitTextToSize(texto, PAGE_W - 2 * MARGIN) as string[];
  doc.text(lineas, MARGIN, startY);
  return startY + lineas.length * 4.5 + 3;
}

/**
 * 🔴 EL PIE DE TOTALES VA A LA DERECHA Y UNO DEBAJO DEL OTRO, como el pie de la
 * factura que manda el proveedor: Subtotal · Importación N% · ITBMS N% · Total
 * en negrita con raya arriba. Reemplaza a las CUATRO cajas que abrían el papel
 * antes de que se supiera de qué reclamo se estaba hablando.
 */
function drawPieTotales(doc: jsPDF, empresa: string | undefined, subtotal: number, startY: number): number {
  const filas = totalesDelPapel(empresa, subtotal);
  const xValor = PAGE_W - MARGIN;
  const xRotulo = PAGE_W - MARGIN - 40;
  let y = startY;
  for (const f of filas) {
    if (f.fuerte) {
      doc.setDrawColor(30, 30, 30);
      doc.setLineWidth(0.4);
      doc.line(xRotulo - 4, y - 3.2, xValor, y - 3.2);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.setTextColor(20, 20, 20);
    } else {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(100, 100, 100);
    }
    doc.text(f.rotulo, xRotulo, y, { align: "left" });
    if (f.fuerte) doc.setTextColor(20, 20, 20);
    else doc.setTextColor(40, 40, 40);
    doc.text(`$${fmt(f.valor)}`, xValor, y, { align: "right" });
    y += f.fuerte ? 6 : 5;
  }
  return y + 2;
}

/** La tabla de renglones, con las columnas que de verdad traen datos. */
function drawTablaRenglones(doc: jsPDF, rec: ReclamoFull, items: ReclamoItem[], startY: number): number {
  const columnas: ColumnaPapel[] = columnasDelPapel(items);
  const cuerpo = items.map((i) =>
    columnas.map((c) => {
      const v = valorDeCelda(i, c.clave);
      if (c.tipo === "dinero") return `$${fmt(Number(v) || 0)}`;
      if (c.tipo === "entero") return `${Number(v) || 0}`;
      return String(v);
    }),
  );
  const columnStyles: Record<number, { cellWidth?: number | "auto"; halign?: "right" | "center" | "left" }> = {};
  columnas.forEach((c, i) => {
    columnStyles[i] = {
      cellWidth: c.mm === null ? "auto" : c.mm,
      halign: c.tipo === "texto" ? "left" : "right",
    };
  });
  autoTable(doc, {
    startY,
    head: [columnas.map((c) => c.rotulo)],
    body: cuerpo,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [27, 58, 92], textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [248, 249, 249] },
    columnStyles,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((doc as any).lastAutoTable?.finalY ?? startY) + 6;
}

// Bloque de recuperación: Reclamado vs Recuperado (Σ NCs) + lista de notas de
// crédito. Solo se dibuja si hay settlements vigentes o el reclamo está Pagado.
function drawSettlementBlock(doc: jsPDF, rec: ReclamoFull, subtotal: number, startY: number): number {
  const settlements = (rec.reclamo_settlements || []).filter((s) => !s.deleted);
  if (settlements.length === 0 && rec.estado !== "Pagado") return startY;

  const reclamado = rec.monto_reclamado_snapshot ?? reclamoTaxes(rec.empresa, subtotal).total;
  const recuperado = settlements.reduce((s, x) => s + (Number(x.monto) || 0), 0);

  let y = startY;
  // Encabezado de sección
  doc.setFillColor(46, 94, 142);
  doc.rect(MARGIN, y, PAGE_W - 2 * MARGIN, 8, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Recuperación / Notas de crédito", PAGE_W / 2, y + 5.5, { align: "center" });
  y += 12;

  // Cajas Reclamado / Recuperado
  const boxes = [
    { label: "Reclamado", value: reclamado, dark: false },
    { label: "Recuperado", value: recuperado, dark: true },
  ];
  const boxW = (PAGE_W - 2 * MARGIN - 3) / 2;
  boxes.forEach((b, i) => {
    const x = MARGIN + (boxW + 3) * i;
    if (b.dark) {
      doc.setFillColor(27, 58, 92);
      doc.rect(x, y, boxW, 14, "F");
      doc.setTextColor(170, 170, 170);
    } else {
      doc.setDrawColor(220, 220, 220);
      doc.setFillColor(248, 249, 249);
      doc.rect(x, y, boxW, 14, "FD");
      doc.setTextColor(120, 120, 120);
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text(b.label.toUpperCase(), x + boxW / 2, y + 5, { align: "center" });
    doc.setTextColor(b.dark ? 255 : 30, b.dark ? 255 : 30, b.dark ? 255 : 30);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(`$${fmt(b.value)}`, x + boxW / 2, y + 11, { align: "center" });
  });
  y += 18;

  // Lista de notas de crédito
  if (settlements.length > 0) {
    doc.setTextColor(80, 80, 80);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    for (const s of settlements) {
      const nc = s.nota_credito ? ` · NC ${s.nota_credito}` : "";
      doc.text(`${fmtDate(s.fecha)} — $${fmt(Number(s.monto) || 0)}${nc}`, MARGIN + 2, y);
      y += 5;
    }
    y += 2;
  }
  return y;
}

function drawNotas(doc: jsPDF, notas: string, startY: number): number {
  doc.setTextColor(80, 80, 80);
  doc.setFont("helvetica", "italic");
  doc.setFontSize(9);
  const lines = doc.splitTextToSize(`Notas: ${notas}`, PAGE_W - 2 * MARGIN);
  doc.text(lines, MARGIN, startY);
  return startY + lines.length * 4 + 4;
}

function ensureSpace(doc: jsPDF, cursorY: number, needed: number): number {
  if (cursorY + needed > PAGE_H - MARGIN) {
    doc.addPage();
    return MARGIN;
  }
  return cursorY;
}

export async function buildBulkReclamosPdf(
  reclamos: ReclamoFull[],
  empresa: string,
  contacto: ContactoDePapel | null = null,
): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });

  // 1 solo reclamo → PDF individual limpio (sin portada ni tabla resumen).
  const single = reclamos.length === 1;

  if (!single) {
    const grandTotal = reclamos.reduce(
      (acc, r) => acc + reclamoTaxes(r.empresa, subtotalDe(r)).total,
      0,
    );

    drawCoverHeader(doc, empresa, reclamos.length, grandTotal);

    // Summary table
    const summaryRows = reclamos.map((r) => {
      const items = itemsVivos(r);
      const total = reclamoTaxes(r.empresa, subtotalDe(r)).total;
      return [
        r.nro_reclamo || "",
        fmtDate(r.fecha_reclamo),
        facturasEnPantalla(r.nro_factura),
        r.estado || "",
        `${items.length}`,
        `$${fmt(total)}`,
      ];
    });

    autoTable(doc, {
      startY: 50,
      head: [["N° Reclamo", "Fecha", "Factura", "Estado", "Ítems", "Total"]],
      body: summaryRows,
      styles: { fontSize: 9, cellPadding: 2.5 },
      headStyles: { fillColor: [27, 58, 92], textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 249, 249] },
      columnStyles: {
        0: { cellWidth: 28 },
        1: { cellWidth: 22 },
        2: { cellWidth: 38 },
        3: { cellWidth: 24 },
        4: { halign: "center", cellWidth: 16 },
        5: { halign: "right", cellWidth: "auto" },
      },
    });
  }

  // Per-reclamo full detail pages (for clásico: hay await de fotos adentro).
  for (let idx = 0; idx < reclamos.length; idx++) {
    const rec = reclamos[idx];
    // Para multi: cada detalle en página nueva. Para single: detalle en página 1.
    if (!single || idx > 0) doc.addPage();
    let cursorY = MARGIN;

    cursorY = drawCabecera(doc, rec, cursorY);
    cursorY = drawLineaDatos(doc, rec, contacto, cursorY);

    const items = itemsVivos(rec);
    const subtotal = subtotalDe(rec);

    if (items.length > 0) {
      cursorY = ensureSpace(doc, cursorY, 30);
      cursorY = drawTablaRenglones(doc, rec, items, cursorY);
    }

    // El pie de totales va DESPUÉS de la tabla, a la derecha (mockup 11-sep-2026).
    cursorY = ensureSpace(doc, cursorY, 30);
    cursorY = drawPieTotales(doc, rec.empresa, subtotal, cursorY);

    // Recuperación (settlements/NCs) — solo si hay pagos o está Pagado.
    const settlementsVivos = (rec.reclamo_settlements || []).filter((s) => !s.deleted);
    if (settlementsVivos.length > 0 || rec.estado === "Pagado") {
      cursorY = ensureSpace(doc, cursorY, 40);
      cursorY = drawSettlementBlock(doc, rec, subtotal, cursorY);
    }

    if (rec.notas && rec.notas.trim()) {
      cursorY = ensureSpace(doc, cursorY, 16);
      cursorY = drawNotas(doc, rec.notas, cursorY);
    }

    const fotos = rec.reclamo_fotos || [];
    if (fotos.length > 0) {
      const downloaded = await Promise.all(fotos.map((f) => downloadFoto(f.storage_path)));
      const valid = downloaded.filter((d): d is { base64: string; ext: string } => d !== null);
      if (valid.length > 0) {
        cursorY = ensureSpace(doc, cursorY, 20);
        doc.setFillColor(46, 94, 142);
        doc.rect(MARGIN, cursorY, PAGE_W - 2 * MARGIN, 8, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.text(`Evidencia fotográfica — ${rec.nro_reclamo || ""}`, PAGE_W / 2, cursorY + 5.5, { align: "center" });
        cursorY += 14;

        const imgSize = 110;
        for (const photo of valid) {
          cursorY = ensureSpace(doc, cursorY, imgSize + 6);
          const x = (PAGE_W - imgSize) / 2;
          try {
            doc.addImage(`data:image/${photo.ext.toLowerCase()};base64,${photo.base64}`, photo.ext, x, cursorY, imgSize, imgSize);
          } catch { /* skip */ }
          cursorY += imgSize + 6;
        }
      }
    }
  }

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setTextColor(150);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    // Pie de la casa, el mismo de todos los papeles (mockup 11-sep-2026).
    doc.text(PIE_PAPEL, MARGIN, PAGE_H - 8);
    doc.text(`Página ${i} de ${pageCount}`, PAGE_W - MARGIN, PAGE_H - 8, { align: "right" });
  }

  return doc;
}

export function reclamoBulkConstants() {
  return { TASA_IMPORTACION, TASA_ITBMS, FACTOR_TOTAL };
}
