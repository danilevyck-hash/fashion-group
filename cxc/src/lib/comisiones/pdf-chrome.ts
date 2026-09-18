// ─────────────────────────────────────────────────────────────────────────────
// LA CARROCERÍA DE LOS PAPELES DE COMISIONES — logo, cabeza, pie y estilos.
//
// 🔴 UN SOLO JUEGO DE ESTILOS PARA LOS DOS PAPELES (9-sep-2026). El módulo saca
// dos PDF distintos —el reporte de UN vendedor (`pdf-comision.ts`) y la matriz
// del mes o del año (`pdf-tabla-comisiones.ts`)— y los dos son papel de la casa:
// mismo navy, mismo logo, mismo «Confidencial · fashiongr.com», misma
// numeración. Copiar 80 líneas de dibujo en el segundo archivo es exactamente
// cómo se llega a que dentro de seis meses un papel tenga el logo y el otro no.
//
// Acá NO se decide QUÉ dice ningún papel: solo cómo se ve. El contenido vive en
// los módulos puros (`reporte-comision.ts`, `tabla-papel.ts`).
// ─────────────────────────────────────────────────────────────────────────────

import type jsPDF from "jspdf";
import { FG_LOGO_BASE64, FG_LOGO_WIDTH, FG_LOGO_HEIGHT } from "@/lib/pdf-logo";

/** Navy de la casa — el MISMO `pri` de los Excel y del papel del CXC. */
export const NAVY: [number, number, number] = [27, 58, 92];
export const TINTA: [number, number, number] = [17, 24, 39];
export const GRIS: [number, number, number] = [107, 114, 128];
export const GRIS_CLARO: [number, number, number] = [156, 163, 175];
export const CEBRA: [number, number, number] = [248, 249, 249];
export const ROJO: [number, number, number] = [225, 29, 72];
export const LINEA: [number, number, number] = [209, 213, 219];

/**
 * 🩸 EL MENOS TIPOGRÁFICO NO EXISTE EN EL PDF (9-sep-2026, medido en el archivo
 * de verdad).
 *
 * La casa escribe la plata negativa con `−` (U+2212, diccionario § 0) y la
 * fuente base de jsPDF (helvetica con `WinAnsiEncoding`, un byte por letra) no
 * tiene ese carácter: **mangla el renglón ENTERO**. Medido sobre el reporte de
 * un vendedor: `−$250.00` salía como `" $ 2 5 0 . 0 0` —una comilla y los
 * dígitos separados uno por uno— y arrastraba consigo el resto de la línea
 * (`V e n t a s " $ 2 5 0 . 0 0 × 0 . 5 0 %`).
 *
 * 🔴 SE CAMBIA AL DIBUJAR, NUNCA EN EL DATO. El número que se muestra en
 * pantalla, el del Excel y el que compara el código siguen con su `−`: lo único
 * que pasa por acá es el texto que se pinta en el papel. Es la misma solución
 * que ya tomó la planilla de Asistencia con su fórmula del neto.
 */
export const MENOS_EN_PDF = "-";

export function textoDePdf(texto: string): string {
  return texto.replace(/\u2212/g, MENOS_EN_PDF);
}

export const MARGEN = 19;
/** Dónde arranca la tabla en la PRIMERA hoja: debajo de la cabecera. */
export const ALTO_CABECERA = 32;
/**
 * 🔴 EL TÍTULO VA SOLO EN LA PRIMERA HOJA (17-sep-2026).
 *
 * Daniel, textual: *«no quiero ver en cada pagina lo mismo… solo en la
 * primera»*. El logo y el renglón «Comisión — Vendedor · Empresa · agosto 2026»
 * se repetían idénticos en las cuatro hojas de un reporte: ocupaban 32 mm de
 * cada una para decir lo que ya se leyó.
 *
 * 🔴 LOS NOMBRES DE COLUMNA SÍ SE REPITEN, y eso es lo contrario de un olvido:
 * sin ellos la tabla de la hoja 3 son números sueltos. Los repite `autoTable`
 * solo (`showHead` por defecto), y por eso acá no hay nada que hacer.
 *
 * ⚠️ EL PIE CON LA NUMERACIÓN NO SE TOCA (`piePorHoja`): «Página 2 de 4» y
 * «Confidencial · fashiongr.com» siguen en TODAS las hojas — es lo que dice de
 * qué documento es la hoja suelta que quedó en la impresora.
 *
 * Esto es dónde arranca la tabla en las hojas de continuación, que ya no llevan
 * cabecera: el mismo aire que los lados, para que no quede una franja en blanco.
 */
export const ALTO_CONTINUACION = MARGEN;
/** Aire de abajo, donde va el pie. */
export const PIE = 18;

/** La cabeza del papel: logo y de qué es. Se dibuja UNA vez, en su primera hoja. */
export function cabecera(doc: jsPDF, titulo: string): void {
  const w = doc.internal.pageSize.getWidth();
  try {
    doc.addImage(FG_LOGO_BASE64, "JPEG", MARGEN, 10, FG_LOGO_WIDTH, FG_LOGO_HEIGHT);
  } catch {
    /* el papel sale igual sin el logo */
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...TINTA);
  doc.text(textoDePdf(titulo), MARGEN, 10 + FG_LOGO_HEIGHT + 5);
  doc.setDrawColor(...LINEA);
  doc.setLineWidth(0.3);
  doc.line(MARGEN, 10 + FG_LOGO_HEIGHT + 7.5, w - MARGEN, 10 + FG_LOGO_HEIGHT + 7.5);
}

/** El pie de la casa, con la numeración. Se escribe al final, ya con el total. */
export function piePorHoja(doc: jsPDF): void {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  const hojas = doc.getNumberOfPages();
  for (let i = 1; i <= hojas; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...GRIS_CLARO);
    doc.text("Confidencial", MARGEN, h - 10);
    doc.text(`Página ${i} de ${hojas}`, w / 2, h - 10, { align: "center" });
    doc.text("fashiongr.com", w - MARGEN, h - 10, { align: "right" });
  }
}

/** Los estilos de tabla de la casa (los mismos del papel del CXC). */
export function estilosDeTabla() {
  return {
    styles: { font: "helvetica" as const, fontSize: 8, cellPadding: 2, textColor: TINTA },
    headStyles: {
      fillColor: NAVY,
      textColor: [255, 255, 255] as [number, number, number],
      fontStyle: "bold" as const,
      fontSize: 7.5,
    },
    alternateRowStyles: { fillColor: CEBRA },
    footStyles: {
      fillColor: [255, 255, 255] as [number, number, number],
      textColor: TINTA,
      fontStyle: "bold" as const,
      fontSize: 8.5,
      lineColor: NAVY,
      lineWidth: { top: 0.6, right: 0, bottom: 0, left: 0 },
    },
  };
}

/** Dónde terminó la última tabla. */
export function finDeTabla(doc: jsPDF): number {
  const y = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY;
  return typeof y === "number" ? y : ALTO_CABECERA;
}

/** Deja lugar para `alto` mm; si no cabe, abre hoja.
 *
 *  🔄 17-sep-2026: la hoja nueva ya NO repite la cabeza (ver `ALTO_CONTINUACION`)
 *  y por eso este ayudante dejó de pedir el título. */
export function asegurarEspacio(doc: jsPDF, y: number, alto: number): number {
  const h = doc.internal.pageSize.getHeight();
  if (y + alto <= h - PIE) return y;
  doc.addPage();
  return ALTO_CONTINUACION;
}
