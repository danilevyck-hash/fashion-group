import { supabaseServer } from "@/lib/supabase-server";

// Bucket PRIVADO dedicado a los PDFs de factura de reclamos. Se sirve SOLO con
// signed URL (TTL 1h) — nunca getPublicUrl. Patrón espejo de src/lib/marketing/
// storage.ts.
export const FACTURA_BUCKET = "reclamo-facturas";
const DEFAULT_TTL_SECONDS = 60 * 60; // 1h
// TTL largo para los links del Excel EXPORTADO (mismo enfoque que Marketing
// zip-export.ts): la factura sigue en bucket PRIVADO, pero el link firmado dura
// ~1 año para que abra con un clic en el navegador (Mac/Windows), sin extraer
// nada y sin exponer el bucket.
export const FACTURA_LINK_TTL_SECONDS = 60 * 60 * 24 * 365; // 1 año
const SIGN_RETRY_DELAY_MS = 250;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Firma un path del bucket privado de facturas (signed URL, TTL 1h por defecto).
 *  Reintenta una vez: un archivo recién subido puede no estar propagado al
 *  primer intento. */
export async function firmarFacturaPath(
  path: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<string> {
  let lastError: string | null = null;
  for (let intento = 0; intento < 2; intento++) {
    if (intento > 0) await sleep(SIGN_RETRY_DELAY_MS);
    const { data, error } = await supabaseServer.storage
      .from(FACTURA_BUCKET)
      .createSignedUrl(path, ttlSeconds);
    if (data && !error) return data.signedUrl;
    lastError = error?.message ?? null;
  }
  throw new Error(lastError ?? "No se pudo firmar URL de factura");
}

/** Firma sin lanzar: devuelve null si falla (para no romper el GET del detalle). */
export async function firmarFacturaPathSafe(
  path: string | null | undefined,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<string | null> {
  if (!path) return null;
  try {
    return await firmarFacturaPath(path, ttlSeconds);
  } catch (err) {
    console.warn(
      "firmarFacturaPathSafe: no se pudo firmar",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/** Firma en LOTE varios paths del bucket privado (createSignedUrls). Devuelve un
 *  mapa path→signedUrl. Dedupe. TTL largo por defecto (1 año) para los links del
 *  Excel exportado. Espejo de marketing/zip-export.ts firmarLote. */
export async function firmarFacturasLote(
  paths: ReadonlyArray<string>,
  ttlSeconds: number = FACTURA_LINK_TTL_SECONDS,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = Array.from(new Set(paths.filter((p): p is string => !!p)));
  if (unique.length === 0) return map;
  const { data } = await supabaseServer.storage
    .from(FACTURA_BUCKET)
    .createSignedUrls(unique, ttlSeconds);
  for (const row of data ?? []) {
    if (row.signedUrl && row.path) map.set(row.path, row.signedUrl);
  }
  return map;
}

/** Adjunta `factura_pdf_url` (signed URL web, TTL largo) a cada reclamo que tenga
 *  `factura_pdf_path`. Lo usan los exports de Excel para poner un link WEB de un
 *  clic (no ruta relativa al ZIP) sin volver público el bucket. */
export async function adjuntarFacturaUrls<T extends { factura_pdf_path?: string | null }>(
  reclamos: T[],
  ttlSeconds: number = FACTURA_LINK_TTL_SECONDS,
): Promise<(T & { factura_pdf_url: string | null })[]> {
  const paths = reclamos
    .map((r) => r.factura_pdf_path)
    .filter((p): p is string => !!p);
  const urlMap = await firmarFacturasLote(paths, ttlSeconds);
  return reclamos.map((r) => ({
    ...r,
    factura_pdf_url: r.factura_pdf_path ? urlMap.get(r.factura_pdf_path) ?? null : null,
  }));
}
