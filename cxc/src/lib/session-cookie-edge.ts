import type { SessionPayload } from "./session-cookie";

/**
 * Verificación de la cookie `cxc_session` en runtime Edge (middleware).
 *
 * Mismo wire format y secreto que `session-cookie.ts`, pero usando Web Crypto
 * (`crypto.subtle`, async) porque el Edge runtime no expone `node:crypto`.
 *
 * IMPORTANTE: este archivo NO debe importar nada de `node:crypto` ni de
 * `session-cookie.ts` en runtime. El `import type` de arriba se borra en
 * compilación, así que no arrastra código Node al bundle Edge.
 */

const SEP = ".";

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToB64url(buf: ArrayBuffer): string {
  const arr = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmacEdge(body: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return bytesToB64url(sigBuf);
}

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Verifica la cookie firmada en Edge. Devuelve el payload o null. */
export async function verifySessionEdge(
  raw: string | undefined | null,
): Promise<SessionPayload | null> {
  if (!raw) return null;
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null; // fail-closed

  const idx = raw.indexOf(SEP);
  if (idx <= 0 || idx >= raw.length - 1) return null;

  const body = raw.slice(0, idx);
  const sig = raw.slice(idx + 1);
  const expected = await hmacEdge(body, secret);
  if (!timingSafeEqualStr(sig, expected)) return null;

  try {
    const json = new TextDecoder().decode(b64urlToBytes(body));
    const payload = JSON.parse(json);
    if (!payload || typeof payload.role !== "string" || !payload.role) return null;
    if (!payload.sessionToken) return null;
    return payload as SessionPayload;
  } catch {
    return null;
  }
}
