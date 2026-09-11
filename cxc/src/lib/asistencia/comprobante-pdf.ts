/* ─────────────────────────────────────────────────────────────────────────────
 * EL COMPROBANTE DE PAGO, EN PDF PARA IMPRIMIR.
 *
 * Daniel: *«El comprobante es PDF para imprimir»*. Una hoja por persona, que es
 * como la contadora lo entrega hoy — una pestaña de Excel por cada uno.
 *
 * 🔴 ESTE ARCHIVO NO DECIDE NADA. Los renglones, su orden y sus montos salen
 * enteros de `comprobante.ts`, que es puro y tiene los candados. Acá solo se
 * dibuja. Si algún día el papel cambia de forma, cambia allá.
 *
 * 🔴 SE DIBUJAN TODOS LOS RENGLONES, TAMBIÉN LOS QUE VAN EN 0.00. Daniel,
 * textual: *«Un solo formato, si alguien no lo lleva se pone 0 en el de esa
 * persona»*. Un `if (monto) continue` acá desharía el cambio entero.
 * ────────────────────────────────────────────────────────────────────────── */

import jsPDF from "jspdf";
import { FG_LOGO_BASE64, FG_LOGO_WIDTH, FG_LOGO_HEIGHT } from "@/lib/pdf-logo";
import type { Comprobante } from "./comprobante";

/** Carta vertical, en milímetros. Es la hoja en la que se imprime hoy. */
const HOJA = { formato: "letter" as const, ancho: 215.9, alto: 279.4 };
const MARGEN = 18;
/** Dónde termina la columna de montos (alineada a la derecha). */
const X_MONTO = 150;
/** Dónde arranca la nota (los minutos de tardanza). */
const X_NOTA = 156;
const ALTO_LINEA = 5.6;

const money = (n: number): string =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Dibuja UN comprobante en la página actual.
 *
 * ⚠️ No agrega páginas: eso lo decide quien llama, para que un comprobante
 * suelto y una tanda de 34 usen el mismo dibujo.
 */
