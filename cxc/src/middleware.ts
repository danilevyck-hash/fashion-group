import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "cxc_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

// Routes that don't require authentication
const PUBLIC_PATHS = [
  "/",              // login page
  "/api/auth",      // login endpoint
];

// Paths that start with these prefixes are public
const PUBLIC_PREFIXES = [
  "/api/cron/",     // cron jobs use CRON_SECRET
  "/api/catalogo/reebok/products", // public catalog reads
  "/api/catalogo/reebok/inventory", // public catalog stock
  "/api/catalogo/reebok/public",    // public catalog endpoint (no auth)
  "/catalogo-publico/",             // public catalog page (no auth)
  "/_next/",
  "/icon-",
  "/manifest",
  "/logo",
  "/reebok/",
];

// Validate session token against Supabase (direct REST call for edge compatibility)
async function isSessionValid(sessionToken: string): Promise<boolean> {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return true; // fail open if not configured

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/user_sessions?session_token=eq.${sessionToken}&revoked=eq.false&select=id`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
      }
    );
    if (!res.ok) return true; // fail open on network error
    const rows = await res.json();
    return Array.isArray(rows) && rows.length > 0;
  } catch {
    return true; // fail open on error
  }
}

// Update last_seen (fire and forget)
function touchSession(sessionToken: string) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return;

  fetch(
    `${supabaseUrl}/rest/v1/user_sessions?session_token=eq.${sessionToken}`,
    {
      method: "PATCH",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ last_seen: new Date().toISOString() }),
    }
  ).catch(() => {});
}

function clearSessionAndRedirect(req: NextRequest, pathname: string): NextResponse {
  const res = pathname.startsWith("/api/")
    ? NextResponse.json({ error: "Sesión revocada" }, { status: 401 })
    : NextResponse.redirect(new URL("/?expired=1", req.url));
  res.cookies.delete(COOKIE_NAME);
  return res;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();
  for (const prefix of PUBLIC_PREFIXES) {
    if (pathname.startsWith(prefix)) return NextResponse.next();
  }

  // Allow static files
  if (pathname.includes(".")) return NextResponse.next();

  const session = req.cookies.get(COOKIE_NAME)?.value;

  if (!session) {
    // API routes: return 401
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    // Pages: redirect to login
    return NextResponse.redirect(new URL("/", req.url));
  }

  // Validate session is parseable
  let parsed: { role?: string; sessionToken?: string };
  try {
    parsed = JSON.parse(Buffer.from(session, "base64url").toString("utf-8"));
    if (!parsed.role) throw new Error("no role");
  } catch {
    // Invalid cookie — clear it and redirect
    return clearSessionAndRedirect(req, pathname);
  }

  // Validate session token against DB (if present)
  if (parsed.sessionToken) {
    const valid = await isSessionValid(parsed.sessionToken);
    if (!valid) {
      return clearSessionAndRedirect(req, pathname);
    }
    // Update last_seen (fire and forget — non-blocking)
    touchSession(parsed.sessionToken);
  }

  // Auto-refresh: re-set cookie with fresh 7-day maxAge on every request
  const res = NextResponse.next();
  res.cookies.set(COOKIE_NAME, session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  return res;
}

export const config = {
  matcher: [
    // Match all paths except static files and _next internals
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
