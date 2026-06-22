import { supabaseServer } from "@/lib/supabase-server";

// Bucket PRIVADO dedicado a los PDFs de factura de reclamos. Se sirve SOLO con
// signed URL (TTL 1h) — nunca getPublicUrl. Patrón espejo de src/lib/marketing/
// storage.ts.
export const FACTURA_BUCKET = "reclamo-facturas";
const DEFAULT_TTL_SECONDS = 60 * 60; // 1h
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
