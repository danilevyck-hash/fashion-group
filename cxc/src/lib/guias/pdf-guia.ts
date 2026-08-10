// ============================================================================
// Guías — LA MISMA HOJA QUE SE IMPRIME, pero como archivo PDF.
//
// Pedido de Daniel: *"al finalizar una guia de despacho, quiero un boton de
// compartir guia (o pdf) o imagen asi se comparta por whatsapp u otros medios.
// de la misma manera que cuando estas en un documento y pones compartir."*
//
// 🩸 POR QUÉ UN PDF ARMADO A MANO Y NO UNA FOTO DE LA PANTALLA. La tentación
// era rasterizar el `#print-document` con html2canvas: sale "igual" sin
// escribir el documento dos veces. Se descartó por tres razones concretas:
//   1. La guía se manda por WhatsApp como RESPALDO de una entrega — una imagen
//      se recomprime, se ve borrosa en pantalla grande y no se puede imprimir.
//   2. html2canvas no está en el proyecto y no entiende varias cosas que el
//      documento ya usa; agregar una dependencia de render para un botón es
//      caro y frágil.
//   3. La hoja se ve dentro de `HojaEscalada`, que le aplica un `transform:
//      scale(...)` en pantalla. Fotografiar el DOM fotografía la ESCALA — el
//      archivo saldría del tamaño del celular de quien lo comparte.
//
// ⚠️ EL RIESGO DE ESTE ENFOQUE ES LA DERIVA: son dos dibujos del mismo papel
// (este archivo y `PrintDocument.tsx`), y si alguien agrega un campo allá y no
// acá, lo compartido deja de ser lo firmado. El candado es
// `src/__tests__/lib/guia-pdf-compartir.test.ts`, que lee los DOS archivos y
// exige que todo campo de la guía que `PrintDocument` pinta aparezca también
// acá. Un campo nuevo pone el build en ROJO hasta que se agregue a los dos.
//
// ⚠️ OJO CON EL LOGO Y LAS FIRMAS: `addImage` va en try/catch, así que un
// base64 roto haría desaparecer la imagen SIN error (fue el bug del 26-jul-2026
// en el comprobante de marketing). El candado del logo es `pdf-logos.test.ts`;
// el de que ESTE documento dibuje las firmas cuenta los XObject del PDF ya
// generado.
// ============================================================================

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { FG_LOGO_BASE64 } from "@/lib/pdf-logo";
import { fmtDate, fmtGuia } from "@/lib/format";
import type { Guia } from "@/app/guias/components/types";
import { numeroTranspDeLinea, numeroTranspUnico } from "@/lib/guias/falta-para-despachar";

const PAGE_W = 216; // Letter
const MARGIN = 15;
const ANCHO = PAGE_W - 2 * MARGIN;

const TEXTO_LEGAL =
  "La firma del transportista constituye aceptacion expresa de la mercancia detallada en este " +
  "documento, en la cantidad y condicion indicadas. Cualquier faltante o dano no reportado al " +
  "momento de la recepcion sera responsabilidad exclusiva del transportista.";

/** Nombre del archivo: se ve en el chat de WhatsApp, así que dice qué es. */
export function nombreArchivoGuia(g: Guia): string {
  return `Guia-${fmtGuia(g.numero)}-${String(g.fecha ?? "").slice(0, 10)}.pdf`;
}

/** Dos columnas de "ETIQUETA: valor" con línea de puntos, como el papel. */
function bloqueCampos(doc: jsPDF, campos: Array<[string, string]>, yInicio: number): number {
  const colW = ANCHO / 2;
  let y = yInicio;
  doc.setFontSize(8);
  campos.forEach(([etiqueta, valor], i) => {
    const x = MARGIN + (i % 2) * colW;
    doc.setFont("helvetica", "bold");
    doc.text(etiqueta, x, y);
    const anchoEtiqueta = doc.getTextWidth(etiqueta) + 2;
    doc.setFont("helvetica", "normal");
    doc.text(valor || "", x + anchoEtiqueta, y);
    doc.setDrawColor(200);
    doc.line(x + anchoEtiqueta, y + 1, x + colW - 6, y + 1);
    if (i % 2 === 1) y += 7;
  });
  if (campos.length % 2 === 1) y += 7;
  return y;
}

