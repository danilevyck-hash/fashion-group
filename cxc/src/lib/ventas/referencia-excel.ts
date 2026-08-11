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

/** "16 meses" / "te quedan 89" — el MISMO texto que la pantalla. */
export function textoSeVendioEn(c: CompraMedida): string {
  switch (c.estado) {
    case "medida":
      return textoMeses(c.meses);
    case "viva":
      return `te quedan ${c.quedan}`;
    case "sin-ventas":
      return "todavía no vendió";
    case "cerrada-sin-90":
      return textoMeses(c.meses);
  }
}

export function textoMeses(meses: number | null): string {
  if (meses == null) return "—";
  const n = Math.round(meses);
  if (n <= 0) return "menos de 1 mes";
  return n === 1 ? "1 mes" : `${n} meses`;
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
      `"se vendió en" se mide hasta el 90% vendido · las notas de crédito ya están restadas`,
    columns: [
      { header: "Referencia", wch: 18 },
      { header: "Descripción", wch: 28 },
      { header: "Empresa", wch: 15 },
      { header: "Llegó", wch: 12 },
      { header: "Cuánto", wch: 9, align: "right", fmt: "#,##0" },
      { header: "Se vendió en", wch: 16 },
      { header: "Queda", wch: 8, align: "right", fmt: "#,##0" },
      { header: "Meses en que vendió", wch: 42 },
      { header: "CIF", wch: 10, align: "right", fmt: MONEY_FMT },
      { header: "FOB", wch: 10, align: "right", fmt: MONEY_FMT },
      { header: "FOB de dónde", wch: 22 },
      { header: "Lista", wch: 10, align: "right", fmt: MONEY_FMT },
      { header: "Vendido", wch: 10, align: "right", fmt: MONEY_FMT },
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
        compra.fecha,
        compra.unidades,
        textoSeVendioEn(compra),
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
        "—",
        null,
        "sin compra registrada",
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
