// ============================================================================
// Marketing — COMPROBANTE DE ENTREGA DE MOBILIARIO (PDF).
//
// Pedido de Daniel, textual: *"no es que salen vacias, sino que no hay ningun
// comprobante, tiene que abrirse un pdf que no se vea generico sobre la entrega
// del mueble"*.
//
// 🩸 EL PROBLEMA REAL, medido: una entrega de muebles (`mk_entregas_muebles`) no
// tenía —ni podía tener— un comprobante. `mk_adjuntos` sólo vincula por
// `proyecto_id` o `factura_id`: **no existe `entrega_id`**, así que no hay dónde
// colgarle un PDF. Y no es un caso raro: las **21 entregas** de la base
// ($70.725,00) tienen las tres columnas de papeleo vacías — `notas` NULL en
// 21/21 y cero adjuntos. En el Excel salían con "N° Factura" en blanco y la
// columna "Factura" en "—", y en el ZIP no aparecía ningún archivo suyo. No era
// un bug del export: el documento no existía en ninguna parte.
//
// Este módulo lo GENERA a partir de lo que la entrega ya guarda (no inventa
// datos): cliente, proyecto, fecha, artículos con cantidad y precio unitario,
// reparto por marca, total y notas.
//
// ⚠️ LO QUE NO SE PUEDE LLENAR SOLO, y por qué queda como línea de firma:
// el sistema NO guarda quién entregó ni quién recibió el mobiliario (no hay
// esas columnas). Un comprobante de entrega sin receptor no sirve para
// reclamar nada, así que el PDF sale con el bloque de firmas EN BLANCO para
// imprimir y firmar — que es como se usa un comprobante de entrega de verdad.
// Si Daniel quiere que el receptor quede GUARDADO en el sistema (y que el PDF
// salga ya con el nombre), hace falta agregar campos a `mk_entregas_muebles`;
// eso lo tiene que aprobar él (queda anotado en el reporte, no se hizo solo).
//
// Estilo: el de la casa, igual que los otros PDFs del repo (banda navy 1B3A5C +
// logo Fashion Group + Helvetica + cajas de total). NO es una plantilla
// genérica: lleva el logo, el número de comprobante, el cliente con su código
// de directorio y el desglose real de muebles.
//
// ⚠️ OJO CON EL LOGO: `addImage` va envuelto en try/catch en TODO el repo, así
// que si el base64 estuviera mal el logo desaparecería SIN error (fue el bug
// del 26-jul-2026, a la cadena le faltaba un `=`). El candado del base64 es
// `src/__tests__/lib/pdf-logos.test.ts`; el de que ESTE documento efectivamente
// dibuje la imagen es `pdf-entrega-mueble.test.ts`, que cuenta los XObject de
// imagen del PDF ya generado.
// ============================================================================

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { FG_LOGO_BASE64, FG_LOGO_HEIGHT, FG_LOGO_WIDTH } from "@/lib/pdf-logo";

const PAGE_W = 216; // Letter
const MARGIN = 15;
const NAVY: [number, number, number] = [27, 58, 92];
const MID: [number, number, number] = [46, 94, 142];

export interface EntregaMuebleItemPdf {
  /** Nombre del mueble/artículo (mk_inventario_productos.nombre). */
  articulo: string;
  cantidad: number;
  precioUnitario: number;
}

export interface EntregaMueblePdfData {
  /** UUID de la entrega — de acá sale el número de comprobante. */
  entregaId: string;
  /** Fecha de la entrega (created_at, ISO). */
  fecha: string;
  /** Nombre del cliente del directorio; si no hay, el texto libre de la tienda. */
  cliente: string;
  /** Código D-XXX del directorio, o null si el proyecto no está vinculado. */
  clienteCodigo: string | null;
  /** Texto libre de la tienda tal como está en el proyecto. */
  tienda: string;
  /** Nombre del proyecto ("Remodelacion", "Muebles"…). */
  proyecto: string;
  items: EntregaMuebleItemPdf[];
  /** Reparto del monto por marca, ya con nombre resuelto. */
  porMarca: Array<{ marca: string; monto: number }>;
  /** Total de la entrega (mk_entregas_muebles.total). Mobiliario NO lleva ITBMS. */
  total: number;
  notas: string | null;
}

