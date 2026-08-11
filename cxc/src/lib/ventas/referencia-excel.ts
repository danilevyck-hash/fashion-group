// Export Excel del tab "Referencia" (/ventas) — UNA FILA POR COMPRA, las
// mismas columnas que la pantalla y en el mismo orden. Daniel pidió poder
// bajar la tabla; si el Excel dijera otra cosa que la pantalla, tendríamos dos
// verdades.
//
// Estilo de la casa: src/lib/excel-export.ts (regla del repo). Construcción del
// sheet PURA (sin DOM) — testeable.
//
// 🔴 El FOB se muestra TAL CUAL viene, con su origen al lado. En el 86% de las
// líneas Switch lo manda IGUAL al CIF: es un error de carga conocido del lado
// de Daniel y NO se corrige ni se estima — la columna "FOB de dónde" es la que
// le dice a cuál creerle. Fashion Shoes es la única donde se estima (no trae
// desglose), y se dice.

import {
  textoMesesVendidos,
  type ArticuloCompras,
  type CompraMedida,
  type OrigenFob,
  type ResumenArticulo,
} from "./compras";

export function textoOrigenFob(o: OrigenFob): string {
  switch (o) {
    case "real":
      return "de Switch";
    case "igual-al-cif":
      return "igual al CIF (revisar)";
    case "estimado":
      return "estimado (CIF ÷ 1,10)";
    case "sin-dato":
      return "—";
  }
}

/**
 * "54 u en 7 meses" — CUÁNTO se vendió de esta llegada y en cuánto tiempo. El
 * MISMO texto que la pantalla.
 *
 * 🩸 ANTES DECÍA "te quedan 126" Y ESO ERA UN DEFECTO. Daniel, mirando la
 * pantalla publicada: *"me sale dos veces mi inv, esta bien? que opinas? y no
 * me esta diciendo cuanto vendi y cuantos meses"*. En una tanda viva esta celda
 * repetía exactamente el número de la columna QUEDA, al lado, y a cambio se
 * comía el único dato que él vino a buscar. El inventario se dice UNA vez, en
 * QUEDA; acá van las UNIDADES VENDIDAS.
 *
 * Los meses son lo que corresponde a cada caso, y los dos son hechos, no
 * promedios:
 *   · tanda ya acabada → lo que tardó en venderse (hasta el 90%);
 *   · tanda viva → lo que lleva en la casa desde que llegó. Medido en
 *     `QD3958033`: llegó el 26-dic-2025, van 54 vendidas, y saber que hace 7
 *     meses que está es justamente el dato de la decisión.
 * Que la tanda esté viva o no se lee en QUEDA: si queda algo, sigue corriendo.
 */
export function textoSeVendio(c: CompraMedida): string {
  if (c.estado === "sin-ventas") return "todavía no vendió";
  // Una tanda que no vendió NI UNA en los meses que lleva acá: "0 u" se lee
  // como un dato que faltó cargar, y el tiempo es justo lo que hay que ver.
  if (c.vendidas === 0) return `nada en ${textoMeses(mesesDeCompra(c))}`;
  return `${c.vendidas.toLocaleString("en-US")} u en ${textoMeses(mesesDeCompra(c))}`;
}

/** Los meses que le corresponden a la fila: lo que TARDÓ si ya se acabó, lo que
 *  LLEVA en la casa si sigue viva. Una sola definición para la pantalla y el
 *  Excel — si difirieran, la misma compra tendría dos duraciones. */
export function mesesDeCompra(c: CompraMedida): number | null {
  if (c.estado === "sin-ventas") return null;
  return c.estado === "viva" ? c.mesesTranscurridos : c.meses;
}

export function textoMeses(meses: number | null): string {
  if (meses == null) return "—";
  const n = Math.round(meses);
  if (n <= 0) return "menos de 1 mes";
  return n === 1 ? "1 mes" : `${n} meses`;
}

