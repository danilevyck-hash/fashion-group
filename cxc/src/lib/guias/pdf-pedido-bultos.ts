// ─────────────────────────────────────────────────────────────────────────────
// EL PAPEL DEL PEDIDO, CON SUS BULTOS (6-oct-2026, `PEDIDOS_BULTOS_2026_10`)
//
// 🔴 VA COMO EL PDF DE PEDIDO DE SWITCH, NO AGRUPADO POR BULTO (Daniel,
// 6-oct-2026, mandando el papel de muestra `PEDIDO 16-000002275`). Mismas
// columnas y mismo orden que ahí, **sin «Código barra»** ni «Referencia» —que
// Switch no manda—, y el **Bulto PRIMERO** —«es lo que bodega llena, así que
// manda», al aprobar—:
//
//     Bulto · Código · Descripción · Cant. · Precio · Total
//
// 🔴 EL PAPEL SIEMPRE LLEVA PRECIO Y TOTAL, LO IMPRIMA QUIEN LO IMPRIMA
// (Daniel, 6-oct-2026) — también bodega, que en pantalla no los ve. Por eso el
// papel se dibuja en el SERVIDOR (`/api/guias/pedidos/detalle/papel`): así los
// números entran al PDF sin pasar nunca por el navegador de bodega.
//
// El papel y la pantalla van con el MISMO orden a propósito: bodega las compara
// una contra otra, y dos órdenes distintos obligan a buscar la columna cada vez.
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
import { asegurarEspacio, finDeTabla } from "@/lib/comisiones/pdf-chrome";
import {
  descripcionCompleta,
  firmasEnOrden,
  renglonesDelPie,
  resumenAsignacion,
  tituloPapelBultos,
  totalesDelPedido,
  type FirmasPedido,
  type LineaPedido,
} from "./pedidos-bultos";

/** Las columnas del papel de Switch, sin «Código barra» y con «Bulto» al final. */
export const COLUMNAS_PAPEL_BULTOS = [
  "Bulto",
  "Código",
  "Descripción",
  "Cant.",
  "Precio",
  "Total",
] as const;

/** 🔴 «A veces el cliente pide con precio y sin precio» (Daniel, 6-oct-2026). */
export const COLUMNAS_PAPEL_SIN_PRECIOS = COLUMNAS_PAPEL_BULTOS.filter(
  (c) => c !== "Precio" && c !== "Total",
);

const SIN_BULTO = "—";

const cantidad = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
const monto = (n: number | null) => (n == null ? "" : n.toFixed(2));

export interface PapelDeBultos {
  secuencial: string;
  empresa: string;
  cliente: string;
  lineas: readonly LineaPedido[];
  /** Quién marcó cada paso. Sin firmas, el pie no se dibuja. */
  firmas?: FirmasPedido;
  /**
   * 🔴 Subtotal · ITBMS · Total **como los manda Switch**. Lo que falte no se
   * dibuja: un ITBMS inventado sería un número fiscal falso.
   */
  deSwitch?: { subtotal?: number | null; impuesto?: number | null; total?: number | null };
  /**
   * 🔴 Las DOS formas de imprimir (Daniel, 6-oct-2026): *«a veces el cliente
   * pide con precio y sin precio»*. `false` saca las columnas Precio y Total y
   * deja solo el total de unidades.
   */
  conPrecios?: boolean;
}

