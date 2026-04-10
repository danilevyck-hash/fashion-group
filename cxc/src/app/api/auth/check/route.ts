import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/auth/check
 * Returns 200 if session is valid (middleware already validates the cookie),
 * so if this handler runs, the user is authenticated.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Middleware validates the session cookie before this runs.
  // If we reach here, the session is valid.
  // Read cookie expiry info to help client estimate remaining time.
  const cookie = req.cookies.get("cxc_session")?.value;
  if (!cookie) {
    return NextResponse.json({ valid: false }, { status: 401 });
  }

  return NextResponse.json({ valid: true });
}
