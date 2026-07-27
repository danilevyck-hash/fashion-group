import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { verifySessionEdge } from "@/lib/session-cookie-edge";

const COOKIE_NAME = "cxc_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

// Routes that don't require authentication
const PUBLIC_PATHS = [
  "/",              // login page
  "/api/auth",      // login endpoint
];

// Extensiones de assets ESTÁTICOS reales. Antes el middleware dejaba pasar sin
// auth cualquier pathname con un "." (`pathname.includes(".")`), lo que abría un
// bypass: una ruta API/página con un punto en un parámetro (ej.
// /api/catalogo/.../id.con.punto) se servía SIN validar sesión. Ahora solo se
// saltan la auth los paths que TERMINAN en una extensión de asset conocida.
const STATIC_ASSET_RE =
  /\.(?:png|jpe?g|gif|svg|webp|avif|ico|bmp|css|js|mjs|map|woff2?|ttf|otf|eot|json|webmanifest|xml|txt|pdf|mp4|webm|mp3|ogg)$/i;

// Paths that start with these prefixes are public
const PUBLIC_PREFIXES = [
  "/api/cron/",     // cron jobs use CRON_SECRET
  "/api/health-crons", // meta-watchdog externo; protegido por HEALTHCHECK_TOKEN propio (no cookie)
  "/api/diag/",     // diagnósticos internos; protegidos por CRON_SECRET propio (fail-closed, no cookie)
  "/api/catalogo/reebok/products", // public catalog reads
  "/api/catalogo/reebok/inventory", // public catalog stock
  "/api/catalogo/reebok/public",    // public catalog endpoint (no auth)
  "/catalogo-publico/",             // public catalog page (no auth)
  "/marketing/galeria/",            // galería pública de fotos por cliente (token HMAC)
  "/api/marketing/facturas-pdf/",   // PDF combinado de facturas por cliente (token HMAC)
  "/reclamos/galeria/",             // galería pública de fotos por reclamo (token HMAC)
  "/pedido-reebok/",                // public order view page (no auth)
  "/api/catalogo/reebok/pedido-publico", // public order API (no auth)
  "/pedido-joybees/",               // Joybees public order view page (no auth)
  "/api/catalogo/joybees/pedido-publico", // Joybees public order API (no auth)
  "/api/catalogo/joybees/public",       // Joybees public catalog (no auth)
  "/pedido-tommy/",                 // Tommy public order view page (no auth)
  "/api/catalogo/tommy/pedido-publico", // Tommy public order API (no auth)
  "/api/catalogo/tommy/public",         // Tommy public catalog (no auth)
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
  if (!supabaseUrl || !supabaseKey) {
    // Fail CLOSED: sin config no podemos validar la sesión → tratar como inválida.
    Sentry.captureMessage("[auth] Supabase env ausente en middleware — sesión rechazada (fail-closed)", "error");
    return false;
  }

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
    if (!res.ok) {
      // Fail OPEN ante un blip transitorio de Supabase (5xx/red/error de infra):
      // un fallo de la DB NO debe desloguear a un usuario con cookie HMAC válida.
      // La cookie ya fue firmada y verificada → auténtica; solo no pudimos chequear
      // la revocación. La tratamos como válida POR AHORA (el próximo request
      // reintenta). Exposición acotada: una sesión revocada manualmente podría
      // seguir viva durante el outage. Loggeado para observabilidad.
      Sentry.captureMessage(`[auth] Supabase respondió ${res.status} validando sesión — fail-open transitorio`, "warning");
      return true;
    }
    const rows = await res.json();
    // Respuesta DEFINITIVA (2xx): 0 filas = token revocado o inexistente → sesión
    // realmente inválida → desloguear. >0 = activa. Esto NO es un blip.
    return Array.isArray(rows) && rows.length > 0;
  } catch (err) {
    // Fail OPEN ante excepción de red (fetch falló): blip transitorio, no
    // desloguear por un error de conexión. Loggeado para observabilidad.
    Sentry.captureException(err);
    return true;
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
  const { pathname, searchParams } = req.nextUrl;

  // Legacy URL redirects — preserve bookmarks from WhatsApp / email.
  // Ejecutar ANTES del auth check para que el redirect funcione sin sesión
  // (middleware igual redirigirá a login en el destino si hace falta).
  if (pathname === "/guias" && searchParams.get("id")) {
    const id = searchParams.get("id")!;
    return NextResponse.redirect(new URL(`/guias/${id}/imprimir`, req.url));
  }
  if (pathname === "/caja") {
    const view = searchParams.get("view");
    const id = searchParams.get("id");
    if (view === "detail" && id) {
      return NextResponse.redirect(new URL(`/caja/${id}`, req.url));
    }
    if (view === "print" && id) {
      return NextResponse.redirect(new URL(`/caja/${id}/imprimir`, req.url));
    }
  }

  // Allow public paths
  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();
  for (const prefix of PUBLIC_PREFIXES) {
    if (pathname.startsWith(prefix)) return NextResponse.next();
  }

  // Allow static asset files — SOLO por extensión real al final del path.
  // (No usar pathname.includes(".") — eso dejaba pasar rutas con punto en
  // parámetros sin autenticar.)
  if (STATIC_ASSET_RE.test(pathname)) return NextResponse.next();

  const session = req.cookies.get(COOKIE_NAME)?.value;

  if (!session) {
    // API routes: return 401
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    // Pages: redirect to login
    return NextResponse.redirect(new URL("/", req.url));
  }

  // Verify HMAC signature + parse. Rechaza cookies sin firmar o forjadas, y
  // exige sessionToken (verifySessionEdge ya lo garantiza, pero lo re-chequeamos).
  const parsed = await verifySessionEdge(session);
  if (!parsed || !parsed.sessionToken) {
    // Cookie inválida/forjada/sin token — limpiar y redirigir
    return clearSessionAndRedirect(req, pathname);
  }

  // Validate session token against DB (fail-closed)
  const valid = await isSessionValid(parsed.sessionToken);
  if (!valid) {
    return clearSessionAndRedirect(req, pathname);
  }
  // Update last_seen (fire and forget — non-blocking)
  touchSession(parsed.sessionToken);

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
