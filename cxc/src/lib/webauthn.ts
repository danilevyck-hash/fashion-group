/**
 * WebAuthn utilities — zero dependencies, uses Web Crypto API only.
 * Supports ES256 (P-256, alg -7) with packed/none attestation.
 */

// ---------------------------------------------------------------------------
// Buffer helpers
// ---------------------------------------------------------------------------

/** Convert Uint8Array to a clean ArrayBuffer (fixes TS strict BufferSource issues) */
function toAB(u: Uint8Array): ArrayBuffer {
  const ab = new ArrayBuffer(u.byteLength);
  new Uint8Array(ab).set(u);
  return ab;
}

// ---------------------------------------------------------------------------
// DER → IEEE P1363 signature conversion (for ECDSA P-256)
// ---------------------------------------------------------------------------

/** Convert DER-encoded ECDSA signature to raw r||s (each 32 bytes for P-256) */
function derToRaw(der: Uint8Array): Uint8Array {
  // DER: 30 <totalLen> 02 <rLen> <rBytes> 02 <sLen> <sBytes>
  const raw = new Uint8Array(64); // 32 + 32 for P-256
  let offset = 2; // skip 30 <len>

  // Read r
  if (der[offset] !== 0x02) throw new Error("Invalid DER: expected 0x02 for r");
  offset++;
  const rLen = der[offset++];
  let rStart = offset;
  let rActualLen = rLen;
  // Skip leading zero padding (DER adds 0x00 if high bit set)
  if (rLen === 33 && der[rStart] === 0x00) { rStart++; rActualLen = 32; }
  // Copy r, right-aligned in 32 bytes
  raw.set(der.slice(rStart, rStart + Math.min(rActualLen, 32)), 32 - Math.min(rActualLen, 32));
  offset += rLen;

  // Read s
  if (der[offset] !== 0x02) throw new Error("Invalid DER: expected 0x02 for s");
  offset++;
  const sLen = der[offset++];
  let sStart = offset;
  let sActualLen = sLen;
  if (sLen === 33 && der[sStart] === 0x00) { sStart++; sActualLen = 32; }
  raw.set(der.slice(sStart, sStart + Math.min(sActualLen, 32)), 32 + 32 - Math.min(sActualLen, 32));

  return raw;
}

// ---------------------------------------------------------------------------
// Base64url helpers
// ---------------------------------------------------------------------------

