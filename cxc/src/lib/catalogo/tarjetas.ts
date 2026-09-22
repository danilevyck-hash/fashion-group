// ─────────────────────────────────────────────────────────────────────────────
// CUÁNTAS TARJETAS VE EL CLIENTE — el puente entre las FILAS y la VITRINA.
//
// 🩸 POR QUÉ EXISTE (22-sep-2026). El hub decía «81 productos a la venta» de
// Joybees y al entrar al catálogo salían **70 tarjetas**. Los dos números eran
// correctos: Joybees es la única marca con `features.agrupacionPorModelo`, y
// medido contra producción hay **11 modelos con dos filas cada uno** —tallas
// distintas del mismo modelo, `-KIDS` contra `-JUNIOR` y `-M` contra `-W`, cada
// una con su propio inventario, y dos pares con precio distinto ($13 los Kids,
// $15 los Junior)—. El catálogo los junta en UNA tarjeta con un botón por
// talla. 81 − 11 = 70, exacto.
//
// Daniel decidió: **el hub dice 70**, que es lo que el cliente ve.
//
// 🔴 LA REGLA DE AGRUPAR NO SE COPIA: SE LLAMA. La agrupación la decide
// `groupByModel` —con su parseo de sufijos, su empate por NOMBRE y su guard de
// sufijo repetido—, y este módulo no reescribe nada de eso: le pasa las filas y
// devuelve los grupos. Una segunda implementación de «qué es un modelo» sería
// exactamente el modo de falla que separó al hub del catálogo en primer lugar.
//
// ⚠️ ESTE MÓDULO NO DECIDE QUÉ SE VENDE. Recibe las filas YA filtradas por
// `productosALaVenta`: agrupar es la segunda pregunta, nunca la primera.
// ─────────────────────────────────────────────────────────────────────────────

import { groupByModel, type JoybeesProduct } from "@/components/catalogo/groupByModel";

/** Lo mínimo que hace falta para agrupar: el SKU (trae el sufijo) y el nombre. */
export interface FilaAgrupable {
  id?: string;
  sku?: string | null;
  name?: string | null;
}

/**
 * Las filas repartidas en TARJETAS: cada arreglo es una tarjeta del catálogo y
 * adentro van sus tallas.
 *
 * 🔑 El `cast` está acá y en ningún otro lugar. `groupByModel` pide el tipo
 * completo de `joybees_products` porque la pantalla necesita precio, género y
 * foto; para CONTAR alcanza con `id`, `sku` y `name`, que es justo lo que la
 * ruta de contadores pide a la base. Los campos que faltan solo alimentan
 * etiquetas y el precio de referencia, que acá nadie lee — y el candado
 * `catalogo-contadores-una-regla` lo comprueba con filas reales.
 */
export function tarjetasDeModelo<T extends FilaAgrupable>(filas: T[]): T[][] {
  return groupByModel(filas as unknown as JoybeesProduct[]).map((g) =>
    g.variants.map((v) => v.product as unknown as T),
  );
}