/**
 * El resumen del artículo, en UNA frase. Misma definición para la pantalla y
 * para el Excel — si dijeran cosas distintas tendríamos dos verdades.
 *
 * "Ya se acabaron 2 compras: 480 u en 15 meses" · "Ya se acabó 1 compra: 240 u
 * en 7 meses" · "Todavía no se ha acabado ninguna compra".
 *
 * 🔴 Las unidades van AL LADO de los meses, JAMÁS divididas. Ver la nota de
 * compras.ts: dividir da los 14.899 u/mes que sacó la medición de 300 códigos.
 * Y no hay promedio: el de `NB2570001` daría 11 meses, que no es ninguna de sus
 * dos tandas (7 y 15).
 */
export function textoAgotadas(r: ResumenArticulo): string {
  if (r.comprasAgotadas === 0) return "Todavía no se ha acabado ninguna compra";
  const cuantas = r.comprasAgotadas === 1 ? "Ya se acabó 1 compra" : `Ya se acabaron ${r.comprasAgotadas} compras`;
  return `${cuantas}: ${r.unidadesAgotadas.toLocaleString("en-US")} u en ${textoMeses(r.mesesAgotadas)}`;
}

export interface FilaCompraExcel {
  articulo: ArticuloCompras;
  compra: CompraMedida;
}

/** Aplana los artículos a una fila por compra. Un artículo SIN compra
 *  registrada deja igual su fila, diciéndolo — no se lo esconde. */
export function aplanar(articulos: readonly ArticuloCompras[]): FilaCompraExcel[] {
  const out: FilaCompraExcel[] = [];
  for (const a of articulos) {
    for (const c of a.compras) out.push({ articulo: a, compra: c });
  }
  return out;
}

