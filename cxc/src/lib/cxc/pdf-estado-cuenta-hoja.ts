// ─────────────────────────────────────────────────────────────────────────────
// LA HOJA DEL ESTADO DE CUENTA, CON LA FORMA DE SWITCH (9-sep-2026).
//
// Daniel, textual: *«el sistema debe de mandar el estado de cuenta tal cual como
// sale en Switch cuando descargas el historial. Mismos números, mismos nombres,
// mismo todo!!!!»*
//
// Acá vive el DIBUJO de una hoja —la cabeza de la empresa, la ficha del cliente,
// la tabla de diez columnas, los tramos y el «RECIBIDO CONFORME»—. Lo que se
// DECIDE (fechas, vencimiento, saldo corrido, tramos, cuadre) está en
// `lib/cxc/estado-cuenta-switch.ts`, que es puro y se puede probar sin dibujar.
//
// 🔴 ES NUESTRO PAPEL CON SU FORMA, NO UNA COPIA ANÓNIMA: lleva el logo y el pie
// de la CASA QUE COBRA. Lo que se copia de Switch es el ORDEN y los NOMBRES de
// las columnas, que es lo que el cliente ya sabe leer.
//
// 🔴 QUIÉN FIRMA SALE DE `casa-del-papel.ts` Y SE DERIVA DE LA EMPRESA
// (9-sep-2026, Daniel: *«Firma Confecciones Boston»*): las seis del grupo
// llevan el logo de Fashion Group y «Confidencial · fashiongr.com»; el papel de
// Confecciones Boston sale sin logo y sin ese dominio. Nadie elige la casa a
// mano — se pregunta por `empresa_key`, que el papel ya tiene.
//
// ⚠️ El papel del cliente NUNCA dice «vencido». `dias` es la EDAD del documento,
// no días de mora, así que los tres tramos salen rotulados por su RANGO —igual
// que el papel de Switch, que tampoco los juzga— y ese rango se deriva de
// `cxc-aging`, la misma lista que rotula la pantalla. Candado:
// `cxc-papel-vocabulario.test.ts`.
// ─────────────────────────────────────────────────────────────────────────────

import type jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { casaDeEmpresa, type CasaDelPapel } from "@/lib/cxc/casa-del-papel";
import { AGING_ORDER, tramoRango } from "@/lib/cxc-aging";
import { fichaFiscal } from "@/lib/cxc/empresa-fiscal";
import type { EstadoEmpresa, FichaCliente } from "@/lib/cxc/estado-cuenta-tipos";
import {
  filasDelPapel,
  tramosDelPapel,
  monto,
  fechaDMY,
  type FilaDelPapel,
} from "@/lib/cxc/estado-cuenta-switch";

export const MARGEN = 12;
/** Alto reservado abajo para el pie de la casa. */
export const FOOTER_RESERVA_MM = 16;

const GRIS = [107, 114, 128] as const;
const NEGRO = [17, 24, 39] as const;

/** El «Fecha:» del encabezado, en el DD-MM-AAAA de Switch y con el día LOCAL
 *  (con UTC, de madrugada el papel sale fechado mañana). */
export function hoyDMY(): string {
  const d = new Date();
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return fechaDMY(iso);
}

// ── 1. La cabeza: quién cobra ────────────────────────────────────────────────

/**
 * Logo a la izquierda, la empresa acreedora centrada (nombre legal,
 * identificación, teléfono y correo) y a la derecha «ESTADO DE CUENTA» con la
 * fecha. Las líneas que no sabemos NO se dibujan — nunca las de otra empresa.
 *
 * 🔴 EL LOGO SALE DE LA CASA QUE COBRA, y la casa se DERIVA de `empresaKey`
 * (`casaDeEmpresa`). Confecciones Boston no tiene logo cargado, así que su papel
 * sale sin ninguno — nunca con el de Fashion Group, que no le vendió nada a ese
 * cliente.
 */