/** El pedido entero en una tabla, en el orden de Switch, con su columna Bulto. */
export function construirPdfPedidoBultos(p: PapelDeBultos): jsPDF {
  const conPrecios = p.conPrecios !== false;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const y = cabeceraPapel(doc, {
    titulo: tituloPapelBultos(p.secuencial, p.empresa, sinMayusculas(p.cliente)),
    subtitulo: resumenAsignacion(p.lineas),
  });

  const body = p.lineas.map((l) => {
    const fila = [
      l.bulto == null ? SIN_BULTO : String(l.bulto),
      l.codigo,
      descripcionCompleta(l),
      cantidad(l.cantidad),
    ];
    // 🔴 Con precios, el papel SIEMPRE los lleva —se dibuja en el servidor, que
    // los lee aunque quien imprime no los vea en pantalla—. Sin precios, las dos
    // columnas no existen; no van vacías.
    return conPrecios ? [...fila, monto(l.precio), monto(l.total)] : fila;
  });

  // 🔴 EL PIE VA COMO EL DE SWITCH (Daniel mandó el PDF real): el bloque
  // Subtotal · ITBMS · Total a la derecha, y debajo «Cantidad de artículos».
  // Dentro de la tabla queda solo el total de UNIDADES, que es lo que cierra la
  // columna Cant.; los montos van en el bloque, como en el papel de Switch.
  const totales = totalesDelPedido(p.lineas, p.deSwitch);
  const pie = conPrecios
    ? [["", "", "", cantidad(totales.unidades), "", ""]]
    : [["", "", "", cantidad(totales.unidades)]];

  autoTable(doc, {
    startY: y,
    margin: { top: MARGEN_PAPEL, left: MARGEN_PAPEL, right: MARGEN_PAPEL, bottom: PIE_PAPEL },
    head: [conPrecios ? [...COLUMNAS_PAPEL_BULTOS] : [...COLUMNAS_PAPEL_SIN_PRECIOS]],
    body: body.length > 0 ? body : [["", "", "Este pedido no tiene artículos"]],
    foot: body.length > 0 ? pie : undefined,
    styles: { font: "helvetica", fontSize: 8, cellPadding: 1.6, valign: "middle" },
    // 🔴 La descripción no suele ser larga (Daniel, 6-oct-2026): se le pone un
    // ancho propio y el sobrante se reparte entre las demás, en vez de dejar que
    // se lo quede todo por ser la única columna «auto».
    columnStyles: conPrecios
      ? {
          0: { cellWidth: 20, halign: "right", fontStyle: "bold" },
          1: { cellWidth: 34 },
          2: { cellWidth: 62 },
          3: { cellWidth: 20, halign: "right" },
          4: { cellWidth: 23, halign: "right" },
          5: { cellWidth: 25, halign: "right" },
        }
      : {
          0: { cellWidth: 26, halign: "right", fontStyle: "bold" },
          1: { cellWidth: 44 },
          2: { cellWidth: 88 },
          3: { cellWidth: 26, halign: "right" },
        },
    didParseCell: (d) => {
      // El bulto en el azul de la casa; lo que falta por asignar, en rojo, que
      // es el color de lo que hay que mirar.
      if (d.section !== "body" || d.column.index !== 0) return;
      d.cell.styles.textColor = String(d.cell.raw ?? "") === SIN_BULTO ? PAPEL.rojo : PAPEL.azul;
    },
  });

  bloqueDeTotales(doc, totales, conPrecios);
  firmasAlPie(doc, p.firmas);
  piePapel(doc);
  return doc;
}

/**
 * El bloque de totales, copiado del papel de Switch: los montos alineados a la
 * derecha con su rótulo, y debajo «Cantidad de artículos».
 *
 * 🔴 Un renglón sin dato NO se dibuja. Si Switch todavía no mandó el ITBMS, el
 * papel no escribe «ITBMS: 0.00»: eso sería un número fiscal inventado.
 */
function bloqueDeTotales(doc: jsPDF, t: ReturnType<typeof totalesDelPedido>, conPrecios: boolean): void {
  const w = doc.internal.pageSize.getWidth();
  let y = finDeTabla(doc) + 7;
  y = asegurarEspacio(doc, y, 24);

  if (conPrecios) {
    doc.setFontSize(9);
    for (const r of renglonesDelPie(t)) {
      const ultimo = r.rotulo === "Total:";
      doc.setFont("helvetica", ultimo ? "bold" : "normal");
      doc.setTextColor(...(ultimo ? PAPEL.tinta : PAPEL.grisOscuro));
      doc.text(r.rotulo, w - MARGEN_PAPEL - 34, y, { align: "right" });
      doc.text(monto(r.monto), w - MARGEN_PAPEL, y, { align: "right" });
      y += 5;
    }
    y += 1;
  }

  // El mismo rótulo que usa Switch.
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...PAPEL.grisOscuro);
  doc.text(`Cantidad de artículos: ${cantidad(t.unidades)}`, MARGEN_PAPEL, y);
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