export function base64urlEncode(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64urlDecode(str: string): Uint8Array {
  // Restore base64 padding
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4 !== 0) base64 += "=";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// Challenge store (in-memory, 5 min expiry)
// ---------------------------------------------------------------------------

const challengeStore = new Map<string, { data: unknown; expires: number }>();
const CHALLENGE_TTL = 5 * 60 * 1000; // 5 minutes

export function storeChallenge(challenge: string, data: unknown): void {
  // Clean expired entries
  const now = Date.now();
  for (const [key, val] of challengeStore) {
    if (val.expires < now) challengeStore.delete(key);
  }
  challengeStore.set(challenge, { data, expires: now + CHALLENGE_TTL });
}

export function consumeChallenge(challenge: string): unknown | null {
  const entry = challengeStore.get(challenge);
  if (!entry) return null;
  challengeStore.delete(challenge);
  if (entry.expires < Date.now()) return null;
  return entry.data;
}

// ---------------------------------------------------------------------------
// Minimal CBOR decoder (enough for attestation parsing)
// ---------------------------------------------------------------------------

class CborDecoder {
  private view: DataView;
  private offset: number;

  constructor(data: Uint8Array) {
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    this.offset = 0;
  }

  decode(): unknown {
    const initial = this.view.getUint8(this.offset++);
    const major = initial >> 5;
    const additional = initial & 0x1f;

    switch (major) {
      case 0: return this.readUint(additional); // unsigned int
      case 1: return -1 - Number(this.readUint(additional)); // negative int
      case 2: return this.readBytes(Number(this.readUint(additional))); // byte string
      case 3: return this.readString(Number(this.readUint(additional))); // text string
      case 4: return this.readArray(Number(this.readUint(additional))); // array
      case 5: return this.readMap(Number(this.readUint(additional))); // map
      case 7: {
        // Simple values & floats
        if (additional === 20) return false;
        if (additional === 21) return true;
        if (additional === 22) return null;
        if (additional === 25) {
          // float16 - skip, not needed
          this.offset += 2;
          return 0;
        }
        if (additional === 26) {
          const val = this.view.getFloat32(this.offset);
          this.offset += 4;
          return val;
        }
        if (additional === 27) {
          const val = this.view.getFloat64(this.offset);
          this.offset += 8;
          return val;
        }
        return undefined;
      }
      default:
        return undefined;
    }
  }

  private readUint(additional: number): number {
    if (additional < 24) return additional;
    if (additional === 24) return this.view.getUint8(this.offset++);
    if (additional === 25) {
      const val = this.view.getUint16(this.offset);
      this.offset += 2;
      return val;
    }
    if (additional === 26) {
      const val = this.view.getUint32(this.offset);
      this.offset += 4;
      return val;
    }
    // 27 = 8 bytes, but we only handle 32-bit for our use case
    if (additional === 27) {
      // Read as two 32-bit values, combine (JS safe integer range)
      const high = this.view.getUint32(this.offset);
      const low = this.view.getUint32(this.offset + 4);
      this.offset += 8;
      return high * 0x100000000 + low;
    }
    return 0;
  }

  private readBytes(length: number): Uint8Array {
    const bytes = new Uint8Array(this.view.buffer, this.view.byteOffset + this.offset, length);
    this.offset += length;
    return new Uint8Array(bytes); // copy to avoid detached buffer issues
  }

  private readString(length: number): string {
    const bytes = this.readBytes(length);
    return new TextDecoder().decode(bytes);
  }

  private readArray(length: number): unknown[] {
    const arr: unknown[] = [];
    for (let i = 0; i < length; i++) {
      arr.push(this.decode());
    }
    return arr;
  }

  private readMap(length: number): Map<unknown, unknown> {
    const map = new Map<unknown, unknown>();
    for (let i = 0; i < length; i++) {
      const key = this.decode();
      const value = this.decode();
      map.set(key, value);
    }
    return map;
  }
}

export function cborDecode(data: Uint8Array): unknown {
  return new CborDecoder(data).decode();
}

// ---------------------------------------------------------------------------
// Authenticator data parser
// ---------------------------------------------------------------------------

interface AuthenticatorData {
  rpIdHash: Uint8Array;
  flags: number;
  signCount: number;
  attestedCredentialData?: {
    aaguid: Uint8Array;
    credentialId: Uint8Array;
    publicKey: Map<unknown, unknown>;
  };
}

export function parseAuthenticatorData(data: Uint8Array): AuthenticatorData {
  const rpIdHash = data.slice(0, 32);
  const flags = data[32];
  const signCount = new DataView(data.buffer, data.byteOffset + 33, 4).getUint32(0);

  const result: AuthenticatorData = { rpIdHash, flags, signCount };

  // Bit 6 (0x40) = attested credential data present
  if (flags & 0x40) {
    const aaguid = data.slice(37, 53);
    const credIdLen = new DataView(data.buffer, data.byteOffset + 53, 2).getUint16(0);
    const credentialId = data.slice(55, 55 + credIdLen);

    // CBOR-encoded public key follows
    const publicKeyBytes = data.slice(55 + credIdLen);
    const publicKey = cborDecode(publicKeyBytes) as Map<unknown, unknown>;

    result.attestedCredentialData = { aaguid, credentialId, publicKey };
  }

  return result;
}

// ---------------------------------------------------------------------------
// Registration options
// ---------------------------------------------------------------------------

export interface RegistrationOptions {
  challenge: string; // base64url
  rp: { name: string; id: string };
  user: { id: string; name: string; displayName: string };
  pubKeyCredParams: { type: "public-key"; alg: number }[];
  authenticatorSelection: {
    authenticatorAttachment: string;
    residentKey: string;
    userVerification: string;
  };
  attestation: string;
  timeout: number;
  excludeCredentials: { type: "public-key"; id: string }[];
}

export function generateRegistrationOptions(
  userId: number,
  userName: string,
  rpId: string,
  existingCredentialIds: string[] = []
): RegistrationOptions {
  const challengeBytes = crypto.getRandomValues(new Uint8Array(32));
  const challenge = base64urlEncode(challengeBytes);

  // Store challenge with userId
  storeChallenge(challenge, { userId, userName });

  return {
    challenge,
    rp: { name: "Fashion Group", id: rpId },
    user: {
      id: base64urlEncode(new TextEncoder().encode(String(userId))),
      name: userName,
      displayName: userName,
    },
    pubKeyCredParams: [{ type: "public-key", alg: -7 }], // ES256
    authenticatorSelection: {
      authenticatorAttachment: "platform",
      residentKey: "preferred",
      userVerification: "preferred",
    },
    attestation: "none",
    timeout: 60000,
    excludeCredentials: existingCredentialIds.map((id) => ({
      type: "public-key" as const,
      id,
    })),
  };
}

// ---------------------------------------------------------------------------
// Registration verification
// ---------------------------------------------------------------------------

export async function verifyRegistrationResponse(
  response: {
    id: string;
    rawId: string;
    type: string;
    response: {
      attestationObject: string; // base64url
      clientDataJSON: string; // base64url
    };
  },
  expectedChallenge: string,
  rpId: string,
  origin: string
): Promise<{
  credentialId: string;
  publicKey: string; // base64url-encoded SPKI
  counter: number;
}> {
  // 1. Decode & verify clientDataJSON
  const clientDataBytes = base64urlDecode(response.response.clientDataJSON);
  const clientData = JSON.parse(new TextDecoder().decode(clientDataBytes));

  if (clientData.type !== "webauthn.create") {
    throw new Error("Invalid clientData type");
  }
  if (clientData.challenge !== expectedChallenge) {
    throw new Error("Challenge mismatch");
  }
  // In PWA standalone mode on iOS, origin may differ (http vs https, port differences)
  // Accept if hostname matches
  try {
    const expectedHost = new URL(origin).hostname;
    const actualHost = new URL(clientData.origin).hostname;
    if (expectedHost !== actualHost) {
      throw new Error(`Origin mismatch: expected ${expectedHost}, got ${actualHost}`);
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("Origin mismatch")) throw e;
    // If URL parsing fails, fall through
  }

  // 2. Decode attestation object
  const attestationBytes = base64urlDecode(response.response.attestationObject);
  const attestation = cborDecode(attestationBytes) as Map<unknown, unknown>;
  const authDataRaw = attestation.get("authData") as Uint8Array;

  if (!authDataRaw) throw new Error("Missing authData in attestation");

  // 3. Parse authenticator data
  const authData = parseAuthenticatorData(authDataRaw);

  // 4. Verify RP ID hash
  const expectedRpIdHash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rpId))
  );
  if (!arrayEquals(authData.rpIdHash, expectedRpIdHash)) {
    throw new Error("RP ID hash mismatch");
  }

  // 5. Check user present flag (bit 0)
  if (!(authData.flags & 0x01)) {
    throw new Error("User not present");
  }

  // 6. Extract credential data
  if (!authData.attestedCredentialData) {
    throw new Error("No attested credential data");
  }

  const { credentialId, publicKey: coseKey } = authData.attestedCredentialData;

  // 7. Convert COSE key to Web Crypto key (ES256 / P-256)
  // COSE key map: 1=kty, 3=alg, -1=crv, -2=x, -3=y
  const kty = coseKey.get(1);
  const alg = coseKey.get(3);
  const x = coseKey.get(-2) as Uint8Array;
  const y = coseKey.get(-3) as Uint8Array;

  if (kty !== 2 || alg !== -7) {
    throw new Error("Unsupported key type or algorithm");
  }

  // Import as raw EC key to export as SPKI
  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      x: base64urlEncode(x),
      y: base64urlEncode(y),
    },
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["verify"]
  );

  const spkiBuffer = await crypto.subtle.exportKey("spki", cryptoKey);
  const publicKeyB64 = base64urlEncode(spkiBuffer);

  return {
    credentialId: base64urlEncode(credentialId),
    publicKey: publicKeyB64,
    counter: authData.signCount,
  };
}

