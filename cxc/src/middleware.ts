import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "cxc_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

// Routes that don't require authentication
const PUBLIC_PATHS = [
  "/",              // login page
  "/api/auth",      // login endpoint
  "/catalogo/reebok/auth", // reebok auth has its own password
];

// Paths that start with these prefixes are public
const PUBLIC_PREFIXES = [
  "/api/cron/",     // cron jobs use CRON_SECRET
  "/api/catalogo/reebok/auth", // reebok separate auth
  "/api/catalogo/reebok/products", // public catalog reads
  "/api/catalogo/reebok/inventory", // public catalog stock
  "/_next/",
  "/icon-",
  "/manifest",
  "/logo",
  "/reebok/",
];

export function middleware(req: NextRequest) {
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
  try {
    const parsed = JSON.parse(Buffer.from(session, "base64url").toString("utf-8"));
    if (!parsed.role) throw new Error("no role");
  } catch {
    // Invalid cookie — clear it and redirect
    const res = pathname.startsWith("/api/")
      ? NextResponse.json({ error: "Sesión inválida" }, { status: 401 })
      : NextResponse.redirect(new URL("/", req.url));
    res.cookies.delete(COOKIE_NAME);
    return res;
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