export async function buildComprasSheet(
  articulos: readonly ArticuloCompras[],
  hoyMes: string,
): Promise<import("xlsx-js-style").WorkSheet> {
  const { buildReportSheet, MONEY_FMT, PCT_FMT } = await import("@/lib/excel-export");
  const filas = aplanar(articulos);
  const sinCompra = articulos.filter((a) => a.sinCompraRegistrada);

  return buildReportSheet({
    title: "FASHION GROUP — Compras y cuánto tardaron en venderse",
    subtitle:
      `${articulos.length} referencias · ${filas.length} compras · corte ${hoyMes} · ` +
      `"U. vendidas" son las unidades de ESA compra y "Meses" lo que tardó en venderse (hasta el 90%) ` +
      `o, si todavía le queda mercancía, lo que lleva desde que llegó · ` +
      `las notas de crédito ya están restadas · ` +
      `las 4 columnas del resumen son del ARTÍCULO ENTERO y se repiten en cada una de sus compras`,
    columns: [
      { header: "Referencia", wch: 18 },
      { header: "Descripción", wch: 28 },
      { header: "Empresa", wch: 15 },
      // ── Resumen del ARTÍCULO (se repite en cada fila del mismo código) ──
      { header: "En bodega (artículo)", wch: 18, align: "right", fmt: "#,##0" },
      { header: "Compras ya acabadas", wch: 18, align: "right", fmt: "#,##0" },
      { header: "U. ya acabadas", wch: 14, align: "right", fmt: "#,##0" },
      { header: "Meses vendiéndolas", wch: 18, align: "right", fmt: "#,##0.0" },
      // ── La compra ──
      { header: "Llegó", wch: 12 },
      { header: "Cuánto", wch: 9, align: "right", fmt: "#,##0" },
      // Unidades y meses van en columnas NUMÉRICAS separadas: en el Excel
      // Daniel ordena y filtra por ellas, y "54 u en 7 meses" como texto no se
      // puede ordenar. En pantalla es una sola celda.
      { header: "U. vendidas", wch: 12, align: "right", fmt: "#,##0" },
      { header: "Meses", wch: 8, align: "right", fmt: "#,##0.0" },
      { header: "Queda", wch: 8, align: "right", fmt: "#,##0" },
      { header: "Meses en que vendió", wch: 42 },
      { header: "CIF", wch: 10, align: "right", fmt: MONEY_FMT },
      { header: "FOB", wch: 10, align: "right", fmt: MONEY_FMT },
      { header: "FOB de dónde", wch: 22 },
      { header: "Lista", wch: 10, align: "right", fmt: MONEY_FMT },
      { header: "Salió a", wch: 10, align: "right", fmt: MONEY_FMT },
      { header: "Desc.", wch: 8, align: "right", fmt: PCT_FMT },
      { header: "Proveedor", wch: 26 },
      { header: "Documento", wch: 16 },
      { header: "Nota", wch: 38 },
    ],
    rows: [
      ...filas.map(({ articulo, compra }) => [
        articulo.codigo,
        articulo.descripcion || "—",
        articulo.empresa || "—",
        ...resumenCeldas(articulo.resumen),
        compra.fecha,
        compra.unidades,
        compra.vendidas,
        mesesDeCompra(compra) != null ? Number(mesesDeCompra(compra)!.toFixed(1)) : null,
        compra.quedan,
        textoMesesVendidos(compra.mesesConVenta, hoyMes) || "—",
        compra.costos.cif,
        compra.costos.fob,
        textoOrigenFob(compra.costos.fobOrigen),
        compra.costos.lista,
        compra.precioVendido != null ? Number(compra.precioVendido.toFixed(2)) : null,
        compra.descuento != null ? Number(compra.descuento.toFixed(4)) : null,
        compra.proveedor || "—",
        compra.documento || "—",
        nota(articulo, compra),
      ]),
      // Las referencias sin NINGUNA compra registrada también bajan: que no
      // aparezcan haría pensar que no existen.
      ...sinCompra.map((a) => [
        a.codigo,
        a.descripcion || "—",
        a.empresa || "—",
        ...resumenCeldas(a.resumen),
        "—",
        null,
        null,
        null,
        a.existencia,
        "—",
        null,
        null,
        "—",
        null,
        null,
        null,
        "—",
        "—",
        `vendió ${a.cuadre.vendido} u, pero no hay ningún ingreso de mercancía cargado`,
      ]),
    ],
  });
}

/** Las 4 celdas del resumen del artículo. NÚMEROS, no texto: en el Excel Daniel
 *  ordena y filtra por ellas. Sin ninguna compra acabada van en blanco — un 0
 *  se leería como "tardó 0 meses". */
function resumenCeldas(r: ResumenArticulo): (number | null)[] {
  return [
    r.enBodega,
    r.comprasAgotadas,
    r.comprasAgotadas > 0 ? r.unidadesAgotadas : null,
    r.mesesAgotadas != null ? Number(r.mesesAgotadas.toFixed(1)) : null,
  ];
}

function nota(a: ArticuloCompras, c: CompraMedida): string {
  const partes: string[] = [];
  if (a.cuadre.ajusteConfiable && c.noVendidoNiEnBodega > 0) {
    partes.push(`de las ${c.unidades}, ${c.noVendidoNiEnBodega} se perdió en ajuste`);
  }
  if (a.vendidoAntes > 0) partes.push(`${a.vendidoAntes} u vendidas antes de la primera compra`);
  if (a.vendidoDeMas > 0) partes.push(`${a.vendidoDeMas} u vendidas de más`);
  return partes.join(" · ") || "";
}

export async function exportComprasToExcel(
  articulos: readonly ArticuloCompras[],
  hoyMes: string,
): Promise<void> {
  const ws = await buildComprasSheet(articulos, hoyMes);
  const { workbookFromSheets, downloadWorkbook, exportFilename } = await import("@/lib/excel-export");
  downloadWorkbook(workbookFromSheets([{ name: "Compras", ws }]), exportFilename("ventas-compras"));
}
