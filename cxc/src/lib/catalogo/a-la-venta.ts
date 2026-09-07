// ─────────────────────────────────────────────────────────────────────────────
// QUÉ PRODUCTOS SE VEN AL ENTRAR AL CATÁLOGO — regla ÚNICA (6-sep-2026).
//
// 🩸 POR QUÉ EXISTE. La tarjeta del hub (`/catalogos/marcas`) contaba las filas
// que devuelve `products?active=true` —lo que EXISTE— y el catálogo muestra lo
// que se puede VENDER. Medido el 6-sep-2026 contra producción:
//
//     Reebok   232 → 182      Tommy   460 → 455
//     Calvin    84 →  81      Joybees  81 →  81
//
// O sea que la tarjeta prometía 232 productos y al entrar salían 182. Daniel:
// *«no sabía que los productos eran los de Switch, no con existencia»*.
//
// La regla ya vivía —dos veces, calcada— dentro de `CatalogoVendedorPage` y
// `CatalogoPublicoPage`. Acá queda UNA sola, y el hub cuenta con ella: la
// tarjeta y el catálogo no pueden volver a decir números distintos.
//
// LAS TRES CLÁUSULAS, y por qué son tres:
//   1. Hay DISPONIBILIDAD (lo vendible = saldo − apartado). Es el caso normal.
//   2. `is_regalia` — Joybees regala modelos que no tienen existencia propia.
//   3. `badge === "proximamente"` — la PRE-ORDEN de Reebok: se ofrece justamente
//      porque todavía no llegó.
//
// ⚠️ Las dos ramas de las páginas miraban una excepción cada una (la agrupada
// solo `is_regalia`, la plana solo el badge). Unificarlas es un NO-OP medido:
// `is_regalia` solo existe en `joybees_products` y `badge` está en NULL en los
// 944 productos de las 4 marcas. Se unifica igual porque dos reglas para la
// misma pregunta es cómo el hub y el catálogo terminaron peleados.
// ─────────────────────────────────────────────────────────────────────────────

import { disponibleVendible, type StockCrudo } from "@/lib/catalogos/disponible";

export interface ProductoALaVenta extends StockCrudo {
  /** Joybees: modelo de regalía, se ofrece sin existencia propia. */
  is_regalia?: boolean | null;
  /** Reebok: `"proximamente"` es la pre-orden. */
  badge?: string | null;
}

/**
 * ¿Este producto se ve al entrar al catálogo?
 *
 * `fallback` es para Reebok, donde la existencia por talla vive en la tabla
 * `inventory` y no en la fila del producto (ver `disponibleVendible`).
 */
export function estaALaVenta(p: ProductoALaVenta, fallback?: number | null): boolean {
  if (disponibleVendible(p, fallback) > 0) return true;
  if (p.is_regalia) return true;
  if (p.badge === "proximamente") return true;
  return false;
}

/** Los que se ven, de una lista. `stockPorProducto` = el fallback de Reebok. */
export function productosALaVenta<T extends ProductoALaVenta & { id?: string }>(
  productos: T[],
  stockPorProducto?: Record<string, number>,
): T[] {
  return productos.filter((p) =>
    estaALaVenta(p, stockPorProducto && p.id ? stockPorProducto[p.id] : undefined),
  );
}
