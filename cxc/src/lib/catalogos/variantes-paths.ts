// ─────────────────────────────────────────────────────────────────────────────
// Rutas de Storage de las fotos de catálogo. Módulo PURO y CLIENT-SAFE (sin
// imports): lo leen tanto MARCAS_CONFIG (server) como MARCA_THEME (cliente),
// así el prefijo de cada marca tiene UNA sola fuente y no puede divergir.
//
// Bucket único: `product-images` (el que ya usa la app).
//
//   Foto elegida:  {prefijo}/{skuStorage}.jpg
//   Variantes:     {prefijo}/_v/{skuStorage}/{n}.jpg     (n = vista del B2B)
//
// `skuStorage` = normalizarSkuStorage(sku) — minúsculas sin separadores. Es la
// convención con la que ya viven las fotos de Tommy en Storage.
// ─────────────────────────────────────────────────────────────────────────────

import { normalizarSkuStorage } from "./fotos-b2b";

/** Prefijo (carpeta raíz) de cada marca dentro del bucket product-images.
 *  Reebok usa "products" por herencia — NO renombrar: hay ~200 fotos vivas
 *  ahí y image_url apunta a esas rutas. */
export const STORAGE_PREFIX = {
  reebok: "products",
  joybees: "joybees",
  tommy: "tommy",
} as const;

export type StorageMarcaKey = keyof typeof STORAGE_PREFIX;

/** Carpeta que agrupa TODAS las variantes de una marca. */
export function variantesRoot(marca: StorageMarcaKey): string {
  return `${STORAGE_PREFIX[marca]}/_v`;
}

/** Carpeta de variantes de un SKU. */
export function variantesPrefix(marca: StorageMarcaKey, sku: string): string {
  return `${variantesRoot(marca)}/${normalizarSkuStorage(sku)}`;
}

/** Objeto de una variante concreta. */
export function variantePath(marca: StorageMarcaKey, sku: string, vista: number): string {
  return `${variantesPrefix(marca, sku)}/${vista}.jpg`;
}

/** Objeto de la foto ELEGIDA (la que ve el catálogo). */
export function fotoElegidaPath(marca: StorageMarcaKey, sku: string): string {
  return `${STORAGE_PREFIX[marca]}/${normalizarSkuStorage(sku)}.jpg`;
}

/**
 * ¿Es `path` exactamente la ruta de una variante bajo `root`?
 *
 * SEGURIDAD: gobierna qué rutas se firman para subida directa desde el
 * navegador. Un token firmado escribe ese objeto saltándose RLS, así que solo
 * se acepta la forma canónica `{prefijo}/_v/{skuStorage}/{n}.jpg` — nunca la
 * foto elegida, ni otra marca, ni nada fuera de `_v/`.
 */
export function pathDeVarianteValido(path: string, root: string): boolean {
  if (typeof path !== "string" || path.includes("..") || path.includes("//")) return false;
  const escapado = root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escapado}/[a-z0-9]+/\\d{1,3}\\.jpg$`).test(path);
}

/** `{prefijo}/_v/{sku}/12.jpg` → 12. null si el nombre no es una vista. */
export function vistaDesdeNombre(nombre: string): number | null {
  const m = (nombre || "").match(/^(\d{1,3})\.jpg$/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/**
 * Qué variante está usando hoy un producto, leyendo su `image_url`.
 *
 * DECISIÓN (25-jul-2026): la foto elegida NO se copia a `{prefijo}/{sku}.jpg`;
 * `image_url` apunta DIRECTO al objeto de la variante. Es lo más simple y lo
 * más consistente con cómo el catálogo público lee la foto (lee `image_url` y
 * ya), no duplica ~25 KB por producto en Storage, y hace que "cuál está
 * puesta" sea un dato derivable — que es justo lo que necesita el ✓ del
 * selector. El housekeeping no puede dejar huérfana ninguna foto porque solo
 * borra las carpetas de SKUs que ya no existen como fila.
 *
 * Devuelve null si la foto no viene del banco (subida a mano, legacy, o vacía).
 */
export function vistaActualDeImageUrl(
  imageUrl: string | null | undefined,
  marca: StorageMarcaKey,
  sku: string,
): number | null {
  if (!imageUrl) return null;
  const sinQuery = imageUrl.split("?")[0];
  const prefijo = `${variantesPrefix(marca, sku)}/`;
  const i = sinQuery.indexOf(prefijo);
  if (i < 0) return null;
  return vistaDesdeNombre(sinQuery.slice(i + prefijo.length));
}
