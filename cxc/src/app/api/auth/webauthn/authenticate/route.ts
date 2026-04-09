import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { logActivity } from "@/lib/log-activity";
import { randomUUID } from "crypto";
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@/lib/webauthn";

const COOKIE_NAME = "cxc_session";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function getRpId(req: NextRequest): string {
  const host = req.headers.get("host") || "localhost";
  return host.split(":")[0];
}

function getOrigin(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("host") || "localhost";
  return `${proto}://${host}`;
}

function setSessionCookie(res: NextResponse, payload: Record<string, unknown>) {
  const value = Buffer.from(JSON.stringify(payload)).toString("base64url");
  res.cookies.set(COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
}

/**
 * GET /api/auth/webauthn/authenticate
 * Generate authentication options.
 * Query param: ?credentialIds=id1,id2 (from localStorage)
 */
export async function GET(req: NextRequest) {
  const rpId = getRpId(req);
  const credIdsParam = req.nextUrl.searchParams.get("credentialIds") || "";

  let credentialIds: string[] = [];

  if (credIdsParam) {
    // Client sent stored credential IDs
    credentialIds = credIdsParam.split(",").filter(Boolean);
  }

  // If no credential IDs provided, get all from DB (fallback)
  if (credentialIds.length === 0) {
    const { data } = await supabaseServer
      .from("webauthn_credentials")
      .select("credential_id");
    credentialIds = data?.map((c: { credential_id: string }) => c.credential_id) || [];
  }

  if (credentialIds.length === 0) {
    return NextResponse.json(
      { error: "No hay credenciales registradas" },
      { status: 404 }
    );
  }

  const options = generateAuthenticationOptions(credentialIds, rpId);
  return NextResponse.json(options);
}

/**
 * POST /api/auth/webauthn/authenticate
 * Verify authentication response, create session.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { credential, challenge } = body;

  if (!credential || !challenge) {
    return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
  }

  // Look up credential by ID
  const { data: storedCred, error: lookupErr } = await supabaseServer
    .from("webauthn_credentials")
    .select("*")
    .eq("credential_id", credential.id)
    .single();

  if (lookupErr || !storedCred) {
    return NextResponse.json(
      { error: `Credencial no encontrada (id: ${credential.id?.substring(0, 12)}..., dbError: ${lookupErr?.message || "none"})` },
      { status: 401 }
    );
  }

  const rpId = getRpId(req);
  const origin = getOrigin(req);

  try {
    const result = await verifyAuthenticationResponse(
      credential,
      {
        publicKey: storedCred.public_key,
        counter: storedCred.counter,
      },
      challenge,
      rpId,
      origin
    );

    // Update counter
    await supabaseServer
      .from("webauthn_credentials")
      .update({ counter: result.newCounter })
      .eq("credential_id", credential.id);

    // Look up the user
    const { data: user, error: userErr } = await supabaseServer
      .from("fg_users")
      .select("id, name, role, active")
      .eq("id", storedCred.user_id)
      .single();

    if (userErr || !user) {
      return NextResponse.json(
        { error: `Usuario no encontrado (user_id: ${storedCred.user_id}, dbError: ${userErr?.message || "none"})` },
        { status: 401 }
      );
    }
    if (!user.active) {
      return NextResponse.json(
        { error: `Usuario "${user.name}" está inactivo` },
        { status: 401 }
      );
    }

    // Get modules (same logic as password auth)
    let modules: string[] = [];
    try {
      const { data: rolePerm } = await supabaseServer
        .from("role_permissions")
        .select("modulos")
        .eq("role", user.role)
        .single();
      if (rolePerm?.modulos) modules = rolePerm.modulos;
    } catch {
      /* use defaults below */
    }

    if (modules.length === 0) {
      const ALL = ["cxc", "guias", "caja", "directorio", "reclamos", "prestamos", "ventas", "upload", "cheques", "reebok", "camisetas"];
      const DEFAULTS: Record<string, string[]> = {
        admin: ALL,
        director: ALL,
        contabilidad: ["prestamos", "ventas"],
        secretaria: ["upload", "guias", "caja", "reclamos", "cheques", "directorio"],
        vendedor: ["reebok", "cxc", "directorio"],
        bodega: ["guias"],
        cliente: ["reebok"],
      };
      modules = DEFAULTS[user.role] || [];
    }

    // Create session (same as password login)
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
    const sessionToken = randomUUID();

    try {
      await supabaseServer.from("user_sessions").insert({
        user_name: user.name,
        user_role: user.role,
        session_token: sessionToken,
        ip_address: ip,
      });
    } catch {
      /* table may not exist yet */
    }

    const payload = {
      authenticated: true,
      role: user.role,
      userId: user.id,
      userName: user.name,
      modules,
    };

    const res = NextResponse.json(payload);
    setSessionCookie(res, {
      role: user.role,
      userId: user.id,
      userName: user.name,
      modules,
      sessionToken,
    });

    await logActivity(user.role, "login", "auth", { userName: user.name, method: "webauthn" }, user.name);

    return res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("WebAuthn authentication verification failed:", msg);
    return NextResponse.json(
      { error: `Error verificando credencial: ${msg}` },
      { status: 401 }
    );
  }
}
