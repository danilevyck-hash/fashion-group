// Export Excel del tab "Referencia" (/ventas).
//
// 🔴 DOS HOJAS, Y LA PRIMERA ES LA PANTALLA. Daniel usa este tab para HACER
// PEDIDO y después *"escribe la cantidad en un Excel"*, así que el archivo tiene
// que traer la respuesta, no la materia prima:
//   · Hoja "Referencia" — UNA FILA POR ARTÍCULO, con los TRES números grandes,
//     el precio real, el margen y los 12 meses en columnas.
//   · Hoja "Compras" — el detalle por compra, que en la pantalla vive detrás de
//     "Ver las N compras anteriores".
//
// Si el Excel dijera otra cosa que la pantalla tendríamos dos verdades, y él no
// dejaría de creerle al que está mal: dejaría de creerles a los dos. Por eso los
// números salen de `armarFicha()` — el MISMO módulo puro que dibuja la pantalla.
//
// 🩸 LA COLUMNA "DESC." SE FUE. Daniel, textual: *"no sirve"*. Lo que sí sirve
// para su decisión es el PRECIO REAL y el MARGEN, que antes no estaban en
// ninguna parte: la pantalla mostraba el precio de LISTA, que no es a lo que
// vendió.
//
// 🔴 El FOB se muestra TAL CUAL viene, con su origen al lado. En el 93% de las
// líneas Switch lo manda IGUAL al CIF: es un error de carga conocido del lado de
// Daniel y NO se corrige ni se estima — la columna "FOB de dónde" es la que le
// dice a cuál creerle. Fashion Shoes es la única donde se estima, y se dice.

import {
  textoMesesVendidos,
  type ArticuloCompras,
  type CompraMedida,
  type OrigenFob,
  type ResumenArticulo,
} from "./compras";
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

/**
 * "54 u en 7 meses" — CUÁNTO se vendió de esta llegada y en cuánto tiempo.
 *
 * 🩸 ANTES DECÍA "te quedan 126" Y ESO ERA UN DEFECTO. Daniel, mirando la
 * pantalla publicada: *"me sale dos veces mi inv, esta bien? que opinas? y no me
 * esta diciendo cuanto vendi y cuantos meses"*. El inventario se dice UNA vez;
 * acá van las UNIDADES VENDIDAS.
 */
export function textoSeVendio(c: CompraMedida): string {
  if (c.estado === "sin-ventas") return "todavía no vendió";
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

/**
 * "Ya se acabaron 2 compras: 480 u en 15 meses".
 *
 * ⚠️ YA NO SE MUESTRA EN PANTALLA — la línea de resumen se retiró por pedido de
 * Daniel (el módulo se redujo a los tres números grandes). La función queda
 * porque `art.resumen` sigue calculándose y sus invariantes siguen bajo test.
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

const n1 = (x: number | null | undefined): number | null =>
  x == null || !Number.isFinite(x) ? null : Number(x.toFixed(1));
const n2 = (x: number | null | undefined): number | null =>
  x == null || !Number.isFinite(x) ? null : Number(x.toFixed(2));
const n4 = (x: number | null | undefined): number | null =>
  x == null || !Number.isFinite(x) ? null : Number(x.toFixed(4));

// ─── Hoja 1: la pantalla ─────────────────────────────────────────────────────

/**
 * UNA FILA POR ARTÍCULO. Las columnas son, en orden, lo que se lee en la
 * tarjeta: los tres números grandes, la comparación con la compra anterior, el
 * precio real y el margen, la fila de costos y los 12 meses.
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
      `las notas de crédito ya están restadas`,
    columns: [
      { header: "Referencia", wch: 18 },
      { header: "Descripción", wch: 26 },
      { header: "Empresa", wch: 14 },
      { header: "En bodega", wch: 11, align: "right", fmt: "#,##0" },
      // ── Mi última compra ──
      { header: "Mi última compra", wch: 22 },
      { header: "Llegó", wch: 12 },
      { header: "Cuánto", wch: 9, align: "right", fmt: "#,##0" },
      { header: "Vendidas", wch: 10, align: "right", fmt: "#,##0" },
      { header: "Meses en venderse", wch: 17, align: "right", fmt: "#,##0.0" },
      // ── La anterior, para ver la tendencia ──
      { header: "Anterior: llegó", wch: 14 },
      { header: "Anterior: cuánto", wch: 15, align: "right", fmt: "#,##0" },
      { header: "Anterior: meses", wch: 14, align: "right", fmt: "#,##0.0" },
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
      { header: "Compras anteriores", wch: 17, align: "right", fmt: "#,##0" },
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
    u ? resumenTitular(u) : "sin compra registrada",
    u?.fecha ?? "—",
    u?.unidades ?? null,
    u?.vendidas ?? null,
    u ? n1(mesesDeCompra(u)) : null,
    a?.fecha ?? "—",
    a?.unidades ?? null,
    a ? n1(mesesDeCompra(a)) : null,
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
    f.viejas.length,
    notaArticulo(art),
  ];
}

/** El mismo texto del número grande de la pantalla, sin el detalle. */
function resumenTitular(c: CompraMedida): string {
  if (c.estado === "viva" || c.estado === "sin-ventas") return "todavía no se acaba";
  return `${c.unidades.toLocaleString("en-US")} u en ${textoMeses(c.meses)}`;
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
    partes.push(`${a.comprasFueraDeVentana} compra(s) de más de 3 años no se muestran`);
  }
  return partes.join(" · ");
}

