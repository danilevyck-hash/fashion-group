// ─────────────────────────────────────────────────────────────────────────────
// EL PAPEL DE LOS BULTOS DE UN PEDIDO (6-oct-2026, `PEDIDOS_BULTOS_2026_10`)
//
// Daniel, regla 5: «un papel ordenado por bulto, "Bulto 1: artículo · cantidad",
// con el estilo de papel de la casa». Así que sale por `pdf-estilo.ts` como
// todos los demás: logo arriba a la izquierda, título en el azul de la casa,
// raya dorada, encabezado de tabla LLENO en ese azul con letra blanca, sin
// rayas verticales ni cebra, números a la derecha, el mismo pie y margen de
// 16 mm. Colores, SOLO de `docs/marca.md` (candado `papeles-paleta-unica`).
//
// 🔑 UNA SOLA TABLA, NO UNA POR BULTO. Lo medido: un envío real llevó **416
// bultos**. Una llamada a `autoTable` por bulto serían 416 tablas en una hoja
// carta — minutos de dibujo y el salto de hoja mal calculado. Acá el BULTO es
// una columna que se escribe UNA vez por grupo, así que el papel cuesta lo que
// cuesten las LÍNEAS (56 medidas), no lo que cuesten los bultos.
//
// 🔴 EL PAPEL NO CALLA LO QUE FALTA: si quedan artículos sin bulto, salen al
// final bajo «Sin bulto todavía». Una hoja que se lleva bodega no puede esconder
// mercancía sin asignar.
//
// 🔑 Talla y color van DENTRO de la descripción (Switch no los manda aparte) y
// así se imprimen, sin partirlos.
//
// 🩸 LA CANTIDAD SE DICE UNA SOLA VEZ. El primer borrador escribía «artículo ·
// cantidad» en la columna Artículo Y además la columna Cantidad: el 12 salía
// dos veces en el mismo renglón (`docs/diseno.md`, regla 8: sin datos
// repetidos). Daniel pidió «Bulto 1: artículo · cantidad», que es lo que las
// TRES columnas dicen —y así los números quedan alineados a la derecha, como
// en todos los papeles de la casa—.
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
  bultosDelPapel,
  resumenAsignacion,
  sinBulto,
  tituloPapelBultos,
  type LineaPedido,
} from "./pedidos-bultos";

/** Las tres columnas del papel: el bulto, qué lleva y cuánto. */
export const COLUMNAS_PAPEL_BULTOS = ["Bulto", "Artículo", "Cantidad"] as const;

const ROTULO_SIN_BULTO = "Sin bulto todavía";

const cantidad = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

export interface PapelDeBultos {
  secuencial: string;
  empresa: string;
  cliente: string;
  lineas: readonly LineaPedido[];
}

/**
 * Una hoja (o las que haga falta) con los bultos del pedido, del 1 al último.
 * El número del bulto se escribe en su PRIMER renglón y el resto del grupo lo
 * deja en blanco: así se lee como una lista y no como una columna repetida.
 */
export function construirPdfPedidoBultos(p: PapelDeBultos): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const y = cabeceraPapel(doc, {
    titulo: tituloPapelBultos(p.secuencial, p.empresa, sinMayusculas(p.cliente)),
    subtitulo: resumenAsignacion(p.lineas),
  });

  const body: string[][] = [];
  for (const g of bultosDelPapel(p.lineas)) {
    g.lineas.forEach((l, i) => {
      body.push([i === 0 ? `Bulto ${g.bulto}` : "", l.descripcion, cantidad(l.cantidad)]);
    });
  }
  // Lo que falta, al final y con su nombre: el papel no esconde mercancía.
  const faltan = sinBulto(p.lineas);
  faltan.forEach((l, i) => {
    body.push([i === 0 ? ROTULO_SIN_BULTO : "", l.descripcion, cantidad(l.cantidad)]);
  });

  autoTable(doc, {
    startY: y,
    margin: { top: MARGEN_PAPEL, left: MARGEN_PAPEL, right: MARGEN_PAPEL, bottom: PIE_PAPEL },
    head: [[...COLUMNAS_PAPEL_BULTOS]],
    body: body.length > 0 ? body : [["", "Este pedido todavía no tiene artículos", ""]],
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 1.8, valign: "middle" },
    columnStyles: {
      0: { cellWidth: 26, fontStyle: "bold" },
      2: { cellWidth: 20, halign: "right" },
    },
    didParseCell: (d) => {
      // El rótulo del grupo en el azul de la casa; «Sin bulto todavía», en rojo,
      // que es el color de lo que hay que mirar.
      if (d.section !== "body" || d.column.index !== 0) return;
      const t = String(d.cell.raw ?? "");
      if (t === ROTULO_SIN_BULTO) d.cell.styles.textColor = PAPEL.rojo;
      else if (t) d.cell.styles.textColor = PAPEL.azul;
    },
  });

  piePapel(doc);
  return doc;
}