// ---------------------------------------------------------------------------
// Authentication options
// ---------------------------------------------------------------------------

export interface AuthenticationOptions {
  challenge: string; // base64url
  rpId: string;
  timeout: number;
  userVerification: string;
  allowCredentials: { type: "public-key"; id: string }[];
}

export function generateAuthenticationOptions(
  credentialIds: string[],
  rpId: string
): AuthenticationOptions {
  const challengeBytes = crypto.getRandomValues(new Uint8Array(32));
  const challenge = base64urlEncode(challengeBytes);

  storeChallenge(challenge, { credentialIds });

  return {
    challenge,
    rpId,
    timeout: 60000,
    userVerification: "preferred",
    allowCredentials: credentialIds.map((id) => ({
      type: "public-key" as const,
      id,
    })),
  };
}

// ---------------------------------------------------------------------------
// Authentication verification
// ---------------------------------------------------------------------------

export async function verifyAuthenticationResponse(
  response: {
    id: string;
    rawId: string;
    type: string;
    response: {
      authenticatorData: string; // base64url
      clientDataJSON: string; // base64url
      signature: string; // base64url
    };
  },
  credential: {
    publicKey: string; // base64url SPKI
    counter: number;
  },
  expectedChallenge: string,
  rpId: string,
  origin: string
): Promise<{ newCounter: number }> {
  // 1. Decode & verify clientDataJSON
  const clientDataBytes = base64urlDecode(response.response.clientDataJSON);
  const clientData = JSON.parse(new TextDecoder().decode(clientDataBytes));

  if (clientData.type !== "webauthn.get") {
    throw new Error(`Invalid clientData type: expected "webauthn.get", got "${clientData.type}"`);
  }
  // Normalize: strip any trailing '=' padding for comparison
  const normalizeB64 = (s: string) => s.replace(/=+$/, "");
  if (normalizeB64(clientData.challenge) !== normalizeB64(expectedChallenge)) {
    throw new Error(`Challenge mismatch (browser: ${clientData.challenge?.substring(0, 16)}..., expected: ${expectedChallenge?.substring(0, 16)}...)`);
  }
  // In PWA standalone mode on iOS, origin may differ (http vs https, port differences)
  // Accept if hostname matches
  try {
    const expectedHost = new URL(origin).hostname;
    const actualHost = new URL(clientData.origin).hostname;
    if (expectedHost !== actualHost) {
      throw new Error(`Origin mismatch: expected host ${expectedHost}, got ${actualHost} (server origin: ${origin}, client origin: ${clientData.origin})`);
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("Origin mismatch")) throw e;
    // If URL parsing fails, fall through
  }

  // 2. Parse authenticator data
  const authDataBytes = base64urlDecode(response.response.authenticatorData);
  const authData = parseAuthenticatorData(authDataBytes);

  // 3. Verify RP ID hash
  const expectedRpIdHash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rpId))
  );
  if (!arrayEquals(authData.rpIdHash, expectedRpIdHash)) {
    throw new Error(`RP ID hash mismatch (rpId: ${rpId})`);
  }

  // 4. Check user present
  if (!(authData.flags & 0x01)) {
    throw new Error(`User not present (flags: 0x${authData.flags.toString(16)})`);
  }

  // 5. Verify counter (anti-replay)
  if (authData.signCount > 0 && authData.signCount <= credential.counter) {
    throw new Error(`Counter not incremented: authenticator=${authData.signCount}, stored=${credential.counter}`);
  }

  // 6. Verify signature
  // Signature is over: authenticatorData || SHA-256(clientDataJSON)
  const clientDataHash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", toAB(clientDataBytes))
  );
  const signedData = new Uint8Array(authDataBytes.length + clientDataHash.length);
  signedData.set(authDataBytes, 0);
  signedData.set(clientDataHash, authDataBytes.length);

  // Import the public key
  const publicKeyBytes = base64urlDecode(credential.publicKey);
  let cryptoKey: CryptoKey;
  try {
    cryptoKey = await crypto.subtle.importKey(
      "spki",
      toAB(publicKeyBytes),
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"]
    );
  } catch (keyErr) {
    throw new Error(`Failed to import public key (${publicKeyBytes.length}B): ${keyErr instanceof Error ? keyErr.message : String(keyErr)}`);
  }

  // WebAuthn gives DER-encoded signature, but Web Crypto ECDSA expects
  // IEEE P1363 format (raw r||s, each 32 bytes for P-256). Convert.
  const derSig = base64urlDecode(response.response.signature);
  const rawSig = derToRaw(derSig);

  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    cryptoKey,
    toAB(rawSig),
    toAB(signedData)
  );

  if (!valid) {
    throw new Error(`Signature verification failed (signedData: ${signedData.length}B, sig: ${rawSig.length}B, pubKey: ${publicKeyBytes.length}B)`);
  }

  return { newCounter: authData.signCount };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function arrayEquals(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