export function dibujarCabeza(doc: jsPDF, empresaKey: string, empresaNombre: string): number {
  const w = doc.internal.pageSize.getWidth();
  const centro = w / 2;
  const f = fichaFiscal(empresaKey, empresaNombre);
  const casa = casaDeEmpresa(empresaKey);

  if (casa.logo) {
    try {
      doc.addImage(casa.logo.base64, "JPEG", MARGEN, 10, casa.logo.width, casa.logo.height);
    } catch { /* el papel sale igual sin el logo */ }
  }

  let y = 14;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...NEGRO);
  doc.text(f.legal, centro, y, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...GRIS);
  for (const linea of [
    f.identificacion ? `Identificación: ${f.identificacion}` : "",
    f.telefono ? `TEL: ${f.telefono}` : "",
    f.correo,
  ]) {
    if (!linea) continue;
    y += 4;
    doc.text(linea, centro, y, { align: "center" });
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...NEGRO);
  doc.text("ESTADO DE CUENTA", w - MARGEN, 14, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...GRIS);
  doc.text(`Fecha: ${hoyDMY()}`, w - MARGEN, 19, { align: "right" });

  return Math.max(y, 22) + 6;
}

// ── 2. La ficha del cliente, en dos columnas ─────────────────────────────────

/** «Nombre · Teléfono / Identificación · Email / Código · Dirección / Límite de
 *  crédito · Tiempo de Morosidad», exactamente el bloque de Switch. Lo que no
 *  tenemos va vacío, nunca inventado. */
export function dibujarFichaCliente(
  doc: jsPDF,
  y: number,
  nombre: string,
  codigo: string,
  ficha: FichaCliente,
): number {
  const w = doc.internal.pageSize.getWidth();
  const col2 = w / 2 + 4;
  const pares: Array<[string, string, string, string]> = [
    ["Nombre:", nombre, "Teléfono:", ficha.telefono],
    ["Identificación:", ficha.identificacion, "Email:", ficha.email],
    ["Código:", codigo, "Dirección:", ficha.direccion],
    [
      "Límite de crédito:",
      ficha.limiteCredito != null ? monto(ficha.limiteCredito) : "",
      "Tiempo de Morosidad:",
      ficha.tiempoMorosidad != null ? String(ficha.tiempoMorosidad) : "",
    ],
  ];

  doc.setFontSize(8);
  for (const [r1, v1, r2, v2] of pares) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...NEGRO);
    doc.text(r1, MARGEN, y);
    doc.setFont("helvetica", "normal");
    doc.text(v1, MARGEN + doc.getTextWidth(r1) + 1.5, y);

    doc.setFont("helvetica", "bold");
    doc.text(r2, col2, y);
    doc.setFont("helvetica", "normal");
    doc.text(v2, col2 + doc.getTextWidth(r2) + 1.5, y);
    y += 4.6;
  }
  return y + 3;
}

// ── 3. La tabla de diez columnas ─────────────────────────────────────────────

export const COLUMNAS = [
  "Fecha",
  "Comprobante",
  "Comentario",
  "N. Interno",
  "Débitos",
  "Créditos",
  "Saldo",
  "Vence",
  "Plazo",
  "Días",
] as const;

/**
 * 🔴 EL NÚMERO FISCAL VA DEBAJO DE SU DOCUMENTO, en gris chico, igual que en el
 * papel de Switch. Se dibuja como una FILA más de la tabla (una sola celda que
 * abarca las diez columnas) y no como texto suelto: así el salto de página no
 * puede separar el número fiscal de su documento.
 */
function cuerpoDeLaTabla(filas: FilaDelPapel[]): Array<Array<string | { content: string; colSpan: number; styles: Record<string, unknown> }>> {
  const cuerpo: Array<Array<string | { content: string; colSpan: number; styles: Record<string, unknown> }>> = [];
  for (const f of filas) {
    cuerpo.push([
      f.fecha, f.comprobante, f.comentario, f.numeroInterno,
      f.debito, f.credito, f.saldo, f.vence, f.plazo, f.dias,
    ]);
    if (f.numeroFiscal) {
      cuerpo.push([
        {
          content: `N. Fiscal: ${f.numeroFiscal}`,
          colSpan: COLUMNAS.length,
          styles: { fontSize: 5.6, textColor: [140, 146, 156], fillColor: [249, 250, 251] },
        },
      ]);
    }
  }
  return cuerpo;
}