function fmt(n: number): string {
  return (Number.isFinite(n) ? n : 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtFecha(iso: string): string {
  const d = (iso || "").slice(0, 10);
  const [y, m, day] = d.split("-");
  return day && m && y ? `${day}/${m}/${y}` : "—";
}

/**
 * Hoy en dd/mm/yyyy. A mano y NO con `toLocaleDateString("es-PA")`: Node sin ICU
 * completo ignora el locale y devuelve el formato de EE.UU. (mm/dd/yyyy), que en
 * Panamá se lee como otra fecha — el 30 de julio salía "07/30/2026".
 */
function hoyPanama(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/**
 * Número de comprobante legible y ESTABLE: `ME-<8 hex del uuid>`.
 *
 * Se deriva del id, no de un contador: un contador exigiría una columna nueva y
 * dos entregas creadas a la vez podrían pelearse el mismo número. El uuid ya es
 * único, y 8 hex alcanzan de sobra para 21 entregas (y para miles más).
 */
export function numeroComprobante(entregaId: string): string {
  const hex = (entregaId || "").replace(/-/g, "").slice(0, 8).toUpperCase();
  return `ME-${hex || "00000000"}`;
}

/** Nombre de archivo del comprobante dentro del ZIP / de la descarga. */
export function nombreArchivoComprobante(d: {
  entregaId: string;
  fecha: string;
}): string {
  return `${(d.fecha || "").slice(0, 10)} · Entrega de mobiliario ${numeroComprobante(d.entregaId)}`;
}

/** Dibuja una línea de firma con su etiqueta debajo. */
function lineaFirma(
  doc: jsPDF,
  x: number,
  y: number,
  ancho: number,
  etiqueta: string,
): void {
  doc.setDrawColor(150, 150, 150);
  doc.setLineWidth(0.3);
  doc.line(x, y, x + ancho, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  doc.text(etiqueta.toUpperCase(), x, y + 3.5);
}

/** Construye el documento (sin escribirlo) — así el test puede inspeccionarlo. */
export function buildComprobanteEntregaDoc(d: EntregaMueblePdfData): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const ancho = PAGE_W - 2 * MARGIN;

  // ── Banda de encabezado ───────────────────────────────────────────────────
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, PAGE_W, 28, "F");
  try {
    doc.addImage(FG_LOGO_BASE64, "JPEG", 8, 5, FG_LOGO_WIDTH + 4, FG_LOGO_HEIGHT + 4);
  } catch {
    /* el candado del base64 vive en pdf-logos.test.ts */
  }
  const titleX = 8 + FG_LOGO_WIDTH + 4 + 6;
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("FASHION GROUP", titleX, 13);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.text("Comprobante de entrega de mobiliario", titleX, 20);

  // Número de comprobante, alineado a la derecha de la banda.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(numeroComprobante(d.entregaId), PAGE_W - 10, 13, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(`Entregado el ${fmtFecha(d.fecha)}`, PAGE_W - 10, 20, { align: "right" });

  // ── Datos de la entrega ───────────────────────────────────────────────────
  let y = 40;
  const colW = ancho / 2;
  const col2 = MARGIN + colW;

  const par = (
    label: string,
    valor: string,
    x: number,
    yy: number,
    ancho2 = colW - 6,
  ): void => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(130, 130, 130);
    doc.text(label.toUpperCase(), x, yy);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(30, 30, 30);
    // El nombre del cliente puede ser largo: se recorta al ancho disponible.
    const lineas = doc.splitTextToSize(valor || "—", ancho2) as string[];
    doc.text(lineas.slice(0, 2), x, yy + 5);
  };

  par("Entregado a", d.cliente, MARGIN, y);
  par(
    "Código de cliente",
    d.clienteCodigo ?? "Sin vincular al directorio",
    col2,
    y,
  );
  y += 17;
  par("Tienda", d.tienda, MARGIN, y);
  par("Proyecto", d.proyecto, col2, y);
  y += 17;
  // Ocupa el ancho COMPLETO: con dos o tres marcas el texto no cabe en media
  // página y se perdería justo el dato que dice a quién se le carga el gasto.
  par(
    "Marca(s) del gasto",
    d.porMarca.length > 0
      ? d.porMarca.map((m) => `${m.marca} $${fmt(m.monto)}`).join("  ·  ")
      : "Sin marca asignada",
    MARGIN,
    y,
    ancho,
  );
  y += 15;

  // ── Detalle de los muebles entregados ─────────────────────────────────────
  doc.setFillColor(...MID);
  doc.rect(MARGIN, y, ancho, 8, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Muebles entregados", MARGIN + 3, y + 5.5);
  y += 11;

  const totalUnidades = d.items.reduce((s, i) => s + (Number(i.cantidad) || 0), 0);

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [["Artículo", "Cantidad", "Precio unitario", "Importe"]],
    body:
      d.items.length > 0
        ? d.items.map((i) => [
            i.articulo || "—",
            String(i.cantidad ?? 0),
            `$${fmt(i.precioUnitario)}`,
            `$${fmt((Number(i.cantidad) || 0) * (Number(i.precioUnitario) || 0))}`,
          ])
        : [["Sin detalle de artículos registrado", "—", "—", `$${fmt(d.total)}`]],
    styles: { fontSize: 9, cellPadding: 2.4, textColor: [40, 40, 40] },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontSize: 8.5 },
    alternateRowStyles: { fillColor: [248, 249, 249] },
    columnStyles: {
      1: { halign: "center", cellWidth: 24 },
      2: { halign: "right", cellWidth: 32 },
      3: { halign: "right", cellWidth: 30 },
    },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 8;

  // ── Total ─────────────────────────────────────────────────────────────────
  const boxW = 74;
  const boxX = PAGE_W - MARGIN - boxW;
  doc.setFillColor(...NAVY);
  doc.rect(boxX, y, boxW, 15, "F");
  doc.setTextColor(180, 195, 210);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.text("TOTAL DE LA ENTREGA", boxX + 4, y + 5.5);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(`$${fmt(d.total)}`, boxX + boxW - 4, y + 11.5, { align: "right" });

  if (totalUnidades > 0) {
    doc.setTextColor(90, 90, 90);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(
      `${totalUnidades} unidad${totalUnidades === 1 ? "" : "es"} en ${d.items.length} artículo${d.items.length === 1 ? "" : "s"}`,
      MARGIN,
      y + 6,
    );
  }
  // Nota discreta del criterio de la casa (gastos sin ITBMS).
  doc.setTextColor(150, 150, 150);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text("Montos sin ITBMS — el mobiliario no lo lleva.", MARGIN, y + 12);
  y += 22;

  // ── Notas ─────────────────────────────────────────────────────────────────
  if (d.notas && d.notas.trim()) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(130, 130, 130);
    doc.text("NOTAS", MARGIN, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(50, 50, 50);
    const lineas = doc.splitTextToSize(d.notas.trim(), ancho) as string[];
    doc.text(lineas.slice(0, 4), MARGIN, y + 5);
    y += 8 + Math.min(lineas.length, 4) * 4.5;
  }

  // ── Firmas ────────────────────────────────────────────────────────────────
  // El sistema no guarda quién entregó ni quién recibió: van en blanco, para
  // imprimir y firmar. Ver el encabezado del archivo.
  // El bloque mide 7 (banda) + 11 + 3×15 + 6 ≈ 69 mm y el pie va en 272: por eso
  // el piso es 178 y no más abajo — con 190 la etiqueta "FECHA" quedaba pegada
  // al pie (medido: 4,5 mm de aire).
  if (y < 178) y = 178;
  doc.setFillColor(240, 243, 246);
  doc.rect(MARGIN, y, ancho, 7, "F");
  doc.setTextColor(70, 90, 110);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("Conformidad de la entrega", MARGIN + 3, y + 4.8);
  y += 18;

  const firmaW = (ancho - 12) / 2;
  const bloques: Array<{ titulo: string; x: number }> = [
    { titulo: "Entregado por (Fashion Group)", x: MARGIN },
    { titulo: "Recibido por (cliente)", x: MARGIN + firmaW + 12 },
  ];
  for (const b of bloques) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(60, 60, 60);
    doc.text(b.titulo, b.x, y - 6);
    lineaFirma(doc, b.x, y + 8, firmaW, "Nombre");
    lineaFirma(doc, b.x, y + 23, firmaW, "Cédula");
    lineaFirma(doc, b.x, y + 38, firmaW, "Firma y fecha");
  }

  // ── Pie ───────────────────────────────────────────────────────────────────
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(160, 160, 160);
  doc.text(
    `Fashion Group · fashiongr.com · Comprobante ${numeroComprobante(d.entregaId)} · generado el ${hoyPanama()}`,
    MARGIN,
    272,
  );

  return doc;
}

/** Comprobante listo para servir o para meter en el ZIP. */
export function buildComprobanteEntregaPdf(d: EntregaMueblePdfData): Buffer {
  const doc = buildComprobanteEntregaDoc(d);
  return Buffer.from(doc.output("arraybuffer"));
}
