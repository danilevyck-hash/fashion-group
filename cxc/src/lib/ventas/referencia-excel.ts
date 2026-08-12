// Export Excel del tab "Referencia" (/ventas).
//
// 🔴 DOS HOJAS, Y LA PRIMERA ES LA PANTALLA. Daniel usa este tab para HACER
// PEDIDO y después *"escribe la cantidad en un Excel"*, así que el archivo tiene
// que traer la respuesta, no la materia prima:
//   · Hoja "Referencia" — UNA FILA POR ARTÍCULO: cuántas compras hay y cuándo
//     llegó la última, el precio real, el margen y los 12 meses en columnas.
//   · Hoja "Compras" — UNA FILA POR COMPRA: fecha, cantidad y costos.
//
// Si el Excel dijera otra cosa que la pantalla tendríamos dos verdades, y él no
// dejaría de creerle al que está mal: dejaría de creerles a los dos. Por eso los
// números salen de `armarFicha()` — el MISMO módulo puro que dibuja la pantalla.
//
// 🩸 LAS COLUMNAS DE ATRIBUCIÓN SE FUERON (11-ago-2026), Y NO VUELVEN. Eran
// "Mi última compra" (el titular "240 u en 15 meses"), "Vendidas", "Meses en
// venderse", "Anterior: meses", y en la hoja de compras "U. vendidas", "Meses",
// "Queda", "Meses en que vendió" y "Salió a". TODAS salían de repartir las
// ventas entre las compras (FIFO), y ese reparto es INVENTADO cuando la
// mercancía llega sobre stock que todavía no se acaba: nadie marcó las cajas.
// El Excel refleja la caja nueva — fecha y cantidad, y él saca la conclusión.
//
// 🩸 Y ANTES SE HABÍA IDO "DESC.". Daniel, textual: *"no sirve"*. Lo que sí
// sirve para su decisión es el PRECIO REAL y el MARGEN.
//
// 🔴 El FOB se muestra TAL CUAL viene, con su origen al lado. En el 93% de las
// líneas Switch lo manda IGUAL al CIF: es un error de carga conocido del lado de
// Daniel y NO se corrige ni se estima — la columna "FOB de dónde" es la que le
// dice a cuál creerle. Fashion Shoes es la única donde se estima, y se dice.

import type { ArticuloCompras, Compra, OrigenFob } from "./compras";
import {
  armarFicha,
  fmtMesAnio,
  textoMeses,
  textoSinMargen,
  MESES_VENTANA,
  type FichaArticulo,
} from "./resumen-articulo";

export { textoMeses };

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

