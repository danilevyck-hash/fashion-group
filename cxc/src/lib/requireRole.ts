import { NextRequest, NextResponse } from "next/server";
import { verifySession, type SessionPayload } from "@/lib/session-cookie";

const COOKIE_NAME = "cxc_session";

export type { SessionPayload };

/**
 * Require an authenticated user with one of the allowed roles.
 * Admin always passes regardless of the allowedRoles list.
 *
 * The session cookie must carry a valid HMAC signature (verifySession);
 * unsigned or forged cookies are rejected with 401.
 *
 * Returns the session payload if authorized, or a NextResponse (401/403) if not.
 *
 * Usage:
 *   const auth = requireRole(req, ["admin", "secretaria"]);
 *   if (auth instanceof NextResponse) return auth;
 *   // auth is SessionPayload
 */
export function requireRole(
  req: NextRequest,
  allowedRoles: string[],
): SessionPayload | NextResponse {
  const raw = req.cookies.get(COOKIE_NAME)?.value;
  const parsed = verifySession(raw);
  if (!parsed) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // Admin always passes
  if (parsed.role === "admin") return parsed;

  if (!allowedRoles.includes(parsed.role)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  return parsed;
}
