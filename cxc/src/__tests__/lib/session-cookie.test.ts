import { describe, it, expect, beforeAll } from "vitest";
import { signSession, verifySession } from "@/lib/session-cookie";
import { verifySessionEdge } from "@/lib/session-cookie-edge";

beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-please-ignore-0123456789abcdef";
});

const payload = { role: "admin", userId: "u1", userName: "Test", sessionToken: "tok-123" };

describe("session-cookie HMAC (Node)", () => {
  it("roundtrip: sign → verify devuelve el payload", () => {
    const out = verifySession(signSession(payload));
    expect(out?.role).toBe("admin");
    expect(out?.sessionToken).toBe("tok-123");
  });

  it("rechaza body manipulado", () => {
    const [body, sig] = signSession(payload).split(".");
    const tampered = body.slice(0, -1) + (body.slice(-1) === "A" ? "B" : "A");
    expect(verifySession(`${tampered}.${sig}`)).toBeNull();
  });

  it("rechaza firma manipulada", () => {
    const [body, sig] = signSession(payload).split(".");
    const tampered = sig.slice(0, -1) + (sig.slice(-1) === "A" ? "B" : "A");
    expect(verifySession(`${body}.${tampered}`)).toBeNull();
  });

  it("rechaza cookie sin firmar (forjada: {role:admin} sin firma)", () => {
    const forged = Buffer.from(JSON.stringify({ role: "admin", sessionToken: "x" })).toString("base64url");
    expect(verifySession(forged)).toBeNull();
  });

  it("rechaza payload sin sessionToken", () => {
    expect(verifySession(signSession({ role: "admin" }))).toBeNull();
  });

  it("fail-closed: sin SESSION_SECRET devuelve null", () => {
    const cookie = signSession(payload);
    const prev = process.env.SESSION_SECRET;
    delete process.env.SESSION_SECRET;
    expect(verifySession(cookie)).toBeNull();
    process.env.SESSION_SECRET = prev;
  });
});

describe("session-cookie HMAC (Edge ↔ Node compat)", () => {
  it("el verify Edge acepta una cookie firmada en Node (mismo formato/secreto)", async () => {
    const out = await verifySessionEdge(signSession(payload));
    expect(out?.role).toBe("admin");
    expect(out?.sessionToken).toBe("tok-123");
  });

  it("el verify Edge rechaza una cookie forjada sin firma", async () => {
    const forged = Buffer.from(JSON.stringify({ role: "admin", sessionToken: "x" })).toString("base64url");
    expect(await verifySessionEdge(forged)).toBeNull();
  });
});
