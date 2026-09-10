// ─────────────────────────────────────────────────────────────────────────────
// EL PAPEL DEL MES Y EL DEL AÑO, EN PDF DE VERDAD (9-sep-2026).
//
// Daniel, textual: *«¿no podemos hacer un botón de PDF, ya que de PDF en la
// compu paso a imprimir?»* y, al preguntarle si pasaba también los dos botones
// de arriba: *«Los paso a PDF también, para que todo el módulo se comporte
// igual»*.
//
// 🩸 ANTES ESTA MATRIZ NO ERA UN ARCHIVO. Se dibujaba en HTML dentro de un
// portal a `<body>` (`ImpresionTablaComisiones`, retirado el mismo día) y se
// llamaba a `window.print()`: lo que salía era el DIÁLOGO del navegador, y
// «Guardar como PDF» quedaba escondido adentro de un menú. Es lo que Daniel
// llama «impresión directa».
//
// 🔴 EL NOMBRE DEL ARCHIVO LO PONE ESTE CÓDIGO, no el navegador. Con
// `window.print()` el PDF se llamaba como el `document.title` de la página —que
// en toda la app es «Fashion Group»—. El nombre sigue saliendo de
// `lib/comisiones/nombre-archivo`, el MISMO que usa el Excel del mismo período:
// `comisiones-consolidado-2026-08` para los dos.
//
// 🩸 Y ESTE PDF NO PUEDE LLEVARSE OTRO REPORTE PEGADO ATRÁS. Con el papel en
// HTML, si el detalle de un vendedor estaba abierto su hoja también vivía
// montada en `<body>` y entraba al mismo trabajo de impresión; había que taparla
// con una regla de CSS (`body > [data-cds-print]:not([data-cds-tabla])`). Acá el
// documento se arma SOLO con la tabla que se le pasa: no hay nada más en la
// página que pueda colarse.
//
// 🔴 NI UNA SUMA ACÁ. Las filas y los totales llegan ya calculados por la vista
// —las MISMAS que están en pantalla, con el MISMO pie (`sumarPagable`)—. Este
// archivo dibuja. Qué dice el papel vive en `tabla-papel.ts` (módulo puro).
// ─────────────────────────────────────────────────────────────────────────────

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  ALTO_CABECERA,
  GRIS,
  GRIS_CLARO,
  MARGEN,
  PIE,
  cabecera,
  estilosDeTabla,
  piePorHoja,
  textoDePdf,
} from "./pdf-chrome";
import { orientacionPapel, type TablaPapel } from "./tabla-papel";

/** El papel completo. Una sola tabla; se parte en hojas cuando no cabe. */
export function construirPdfTablaComisiones(tabla: TablaPapel): jsPDF {
  const doc = new jsPDF({
    // Parado o acostado: lo decide el módulo puro a partir de las columnas.
    orientation: orientacionPapel(tabla.columnas.length),
    unit: "mm",
    format: "letter",
  });
  const titulo = `${tabla.titulo} · ${tabla.subtitulo}`;
  cabecera(doc, titulo);

  autoTable(doc, {
    startY: ALTO_CABECERA,
    margin: { top: ALTO_CABECERA, left: MARGEN, right: MARGEN, bottom: PIE },
    // 🩸 Todo lo que se DIBUJA pasa por `textoDePdf`: el «−» de la plata
    // negativa no existe en la fuente base y mangla el renglón entero. El dato
    // no se toca — ver `pdf-chrome.ts`.
    head: [tabla.columnas.map((c) => textoDePdf(c.header))],
    body: tabla.filas.map((f) => f.celdas.map(textoDePdf)),
    foot: [tabla.totales.map(textoDePdf)],
    columnStyles: Object.fromEntries(
      tabla.columnas.map((c, i) => [i, c.numerica ? { halign: "right" as const } : {}]),
    ),
    // Los que no se pagan van en gris, igual que en pantalla y en el Excel.
    didParseCell: (d) => {
      if (d.section === "body" && tabla.filas[d.row.index]?.apagada) {
        d.cell.styles.textColor = GRIS_CLARO;
      }
      if (d.section === "head" && tabla.columnas[d.column.index]?.numerica) {
        d.cell.styles.halign = "right";
      }
      if (d.section === "foot" && tabla.columnas[d.column.index]?.numerica) {
        d.cell.styles.halign = "right";
      }
    },
    ...estilosDeTabla(),
    // La cabeza se repite en cada hoja: una matriz larga no pierde de qué es.
    didDrawPage: () => cabecera(doc, titulo),
  });

  // La nota de la casa: qué ya está descontado. Es la MISMA frase del pie de la
  // pantalla — el papel no puede explicar el número distinto que la pantalla.
  const h = doc.internal.pageSize.getHeight();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...GRIS);
  doc.text(textoDePdf("Ya están descontados lo devuelto y los descuentos."), MARGEN, h - 14);

  piePorHoja(doc);
  return doc;
}

/**
 * Baja el archivo. El nombre llega SIN extensión (es el mismo que usa el Excel
 * del mismo período); el `.pdf` se pone acá.
 */
export function descargarPdfTablaComisiones(
  tabla: TablaPapel,
  nombreSinExtension: string,
): void {
  construirPdfTablaComisiones(tabla).save(`${nombreSinExtension}.pdf`);
}