/** Una firma: nombre, imagen (si la hay) y la línea de "nombre y firma". */
function bloqueFirma(
  doc: jsPDF,
  x: number,
  y: number,
  colW: number,
  opts: {
    titulo: string;
    nombre: string;
    cedula?: string | null;
    firma?: string | null;
    pie: string;
  },
): void {
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text(opts.titulo.toUpperCase(), x, y);
  doc.setFont("helvetica", "normal");

  let cursor = y + 8;
  doc.text(`NOMBRE: ${opts.nombre || ""}`, x, cursor);
  if (!opts.nombre) {
    doc.setDrawColor(150);
    doc.line(x + 18, cursor + 1, x + colW - 6, cursor + 1);
  }
  cursor += 7;

  if (opts.cedula !== undefined) {
    doc.text(`CEDULA: ${opts.cedula || ""}`, x, cursor);
    if (!opts.cedula) {
      doc.setDrawColor(150);
      doc.line(x + 17, cursor + 1, x + colW - 6, cursor + 1);
    }
    cursor += 7;
  }

  // 🩸 3 mm de aire ANTES de la firma. La imagen se dibuja HACIA ARRIBA desde
  // su línea (una firma se apoya en el renglón, no cuelga de él), y sin este
  // aire el trazo cruzaba por encima de "CEDULA: 9-70013387" en la columna del
  // receptor — que es justo el dato que alguien va a querer leer si hay un
  // reclamo. Se vio recién al mirar el PDF renderizado; el texto extraído no lo
  // muestra, porque solapar dos cosas no cambia ni una letra.
  cursor += 3;
  doc.text("FIRMA:", x, cursor);
  if (opts.firma) {
    try {
      // 12 mm de alto ≈ los 40 px de la hoja impresa.
      //
      // ⚠️ "FAST" no es cosmético: las firmas salen de un canvas a resolución de
      // pantalla y pesan cientos de KB cada una. Sin comprimir, la guía real
      // GT-188 daba un archivo de 1,4 MB — para mandar por WhatsApp desde el
      // celular de un bodeguero, con datos móviles.
      doc.addImage(opts.firma, "PNG", x + 15, cursor - 8, 40, 12, undefined, "FAST");
    } catch {
      /* firma ilegible: queda la línea vacía, nunca se rompe el documento */
    }
  } else {
    doc.setDrawColor(150);
    doc.line(x + 15, cursor + 1, x + colW - 6, cursor + 1);
  }
  cursor += 8;

  doc.setFontSize(7);
  doc.setTextColor(150);
  doc.text(opts.pie, x, cursor);
  doc.setTextColor(0);
}

/**
 * Arma el PDF de la guía. Es un espejo de `PrintDocument.tsx` — mismo título,
 * mismos campos, misma tabla, mismas firmas y el mismo texto legal.
 */
