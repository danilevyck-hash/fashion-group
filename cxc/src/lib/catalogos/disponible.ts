// Regla ÚNICA de "cuántas piezas puedo vender de verdad" en los catálogos.
//
// Switch da dos números por artículo (`/apiarticulos/stock`):
//   saldo      → EXISTENCIA   — lo que hay físicamente en la bodega.
//   disponible → DISPONIBILIDAD — existencia menos lo ya apartado/comprometido.
//
// El catálogo público (y el "Disponible ahora" que ve el cliente al confirmar)
// tiene que hablar de DISPONIBILIDAD: mostrar existencia le ofrece al cliente
// mercancía que ya está apartada para otro. Hasta jul-2026 todo el flujo
// público leía existencia — `publicCatalog.cols` ni siquiera traía la columna
// disponibilidad, y en Joybees/Tommy la columna `stock` es un espejo exacto de
// existencia (lo escribe el cron: `stock: existencia`).
//
// La VISIBILIDAD del producto sigue decidiéndose por existencia
// (`esVisibleEnCatalogo`): eso es deliberado y no cambia acá.

export interface StockCrudo {
  /** Vendible: saldo − apartado. Puede faltar si el cron aún no corrió. */
  disponibilidad?: number | null;
  /** Saldo físico. */
  existencia?: number | null;
  /** Joybees/Tommy: espejo de existencia, heredado. */
  stock?: number | null;
}

/**
 * Piezas realmente vendibles de un producto.
 *
 * Si `disponibilidad` no está (null/undefined porque el sync todavía no la
 * escribió), cae a la existencia — nunca a 0: un dato faltante no debe hacer
 * desaparecer producto del catálogo. `fallback` es para Reebok, donde la
 * existencia por talla vive en la tabla `inventory` y no en la fila del
 * producto.
 */
export function disponibleVendible(p: StockCrudo, fallback?: number | null): number {
  if (typeof p.disponibilidad === "number") return Math.max(0, p.disponibilidad);
  if (typeof p.existencia === "number") return Math.max(0, p.existencia);
  if (typeof p.stock === "number") return Math.max(0, p.stock);
  if (typeof fallback === "number") return Math.max(0, fallback);
  return 0;
}

/** ¿La disponibilidad viene del dato correcto o es un fallback a existencia? */
export function tieneDisponibilidadReal(p: StockCrudo): boolean {
  return typeof p.disponibilidad === "number";
}