/** Dibuja los documentos de UNA empresa y devuelve dónde quedó, más el total. */
export function dibujarDocumentos(doc: jsPDF, y: number, emp: EstadoEmpresa): { y: number; total: number } {
  const { filas, total } = filasDelPapel(emp.documentos);

  autoTable(doc, {
    startY: y,
    margin: { left: MARGEN, right: MARGEN, bottom: FOOTER_RESERVA_MM },
    head: [[...COLUMNAS]],
    body: cuerpoDeLaTabla(filas),
    styles: { font: "helvetica", fontSize: 6.6, cellPadding: 1.3, textColor: [...NEGRO], overflow: "linebreak" },
    headStyles: { fillColor: [243, 244, 246], textColor: [...GRIS], fontStyle: "bold", fontSize: 6.4 },
    columnStyles: {
      0: { cellWidth: 17 },
      1: { cellWidth: 23 },
      2: { cellWidth: "auto" },
      3: { cellWidth: 24 },
      4: { cellWidth: 17, halign: "right" },
      5: { cellWidth: 17, halign: "right" },
      6: { cellWidth: 19, halign: "right", fontStyle: "bold" },
      7: { cellWidth: 17 },
      8: { cellWidth: 10, halign: "right" },
      9: { cellWidth: 10, halign: "right" },
    },
  });

  // @ts-expect-error lastAutoTable lo agrega el plugin en runtime
  return { y: doc.lastAutoTable.finalY + 5, total };
}

// ── 4. Los TRES tramos y el Total General ────────────────────────────────────

/**
 * 🔴 LOS TRES TRAMOS DE LA PANTALLA, NO LOS OCHO DE SWITCH. Daniel, textual:
 * *«solo los 3 de mi lista»*. Los rangos salen de `cxc-aging` (la misma lista
 * que rotula la pantalla, el celular y las descargas), nunca escritos acá.
 */
export function dibujarPie(doc: jsPDF, y: number, emp: EstadoEmpresa, total: number): number {
  const w = doc.internal.pageSize.getWidth();
  const alto = 26;
  if (y + alto > doc.internal.pageSize.getHeight() - FOOTER_RESERVA_MM) {
    doc.addPage();
    y = 20;
  }
  const t = tramosDelPapel(emp.documentos);

  autoTable(doc, {
    startY: y,
    margin: { left: MARGEN, right: MARGEN, bottom: FOOTER_RESERVA_MM },
    head: [AGING_ORDER.map((k) => tramoRango(k))],
    body: [[monto(t.current), monto(t.watch), monto(t.overdue)]],
    styles: { font: "helvetica", fontSize: 7, cellPadding: 1.6, halign: "right", textColor: [...NEGRO] },
    headStyles: { fillColor: [243, 244, 246], textColor: [...GRIS], fontStyle: "bold", fontSize: 6.6, halign: "right" },
    tableWidth: 110,
  });
  // @ts-expect-error lastAutoTable lo agrega el plugin en runtime
  y = doc.lastAutoTable.finalY + 7;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...NEGRO);
  doc.text(`Total General: ${monto(total)}`, w - MARGEN, y, { align: "right" });
  return y + 12;
}

/** La línea de firma del papel de Switch. */
export function dibujarRecibidoConforme(doc: jsPDF, y: number): number {
  if (y + 16 > doc.internal.pageSize.getHeight() - FOOTER_RESERVA_MM) {
    doc.addPage();
    y = 24;
  }
  doc.setDrawColor(...GRIS);
  doc.setLineWidth(0.3);
  doc.line(MARGEN, y, MARGEN + 78, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...GRIS);
  doc.text("RECIBIDO CONFORME", MARGEN, y + 5);
  return y + 12;
}

// ── 5. El pie de la casa ─────────────────────────────────────────────────────

export function dibujarPieDeLaCasa(doc: jsPDF, casa: CasaDelPapel): void {
  const pages = doc.getNumberOfPages();
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(156, 163, 175);
    doc.text(`Generado ${hoyDMY()} · ${casa.pie}`, w / 2, h - 10, { align: "center" });
    doc.text(`${i} / ${pages}`, w - MARGEN, h - 10, { align: "right" });
  }
}