export function construirPdfGuia(g: Guia): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "letter", orientation: "portrait" });
  const items = g.guia_items ?? [];
  const bultos = items.reduce((s, i) => s + (i.bultos || 0), 0);
  const esDirecta = g.tipo_despacho === "directo";

  // ── Encabezado ────────────────────────────────────────────────────────────
  try {
    doc.addImage(FG_LOGO_BASE64, "PNG", MARGIN, 12, 10, 10, undefined, "FAST");
  } catch {
    /* sin logo el documento sigue siendo válido */
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("GUIA DE TRANSPORTE INTERIOR", PAGE_W / 2, 19, { align: "center" });

  // ── Datos de la guía ──────────────────────────────────────────────────────
  const campos: Array<[string, string]> = [
    ["N GUIA:", fmtGuia(g.numero)],
    ["FECHA:", fmtDate(g.fecha)],
    ["TRANSPORTISTA:", g.transportista ?? ""],
    ["PLACA / VEHICULO:", g.placa ?? ""],
    ["DESPACHADO POR:", g.entregado_por ?? ""],
    ["TIPO:", esDirecta ? "Entrega directa" : "Transportista externo"],
  ];
  // ⚠️ Solo se anuncia arriba cuando hay UN número en toda la guía; con varios
  // por línea, un encabezado con uno de ellos mentiría. Ver `PrintDocument`.
  const transpUnico = numeroTranspUnico(items, g.numero_guia_transp);
  if (transpUnico) campos.push(["N GUIA TRANSP.:", transpUnico]);
  if (esDirecta && g.nombre_chofer) campos.push(["CHOFER:", g.nombre_chofer]);

  let y = bloqueCampos(doc, campos, 32);

  doc.setDrawColor(180);
  doc.line(MARGIN, y - 2, PAGE_W - MARGIN, y - 2);

  // ── Detalle ───────────────────────────────────────────────────────────────
  autoTable(doc, {
    startY: y + 2,
    margin: { left: MARGIN, right: MARGIN },
    head: [["#", "CLIENTE", "DIRECCION", "EMPRESA", "FACTURA(S)", "BULTOS", "N GUIA TRANSP."]],
    body: [
      ...items.map((it, i) => [
        String(i + 1),
        it.cliente ?? "",
        it.direccion ?? "",
        it.empresa ?? "",
        it.facturas ?? "",
        it.bultos ? String(it.bultos) : "",
        numeroTranspDeLinea(it.numero_guia_transp, g.numero_guia_transp),
      ]),
      [
        { content: "TOTAL DE BULTOS DESPACHADOS", colSpan: 5, styles: { halign: "right" as const, fontStyle: "bold" as const } },
        { content: String(bultos), styles: { halign: "center" as const, fontStyle: "bold" as const } },
        "",
      ],
    ],
    styles: { fontSize: 7, cellPadding: 1.5, lineColor: [180, 180, 180], lineWidth: 0.1 },
    headStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: "bold", fontSize: 7 },
    columnStyles: {
      0: { cellWidth: 7, halign: "center" },
      5: { cellWidth: 13, halign: "center" },
      6: { cellWidth: 24 },
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 8;

  // ── Observaciones ─────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("OBSERVACIONES GENERALES DEL ENVIO", MARGIN, y);
  doc.setFont("helvetica", "normal");
  const obs = doc.splitTextToSize(g.observaciones || "", ANCHO - 4);
  const altoObs = Math.max(12, obs.length * 4 + 4);
  doc.setDrawColor(180);
  doc.rect(MARGIN, y + 2, ANCHO, altoObs);
  if (g.observaciones) doc.text(obs, MARGIN + 2, y + 7);
  y += altoObs + 14;

  // ── Firmas ────────────────────────────────────────────────────────────────
  const colW = ANCHO / 2 - 6;
  bloqueFirma(doc, MARGIN, y, colW, {
    titulo: esDirecta ? "Chofer" : "Despachado por",
    nombre: (esDirecta ? g.nombre_chofer : g.entregado_por) ?? "",
    firma: g.firma_base64,
    pie: "Nombre y firma",
  });
  bloqueFirma(doc, MARGIN + ANCHO / 2 + 6, y, colW, {
    titulo: esDirecta ? "Recibido por — Cliente" : "Recibido Conforme — Transportista",
    nombre: g.receptor_nombre ?? "",
    cedula: g.cedula ?? "",
    firma: g.firma_entregador_base64,
    pie: "Nombre, cedula y firma",
  });

  // ── Pie legal ─────────────────────────────────────────────────────────────
  const pieY = 250;
  doc.setDrawColor(220);
  doc.line(MARGIN, pieY, PAGE_W - MARGIN, pieY);
  doc.setFontSize(6.5);
  doc.setTextColor(150);
  doc.text(doc.splitTextToSize(TEXTO_LEGAL, ANCHO), PAGE_W / 2, pieY + 5, { align: "center" });
  doc.setTextColor(0);

  return doc;
}
