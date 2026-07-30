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

/**
 * ¿Este producto tiene ALTERNATIVAS de foto, o sea alguna guardada DISTINTA a
 * la que ya está puesta?
 *
 * 🩸 EL BUG QUE ARREGLA (30-jul-2026). Daniel, con captura del producto
 * `THS10159C000`: "no me deberia de salir el boton de Cambiar foto si no hay
 * opciones". El botón se pintaba con solo EXISTIR la carpeta `_v/{sku}/`, y tras
 * la limpieza del banco esa carpeta conserva UN archivo: justamente la foto
 * elegida. O sea que existía carpeta, se pintaba el botón, y recién al tocarlo
 * aparecía "Este código no tiene más fotos guardadas" — enterarse después de
 * tocar es exactamente lo que él no quiere.
 *
 * La pregunta correcta no es "¿hay carpeta?" ni "¿hay fotos?", es **"¿hay
 * alguna foto que NO sea la puesta?"**. Con las vistas de cada SKU y su
 * `image_url` se responde exacto y sin una sola consulta extra.
 *
 * @param vistas  vistas guardadas del SKU (`undefined` = no hay carpeta)
 * @param exacto  false = no se pudo saber el contenido de la carpeta (Storage
 *                no soportó el listado recursivo). Se degrada a "sí hay": ante
 *                la duda es mejor mostrar el botón de más que esconder una
 *                función que sirve.
 */
export function tieneAlternativas(
  vistas: readonly number[] | undefined,
  imageUrl: string | null | undefined,
  marca: StorageMarcaKey,
  sku: string,
  exacto: boolean = true,
): boolean {
  if (vistas === undefined) return false; // sin carpeta → no hay nada que elegir
  if (!exacto) return true;
  if (vistas.length === 0) return false;
  const actual = vistaActualDeImageUrl(imageUrl, marca, sku);
  // La foto puesta no sale del banco (subida a mano/legacy) → TODAS son alternativas.
  if (actual == null) return true;
  return vistas.some((v) => v !== actual);
}

/** Cuántas fotos alternativas hay (0 = no se pinta el botón). */
export function contarAlternativas(
  vistas: readonly number[] | undefined,
  imageUrl: string | null | undefined,
  marca: StorageMarcaKey,
  sku: string,
  exacto: boolean = true,
): number {
  if (!tieneAlternativas(vistas, imageUrl, marca, sku, exacto)) return 0;
  if (!exacto || !vistas) return 1; // no sabemos cuántas; alcanza con "hay"
  const actual = vistaActualDeImageUrl(imageUrl, marca, sku);
  return actual == null ? vistas.length : vistas.filter((v) => v !== actual).length;
}