// ─── Hoja 2: el detalle por compra ───────────────────────────────────────────

export async function buildComprasSheet(
  articulos: readonly ArticuloCompras[],
  hoyMes: string,
): Promise<import("xlsx-js-style").WorkSheet> {
  const { buildReportSheet, MONEY_FMT } = await import("@/lib/excel-export");
  const filas = aplanar(articulos);
  const sinCompra = articulos.filter((a) => a.sinCompraRegistrada);

  return buildReportSheet({
    title: "FASHION GROUP — Compras y cuánto tardaron en venderse",
    subtitle:
      `${articulos.length} referencias · ${filas.length} compras · corte ${hoyMes} · ` +
      `"U. vendidas" son las unidades de ESA compra y "Meses" lo que tardó en venderse (hasta el 90%) ` +
      `o, si todavía le queda mercancía, lo que lleva desde que llegó · ` +
      `las notas de crédito ya están restadas`,
    columns: [
      { header: "Referencia", wch: 18 },
      { header: "Descripción", wch: 26 },
      { header: "Empresa", wch: 14 },
      { header: "Llegó", wch: 12 },
      { header: "Cuánto", wch: 9, align: "right", fmt: "#,##0" },
      // Unidades y meses van en columnas NUMÉRICAS separadas: en el Excel
      // Daniel ordena y filtra por ellas, y "54 u en 7 meses" como texto no se
      // puede ordenar.
      { header: "U. vendidas", wch: 12, align: "right", fmt: "#,##0" },
      { header: "Meses", wch: 8, align: "right", fmt: "#,##0.0" },
      { header: "Queda", wch: 8, align: "right", fmt: "#,##0" },
      { header: "Meses en que vendió", wch: 40 },
      { header: "CIF", wch: 10, align: "right", fmt: MONEY_FMT },
      { header: "FOB", wch: 10, align: "right", fmt: MONEY_FMT },
      { header: "FOB de dónde", wch: 22 },
      { header: "Lista", wch: 10, align: "right", fmt: MONEY_FMT },
      { header: "Salió a", wch: 10, align: "right", fmt: MONEY_FMT },
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
        compra.vendidas,
        n1(mesesDeCompra(compra)),
        compra.quedan,
        textoMesesVendidos(compra.mesesConVenta, hoyMes) || "—",
        compra.costos.cif,
        compra.costos.fob,
        textoOrigenFob(compra.costos.fobOrigen),
        compra.costos.lista,
        n2(compra.precioVendido),
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
        null,
        null,
        a.existencia,
        "—",
        null,
        null,
        "—",
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
