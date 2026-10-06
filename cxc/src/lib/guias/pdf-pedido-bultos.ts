// ─────────────────────────────────────────────────────────────────────────────
// EL PAPEL DEL PEDIDO, CON SUS BULTOS (6-oct-2026, `PEDIDOS_BULTOS_2026_10`)
//
// 🔴 VA COMO EL PDF DE PEDIDO DE SWITCH, NO AGRUPADO POR BULTO (Daniel,
// 6-oct-2026, mandando el papel de muestra `PEDIDO 16-000002275`). Mismas
// columnas y mismo orden que ahí, **sin «Código barra»**, y el Bulto al final:
//
//     Código · Referencia · Descripción · Cant. · Precio · Total · Bulto
//
// 🩸 El primer borrador agrupaba por bulto («Bulto 1: artículo · cantidad») y lo
// descartó: bodega compara este papel contra el de Switch renglón por renglón, y
// para eso los dos tienen que leerse igual. El bulto se lee en SU columna.
//
// Del resto manda el estilo único de la casa (`pdf-estilo.ts`, `docs/marca.md`):
// logo arriba a la izquierda, título en el azul de la casa, raya dorada,
// encabezado de tabla LLENO en ese azul con letra blanca, sin rayas verticales ni
// cebra, números a la derecha, el mismo pie y margen de 16 mm.
//
// 🔴 Y AL PIE, QUIÉN MARCÓ CADA PASO: «Preparado por Julio · 10:42 a. m.» /
// «Verificado por Angela · 11:15 a. m.». Es el control de los dos pares de ojos, así
// que tiene que quedar impreso, no solo en la pantalla.
//
// 🔑 Los números son los de Switch: `total` viene calculado por él, con sus
// descuentos, y no se recalcula (la regla de la casa en todo el repo).
//
// 🔑 El papel cuesta las LÍNEAS, nunca los bultos: lo medido fue 416 bultos con
// 56 líneas, y esto es UNA tabla de 56 renglones.
// ─────────────────────────────────────────────────────────────────────────────

import jsPDF from "jspdf";
import autoTable from "@/lib/pdf-tabla";
import {
  MARGEN_PAPEL,
  PAPEL,
  PIE_PAPEL,
  cabeceraPapel,
  piePapel,
  sinMayusculas,
} from "@/lib/pdf-estilo";
import {
  descripcionCompleta,
  firmasEnOrden,
  resumenAsignacion,
  tituloPapelBultos,
  type FirmasPedido,
  type LineaPedido,
} from "./pedidos-bultos";

/** Las columnas del papel de Switch, sin «Código barra» y con «Bulto» al final. */
export const COLUMNAS_PAPEL_BULTOS = [
  "Código",
  "Referencia",
  "Descripción",
  "Cant.",
  "Precio",
  "Total",
  "Bulto",
] as const;

const SIN_BULTO = "—";

const cantidad = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
const monto = (n: number) => n.toFixed(2);

export interface PapelDeBultos {
  secuencial: string;
  empresa: string;
  cliente: string;
  lineas: readonly LineaPedido[];
  /** Quién marcó cada paso. Sin firmas, el pie no se dibuja. */
  firmas?: FirmasPedido;
}

/** El pedido entero en una tabla, en el orden de Switch, con su columna Bulto. */
export function construirPdfPedidoBultos(p: PapelDeBultos): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const y = cabeceraPapel(doc, {
    titulo: tituloPapelBultos(p.secuencial, p.empresa, sinMayusculas(p.cliente)),
    subtitulo: resumenAsignacion(p.lineas),
  });

  const body = p.lineas.map((l) => [
    l.codigo,
    // ⚠️ El API de Switch no manda la referencia (medido): la celda va vacía
    // antes que repetir el código y hacerla pasar por otro dato.
    l.referencia ?? "",
    descripcionCompleta(l),
    cantidad(l.cantidad),
    monto(l.precio),
    monto(l.total),
    l.bulto == null ? SIN_BULTO : String(l.bulto),
  ]);

  autoTable(doc, {
    startY: y,
    margin: { top: MARGEN_PAPEL, left: MARGEN_PAPEL, right: MARGEN_PAPEL, bottom: PIE_PAPEL },
    head: [[...COLUMNAS_PAPEL_BULTOS]],
    body: body.length > 0 ? body : [["", "", "Este pedido todavía no tiene artículos", "", "", "", ""]],
    styles: { font: "helvetica", fontSize: 8, cellPadding: 1.6, valign: "middle" },
    columnStyles: {
      0: { cellWidth: 24 },
      1: { cellWidth: 26 },
      3: { cellWidth: 13, halign: "right" },
      4: { cellWidth: 16, halign: "right" },
      5: { cellWidth: 18, halign: "right" },
      6: { cellWidth: 14, halign: "right", fontStyle: "bold" },
    },
    didParseCell: (d) => {
      // El bulto en el azul de la casa; lo que falta por asignar, en rojo, que
      // es el color de lo que hay que mirar.
      if (d.section !== "body" || d.column.index !== 6) return;
      d.cell.styles.textColor = String(d.cell.raw ?? "") === SIN_BULTO ? PAPEL.rojo : PAPEL.azul;
    },
  });

  firmasAlPie(doc, p.firmas);
  piePapel(doc);
  return doc;
}

/**
 * Las dos firmas, en la ÚLTIMA hoja y encima del pie de la casa. Solo sale la
 * del paso que de verdad ocurrió: un papel no firma por nadie.
 */
function firmasAlPie(doc: jsPDF, firmas: FirmasPedido | undefined): void {
  const lineas = firmas ? firmasEnOrden(firmas) : [];
  if (lineas.length === 0) return;
  const alto = doc.internal.pageSize.getHeight();
  doc.setPage(doc.getNumberOfPages());
  let y = alto - PIE_PAPEL - 4 - (lineas.length - 1) * 4.4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...PAPEL.grisOscuro);
  for (const t of lineas) {
    doc.text(t, MARGEN_PAPEL, y);
    y += 4.4;
  }
}
