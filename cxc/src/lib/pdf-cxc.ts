// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EL PAPEL DE CUENTAS POR COBRAR — UNO SOLO, CON EL BRANDBOOK DE LA CASA
// (8-sep-2026).
//
// 🩸 ERAN DOS PDF QUE SALÍAN DEL MISMO MENÚ Y NO SE PARECÍAN. El «Resumen»
// llevaba el encabezado de tabla casi BLANCO (`#F9FAFB`, letra gris) y el
// «Detallado» casi NEGRO (`#111827`, letra blanca); uno era vertical y el otro
// horizontal; uno traía cuatro cajas de totales y una barra de colores que el
// otro no. Dos documentos de la misma pantalla, el mismo día, con dos identidades.
//
// Ahora son **las dos descargas de Daniel** —«Total por cliente» y «Detallado
// por compañía»— y las dos comparten cabecera, pie, colores y tipografía:
//
//   · arriba a la izquierda el logo, y debajo en gris chico qué es y de qué empresa
//   · arriba a la derecha la fecha, y debajo `Hoja 2 de 6`
//   · encabezado de tabla en **navy `#1B3A5C`** (el mismo de los Excel), letra blanca
//   · filas alternadas muy suaves, montos a la derecha con cifras de ancho fijo
//   · Total en fila destacada con borde superior navy
//   · pie: `Confidencial` a la izquierda, `fashiongr.com` a la derecha
//
// 🔴 LOS RÓTULOS DE LOS TRAMOS NO SE ESCRIBEN ACÁ: salen de `tramoLabel()`, la
// misma función que rotula las píldoras de la pantalla, las columnas de la tabla
// y las tarjetas del celular. Este papel llegó a decir tres cosas distintas del
// mismo tramo en el mismo documento («Corriente», «Vigilancia», «+121d»); nada
// de eso vuelve mientras el nombre se derive.
//
// 🔴 Y QUÉ SE IMPRIME LO DECIDE `lib/cxc/descargas.ts`, no este archivo: acá solo
// se dibuja. Ahí vive quién va en cada bloque —los que se cobran y los de saldo
// a favor—, el nombre capitalizado y —lo que costó un papel que se contradecía a
// sí mismo— qué empresas se listan.
// ─────────────────────────────────────────────────────────────────────────────
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { CASA_GRUPO, type CasaDelPapel } from "@/lib/cxc/casa-del-papel";
import { tramoLabel } from "@/lib/cxc-aging";
import { fmtDate } from "@/lib/format";
import type { BloqueCliente, FilaCliente } from "@/lib/cxc/descargas";
import {
  ROTULO_TOTAL_GENERAL,
  ROTULO_TOTAL_POR_COBRAR,
  rotuloSaldoAFavor,
  totalDeLasFilas,
  totalGeneral,
} from "@/lib/cxc/descargas";

// El nombre del tramo se importa, no se copia (ver el 🔴 de arriba).
const tramo = tramoLabel;

/** Navy de la casa — el MISMO `pri` de `CASA_PALETTE` en `excel-export.ts`. */
const NAVY: [number, number, number] = [27, 58, 92];
const TINTA: [number, number, number] = [17, 24, 39];
const GRIS: [number, number, number] = [107, 114, 128];
const GRIS_CLARO: [number, number, number] = [156, 163, 175];
const CEBRA: [number, number, number] = [248, 249, 249];

const MARGEN = 19;
/** Dónde arranca la tabla: debajo de la cabecera, en todas las hojas. */
const ALTO_CABECERA = 32;

function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function dinero(n: number) {
  return `$${fmt(n)}`;
}

/**
 * La cabecera de CADA hoja: logo, qué es, de qué empresa y la fecha.
 *
 * El `Hoja N de M` NO se dibuja acá: cuántas hojas hay recién se sabe al final
 * (ver `piePorHoja`).
 */
// 🔴 LA CASA DEL PAPEL (23-sep-2026). Hasta hoy el logo, el membrete y el pie
// eran los de Fashion Group, escritos acá. Desde que la cartera de Boston se
// baja por la MISMA pantalla, la casa entra como opción (`opts.casa`) y sale de
// `lib/cxc/casa-del-papel.ts`: Boston firma como Boston, sin el logo del grupo
// y sin `fashiongr.com` en el pie. Sin `casa`, el grupo, como siempre.
function cabecera(doc: jsPDF, subtitulo: string, hoy: string, casa: CasaDelPapel) {
  const w = doc.internal.pageSize.getWidth();

  let anchoLogo = 0;
  if (casa.logo) {
    try {
      doc.addImage(casa.logo.base64, "JPEG", MARGEN, 10, casa.logo.width, casa.logo.height);
      anchoLogo = casa.logo.width;
    } catch { /* sin logo el papel sale igual: nunca se cae por una imagen */ }
  }

  const x = MARGEN + anchoLogo + (anchoLogo ? 3 : 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...TINTA);
  doc.text(casa.membrete, x, 17);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...GRIS);
  doc.text(subtitulo, x, 22);

  doc.setFontSize(9);
  doc.setTextColor(...TINTA);
  doc.text(fmtDate(hoy), w - MARGEN, 17, { align: "right" });

  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.4);
  doc.line(MARGEN, 26, w - MARGEN, 26);
}