export interface FilaCompraExcel {
  articulo: ArticuloCompras;
  compra: Compra;
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

const n1 = (x: number | null | undefined): number | null =>
  x == null || !Number.isFinite(x) ? null : Number(x.toFixed(1));
const n2 = (x: number | null | undefined): number | null =>
  x == null || !Number.isFinite(x) ? null : Number(x.toFixed(2));
const n4 = (x: number | null | undefined): number | null =>
  x == null || !Number.isFinite(x) ? null : Number(x.toFixed(4));

// ─── Hoja 1: la pantalla ─────────────────────────────────────────────────────

/**
 * UNA FILA POR ARTÍCULO. Las columnas son, en orden, lo que se lee en la
 * tarjeta: la caja de Compras, los otros dos números, el precio real y el
 * margen, la fila de costos y los 12 meses.
 */
export async function buildReferenciaSheet(
  articulos: readonly ArticuloCompras[],
  hoyMes: string,
): Promise<import("xlsx-js-style").WorkSheet> {
  const { buildReportSheet, MONEY_FMT, PCT_FMT } = await import("@/lib/excel-export");

  const fichas = articulos.map((a) => ({ art: a, f: armarFicha(a, hoyMes) }));
  // Los encabezados de los meses se derivan de la MISMA ventana que la
  // pantalla: si se escribieran a mano, un cambio de mes los desincronizaría.
  const meses = fichas[0]?.f.barras.map((b) => b.mes) ?? [];

  return buildReportSheet({
    title: "FASHION GROUP — Referencia: cuánto vendo, cuánto me queda y a qué margen",
    subtitle:
      `${articulos.length} referencias · corte ${hoyMes} · ` +
      `los ${MESES_VENTANA} meses son COMPLETOS (el mes en curso NO entra) · ` +
      `"Vendí a" es la venta real ÷ unidades, con los descuentos adentro · ` +
      `el margen se calcula contra el CIF de la última compra · ` +
      `NO se dice cuánto tardó cada compra en venderse: con stock encima eso no se sabe · ` +
      `las notas de crédito ya están restadas`,
    columns: [
      { header: "Referencia", wch: 18 },
      { header: "Descripción", wch: 26 },
      { header: "Empresa", wch: 14 },
      { header: "En bodega", wch: 11, align: "right", fmt: "#,##0" },
      // ── Compras: fecha y cantidad, crudas ──
      { header: "Última compra: llegó", wch: 18 },
      { header: "Última compra: cuánto", wch: 19, align: "right", fmt: "#,##0" },
      { header: "Anterior: llegó", wch: 14 },
      { header: "Anterior: cuánto", wch: 15, align: "right", fmt: "#,##0" },
      { header: "Compras (últimos 3 años)", wch: 22, align: "right", fmt: "#,##0" },
      { header: "Compras de más de 3 años", wch: 23, align: "right", fmt: "#,##0" },
      // ── Vendo por mes / me queda para ──
      { header: "Vendo por mes", wch: 13, align: "right", fmt: "#,##0.0" },
      { header: "Meses promediados", wch: 17, align: "right", fmt: "#,##0" },
      { header: "Me queda para (meses)", wch: 20, align: "right", fmt: "#,##0.0" },
      // ── Precio real y margen: la mitad de la decisión ──
      { header: "Vendí a", wch: 11, align: "right", fmt: MONEY_FMT },
      { header: "Me costó (CIF)", wch: 13, align: "right", fmt: MONEY_FMT },
      { header: "Margen", wch: 9, align: "right", fmt: PCT_FMT },
      { header: "Si no hay margen, por qué", wch: 46 },
      // ── Costos ──
      { header: "CIF compra anterior", wch: 18, align: "right", fmt: MONEY_FMT },
      { header: "FOB", wch: 10, align: "right", fmt: MONEY_FMT },
      { header: "FOB de dónde", wch: 22 },
      { header: "Precio de lista", wch: 13, align: "right", fmt: MONEY_FMT },
      // ── Temporada ──
      { header: "Oct-nov-dic (u)", wch: 14, align: "right", fmt: "#,##0" },
      { header: "Oct-nov-dic (% del año)", wch: 21, align: "right", fmt: PCT_FMT },
      // ── Los 12 meses ──
      ...meses.map((m) => ({ header: fmtMesAnio(m), wch: 10, align: "right" as const, fmt: "#,##0" })),
      { header: "Nota", wch: 46 },
    ],
    rows: fichas.map(({ art, f }) => filaReferencia(art, f)),
  });
}

function filaReferencia(art: ArticuloCompras, f: FichaArticulo): (string | number | null)[] {
  const u = f.ultima;
  const a = f.anterior;
  const m = f.margen;
  return [
    art.codigo,
    art.descripcion || "—",
    art.empresa || "—",
    art.existencia,
    u?.fecha ?? "sin compra registrada",
    u?.unidades ?? null,
    a?.fecha ?? "—",
    a?.unidades ?? null,
    art.compras.length,
    art.comprasFueraDeVentana,
    n1(f.promedio.porMes),
    f.promedio.meses,
    n1(f.alcance),
    n2(m.precioReal),
    n2(m.costo),
    n4(m.margen),
    m.motivo ? textoSinMargen(m.motivo, f.promedio.meses) : "",
    n2(a?.costos.cif),
    n2(u?.costos.fob),
    u ? textoOrigenFob(u.costos.fobOrigen) : "—",
    n2(u?.costos.lista ?? art.precioEtiqueta),
    f.temporada.unidades,
    n4(f.temporada.parte),
    ...f.barras.map((b) => b.unidades),
    notaArticulo(art),
  ];
}

function notaArticulo(a: ArticuloCompras): string {
  const partes: string[] = [];
  if (a.sinCompraRegistrada) {
    partes.push(`vendió ${a.cuadre.vendido} u, pero no hay ningún ingreso de mercancía cargado`);
  }
  if (a.vendidoAntes > 0) partes.push(`${a.vendidoAntes} u vendidas antes de la primera compra`);
  if (a.vendidoDeMas > 0) partes.push(`${a.vendidoDeMas} u vendidas de más`);
  if (a.stockSinRespaldo > 0) partes.push(`${a.stockSinRespaldo} u en bodega sin compra que las respalde`);
  if (a.comprasFueraDeVentana > 0) {
    partes.push(
      `${a.comprasFueraDeVentana} compra(s) de más de 3 años no se muestran (sí cuentan para lo que hay en bodega)`,
    );
  }
  if (a.cuadre.ajusteConfiable && (a.cuadre.residuo ?? 0) > 0) {
    partes.push(`${a.cuadre.residuo} u se perdieron en ajuste de inventario`);
  }
  return partes.join(" · ");
}

// ─── Hoja 2: el detalle por compra ───────────────────────────────────────────
//
// 🔴 FECHA, CANTIDAD Y COSTOS. Lo que Switch registró y nada más. Sin "cuánto
// vendió esta compra" ni "cuánto tardó": eso no se sabe.

export async function buildComprasSheet(
  articulos: readonly ArticuloCompras[],
  hoyMes: string,
): Promise<import("xlsx-js-style").WorkSheet> {
  const { buildReportSheet, MONEY_FMT } = await import("@/lib/excel-export");
  const filas = aplanar(articulos);
  const sinCompra = articulos.filter((a) => a.sinCompraRegistrada);

  return buildReportSheet({
    title: "FASHION GROUP — Compras registradas, tal como llegaron",
    subtitle:
      `${articulos.length} referencias · ${filas.length} compras · corte ${hoyMes} · ` +
      `fecha, cantidad y costos de cada ingreso de mercancía de los últimos 3 años · ` +
      `NO se atribuyen ventas a una compra: con stock encima, de qué llegada salió cada venta no se sabe`,
    columns: [
      { header: "Referencia", wch: 18 },
      { header: "Descripción", wch: 26 },
      { header: "Empresa", wch: 14 },
      { header: "Llegó", wch: 12 },
      { header: "Cuánto", wch: 9, align: "right", fmt: "#,##0" },
      { header: "CIF", wch: 10, align: "right", fmt: MONEY_FMT },
      { header: "FOB", wch: 10, align: "right", fmt: MONEY_FMT },
      { header: "FOB de dónde", wch: 22 },
      { header: "Lista", wch: 10, align: "right", fmt: MONEY_FMT },
      { header: "Proveedor", wch: 26 },
      { header: "Documento", wch: 16 },
    ],
    rows: [
      ...filas.map(({ articulo, compra }) => [
        articulo.codigo,
        articulo.descripcion || "—",
        articulo.empresa || "—",
        compra.fecha,
        compra.unidades,
        compra.costos.cif,
        compra.costos.fob,
        textoOrigenFob(compra.costos.fobOrigen),
        compra.costos.lista,
        compra.proveedor || "—",
        compra.documento || "—",
      ]),
      // Las referencias sin NINGUNA compra registrada también bajan: que no
      // aparezcan haría pensar que no existen.
      ...sinCompra.map((a) => [
        a.codigo,
        a.descripcion || "—",
        a.empresa || "—",
        "sin compra registrada",
        null,
        null,
        null,
        "—",
        null,
        "—",
        "—",
      ]),
    ],
  });
}

export async function exportComprasToExcel(
  articulos: readonly ArticuloCompras[],
  hoyMes: string,
): Promise<void> {
  const [referencia, compras] = await Promise.all([
    buildReferenciaSheet(articulos, hoyMes),
    buildComprasSheet(articulos, hoyMes),
  ]);
  const { workbookFromSheets, downloadWorkbook, exportFilename } = await import("@/lib/excel-export");
  downloadWorkbook(
    workbookFromSheets([
      { name: "Referencia", ws: referencia },
      { name: "Compras", ws: compras },
    ]),
    exportFilename("ventas-referencia"),
  );
}
