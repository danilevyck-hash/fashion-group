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

// scope = "galeria" (fotos) | "facturas" (PDF combinado) | "entrega"
// (comprobante de entrega de mobiliario; acá el "codigo" es el id de la
// entrega, no el del cliente). Namespaces separados para que un token de una
// vista no sirva para la otra.
function firmar(scope: string, codigo: string, secret: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(`${scope}:${codigo}`)
    .digest("base64url");
}

function verificar(
  scope: string,
  codigo: string,
  token: string | undefined | null,
): boolean {
  const secret = process.env.SESSION_SECRET;
  if (!secret || !token) return false; // fail-closed
  const expected = firmar(scope, codigo, secret);
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function signGalleryToken(clienteCodigo: string): string {
  return firmar("galeria", clienteCodigo, requireSecret());
}

export function verifyGalleryToken(
  clienteCodigo: string,
  token: string | undefined | null,
): boolean {
  return verificar("galeria", clienteCodigo, token);
}

export function signFacturasToken(clienteCodigo: string): string {
  return firmar("facturas", clienteCodigo, requireSecret());
}

export function verifyFacturasToken(
  clienteCodigo: string,
  token: string | undefined | null,
): boolean {
  return verificar("facturas", clienteCodigo, token);
}

/**
 * Comprobante de entrega de mobiliario. El sujeto del token es el ID DE LA
 * ENTREGA (no el cliente): un comprobante es un documento puntual, y tener el
 * link de uno no debe abrir los de las demás entregas del mismo cliente.
 */
export function signEntregaToken(entregaId: string): string {
  return firmar("entrega", entregaId, requireSecret());
}

export function verifyEntregaToken(
  entregaId: string,
  token: string | undefined | null,
): boolean {
  return verificar("entrega", entregaId, token);
}