/** `Hoja N de M` arriba a la derecha y el pie, en todas las hojas. */
function piePorHoja(doc: jsPDF, casa: CasaDelPapel) {
  const hojas = doc.getNumberOfPages();
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= hojas; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...GRIS);
    doc.text(`Hoja ${i} de ${hojas}`, w - MARGEN, 22, { align: "right" });

    doc.setFontSize(7);
    doc.setTextColor(...GRIS_CLARO);
    // `casa.pie` es «Confidencial · fashiongr.com» para el grupo y solo
    // «Confidencial» para Boston: a la izquierda lo primero, a la derecha el resto.
    const [izquierda, ...resto] = casa.pie.split(" · ");
    doc.text(izquierda, MARGEN, h - 10);
    if (resto.length) doc.text(resto.join(" · "), w - MARGEN, h - 10, { align: "right" });
  }
}

/** Los estilos de tabla que comparten los dos papeles. */
function estilosDeTabla() {
  return {
    styles: { font: "helvetica" as const, fontSize: 8, cellPadding: 2, textColor: TINTA },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255] as [number, number, number], fontStyle: "bold" as const, fontSize: 7.5 },
    alternateRowStyles: { fillColor: CEBRA },
    // El Total va destacado y con borde superior navy: es una fila que se lee
    // sola, no la última de la lista.
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

type Celda = string | { content: string; colSpan?: number; styles?: Record<string, unknown> };

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EL SALDO A FAVOR TIENE SU PROPIO BLOQUE, Y EL PAPEL CIERRA CON EL TOTAL DE
// LA PANTALLA (20-sep-2026).
//
// 🩸 El papel decía **$4.244.028,67** y la pantalla **$4.242.821,12**. La
// diferencia, **$1.207,55**, son los **5 clientes con saldo a favor**, que la
// pantalla muestra en su bloque «SALDO A FAVOR (5)» y del papel desaparecían sin
// que nada lo dijera.
//
// Ahora el papel lleva, en ESE orden: los que se cobran · «Total por cobrar» ·
// el bloque «Saldo a favor (N)» · y al pie el «Total general», que es el número
// de la pantalla. Sin nadie a favor el papel sale EXACTAMENTE como antes, con su
// única fila «Total».
// ─────────────────────────────────────────────────────────────────────────────

/** Fondo del renglón que encabeza un bloque. */
const FONDO_BLOQUE: [number, number, number] = [237, 242, 247];

/** La fila que suma un bloque: rótulo a la derecha y los cuatro montos en negrita. */
function filaDeSuma(rotulo: string, t: { t0: number; t1: number; t2: number; total: number }): Celda[] {
  const negrita = { fontStyle: "bold", halign: "right" };
  return [
    "",
    { content: rotulo, styles: negrita },
    { content: dinero(t.t0), styles: negrita },
    { content: dinero(t.t1), styles: negrita },
    { content: dinero(t.t2), styles: negrita },
    { content: dinero(t.total), styles: negrita },
  ];
}

/** El renglón que abre el bloque «Saldo a favor (N)», ancho de toda la tabla. */
function tituloSaldoAFavor(cuantos: number): Celda[] {
  return [
    {
      content: rotuloSaldoAFavor(cuantos),
      colSpan: 6,
      styles: { fontStyle: "bold", fillColor: FONDO_BLOQUE, textColor: NAVY },
    },
  ];
}

/**
 * El pie del papel. Con saldo a favor son DOS números —lo que se cobra y el
 * total general—; sin nadie a favor, el «Total» de siempre y nada más.
 */
function pieDelPapel(
  porCobrar: { t0: number; t1: number; t2: number; total: number }[],
  aFavor: { t0: number; t1: number; t2: number; total: number }[],
): Celda[][] {
  const t = totalDeLasFilas(porCobrar);
  if (aFavor.length === 0) {
    return [["", "Total", dinero(t.t0), dinero(t.t1), dinero(t.t2), dinero(t.total)]];
  }
  const g = totalGeneral(porCobrar, aFavor);
  return [["", ROTULO_TOTAL_GENERAL, dinero(g.t0), dinero(g.t1), dinero(g.t2), dinero(g.total)]];
}

