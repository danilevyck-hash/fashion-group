import crypto from "crypto";

/**
 * Firma/verificación de la cookie de sesión `cxc_session` con HMAC-SHA256.
 *
 * Wire format: `<bodyB64url>.<sigB64url>`
 *   - body = base64url(JSON.stringify(payload))
 *   - sig  = base64url(HMAC-SHA256(SESSION_SECRET, body))
 *   - separador "." NO aparece en el alfabeto base64url → parsing inequívoco.
 *
 * Este módulo corre en runtime Node (login, helpers de API, RSC pages, crons).
 * El middleware (Edge runtime) usa `session-cookie-edge.ts` con Web Crypto;
 * ambos comparten secreto y formato → las firmas son intercambiables.
 *
 * Fail-closed: sin SESSION_SECRET, `signSession` lanza y `verifySession`
 * devuelve null (ninguna cookie se considera válida).
 */

export interface SessionPayload {
  role: string;
  userId?: string;
  userName?: string;
  modules?: string[];
  sessionToken?: string;
  isOwner?: boolean;
  empresaFilter?: string;
  guiasReadonly?: boolean;
}

const SEP = ".";

function requireSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET no configurado");
  return s;
}

function hmac(body: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("base64url");
}

/** Firma un payload de sesión. Lanza si falta SESSION_SECRET. */
export function signSession(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = hmac(body, requireSecret());
  return `${body}${SEP}${sig}`;
}

/**
 * Verifica una cookie firmada. Devuelve el payload o null si:
 * - falta el secreto (fail-closed),
 * - no tiene firma (cookies legacy sin firmar / forjadas → rechazadas),
 * - la firma no coincide (comparación timing-safe),
 * - el payload no trae `role` o `sessionToken` (token obligatorio).
 */
export function verifySession(raw: string | undefined | null): SessionPayload | null {
  if (!raw) return null;
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null; // fail-closed

  const idx = raw.indexOf(SEP);
  if (idx <= 0 || idx >= raw.length - 1) return null; // sin firma o mal formado

  const body = raw.slice(0, idx);
  const sig = raw.slice(idx + 1);
  const expected = hmac(body, secret);

  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf-8"));
    if (!payload || typeof payload.role !== "string" || !payload.role) return null;
    if (!payload.sessionToken) return null; // token requerido (defensa en profundidad)
    return payload as SessionPayload;
  } catch {
    return null;
  }
}