export function dibujarComprobante(doc: jsPDF, c: Comprobante): void {
  const derecha = HOJA.ancho - MARGEN;
  let y = MARGEN;

  // ── El logo de la casa. Es NUESTRO papel, aunque copie la forma del de la
  //    contadora: el que lo firma tiene que saber de quién es.
  try {
    doc.addImage(FG_LOGO_BASE64, "JPEG", MARGEN, y - 4, FG_LOGO_WIDTH, FG_LOGO_HEIGHT);
  } catch {
    // Un logo que no decodifica no puede dejar sin comprobante a nadie.
  }

  // ── La cabeza: la empresa y las tres líneas del encabezado, centradas.
  doc.setFont("helvetica", "bold").setFontSize(13);
  doc.text(c.empresa, HOJA.ancho / 2, y + 2, { align: "center" });
  y += 8;
  // 🔴 LA IDENTIFICACIÓN, debajo del nombre y solo si se sabe. Una línea de RUC
  // en blanco en un papel de pago no informa: confunde.
  if (c.identificacion) {
    doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(90);
    doc.text(c.identificacion, HOJA.ancho / 2, y - 3.5, { align: "center" });
    doc.setTextColor(0);
    y += 2;
  }
  doc.setFont("helvetica", "normal").setFontSize(9.5);
  for (const linea of c.encabezado.slice(0, 2)) {
    doc.text(linea, HOJA.ancho / 2, y, { align: "center" });
    y += 5;
  }
  doc.setFont("helvetica", "bold").setFontSize(10);
  doc.text(c.titulo, HOJA.ancho / 2, y, { align: "center" });
  y += 9;

  doc.setDrawColor(180).setLineWidth(0.3);
  doc.line(MARGEN, y, derecha, y);
  y += 7;

  // ── La ficha de la persona.
  //
  // ⚠️ «POSICION DESEMPEÑADA» y «RATA POR HORA» SALEN IMPRESOS y hasta hoy el
  // sistema no los mostraba en ningún lado. El cargo sale de la ficha; sin
  // cargo cargado dice un guion, nunca un cargo inventado.
  doc.setFontSize(9.5);
  const ficha: [string, string][] = [
    ["EMPLEADO", c.empleado],
    ["POSICION DESEMPEÑADA", c.posicion],
    ["RATA POR HORA", money(c.rataPorHora)],
  ];
  for (const [rotulo, valor] of ficha) {
    doc.setFont("helvetica", "normal").text(rotulo, MARGEN, y);
    doc.setFont("helvetica", "bold").text(valor, 78, y);
    y += ALTO_LINEA;
  }
  y += 4;

  // ── Los renglones. TODOS, en el orden de `CLAVES_RENGLON`.
  for (const r of c.renglones) {
    if (r.tipo === "seccion") {
      y += 2;
      doc.setFont("helvetica", "bold").setFontSize(9.5);
      doc.text(r.rotulo, MARGEN, y);
      y += ALTO_LINEA;
      continue;
    }
    const esTotal = r.tipo === "total";
    doc.setFont("helvetica", esTotal ? "bold" : "normal").setFontSize(9.5);
    doc.text(r.rotulo, MARGEN + (r.adentro ? 6 : 0), y);
    doc.text(money(r.monto ?? 0), X_MONTO, y, { align: "right" });
    if (r.nota) {
      // 🔴 LOS MINUTOS VAN ACÁ, AL LADO DEL NÚMERO — nunca dentro del rótulo.
      // Meterlos en el título es lo que produjo las 23 grafías distintas del
      // renglón de tardanza en los 34 comprobantes de julio.
      doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(110);
      doc.text(r.nota, X_NOTA, y);
      doc.setTextColor(0);
    }
    if (esTotal) {
      doc.setDrawColor(120).setLineWidth(0.2);
      doc.line(X_MONTO - 30, y + 1.2, X_MONTO, y + 1.2);
    }
    y += ALTO_LINEA;
  }

  // ── El pie que se firma. Va abajo del todo, siempre en el mismo lugar, para
  //    que 34 hojas se firmen sin buscar la línea en cada una.
  const yPie = HOJA.alto - 34;

  // ── La nota del ajuste (11-sep-2026), chica y gris, ARRIBA de la raya de
  //    las firmas: dice que unas columnas traen los días que la quincena
  //    anterior pagó sin medir. Solo se dibuja cuando hay algo que decir.
  if (c.nota) {
    doc.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(110);
    const lineasNota = doc.splitTextToSize(c.nota, derecha - MARGEN) as string[];
    doc.text(lineasNota, MARGEN, yPie - 10 - (lineasNota.length - 1) * 3.5);
    doc.setTextColor(0);
  }

  doc.setDrawColor(180).setLineWidth(0.3);
  doc.line(MARGEN, yPie - 6, derecha, yPie - 6);

  doc.setFont("helvetica", "normal").setFontSize(9);
  const anchoCol = (derecha - MARGEN) / 3;
  const firmas: [string, string][] = [
    ["RECIBI CONFORME", ""],
    // La cédula sale de la ficha cuando está cargada. Sin ella, la línea queda
    // en blanco para escribirla a mano, que es como se hace hoy.
    ["CEDULA", c.cedula],
    ["FECHA", ""],
  ];
  firmas.forEach(([rotulo, valor], i) => {
    const x = MARGEN + anchoCol * i;
    const finLinea = x + anchoCol - 8;
    if (valor) doc.text(valor, x, yPie - 1);
    doc.setDrawColor(60).setLineWidth(0.3);
    doc.line(x, yPie + 1, finLinea, yPie + 1);
    doc.setFontSize(7.5).setTextColor(90);
    doc.text(rotulo, x, yPie + 5);
    doc.setFontSize(9).setTextColor(0);
  });

  doc.setFontSize(6.5).setTextColor(130);
  doc.text("Confidencial · fashiongr.com", MARGEN, HOJA.alto - 8);
  doc.setTextColor(0);
}

/**
 * El PDF de una tanda de comprobantes: UNA HOJA POR PERSONA.
 *
 * ⚠️ Una lista vacía devuelve un documento de una hoja en blanco y no revienta:
 * quien llama decide si el botón se dibuja (ver `lineasConComprobante`).
 */
export function construirPdfComprobantes(comprobantes: readonly Comprobante[]): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: HOJA.formato });
  comprobantes.forEach((c, i) => {
    if (i > 0) doc.addPage();
    dibujarComprobante(doc, c);
  });
  return doc;
}

/** El nombre del archivo. Con el período adentro, para no bajar 12 iguales. */
export function nombreArchivoComprobante(opts: {
  empresa: string;
  desde: string;
  hasta: string;
  persona?: string | null;
}): string {
  const quien = String(opts.persona ?? "").trim();
  const partes = ["Comprobante", quien || opts.empresa, `${opts.desde}_${opts.hasta}`];
  return `${partes.join("-").replace(/[\\/:*?"<>|]/g, "-")}.pdf`;
}
