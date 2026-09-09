// ─────────────────────────────────────────────────────────────────────────────
// EL REPORTE DE COMISIÓN, EN PDF DE VERDAD (9-sep-2026).
//
// Daniel, textual: *«¿no podemos hacer un botón de PDF, ya que de PDF en la
// compu paso a imprimir?»*. Tiene razón: desde un PDF ya se imprime, así que
// dos botones para lo mismo sobran.
//
// 🩸 ANTES ESTE REPORTE NO ERA UN ARCHIVO. Se dibujaba en HTML dentro de un
// portal a `<body>` y se llamaba a `window.print()`: lo que salía era el DIÁLOGO
// del navegador, y «Guardar como PDF» quedaba escondido adentro de un menú. Por
// eso «sale impresión directa». Ahora el botón dice **PDF** y baja un PDF.
//
// 🔴 EL NOMBRE DEL ARCHIVO LO PONE ESTE CÓDIGO, no el navegador. Con
// `window.print()` el PDF se llamaba como el `document.title` de la página —que
// en toda la app es «Fashion Group»—, así que los doce reportes de un cierre de
// mes bajaban con el mismo nombre. El nombre sigue saliendo de
// `lib/comisiones/nombre-archivo`, el MISMO que usa el Excel.
//
// 🩸 Y EL PDF DE UNA EMPRESA YA NO PUEDE LLEVARSE EL DE OTRA PEGADO ATRÁS. Con
// el papel en HTML, si el detalle estaba abierto su hoja también vivía montada
// en `<body>` y entraba al mismo trabajo de impresión; había que taparla con una
// regla de CSS. Acá el documento se arma SOLO con las hojas que se le pasan: no
// hay nada más en la página que pueda colarse.
//
// 🔑 QUÉ DICE EL PAPEL vive aparte, en `reporte-comision.ts` (módulo puro): acá
// solo se dibuja. Es lo mismo que hacen el papel del CXC y el de las guías.
// ─────────────────────────────────────────────────────────────────────────────

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { FG_LOGO_BASE64, FG_LOGO_WIDTH, FG_LOGO_HEIGHT } from "@/lib/pdf-logo";
import {
  COLUMNAS_COBROS,
  COLUMNAS_VENTAS,
  encabezadoReporte,
  filasCobros,
  filasVentas,
  lineasDelCierre,
  totalesDelPapel,
  type HojaReporte,
} from "./reporte-comision";

/** Navy de la casa — el MISMO `pri` de los Excel y del papel del CXC. */
const NAVY: [number, number, number] = [27, 58, 92];
const TINTA: [number, number, number] = [17, 24, 39];
const GRIS: [number, number, number] = [107, 114, 128];
const GRIS_CLARO: [number, number, number] = [156, 163, 175];
const CEBRA: [number, number, number] = [248, 249, 249];
const ROJO: [number, number, number] = [225, 29, 72];
const LINEA: [number, number, number] = [209, 213, 219];

const MARGEN = 19;
/** Dónde arranca la tabla: debajo de la cabecera, en todas las hojas. */
const ALTO_CABECERA = 32;
/** Aire de abajo, donde va el pie. */
const PIE = 18;

/** La cabeza de cada hoja: logo, de quién es el reporte y de qué período. */
function cabecera(doc: jsPDF, titulo: string): void {
  const w = doc.internal.pageSize.getWidth();
  try {
    doc.addImage(FG_LOGO_BASE64, "JPEG", MARGEN, 10, FG_LOGO_WIDTH, FG_LOGO_HEIGHT);
  } catch {
    /* el papel sale igual sin el logo */
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...TINTA);
  doc.text(titulo, MARGEN, 10 + FG_LOGO_HEIGHT + 5);
  doc.setDrawColor(...LINEA);
  doc.setLineWidth(0.3);
  doc.line(MARGEN, 10 + FG_LOGO_HEIGHT + 7.5, w - MARGEN, 10 + FG_LOGO_HEIGHT + 7.5);
}

/** El pie de la casa, con la numeración. Se escribe al final, ya con el total. */
function piePorHoja(doc: jsPDF): void {
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
function estilosDeTabla() {
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

/** El rótulo de una sección: «Ventas», «Cobros». */
function tituloSeccion(doc: jsPDF, y: number, texto: string): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...GRIS);
  doc.text(texto.toUpperCase(), MARGEN, y);
  return y + 3;
}

/** Dónde terminó la última tabla. */
function finDeTabla(doc: jsPDF): number {
  const y = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY;
  return typeof y === "number" ? y : ALTO_CABECERA;
}

/** Deja lugar para `alto` mm; si no cabe, abre hoja y repite la cabeza. */
function asegurarEspacio(doc: jsPDF, y: number, alto: number, titulo: string): number {
  const h = doc.internal.pageSize.getHeight();
  if (y + alto <= h - PIE) return y;
  doc.addPage();
  cabecera(doc, titulo);
  return ALTO_CABECERA;
}

