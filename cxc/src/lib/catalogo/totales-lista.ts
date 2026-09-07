// ─────────────────────────────────────────────────────────────────────────────
// EL TOTAL DE UNA LISTA DE PEDIDOS — UNA SOLA CADENA PARA LA PANTALLA Y PARA EL
// EXCEL.
//
// 🩸 EL DEFECTO QUE ESTO CIERRA (medido contra producción el 6-sep-2026).
//
// La pantalla de Comprobantes leía las piezas por bulto del ESTILO
// (`leerCategoriaYBulto`) y se las pasaba al resolvedor de líneas. El botón
// «Descargar Excel» de ESA MISMA pantalla no las leía: armaba los items con
// `quantity`, `unit_price` y `category` y llamaba a `cfg.calcTotal`, así que
// todo estilo marcado en 8 se cobraba como si fuera de 12. Seis pedidos de
// Tommy salían inflados, **$1.516,00 de más en total**:
//
//   TOM-020  pantalla 10.408,00 · Excel 11.088,00  (+680,00)
//   TOM-032   pantalla 4.480,00 · Excel  4.704,00  (+224,00)
//   TOM-024   pantalla 3.100,00 · Excel  3.324,00  (+224,00)
//   TOM-018   pantalla 7.548,00 · Excel  7.764,00  (+216,00)
//   TOM-001   pantalla 1.472,00 · Excel  1.584,00  (+112,00)
//   TOM-016   pantalla 1.020,00 · Excel  1.080,00   (+60,00)
//
// Es la MISMA familia del caso TOM-003 (6-ago-2026): la multiplicación por el
// bulto se arregló en un lugar y quedó viva en otro. Por eso el arreglo no fue
// pasarle el mapa al Excel: fue que las dos superficies llamen a la MISMA
// función, y que ninguna de las dos vuelva a poder armar el total por su cuenta.
//
// El candado es `src/__tests__/api/excel-pedidos-mismo-total.test.ts` — corre las
// DOS rutas de verdad, abre el .xlsx que sale y compara las dos cifras.
// ─────────────────────────────────────────────────────────────────────────────

import { leerCategoriaYBulto } from "./bulto-productos";
import { resumirDesdeItems, type ContextoLineas, type ItemCrudo } from "./lineas-pedido";
import type { MarcaConfig } from "./marcas";

/** Lo único que hace falta de la marca para armar el contexto. */
export type CfgDeTotales = Pick<
  MarcaConfig,
  "bultoSize" | "categoryLookup" | "fallbackCategory" | "productsTable"
>;

/**
 * Arma el contexto con el que se resuelven las líneas de una lista de pedidos:
 * la categoría (solo Reebok ramifica por ella) y las PIEZAS POR BULTO del
 * estilo (Tommy y Calvin las marcan producto por producto).
 *
 * Las dos lecturas van juntas a propósito: pedir la categoría sin las piezas es
 * exactamente el defecto de arriba. Se lee en LOTE, una sola consulta por
 * marca, así que sirve igual para una lista de 60 pedidos que para uno solo.
 *
 * ⚠️ Falla ABIERTO: si la tabla de productos no responde, los mapas quedan
 * vacíos y cada marca cae en su bulto por defecto — el mismo comportamiento
 * que tenía el sistema antes de que existieran las piezas por estilo.
 */
export async function contextoDeLineas(
  cfg: CfgDeTotales,
  db: unknown,
  productIds: (string | null | undefined)[],
): Promise<ContextoLineas> {
  const ids = productIds.filter((id): id is string => !!id);
  const categoryByProduct = cfg.categoryLookup
    ? await cfg.categoryLookup(ids)
    : new Map<string, string>();
  const { bultoPzasByProduct } = await leerCategoriaYBulto(db as never, cfg.productsTable, ids);
  return {
    bultoSize: cfg.bultoSize,
    categoryByProduct,
    bultoPzasByProduct,
    fallbackCategory: cfg.fallbackCategory,
  };
}

/**
 * El total de UN pedido de la lista. Es `resumirDesdeItems(...).total` y nada
 * más: existe para que la pantalla y el Excel no puedan escribir dos fórmulas.
 */
export function totalDeLaLista(items: readonly ItemCrudo[], ctx: ContextoLineas): number {
  return resumirDesdeItems(items, ctx).total;
}
