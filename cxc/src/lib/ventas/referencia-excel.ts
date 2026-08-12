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
// 🔴 LA HOJA 1 SIGUE A LA PANTALLA, RÓTULO POR RÓTULO (12-ago-2026): los cuatro
// grandes primero — `Compré` · `Vendí` · `Stock` · `Meses de venta` — y la fila
// de plata en el MISMO orden agrupado de la tarjeta: `Precio prom` · `Lista` ·
// `Costo CIF` · `CIF anterior (solo si cambió)` · `Costo FOB` · `Margen`.
//   · **Compré** es la suma de TODAS las compras registradas (también las de
//     más de 3 años) y **Vendí** el neto histórico con las NC restadas — los
//     mismos números grandes de la pantalla. NO se fuerza el cuadre entre
//     ellos y "En bodega": la columna "Nota" explica los huecos.
//   · El **Costo FOB es CALCULADO** (CIF ÷ 1,10, con `fobEstimado()`), no el que
//     manda Switch — que llega igual al CIF en el 93% de las líneas por un error
//     de carga conocido. Por eso la columna "FOB de dónde" se fue de esta hoja.
//     La palabra "(calculado)" se fue del ENCABEZADO (Daniel: *"esta de mas"*);
//     el subtítulo de la hoja sigue diciendo de dónde sale.
//   · El **CIF anterior solo se llena cuando DIFIERE** del de hoy. La columna se
//     queda (una columna que aparece y desaparece rompe cualquier planilla que
//     apunte a ella), pero vacía significa "no cambió", igual que en pantalla:
//     el dato es la SEÑAL de que te subieron el costo, no un relleno.
//   · **Todo monto va a 2 decimales**, también en la hoja "Compras".
//
// 🔴 La hoja 2 ("Compras") SÍ conserva el FOB CRUDO de Switch con su columna
// "FOB de dónde", y no es una contradicción: esa hoja es el registro tal como
// llegó, y ahí "igual al CIF (revisar)" es justamente el dato que hay que ver
// para arreglarlo en Switch. La cuenta de la ficha vive en la hoja 1.

