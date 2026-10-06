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
// 🔴 17-SEP-2026 — EL TÍTULO SALE SOLO EN LA PRIMERA HOJA DE CADA REPORTE.
// Daniel: *«no quiero ver en cada pagina lo mismo… solo en la primera»*. El logo
// y el renglón «Comisión — Vendedor · Empresa · agosto 2026» se repetían en las
// cuatro hojas. ⚠️ Los NOMBRES DE COLUMNA sí se repiten (los repite `autoTable`
// solo): sin ellos la tabla de la hoja 3 son números sueltos. Y el pie con la
// numeración no se tocó. Las hojas de continuación arrancan en
// `ALTO_CONTINUACION` para que no quede una franja en blanco arriba.
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
  ALTO_CONTINUACION,
  MARGEN,
  PIE,
  ROJO,
  TINTA,
  GRIS,
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
  descuentosActivos,
  encabezadoReporte,
  entraAlPapel,
  filasCobros,
  filasVentas,
  lineaDeComisionesDelPapel,
  lineaDelPieDelPapel,
  seccionesDelPapel,
  totalAPagarComision,
  type HojaReporte,
  type SeccionesDelPapel,
} from "./reporte-comision";
import { fmtMoney } from "@/lib/ventas/format";

/** El rótulo de una sección: «Ventas», «Cobros». */
function tituloSeccion(doc: jsPDF, y: number, texto: string): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...GRIS);
  doc.text(textoDePdf(texto.toUpperCase()), MARGEN, y);
  return y + 3;
}

/**
 * 🔴 EL PAPEL, ALINEADO CON EL DETALLE v3 (6-oct-2026): el título, el total a
 * pagar grande con UNA línea gris («Comisión de ventas · de cobros» y los
 * descuentos), Ventas y Cobros SOLO si aplican (`seccionesDelPapel`) y UNA línea
 * al pie con tasas y bases. Se fueron «TOTAL VENTAS / COBROS / VENTAS + COBROS»
 * y la caja «Resumen», que repetían lo de arriba. Ningún número cambia: el
 * total es `totalAPagarComision`, la misma cuenta de la pantalla.
 */
function dibujarNumero(doc: jsPDF, y: number, hoja: HojaReporte, s: SeccionesDelPapel): number {
  const total = totalAPagarComision(hoja.data, hoja.descuentos);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(22);
  doc.setTextColor(...(total < 0 ? ROJO : TINTA));
  doc.text(textoDePdf(fmtMoney(total)), MARGEN, y + 7);
  const partes = [lineaDeComisionesDelPapel(hoja.data, s)];
  for (const d of descuentosActivos(hoja.descuentos)) partes.push(`${d.concepto} −${fmtMoney(d.monto)}`);
  doc.setFontSize(9);
  doc.setTextColor(...GRIS);
  doc.text(textoDePdf(partes.filter(Boolean).join(" · ")), MARGEN, y + 13);
  return y + 20;
}

/** La línea gris del pie: tasas y bases de lo que aplica. */
function dibujarPie(doc: jsPDF, y: number, hoja: HojaReporte, s: SeccionesDelPapel): void {
  const yy = asegurarEspacio(doc, y + 4, 8);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...GRIS);
  doc.text(textoDePdf(lineaDelPieDelPapel(hoja.data, s)), MARGEN, yy);
}

/**
 * El documento completo. **Una hoja nueva por empresa**: los reportes nunca se
 * pegan a media página, y el de una empresa jamás arrastra el de otra porque el
 * documento se arma SOLO con lo que llega en `hojas`. Quien no tiene ninguna
 * sección que aplique no sale.
 */
export function construirPdfComision(hojasPedidas: HojaReporte[]): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const conSecciones = hojasPedidas.map((h) => ({ hoja: h, s: seccionesDelPapel(h.data, h.vendedor) }));
  const hojas = conSecciones.filter((x) => entraAlPapel(x.s));

  if (hojas.length === 0) {
    cabecera(doc, hojasPedidas[0] ? encabezadoReporte(hojasPedidas[0]) : "Comisión");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...GRIS);
    doc.text(textoDePdf("Sin comisión que pagar en el período."), MARGEN, ALTO_CABECERA + 2);
  }

  hojas.forEach(({ hoja, s }, i) => {
    const titulo = encabezadoReporte(hoja);
    if (i > 0) doc.addPage();
    cabecera(doc, titulo);

    let y = dibujarNumero(doc, ALTO_CABECERA - 6, hoja, s);

    if (s.ventas) {
      const ventas = filasVentas(hoja.data);
      y = tituloSeccion(doc, y, "Ventas");
      autoTable(doc, {
        startY: y,
        margin: { top: ALTO_CONTINUACION, left: MARGEN, right: MARGEN, bottom: PIE },
        head: [[...COLUMNAS_VENTAS]],
        body: ventas.length
          ? ventas.map((f) => f.celdas.map(textoDePdf))
          : [["", "Sin ventas en el período.", "", "", ""]],
        columnStyles: {
          0: { cellWidth: 20 },
          1: { cellWidth: "auto" },
          2: { cellWidth: 28 },
          3: { cellWidth: 12, halign: "center" },
          4: { cellWidth: 26, halign: "right" },
        },
        didParseCell: (d) => {
          if (d.section === "body" && ventas[d.row.index]?.negativo) d.cell.styles.textColor = ROJO;
        },
        ...estilosDeTabla(),
      });
      y = finDeTabla(doc) + 4;
    }

    if (s.cobros) {
      const cobros = filasCobros(hoja.data);
      y = asegurarEspacio(doc, y + 2, 24);
      y = tituloSeccion(doc, y, "Cobros");
      autoTable(doc, {
        startY: y,
        margin: { top: ALTO_CONTINUACION, left: MARGEN, right: MARGEN, bottom: PIE },
        head: [[...COLUMNAS_COBROS]],
        body: cobros.length
          ? cobros.map((f) => f.celdas.map(textoDePdf))
          : [["", "Sin cobros en el período.", ""]],
        columnStyles: {
          0: { cellWidth: 20 },
          1: { cellWidth: "auto" },
          2: { cellWidth: 26, halign: "right" },
        },
        didParseCell: (d) => {
          if (d.section === "body" && cobros[d.row.index]?.negativo) d.cell.styles.textColor = ROJO;
        },
        ...estilosDeTabla(),
      });
      y = finDeTabla(doc) + 4;
    }

    dibujarPie(doc, y, hoja, s);
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