// ─────────────────────────────────────────────────────────────────────────────
// 1 · «Total por cliente» — un renglón por cliente
// ─────────────────────────────────────────────────────────────────────────────

export function pdfTotalPorCliente(
  filas: FilaCliente[],
  aFavor: FilaCliente[],
  opts: { subtitulo: string; archivo: string; hoy: string; casa?: CasaDelPapel },
): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const casa = opts.casa ?? CASA_GRUPO;

  const renglon = (f: FilaCliente): Celda[] =>
    [f.codigo, f.nombre, dinero(f.t0), dinero(f.t1), dinero(f.t2), dinero(f.total)];

  const cuerpo: Celda[][] = filas.map(renglon);
  if (aFavor.length > 0) {
    cuerpo.push(filaDeSuma(ROTULO_TOTAL_POR_COBRAR, totalDeLasFilas(filas)));
    cuerpo.push(tituloSaldoAFavor(aFavor.length));
    for (const f of aFavor) cuerpo.push(renglon(f));
  }

  autoTable(doc, {
    startY: ALTO_CABECERA,
    margin: { top: ALTO_CABECERA, left: MARGEN, right: MARGEN, bottom: 18 },
    head: [["Código", "Cliente", tramo("current"), tramo("watch"), tramo("overdue"), "Total"]],
    body: cuerpo,
    foot: pieDelPapel(filas, aFavor),
    columnStyles: {
      0: { cellWidth: 18 },
      1: { cellWidth: "auto" },
      2: { halign: "right", cellWidth: 24 },
      3: { halign: "right", cellWidth: 24 },
      4: { halign: "right", cellWidth: 24 },
      5: { halign: "right", cellWidth: 26, fontStyle: "bold" },
    },
    ...estilosDeTabla(),
    didDrawPage: () => cabecera(doc, opts.subtitulo, opts.hoy, casa),
  });

  piePorHoja(doc, casa);
  doc.save(opts.archivo);
  return doc;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2 · «Detallado por compañía» — las compañías ADENTRO del cliente, y la suma
//     del cliente ABAJO de sus compañías
// ─────────────────────────────────────────────────────────────────────────────

export function pdfPorCompania(
  bloques: BloqueCliente[],
  aFavor: BloqueCliente[],
  opts: { subtitulo: string; archivo: string; hoy: string; casa?: CasaDelPapel },
): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const casa = opts.casa ?? CASA_GRUPO;

  const cuerpo: Celda[][] = [];
  const dibujarBloque = (b: BloqueCliente) => {
    // El nombre del cliente ENCABEZA su bloque.
    cuerpo.push([
      { content: b.codigo, styles: { fontStyle: "bold", fillColor: FONDO_BLOQUE } },
      { content: b.nombre, colSpan: 5, styles: { fontStyle: "bold", fillColor: FONDO_BLOQUE } },
    ]);
    for (const e of b.empresas) {
      cuerpo.push(["", e.empresa, dinero(e.t0), dinero(e.t1), dinero(e.t2), dinero(e.total)]);
    }
    // …y la suma del cliente va ABAJO de sus compañías, nunca arriba.
    cuerpo.push(filaDeSuma(`Total ${b.nombre}`, b));
  };

  for (const b of bloques) dibujarBloque(b);
  if (aFavor.length > 0) {
    cuerpo.push(filaDeSuma(ROTULO_TOTAL_POR_COBRAR, totalDeLasFilas(bloques)));
    cuerpo.push(tituloSaldoAFavor(aFavor.length));
    for (const b of aFavor) dibujarBloque(b);
  }

  autoTable(doc, {
    startY: ALTO_CABECERA,
    margin: { top: ALTO_CABECERA, left: MARGEN, right: MARGEN, bottom: 18 },
    head: [["Código", "Cliente / Compañía", tramo("current"), tramo("watch"), tramo("overdue"), "Total"]],
    body: cuerpo,
    foot: pieDelPapel(bloques, aFavor),
    columnStyles: {
      0: { cellWidth: 18 },
      1: { cellWidth: "auto" },
      2: { halign: "right", cellWidth: 24 },
      3: { halign: "right", cellWidth: 24 },
      4: { halign: "right", cellWidth: 24 },
      5: { halign: "right", cellWidth: 26 },
    },
    ...estilosDeTabla(),
    didDrawPage: () => cabecera(doc, opts.subtitulo, opts.hoy, casa),
  });

  piePorHoja(doc, casa);
  doc.save(opts.archivo);
  return doc;
}
