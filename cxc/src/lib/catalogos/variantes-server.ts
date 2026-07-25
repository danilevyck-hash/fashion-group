// ─────────────────────────────────────────────────────────────────────────────
// Variantes de foto en Storage — capa de servidor (SERVER-ONLY: resuelve
// clients service-role vía MARCAS_CONFIG).
//
// La convención de rutas y toda la lógica pura viven en variantes-paths.ts /
// fotos-b2b.ts; aquí solo está el I/O contra Supabase Storage y el guardado de
// la foto elegida en la tabla de productos.
//
// TOLERANCIA A DDL PENDIENTE: `foto_manual` (migración 20260725120000) puede no
// existir todavía. Todo lo que la escribe/lee hace fallback silencioso: la
// feature funciona igual, simplemente sin candado, hasta que Daniel corra la
// DDL.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MarcaConfig } from "@/lib/catalogo/marcas";
import { invalidarCatalogoPublico } from "@/lib/catalogo/cache";
import {
  STORAGE_PREFIX,
  variantesRoot,
  variantesPrefix,
  variantePath,
  fotoElegidaPath,
  vistaDesdeNombre,
  vistaActualDeImageUrl,
  type StorageMarcaKey,
} from "./variantes-paths";

const BUCKET = "product-images";
/** cacheControl 1 año: las URLs guardadas llevan `?v=` propio (ver upload/route.ts). */
const CACHE_CONTROL = "31536000";
/** Tope de `list` de Supabase Storage por página. */
const PAGE = 1000;

/** Client de Storage de la marca (mismo criterio que /upload: cfg.upload.storage). */
export async function storageDbDe(cfg: MarcaConfig): Promise<SupabaseClient> {
  return cfg.upload.storage === "main" ? await cfg.mainDb() : await cfg.db();
}

/** Lista TODOS los nombres bajo un prefijo, paginando. */
async function listarTodo(
  db: SupabaseClient,
  prefijo: string,
): Promise<{ name: string; size: number }[]> {
  const out: { name: string; size: number }[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await db.storage.from(BUCKET).list(prefijo, { limit: PAGE, offset });
    if (error) throw new Error(`list ${prefijo}: ${error.message}`);
    const page = data ?? [];
    for (const f of page) {
      out.push({ name: f.name, size: (f.metadata as { size?: number } | null)?.size ?? 0 });
    }
    if (page.length < PAGE) break;
  }
  return out;
}

/** SKUs (normalizados) que tienen al menos una variante guardada. */
export async function listarSkusConVariantes(cfg: MarcaConfig): Promise<string[]> {
  const db = await storageDbDe(cfg);
  const marca = cfg.marca as StorageMarcaKey;
  try {
    // Las "carpetas" de Storage aparecen como entradas sin metadata.
    return (await listarTodo(db, variantesRoot(marca))).map((f) => f.name).filter(Boolean);
  } catch {
    // Carpeta inexistente (nadie subió el ZIP todavía) → sin variantes.
    return [];
  }
}

export interface VarianteInfo {
  vista: number;
  url: string;
}

export interface VariantesDeSku {
  variantes: VarianteInfo[];
  /** Vista que el producto está usando hoy, o null si no se pudo determinar. */
  actual: number | null;
}

/**
 * Variantes de un SKU (orden ascendente) + cuál está puesta.
 *
 * Cómo se determina la actual — dos caminos, porque hay dos formas de que un
 * producto haya recibido su foto:
 *   1. La eligió el selector o el ZIP → `image_url` apunta al objeto de la
 *      variante y la vista se lee de la ruta. Camino normal y exacto.
 *   2. La copió el proceso de carga masiva a `{prefijo}/{sku}.jpg` → la ruta no
 *      dice nada, pero los BYTES son los mismos que los de la variante de
 *      origen. Se compara el tamaño del objeto: si coincide con una sola
 *      variante, esa es. Si empata con varias (dos vistas idénticas) se
 *      devuelve null antes que marcar la equivocada.
 */
export async function listarVariantesDeSku(cfg: MarcaConfig, sku: string): Promise<VariantesDeSku> {
  const db = await storageDbDe(cfg);
  const marca = cfg.marca as StorageMarcaKey;

  let archivos: { name: string; size: number }[];
  try {
    archivos = await listarTodo(db, variantesPrefix(marca, sku));
  } catch {
    return { variantes: [], actual: null };
  }

  const conVista = archivos
    .map((f) => ({ vista: vistaDesdeNombre(f.name), size: f.size }))
    .filter((v): v is { vista: number; size: number } => v.vista != null)
    .sort((a, b) => a.vista - b.vista);

  const variantes = conVista.map(({ vista }) => ({
    vista,
    url: db.storage.from(BUCKET).getPublicUrl(variantePath(marca, sku, vista)).data.publicUrl,
  }));
  if (variantes.length === 0) return { variantes, actual: null };

  // image_url del producto (select explícito).
  const pdb = await cfg.products.writeDb();
  const { data: prod } = await pdb
    .from(cfg.productsTable)
    .select("sku,image_url")
    .eq("sku", sku)
    .maybeSingle();
  const imageUrl = (prod as { image_url: string | null } | null)?.image_url ?? null;

  // Camino 1: la ruta nombra la variante.
  const porRuta = vistaActualDeImageUrl(imageUrl, marca, sku);
  if (porRuta != null) return { variantes, actual: porRuta };

  // Camino 2: comparar bytes con la foto elegida (copia de la carga masiva).
  if (!imageUrl) return { variantes, actual: null };
  const elegida = await listarTodo(db, STORAGE_PREFIX[marca]).catch(() => []);
  const nombreElegida = fotoElegidaPath(marca, sku).split("/").pop()!;
  const size = elegida.find((f) => f.name === nombreElegida)?.size ?? 0;
  if (!size) return { variantes, actual: null };
  const iguales = conVista.filter((v) => v.size === size);
  return { variantes, actual: iguales.length === 1 ? iguales[0].vista : null };
}

