import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "cxc_session";

export interface SessionPayload {
  role: string;
  userId?: string;
  userName?: string;
  modules?: string[];
  sessionToken?: string;
  isOwner?: boolean;
}

/**
 * Require an authenticated user with one of the allowed roles.
 * Admin always passes regardless of the allowedRoles list.
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
  if (!raw) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  let parsed: SessionPayload;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf-8"));
    if (!parsed.role) throw new Error("no role");
  } catch {
    return NextResponse.json({ error: "Sesión inválida" }, { status: 401 });
  }

  // Admin always passes
  if (parsed.role === "admin") return parsed;

  if (!allowedRoles.includes(parsed.role)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  return parsed;
}