import type { ArticuloCompras, Compra, OrigenFob } from "./compras";
import {
  armarFicha,
  centavos,
  fmtMesAnio,
  textoMeses,
  textoNoventaCorto,
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
/** 🔴 Todo MONTO va a 2 decimales, y con el MISMO redondeo que la pantalla
 *  (`centavos`, que formatea con el formateador de la ficha y lee de vuelta).
 *  Con `toFixed(2)` el CIF real $16,555 salía $16.55 en el Excel y $16.56 en la
 *  ficha del mismo artículo. Las UNIDADES siguen enteras. */
const n2 = centavos;
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
  opts: { margen?: boolean } = {},
): Promise<import("xlsx-js-style").WorkSheet> {
  const { buildReportSheet, MONEY_FMT, PCT_FMT } = await import("@/lib/excel-export");
  // Daniel: *"quita margen, lo demas dejalo"* — para vendedor/bodega el Excel
  // tampoco baja el margen (esconderlo solo en pantalla sería teatro).
  const conMargen = opts.margen !== false;

  const fichas = articulos.map((a) => ({ art: a, f: armarFicha(a, hoyMes) }));
  // Los encabezados de los meses se derivan de la MISMA ventana que la
  // pantalla: si se escribieran a mano, un cambio de mes los desincronizaría.
  const meses = fichas[0]?.f.barras.map((b) => b.mes) ?? [];

  return buildReportSheet({
    title: conMargen
      ? "FASHION GROUP — Referencia: cuánto vendo, cuánto me queda y a qué margen"
      : "FASHION GROUP — Referencia: cuánto vendo y cuánto me queda",
    subtitle:
      `${articulos.length} referencias · corte ${hoyMes} · ` +
      `los ${MESES_VENTANA} meses son COMPLETOS (el mes en curso NO entra) · ` +
      `"Compré" son TODAS las compras registradas y "Vendí" el neto histórico con las NC restadas · ` +
      `"Stock" es la existencia de Switch, NUNCA deducida — si no cuadra con Compré − Vendí, la Nota lo explica · ` +
      `"90% en" dice en cuántos meses se vendió el 90% de la compra (la cola no cuenta) · ` +
      `"Meses de venta" y "Vendo por mes" cuentan DESDE QUE LLEGÓ la mercancía (la misma ancla del 90%) · ` +
      `"Precio prom" es la venta real ÷ unidades, con los descuentos adentro · ` +
      (conMargen ? `el margen se calcula contra el Costo CIF de la última compra · ` : ``) +
      `el Costo FOB es calculado (Costo CIF ÷ 1,10), no el que manda Switch · ` +
      `"CIF anterior" solo se llena cuando la compra anterior costó distinto; vacío = no cambió · ` +
      `NO se dice cuánto tardó cada compra en venderse: con stock encima eso no se sabe · ` +
      `las notas de crédito ya están restadas`,
    columns: [
      { header: "Referencia", wch: 18 },
      { header: "Descripción", wch: 26 },
      { header: "Empresa", wch: 14 },
      // ── Los cuatro grandes, en el orden de la pantalla ──
      { header: "Compré", wch: 10, align: "right", fmt: "#,##0" },
      { header: "Vendí", wch: 10, align: "right", fmt: "#,##0" },
      { header: "Stock", wch: 11, align: "right", fmt: "#,##0" },
      { header: "Meses de venta", wch: 14, align: "right", fmt: "#,##0" },
      // ── Compras: fecha y cantidad, crudas ──
      { header: "Última compra: llegó", wch: 18 },
      { header: "Última compra: cuánto", wch: 19, align: "right", fmt: "#,##0" },
      { header: "Anterior: llegó", wch: 14 },
      { header: "Anterior: cuánto", wch: 15, align: "right", fmt: "#,##0" },
      { header: "Compras (últimos 3 años)", wch: 22, align: "right", fmt: "#,##0" },
      { header: "Compras de más de 3 años", wch: 23, align: "right", fmt: "#,##0" },
      // ── El ritmo ──
      // 🔴 "90% en" es la MISMA métrica de la pantalla y del modo pedido
      // (`textoNoventaCorto`): "16 meses" = el 90% de la compra única se vendió
      // en eso; "va el 80%" = compra viva; "van 258 de 360" = varias compras,
      // agregado desde la primera llegada de los últimos 12 meses.
      { header: "90% en", wch: 16 },
      { header: "Vendo por mes", wch: 13, align: "right", fmt: "#,##0.0" },
      { header: "Me queda para (meses)", wch: 20, align: "right", fmt: "#,##0.0" },
      // ── La fila de plata, en el mismo orden agrupado de la pantalla ──
      { header: "Precio prom", wch: 12, align: "right", fmt: MONEY_FMT },
      { header: "Lista", wch: 11, align: "right", fmt: MONEY_FMT },
      { header: "Costo CIF", wch: 11, align: "right", fmt: MONEY_FMT },
      { header: "CIF anterior (solo si cambió)", wch: 27, align: "right", fmt: MONEY_FMT },
      { header: "Costo FOB", wch: 11, align: "right", fmt: MONEY_FMT },
      ...(conMargen
        ? [
            { header: "Margen", wch: 9, align: "right" as const, fmt: PCT_FMT },
            { header: "Si no hay margen, por qué", wch: 46 },
          ]
        : []),
      // ── Temporada ──
      { header: "Oct-nov-dic (u)", wch: 14, align: "right", fmt: "#,##0" },
      { header: "Oct-nov-dic (% del año)", wch: 21, align: "right", fmt: PCT_FMT },
      // ── Los 12 meses ──
      ...meses.map((m) => ({ header: fmtMesAnio(m), wch: 10, align: "right" as const, fmt: "#,##0" })),
      { header: "Nota", wch: 46 },
    ],
    rows: fichas.map(({ art, f }) => filaReferencia(art, f, conMargen)),
  });
}

function filaReferencia(art: ArticuloCompras, f: FichaArticulo, conMargen: boolean): (string | number | null)[] {
  const u = f.ultima;
  const a = f.anterior;
  const m = f.margen;
  return [
    art.codigo,
    art.descripcion || "—",
    art.empresa || "—",
    // Los cuatro grandes de la pantalla: Compré · Vendí · Stock · Meses.
    f.grandes.comprado,
    f.grandes.vendido,
    art.existencia,
    f.ritmo.meses,
    u?.fecha ?? "sin compra registrada",
    u?.unidades ?? null,
    a?.fecha ?? "—",
    a?.unidades ?? null,
    art.compras.length,
    art.comprasFueraDeVentana,
    textoNoventaCorto(f.noventa),
    n1(f.ritmo.porMes),
    n1(f.alcance),
    n2(m.precioReal),
    n2(u?.costos.lista ?? art.precioEtiqueta),
    n2(m.costo),
    // Vacío = el costo no cambió. La celda vacía ES el dato, igual que en
    // pantalla: repetir el mismo número en cada fila era el relleno que se fue.
    n2(f.cambioCosto?.anterior),
    n2(f.fobCalculado),
    ...(conMargen ? [n4(m.margen), m.motivo ? textoSinMargen(m.motivo, f.promedio.meses) : ""] : []),
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
      `acá el FOB es el CRUDO de Switch con su procedencia (en la hoja Referencia el Costo FOB es CALCULADO: CIF ÷ 1,10) · ` +
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
        // 🔴 Dos decimales, como en pantalla. Los costos son promedios ponderados
        // y traen más decimales: el formato los mostraba a 2 pero la celda
        // guardaba 16,555, así que al tocarla aparecía otro número.
        n2(compra.costos.cif),
        n2(compra.costos.fob),
        textoOrigenFob(compra.costos.fobOrigen),
        n2(compra.costos.lista),
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
  opts: { margen?: boolean } = {},
): Promise<void> {
  const [referencia, compras] = await Promise.all([
    buildReferenciaSheet(articulos, hoyMes, opts),
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