/**
 * URL pública de una variante, para guardarla en `image_url`.
 *
 * DECISIÓN (25-jul-2026): NO se copia a `{prefijo}/{sku}.jpg`. `image_url`
 * apunta directo al objeto de la variante — ver la nota larga en
 * variantes-paths.ts (vistaActualDeImageUrl). Aquí solo se verifica que el
 * objeto EXISTA antes de guardar la URL: nunca se escribe en la DB una foto
 * que no está en Storage.
 */
export async function urlDeVariante(
  cfg: MarcaConfig,
  sku: string,
  vista: number,
  opts: { verificar?: boolean } = {},
): Promise<string> {
  const db = await storageDbDe(cfg);
  const marca = cfg.marca as StorageMarcaKey;
  const path = variantePath(marca, sku, vista);

  // El manifiesto del ZIP salta la verificación (verificar:false): el navegador
  // acaba de subir esos objetos y confirmarlos uno por uno serían cientos de
  // `list` extra dentro del mismo request.
  if (opts.verificar !== false) {
    const archivos = await listarTodo(db, variantesPrefix(marca, sku)).catch(() => []);
    if (!archivos.some((f) => vistaDesdeNombre(f.name) === vista)) {
      throw new Error(`No se encontró esa foto (${vista}).`);
    }
  }

  const { publicUrl } = db.storage.from(BUCKET).getPublicUrl(path).data;
  // `?v=` fijo al momento de elegir: la ruta es estable, así que sin esto el
  // browser seguiría sirviendo los bytes viejos si la variante se re-subió.
  return `${publicUrl}?v=${Date.now()}`;
}

/**
 * Guarda la foto elegida en el producto. `manual` = la eligió una persona →
 * foto_manual=true (candado contra la asignación automática del ZIP).
 * Tolerante a DDL pendiente: si `foto_manual` no existe, guarda solo image_url.
 */
export async function guardarFotoElegida(
  cfg: MarcaConfig,
  idValue: string,
  imageUrl: string,
  manual: boolean,
): Promise<void> {
  const db = await cfg.products.writeDb();
  const idField = cfg.products.idField;

  const conFlag = await db
    .from(cfg.productsTable)
    .update({ image_url: imageUrl, foto_manual: manual })
    .eq(idField, idValue)
    .select(idField)
    .maybeSingle();
  if (!conFlag.error) {
    if (!conFlag.data) throw new Error("Producto no encontrado");
    // La foto es lo primero que ve el cliente: invalidar aquí cubre de un solo
    // punto el selector de variantes Y la carga masiva por ZIP (manifiesto),
    // que es el otro llamador. revalidateTag deduplica por request, así que un
    // ZIP de 5000 SKUs invalida la tag UNA vez.
    invalidarCatalogoPublico(cfg.marca);
    return;
  }
  if (!conFlag.error.message.includes("foto_manual")) throw new Error(conFlag.error.message);

  // Fallback pre-migración 20260725120000.
  const sinFlag = await db
    .from(cfg.productsTable)
    .update({ image_url: imageUrl })
    .eq(idField, idValue)
    .select(idField)
    .maybeSingle();
  if (sinFlag.error) throw new Error(sinFlag.error.message);
  if (!sinFlag.data) throw new Error("Producto no encontrado");
  invalidarCatalogoPublico(cfg.marca);
}

/**
 * SKUs de la marca con la foto elegida a mano (foto_manual=true). Pre-migración
 * devuelve vacío: sin la columna no hay candados que respetar.
 */
export async function skusConFotoManual(cfg: MarcaConfig): Promise<Set<string>> {
  const db = await cfg.products.writeDb();
  const { data, error } = await db
    .from(cfg.productsTable)
    .select("sku")
    .eq("foto_manual", true);
  if (error) return new Set();
  return new Set((data ?? []).map((r) => String((r as { sku: string | null }).sku ?? "")).filter(Boolean));
}

/** Borra todos los objetos de una carpeta de variantes. Devuelve bytes liberados. */
export async function borrarCarpetaVariantes(
  db: SupabaseClient,
  prefijo: string,
): Promise<number> {
  const archivos = await listarTodo(db, prefijo);
  if (archivos.length === 0) return 0;
  const paths = archivos.map((f) => `${prefijo}/${f.name}`);
  const { error } = await db.storage.from(BUCKET).remove(paths);
  if (error) throw new Error(error.message);
  return archivos.reduce((s, f) => s + f.size, 0);
}

/** Carpetas de variantes de una marca con su tamaño total (para housekeeping). */
export async function medirCarpetasVariantes(
  cfg: MarcaConfig,
): Promise<{ skuStorage: string; bytes: number }[]> {
  const db = await storageDbDe(cfg);
  const marca = cfg.marca as StorageMarcaKey;
  const root = variantesRoot(marca);
  let carpetas: { name: string }[];
  try {
    carpetas = await listarTodo(db, root);
  } catch {
    return [];
  }
  const out: { skuStorage: string; bytes: number }[] = [];
  for (const c of carpetas) {
    if (!c.name) continue;
    try {
      const archivos = await listarTodo(db, `${root}/${c.name}`);
      out.push({ skuStorage: c.name, bytes: archivos.reduce((s, f) => s + f.size, 0) });
    } catch {
      // Una carpeta ilegible no debe tumbar la medición completa.
    }
  }
  return out;
}

export { BUCKET, CACHE_CONTROL };
