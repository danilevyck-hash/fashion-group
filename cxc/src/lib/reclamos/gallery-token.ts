import crypto from "crypto";

/**
 * Token HMAC para la galería pública de fotos por RECLAMO.
 *
 * Espejo de lib/marketing/gallery-token.ts, pero con namespace propio
 * (`galeria-reclamo:<reclamoId>`) para que un token de galería de reclamo NUNCA
 * pueda confundirse con el de marketing, ni con una cookie de sesión.
 *
 * Reusa SESSION_SECRET. Sin expiración: el acceso se controla por POSEER el
 * token correcto del reclamo. Cada reclamo tiene su propio token; conocer el de
 * uno no da acceso a otro. La galería expone SOLO las fotos de ese reclamo.
 *
 * Fail-closed: sin SESSION_SECRET, `verify*` devuelve false y `sign*` lanza.
 */

const SCOPE = "galeria-reclamo";
const GALERIA_BASE = process.env.NEXT_PUBLIC_SITE_URL || "https://www.fashiongr.com";

function requireSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET no configurado");
  return s;
}

function firmar(reclamoId: string, secret: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(`${SCOPE}:${reclamoId}`)
    .digest("base64url");
}

export function signReclamoGalleryToken(reclamoId: string): string {
  return firmar(reclamoId, requireSecret());
}

export function verifyReclamoGalleryToken(
  reclamoId: string,
  token: string | undefined | null,
): boolean {
  const secret = process.env.SESSION_SECRET;
  if (!secret || !token) return false; // fail-closed
  const expected = firmar(reclamoId, secret);
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** URL web absoluta de la galería de un reclamo (con su token firmado). La usan
 *  los generadores de Excel para el link "Ver fotos". Mismo patrón GALERIA_BASE
 *  que Marketing (NEXT_PUBLIC_SITE_URL || www.fashiongr.com). */
export function reclamoGaleriaUrl(reclamoId: string): string {
  return `${GALERIA_BASE}/reclamos/galeria/${encodeURIComponent(reclamoId)}?t=${signReclamoGalleryToken(reclamoId)}`;
}
