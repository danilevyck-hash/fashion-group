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

/**
 * Vistas guardadas de CADA SKU, en UNA sola llamada a Storage.
 *
 * 🩸 POR QUÉ ASÍ Y NO CONTANDO CARPETA POR CARPETA. Para decidir si se pinta el
 * botón "Cambiar foto" hay que saber QUÉ hay dentro de cada carpeta, no solo si
 * la carpeta existe. La forma obvia —un `list()` por SKU— serían 383 llamadas
 * en cada carga de la pantalla de Tommy, y los metadatos de Storage viven en el
 * mismo Postgres que el negocio: es justo la clase de barrido que ya tumbó la
 * base dos veces esta semana.
 *
 * `list-v2` con `delimiter: ""` devuelve las rutas COMPLETAS de forma recursiva,
 * así que todo el banco de una marca entra en 1 llamada (Tommy: 383 objetos,
 * 1 página). Verificado contra producción el 30-jul-2026. Es el MISMO costo que
 * tenía el listado de carpetas que reemplaza.
 *
 * DEGRADACIÓN SEGURA: si `list-v2` no existe o falla, se vuelve al listado de
 * carpetas de siempre y se marca `exacto: false`. El cliente entonces trata
 * "hay carpeta" como "hay alternativas" — el comportamiento viejo. Ante la duda
 * se muestra el botón de más; nunca se esconde una función que sirve.
 */
export async function listarVistasPorSku(
  cfg: MarcaConfig,
): Promise<{ vistas: Record<string, number[]>; exacto: boolean }> {
  const db = await storageDbDe(cfg);
  const marca = cfg.marca as StorageMarcaKey;
  const root = variantesRoot(marca);

  try {
    // `list-v2` no está en supabase-js: se llama por REST con las credenciales
    // del MISMO client de la marca (nada de leer env por acá, que se desviaría
    // de cómo cada marca resuelve su proyecto).
    const anon = db as unknown as { supabaseKey: string; storage: { url: string } };
    const url = `${anon.storage.url}/object/list-v2/${BUCKET}`;
    const headers = {
      apikey: anon.supabaseKey,
      Authorization: `Bearer ${anon.supabaseKey}`,
      "Content-Type": "application/json",
    };

    const vistas: Record<string, number[]> = {};
    let cursor: string | undefined;
    for (let pagina = 0; pagina < 50; pagina++) {
      const resp = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ prefix: `${root}/`, limit: PAGE, delimiter: "", ...(cursor ? { cursor } : {}) }),
      });
      if (!resp.ok) throw new Error(`list-v2 ${resp.status}`);
      const json = (await resp.json()) as { objects?: { name: string }[]; hasNext?: boolean };
      const objetos = json.objects ?? [];
      for (const o of objetos) {
        // `{prefijo}/_v/{skuStorage}/{vista}.jpg` — ruta COMPLETA.
        const m = String(o.name).match(/\/_v\/([^/]+)\/([^/]+)$/);
        if (!m) continue;
        const vista = vistaDesdeNombre(m[2]);
        if (vista == null) continue;
        (vistas[m[1]] ??= []).push(vista);
      }
      if (!json.hasNext || objetos.length === 0) break;
      cursor = objetos[objetos.length - 1].name;
    }
    for (const k of Object.keys(vistas)) vistas[k].sort((a, b) => a - b);
    return { vistas, exacto: true };
  } catch {
    // Degradación segura: solo sabemos qué carpetas existen → el cliente vuelve
    // al comportamiento de antes (carpeta = hay alternativas).
    try {
      const vistas: Record<string, number[]> = {};
      for (const f of await listarTodo(db, root)) if (f.name) vistas[f.name] = [];
      return { vistas, exacto: false };
    } catch {
      return { vistas: {}, exacto: true }; // sin carpeta raíz: nadie subió el ZIP
    }
  }
}

/** SKUs (normalizados) que tienen al menos una variante guardada. Solo la usa
 *  el fallback de `listarVistasPorSku`: la pantalla necesita el CONTENIDO de
 *  cada carpeta, no la lista de carpetas. */
async function listarSkusConVariantes(cfg: MarcaConfig): Promise<string[]> {
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
