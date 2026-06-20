import crypto from "crypto";

/**
 * Token HMAC para la galería pública de fotos por cliente.
 *
 * Reusa SESSION_SECRET (mismo secreto que la cookie de sesión) pero con un
 * namespace propio (`galeria:<codigo>`) para que un token de galería NUNCA
 * pueda confundirse con una cookie de sesión ni viceversa.
 *
 * Sin expiración: el acceso se controla por POSEER el token correcto del
 * cliente. Cada cliente tiene su propio token; conocer el de uno no da acceso
 * a otro. La galería expone SOLO las fotos de ese cliente (ver galeria.ts).
 *
 * Fail-closed: sin SESSION_SECRET, `verifyGalleryToken` devuelve false y
 * `signGalleryToken` lanza.
 */

function requireSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET no configurado");
  return s;
}

function firmar(codigo: string, secret: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(`galeria:${codigo}`)
    .digest("base64url");
}

export function signGalleryToken(clienteCodigo: string): string {
  return firmar(clienteCodigo, requireSecret());
}

export function verifyGalleryToken(
  clienteCodigo: string,
  token: string | undefined | null,
): boolean {
  const secret = process.env.SESSION_SECRET;
  if (!secret || !token) return false; // fail-closed
  const expected = firmar(clienteCodigo, secret);
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