/** La caja de cierre: de dónde sale cada comisión y qué se paga. */
function dibujarCierre(doc: jsPDF, y: number, hoja: HojaReporte, titulo: string): number {
  const w = doc.internal.pageSize.getWidth();
  const lineas = lineasDelCierre(hoja.data, hoja.descuentos);
  const alto = 9 + lineas.length * 5 + 3;
  // 🔴 El cierre NUNCA se parte entre dos hojas: es lo que se lee primero.
  let yy = asegurarEspacio(doc, y, alto, titulo);

  doc.setDrawColor(...LINEA);
  doc.setLineWidth(0.3);
  doc.rect(MARGEN, yy, w - MARGEN * 2, alto);

  yy += 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...GRIS);
  doc.text("CIERRE", MARGEN + 3, yy);
  yy += 5;

  for (const l of lineas) {
    doc.setFont("helvetica", l.fuerte ? "bold" : "normal");
    doc.setFontSize(l.fuerte ? 9 : 8);
    doc.setTextColor(...(l.monto.startsWith("−") ? ROJO : TINTA));
    doc.text(l.rotulo, MARGEN + 3, yy);
    doc.text(l.monto, w - MARGEN - 3, yy, { align: "right" });
    yy += 5;
  }
  return yy + 4;
}

/** Una línea de total a lo ancho, con su raya arriba. */
function dibujarTotal(doc: jsPDF, y: number, rotulo: string, monto: string): number {
  const w = doc.internal.pageSize.getWidth();
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.5);
  doc.line(MARGEN, y, w - MARGEN, y);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...TINTA);
  doc.text(rotulo, MARGEN, y + 5);
  doc.text(monto, w - MARGEN, y + 5, { align: "right" });
  return y + 9;
}

/**
 * El documento completo. **Una hoja nueva por empresa**: los reportes nunca se
 * pegan a media página, y el de una empresa jamás arrastra el de otra porque el
 * documento se arma SOLO con lo que llega en `hojas`.
 */
export function construirPdfComision(hojas: HojaReporte[]): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });

  hojas.forEach((hoja, i) => {
    const titulo = encabezadoReporte(hoja);
    if (i > 0) doc.addPage();
    cabecera(doc, titulo);

    const ventas = filasVentas(hoja.data);
    const cobros = filasCobros(hoja.data);
    const [totalVentas, totalCobros, totalJuntos] = totalesDelPapel(hoja.data);

    let y = tituloSeccion(doc, ALTO_CABECERA - 4, "Ventas");

    autoTable(doc, {
      startY: y,
      margin: { top: ALTO_CABECERA, left: MARGEN, right: MARGEN, bottom: PIE },
      head: [[...COLUMNAS_VENTAS]],
      body: ventas.length
        ? ventas.map((f) => f.celdas)
        : [["", "Sin ventas comisionables.", "", "", ""]],
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: "auto" },
        2: { cellWidth: 28 },
        3: { cellWidth: 12, halign: "center" },
        4: { cellWidth: 26, halign: "right" },
      },
      // La nota de crédito se lee en ROJO y en negativo, igual que en pantalla.
      didParseCell: (d) => {
        if (d.section === "body" && ventas[d.row.index]?.negativo) d.cell.styles.textColor = ROJO;
      },
      ...estilosDeTabla(),
      didDrawPage: () => cabecera(doc, titulo),
    });

    y = dibujarTotal(doc, finDeTabla(doc) + 2, totalVentas.rotulo, totalVentas.monto);

    y = asegurarEspacio(doc, y + 4, 24, titulo);
    y = tituloSeccion(doc, y, "Cobros");

    autoTable(doc, {
      startY: y,
      margin: { top: ALTO_CABECERA, left: MARGEN, right: MARGEN, bottom: PIE },
      head: [[...COLUMNAS_COBROS]],
      body: cobros.length
        ? cobros.map((f) => f.celdas)
        : [["", "Sin cobros comisionables.", ""]],
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: "auto" },
        2: { cellWidth: 26, halign: "right" },
      },
      didParseCell: (d) => {
        if (d.section === "body" && cobros[d.row.index]?.negativo) d.cell.styles.textColor = ROJO;
      },
      ...estilosDeTabla(),
      didDrawPage: () => cabecera(doc, titulo),
    });

    y = dibujarTotal(doc, finDeTabla(doc) + 2, totalCobros.rotulo, totalCobros.monto);
    y = dibujarTotal(doc, asegurarEspacio(doc, y, 12, titulo), totalJuntos.rotulo, totalJuntos.monto);
    dibujarCierre(doc, y + 3, hoja, titulo);
  });

  piePorHoja(doc);
  return doc;
}

/**
 * Baja el archivo. El nombre llega SIN extensión (es el mismo que usa el Excel);
 * el `.pdf` se pone acá.
 */
export function descargarPdfComision(hojas: HojaReporte[], nombreSinExtension: string): void {
  construirPdfComision(hojas).save(`${nombreSinExtension}.pdf`);
}
