import { NextRequest, NextResponse } from "next/server";
import { verifySession, type SessionPayload } from "@/lib/session-cookie";

const COOKIE_NAME = "cxc_session";

/**
 * Parses + verifies the signed session cookie set by /api/auth on login.
 * Returns the payload or null if missing/invalid/unsigned.
 */
export function getSession(req: NextRequest): SessionPayload | null {
  return verifySession(req.cookies.get(COOKIE_NAME)?.value);
}

/**
 * Guard for API routes. Returns a 401 response if the request has no valid
 * session, or a 403 if the session role is not in the allowed list.
 *
 * Usage:
 *   const authError = requireAuth(req, ["admin"]);
 *   if (authError) return authError;
 */
export function requireAuth(
  req: NextRequest,
  allowedRoles?: string[]
): NextResponse | null {
  const session = getSession(req);

  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // admin always passes role checks
  if (allowedRoles && session.role !== "admin" && !allowedRoles.includes(session.role)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  return null; // authorized
}
