// Export Excel del tab "Referencia" (/ventas).
//
// 🔴 DOS HOJAS, Y LA PRIMERA ES LA PANTALLA. Daniel usa este tab para HACER
// PEDIDO y después *"escribe la cantidad en un Excel"*, así que el archivo tiene
// que traer la respuesta, no la materia prima:
//   · Hoja "Referencia" — UNA FILA POR ARTÍCULO, 13 columnas: lo esencial.
//   · Hoja "Compras" — UNA FILA POR COMPRA: fecha, cantidad y costos (el
//     registro crudo, INTACTO).
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
// 🔴 LA HOJA 1 ES "LO ESENCIAL" — 13 COLUMNAS, APROBADAS POR DANIEL
// (12-ago-2026; sobre la hoja de 39 columnas dijo, textual: *"mucha info,
// quiero lo escencial"*, y después pidió sumar la Lista). Quedaron:
//
//   Referencia · Descripción · Compré · Vendí · Stock · Vendido · Meses ·
//   Última compra · Precio prom · Lista · Costo CIF · Margen · Nota
//
// 🩸 LO QUE SE FUE (y NO vuelve sin que Daniel lo pida): Empresa, Meses de
// venta, Última compra: cuánto, Anterior: llegó/cuánto, Compras (últimos 3
// años), Compras de más de 3 años, Vendo por mes, Me queda para, CIF
// anterior, Costo FOB, "Si no hay margen, por qué" (su contenido se FUSIONÓ en
// la Nota), Oct-nov-dic (las dos) y los 12 meses en columnas. Hay un candado
// que fija el encabezado EXACTO.
//   · **Compré** y **Vendí** son los MISMOS números grandes de la pantalla: la
//     suma de TODAS las compras registradas (también las de más de 3 años) y el
//     neto histórico con las NC restadas… salvo cuando la bodega quedó en 0 y
//     volvió a llegar mercancía, y entonces los dos son de la ÚLTIMA LLEGADA
//     (12-ago-2026, Daniel: *"que sea coherente"*). **Stock es SIEMPRE la
//     existencia total de bodega.** NO se fuerza el cuadre entre los tres: la
//     columna "Nota" explica los huecos.
//   · **Vendido · Meses** son las celdas de `medirVendidoMeses` (las MISMAS del
//     modo pedido): Vendido es SIEMPRE el % real (Vendí ÷ Compré — Daniel:
//     *"como stock 0 y vendido 90%?"*); Meses es el TIEMPO DE VENTA — hasta la
//     última venta si el artículo está AGOTADO (cerrado ahí: la cola de bodega
//     no lo infla), o desde la llegada hasta hoy si sigue vivo. Sin regla del
//     90%: Daniel la eliminó del módulo entero (12-ago-2026). Vacío = no
//     afirmable.
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
  medirVendidoMeses,
  textoMeses,
  textoSinMargen,
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

/** 🔴 Todo MONTO va a 2 decimales, y con el MISMO redondeo que la pantalla
 *  (`centavos`, que formatea con el formateador de la ficha y lee de vuelta).
 *  Con `toFixed(2)` el CIF real $16,555 salía $16.55 en el Excel y $16.56 en la
 *  ficha del mismo artículo. Las UNIDADES siguen enteras. */
const n2 = centavos;
const n4 = (x: number | null | undefined): number | null =>
  x == null || !Number.isFinite(x) ? null : Number(x.toFixed(4));

// ─── Hoja 1: la pantalla ─────────────────────────────────────────────────────

/**
 * UNA FILA POR ARTÍCULO, 13 columnas: lo esencial. Daniel, textual: *"mucha
 * info, quiero lo escencial"*. El ORDEN de las filas es el que traiga
 * `articulos` (el botón exporta `articulosOrdenados`: el orden pegado).
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

  return buildReportSheet({
    columns: [
      { header: "Referencia", wch: 18 },
      { header: "Descripción", wch: 26 },
      // ── Los tres grandes de la pantalla ──
      { header: "Compré", wch: 10, align: "right", fmt: "#,##0" },
      { header: "Vendí", wch: 10, align: "right", fmt: "#,##0" },
      { header: "Stock", wch: 11, align: "right", fmt: "#,##0" },
      // 🔴 "Vendido" · "Meses" son LAS MISMAS dos celdas del modo pedido
      // (`medirVendidoMeses`, una sola función para pantalla y Excel):
      // Vendido = el % REAL (Vendí÷Compré, siempre); Meses = el tiempo de
      // venta (hasta la última venta si está agotado — cerrado ahí — o hasta
      // hoy si sigue vivo). Vacío = no se puede afirmar.
      { header: "Vendido", wch: 9, align: "right", fmt: "0%" },
      { header: "Meses", wch: 8, align: "right", fmt: "#,##0" },
      { header: "Última compra", wch: 14 },
      // Precio prom · Lista juntos, como en la ficha (¿estoy descontando?).
      { header: "Precio prom", wch: 12, align: "right", fmt: MONEY_FMT },
      { header: "Lista", wch: 11, align: "right", fmt: MONEY_FMT },
      { header: "Costo CIF", wch: 11, align: "right", fmt: MONEY_FMT },
      ...(conMargen ? [{ header: "Margen", wch: 9, align: "right" as const, fmt: PCT_FMT }] : []),
      { header: "Nota", wch: 60 },
    ],
    rows: fichas.map(({ art, f }) => filaReferencia(art, f, conMargen)),
  });
}

function filaReferencia(art: ArticuloCompras, f: FichaArticulo, conMargen: boolean): (string | number | null)[] {
  const m = f.margen;
  const vm = medirVendidoMeses(f);
  return [
    art.codigo,
    art.descripcion || "—",
    f.grandes.comprado,
    f.grandes.vendido,
    art.existencia,
    // Vacío = no se puede afirmar, igual que el "—" de la pantalla.
    vm.parte,
    vm.meses,
    f.ultima?.fecha ?? "sin compra registrada",
    n2(m.precioReal),
    // El mismo precio de lista que la ficha: el de la última compra, o el de
    // la etiqueta del catálogo si la compra no lo trae.
    n2(f.ultima?.costos.lista ?? art.precioEtiqueta),
    n2(m.costo),
    ...(conMargen ? [n4(m.margen)] : []),
    notaArticulo(art, f, conMargen),
  ];
}

function notaArticulo(a: ArticuloCompras, f: FichaArticulo, conMargen: boolean): string {
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
  // La columna "Si no hay margen, por qué" se FUSIONÓ acá (Daniel: *"quiero lo
  // escencial"*). Sin margen visible (vendedor/bodega) tampoco se explica su
  // ausencia: sería hablar de una columna que esa hoja no tiene.
  if (conMargen && f.margen.motivo) {
    partes.push(textoSinMargen(f.margen.motivo, f.promedio.meses));
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
