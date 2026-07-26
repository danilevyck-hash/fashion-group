// Validación server-side del POST público de pedidos Tommy Hilfiger
// (/api/catalogo/tommy/pedido-publico). Espejo de
// joybees-pedido-publico-validate: NADA del body se confía. Funciones PURAS
// (sin I/O) para testear con vitest.
//
// Igual que Joybees:
//   * Tommy es 100% calzado → bulto SIEMPRE 12 (no hay category que defina el
//     tamaño del bulto). applyDbPrices solo reemplaza el precio y el total usa
//     calculateTommyOrderTotal (sin category).
//   * Sin is_preorder (Tommy no tiene preventa — feature flag off).
//
// Dos fases:
//   1. validatePedidoBody(body)      — estructura y límites (tipos, rangos, tamaños).
//   2. applyDbPrices(items, precios) — el precio del cliente NO se confía: se
//      reemplaza por el real de `tommy_products` y el total se calcula
//      server-side. product_id desconocido → RECHAZO (el sync oculta con
//      active=false, nunca borra; un id desconocido es un carrito forjado).
//
// Mensajes de error en español simple y accionable — los leen clientes no técnicos.

import { calculateTommyOrderTotal } from "./tommy-order-total";
import { NOMBRE_MIN, NOMBRE_MAX, validarNombreCliente } from "@/lib/catalogo/nombre-cliente";

export const MAX_ITEMS = 200;
export const MAX_QUANTITY = 500;
export const MAX_UNIT_PRICE = 10000;
export const MAX_STR_LEN = 200;      // sku / name
export const MAX_IMAGE_URL_LEN = 1000;
// El nombre del cliente lo valida la regla ÚNICA de las 3 marcas
// (lib/catalogo/nombre-cliente): mínimo 3 LETRAS. Se re-exporta para no romper
// a quien importe NOMBRE_MIN/NOMBRE_MAX desde aquí.
export { NOMBRE_MIN, NOMBRE_MAX };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Item saneado (whitelist de campos — lo que guarda el JSONB y lee la página
 *  /pedido-tommy/[id]: foto, nombre, sku, cantidad, precio). Sin category ni
 *  is_preorder (Tommy es todo calzado, sin preventa). */
export interface PedidoItem {
  product_id: string;
  sku: string;
  name: string;
  image_url: string | null;
  quantity: number;
  unit_price: number;
}

export type BodyValidationResult =
  | { ok: true; items: PedidoItem[]; cliente_nombre: string }
  | { ok: false; error: string };

const ERR_ITEM_INVALIDO =
  "Hay un producto inválido en el carrito. Actualiza la página e intenta de nuevo.";

/** Fase 1 — valida estructura y límites del body crudo. Sin I/O. */
export function validatePedidoBody(body: unknown): BodyValidationResult {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Pedido inválido. Actualiza la página e intenta de nuevo." };
  }
  const b = body as Record<string, unknown>;

  const nombre = validarNombreCliente(b.cliente_nombre);
  if (!nombre.ok) return { ok: false, error: nombre.error };
  const cliente_nombre = nombre.nombre;

  const rawItems = b.items;
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { ok: false, error: "El carrito está vacío" };
  }
  if (rawItems.length > MAX_ITEMS) {
    return { ok: false, error: `El pedido tiene demasiados productos (máximo ${MAX_ITEMS}). Divide tu pedido en dos.` };
  }

  const items: PedidoItem[] = [];
  for (const raw of rawItems) {
    if (typeof raw !== "object" || raw === null) return { ok: false, error: ERR_ITEM_INVALIDO };
    const it = raw as Record<string, unknown>;

    const product_id = typeof it.product_id === "string" ? it.product_id.trim() : "";
    if (!UUID_RE.test(product_id)) return { ok: false, error: ERR_ITEM_INVALIDO };

    const name = typeof it.name === "string" ? it.name.trim() : "";
    if (!name || name.length > MAX_STR_LEN) return { ok: false, error: ERR_ITEM_INVALIDO };

    const sku = typeof it.sku === "string" ? it.sku.trim() : "";
    if (sku.length > MAX_STR_LEN) return { ok: false, error: ERR_ITEM_INVALIDO };

    const quantity = it.quantity;
    if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      return { ok: false, error: `La cantidad de "${name || "un producto"}" no es válida (debe ser entre 1 y ${MAX_QUANTITY} bultos).` };
    }

    const unit_price = it.unit_price;
    if (typeof unit_price !== "number" || !Number.isFinite(unit_price) || unit_price <= 0 || unit_price > MAX_UNIT_PRICE) {
      return { ok: false, error: `El precio de "${name || "un producto"}" no es válido. Actualiza la página e intenta de nuevo.` };
    }

    const image_url =
      typeof it.image_url === "string" && it.image_url.length <= MAX_IMAGE_URL_LEN && it.image_url.length > 0
        ? it.image_url
        : null;

    items.push({ product_id, sku, name, image_url, quantity, unit_price });
  }

  return { ok: true, items, cliente_nombre };
}

/** Precio real según la tabla `tommy_products` (una fila por product_id). */
export interface ProductPriceInfo {
  price: number;
}

export type PricedResult =
  | { ok: true; items: PedidoItem[]; total: number; adjusted: boolean }
  | { ok: false; error: string };

/**
 * Fase 2 — reemplaza unit_price de cada item por el valor real de la DB y calcula
 * el total server-side (bulto 12). `adjusted=true` si algún precio del cliente
 * difería del real (para loguearlo). Pura: recibe el Map ya consultado.
 */
export function applyDbPrices(
  items: PedidoItem[],
  products: Map<string, ProductPriceInfo>,
): PricedResult {
  const priced: PedidoItem[] = [];
  let adjusted = false;

  for (const item of items) {
    const info = products.get(item.product_id);
    if (!info) {
      return { ok: false, error: `"${item.name}" ya no está disponible en el catálogo. Quítalo del carrito e intenta de nuevo.` };
    }
    const dbPrice = Number(info.price);
    if (!Number.isFinite(dbPrice) || dbPrice <= 0) {
      return { ok: false, error: `El precio de "${item.name}" no está disponible en este momento. Intenta de nuevo más tarde.` };
    }
    if (dbPrice !== item.unit_price) {
      adjusted = true;
    }
    priced.push({ ...item, unit_price: dbPrice });
  }

  const total = Math.round(calculateTommyOrderTotal(priced) * 100) / 100;
  return { ok: true, items: priced, total, adjusted };
}
