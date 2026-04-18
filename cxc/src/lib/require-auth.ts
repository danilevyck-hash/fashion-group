import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "cxc_session";

interface SessionPayload {
  role: string;
  userId?: string;
  userName?: string;
  modules?: string[];
  isOwner?: boolean;
}

/**
 * Parses the session cookie set by /api/auth on login.
 * Returns the payload or null if missing/invalid.
 */
export function getSession(req: NextRequest): SessionPayload | null {
  const raw = req.cookies.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf-8"));
    if (!parsed.role) return null;
    return parsed as SessionPayload;
  } catch {
    return null;
  }
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
