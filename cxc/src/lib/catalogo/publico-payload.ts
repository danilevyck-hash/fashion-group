// ─────────────────────────────────────────────────────────────────────────────
// QUÉ SE LE MANDA AL NAVEGADOR DEL CLIENTE — y qué NO (7-sep-2026).
//
// 🩸 LA EXISTENCIA FÍSICA VIAJABA Y NADIE LA DIBUJABA. Las 4 marcas mandaban
// `existencia` (y `stock`, su espejo) en el paquete público junto a
// `disponibilidad`, que es la ÚNICA que se pinta. No son el mismo número:
// existencia es lo que hay en la bodega y disponibilidad es lo vendible
// (existencia − apartado). Cualquiera con el catálogo abierto y la consola del
// navegador leía el inventario real del grupo.
//
// 🔑 LA REGLA: el servidor RESUELVE y manda UN solo número. `disponibilidad`
// sale de `disponibleVendible` —la misma función de siempre, con su caída a
// existencia cuando el sync todavía no escribió la columna—, pero esa caída
// ocurre ACÁ, del lado del servidor. Afuera nunca sale un segundo número.
//
// ⚠️ NO se puede resolver quitando las columnas de la LECTURA: sin `existencia`
// el fallback desaparece y un producto con el sync a medias se vería agotado.
// Se leen las tres y se responde una.
//
// 🩸 REEBOK MANDABA CUATRO COLUMNAS MÁS que las otras tres no mandan
// (`description`, `sub_category`, `on_sale`, `created_at`) y ninguna se dibuja:
// herencia de cuando era la única marca. Esas salen de la LECTURA (ver
// `publicCatalog.cols` en `marcas.ts`), no de acá — este módulo se ocupa del
// stock, que sí hay que leer para poder resolverlo.
//
// 🩸 Y REEBOK MANDABA EL INVENTARIO DE PRODUCTOS APAGADOS. `inventory` se leía
// entera mientras `products` se acotaba a `active = true`, así que viajaban
// filas de tallas de productos que el cliente no ve en ninguna parte. Se acota
// a los productos que sí van en el mismo paquete.
//
// PURO, sin I/O: recibe las filas crudas y devuelve las que salen. Así el
// contrato de lo que ve el cliente se prueba sin base de datos.
// ─────────────────────────────────────────────────────────────────────────────

import { disponibleVendible } from "@/lib/catalogos/disponible";

/** Columnas de stock que NUNCA salen del servidor. `disponibilidad` sí sale,
 *  ya resuelta. */
export const COLUMNAS_QUE_NO_VIAJAN = ["existencia", "stock"] as const;

interface FilaCruda {
  id?: unknown;
  disponibilidad?: number | null;
  existencia?: number | null;
  stock?: number | null;
  [k: string]: unknown;
}

interface FilaInventario {
  product_id?: unknown;
  [k: string]: unknown;
}

/**
 * Una fila de producto como la ve el cliente: sin existencia ni stock, y con
 * `disponibilidad` ya resuelta (nunca `null`).
 *
 * `fallback` es para Reebok, donde la existencia por talla vive en `inventory`
 * y no en la fila del producto — el mismo argumento de `disponibleVendible`.
 */
export function filaPublica(p: FilaCruda, fallback?: number | null): Record<string, unknown> {
  const salida: Record<string, unknown> = {};
  for (const [clave, valor] of Object.entries(p)) {
    if ((COLUMNAS_QUE_NO_VIAJAN as readonly string[]).includes(clave)) continue;
    salida[clave] = valor;
  }
  salida.disponibilidad = disponibleVendible(p, fallback);
  return salida;
}

/** Suma de piezas por producto del inventario por talla (Reebok). */
function existenciaPorProducto(inventory: FilaInventario[]): Map<string, number> {
  const suma = new Map<string, number>();
  for (const fila of inventory) {
    const id = typeof fila.product_id === "string" ? fila.product_id : null;
    if (!id) continue;
    const q = typeof fila.quantity === "number" ? fila.quantity : 0;
    suma.set(id, (suma.get(id) || 0) + q);
  }
  return suma;
}

export interface PaquetePublico {
  products: Record<string, unknown>[];
  inventory?: FilaInventario[];
}

/**
 * El paquete que sale al navegador del cliente.
 *
 * · Cada producto pasa por `filaPublica`.
 * · El inventario (solo Reebok) se ACOTA a los productos del mismo paquete:
 *   una talla de un producto apagado no se le nombra a nadie.
 */
export function paquetePublico(
  products: FilaCruda[],
  inventory?: FilaInventario[],
): PaquetePublico {
  const vivos = new Set(
    products.map((p) => (typeof p.id === "string" ? p.id : "")).filter(Boolean),
  );
  const porProducto = inventory ? existenciaPorProducto(inventory) : null;

  const salidaProductos = products.map((p) => {
    const id = typeof p.id === "string" ? p.id : "";
    return filaPublica(p, porProducto ? (porProducto.get(id) ?? null) : undefined);
  });

  if (!inventory) return { products: salidaProductos };

  return {
    products: salidaProductos,
    inventory: inventory.filter(
      (f) => typeof f.product_id === "string" && vivos.has(f.product_id),
    ),
  };
}
