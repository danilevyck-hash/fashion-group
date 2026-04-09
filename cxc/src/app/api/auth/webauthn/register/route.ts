import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  consumeChallenge,
} from "@/lib/webauthn";

const COOKIE_NAME = "cxc_session";

function getSessionFromCookie(req: NextRequest) {
  const raw = req.cookies.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(Buffer.from(raw, "base64url").toString("utf-8"));
  } catch {
    return null;
  }
}

function getRpId(req: NextRequest): string {
  const host = req.headers.get("host") || "localhost";
  // Strip port for RP ID
  return host.split(":")[0];
}

function getOrigin(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("host") || "localhost";
  return `${proto}://${host}`;
}

/**
 * GET /api/auth/webauthn/register
 * Generate registration options. Requires valid session.
 */
export async function GET(req: NextRequest) {
  const session = getSessionFromCookie(req);
  if (!session?.userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const rpId = getRpId(req);

  // Get existing credentials for this user (to exclude)
  const { data: existing } = await supabaseServer
    .from("webauthn_credentials")
    .select("credential_id")
    .eq("user_id", session.userId);

  const existingIds = existing?.map((c: { credential_id: string }) => c.credential_id) || [];

  const options = generateRegistrationOptions(
    session.userId,
    session.userName || `user-${session.userId}`,
    rpId,
    existingIds
  );

  return NextResponse.json(options);
}

/**
 * POST /api/auth/webauthn/register
 * Verify registration response and store credential.
 */
export async function POST(req: NextRequest) {
  const session = getSessionFromCookie(req);
  if (!session?.userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }
  const { credential, challenge, deviceName } = body;

  if (!credential) {
    return NextResponse.json(
      { error: "Datos incompletos: falta 'credential'", receivedKeys: Object.keys(body) },
      { status: 400 }
    );
  }
  if (!challenge) {
    return NextResponse.json(
      { error: "Datos incompletos: falta 'challenge'", receivedKeys: Object.keys(body) },
      { status: 400 }
    );
  }

  // Verify challenge was issued by us
  const challengeData = consumeChallenge(challenge);
  if (!challengeData) {
    return NextResponse.json({ error: "Challenge expirado o inválido" }, { status: 400 });
  }

  const rpId = getRpId(req);
  const origin = getOrigin(req);

  try {
    const result = await verifyRegistrationResponse(credential, challenge, rpId, origin);

    // Store credential in DB
    const { error } = await supabaseServer.from("webauthn_credentials").insert({
      user_id: session.userId,
      credential_id: result.credentialId,
      public_key: result.publicKey,
      counter: result.counter,
      device_name: deviceName || "Dispositivo",
    });

    if (error) {
      console.error("Error storing webauthn credential:", error);
      return NextResponse.json(
        { error: `Error guardando credencial: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      credentialId: result.credentialId,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("WebAuthn registration verification failed:", msg);
    return NextResponse.json(
      { error: `Error verificando credencial: ${msg}` },
      { status: 400 }
    );
  }
}
