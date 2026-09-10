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
//
// 🔄 9-SEP-2026 — el logo, la cabeza, el pie y los estilos se mudaron a
// `pdf-chrome.ts`: desde que la matriz del mes y la del año también son un PDF
// de verdad, los dos papeles del módulo tienen que verse igual, y dos copias de
// la misma carrocería es cómo se llega a que uno lleve el logo y el otro no.
// ─────────────────────────────────────────────────────────────────────────────

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  ALTO_CABECERA,
  MARGEN,
  NAVY,
  PIE,
  ROJO,
  TINTA,
  GRIS,
  LINEA,
  asegurarEspacio,
  cabecera,
  estilosDeTabla,
  finDeTabla,
  piePorHoja,
  textoDePdf,
} from "./pdf-chrome";
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

/** El rótulo de una sección: «Ventas», «Cobros». */
function tituloSeccion(doc: jsPDF, y: number, texto: string): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...GRIS);
  doc.text(textoDePdf(texto.toUpperCase()), MARGEN, y);
  return y + 3;
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
    // 🔴 El rojo se decide con el texto CRUDO (que sí lleva el «−»); lo que se
    // dibuja va saneado. Al revés, el negativo dejaría de pintarse.
    doc.setTextColor(...(l.monto.startsWith("−") ? ROJO : TINTA));
    doc.text(textoDePdf(l.rotulo), MARGEN + 3, yy);
    doc.text(textoDePdf(l.monto), w - MARGEN - 3, yy, { align: "right" });
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
  doc.text(textoDePdf(rotulo), MARGEN, y + 5);
  doc.text(textoDePdf(monto), w - MARGEN, y + 5, { align: "right" });
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
        ? ventas.map((f) => f.celdas.map(textoDePdf))
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
        ? cobros.map((f) => f.celdas.map(textoDePdf))
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
