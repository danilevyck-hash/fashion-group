// Tests de src/lib/backup/r2.ts — réplica off-site del backup a Cloudflare R2.
// Mock de fetch global: verifica skip sin env vars, firma SigV4 (URL/headers),
// diff por manifest (omite sin cambios), presupuesto de tiempo (pendientes) y
// que un PUT fallido no entra al manifest.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { webcrypto } from "crypto";
import {
  replicateBackupToR2,
  r2Configured,
  fileSignature,
  R2_MANIFEST_KEY,
} from "@/lib/backup/r2";

// aws4fetch firma con WebCrypto (crypto.subtle) — jsdom no lo trae.
if (!globalThis.crypto?.subtle) {
  vi.stubGlobal("crypto", webcrypto);
}

const ENV = {
  R2_ACCOUNT_ID: "acct123",
  R2_ACCESS_KEY_ID: "AKIA_TEST",
  R2_SECRET_ACCESS_KEY: "secret_test",
  R2_BUCKET: "fg-backups",
};

const BASE = "https://acct123.r2.cloudflarestorage.com/fg-backups";

type FetchMock = ReturnType<typeof vi.fn>;

function stubEnv(vars: Record<string, string>) {
  for (const [k, v] of Object.entries(vars)) vi.stubEnv(k, v);
}

/** fetch mock: GET manifest → `manifest` (o 404 si null); PUTs → putStatus. */
function mockFetch(manifest: Record<string, string> | null, putStatus = 200): FetchMock {
  const fn = vi.fn(async (input: Request | string | URL) => {
    const req = input as Request;
    if (req.method === "GET") {
      if (manifest === null) return new Response("not found", { status: 404 });
      return new Response(JSON.stringify(manifest), { status: 200 });
    }
    return new Response(putStatus === 200 ? "" : "err body", { status: putStatus });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

function calls(fn: FetchMock): Request[] {
  return fn.mock.calls.map((c) => c[0] as Request);
}

beforeEach(() => {
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("r2Configured / skip sin env vars", () => {
  it("sin env vars → enabled:false con nota y CERO llamadas a la red", async () => {
    const fn = mockFetch({});
    expect(r2Configured()).toBe(false);
    const res = await replicateBackupToR2([{ key: "data/x.ndjson.gz", body: Buffer.from("x") }], Date.now() + 10_000);
    expect(res.enabled).toBe(false);
    expect(res.nota).toMatch(/R2 no configurado/);
    expect(res.subidos).toBe(0);
    expect(res.errores).toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });

  it("con las 4 env vars → configurado", () => {
    stubEnv(ENV);
    expect(r2Configured()).toBe(true);
  });

  it("R2_ENDPOINT explícito reemplaza al endpoint derivado del account id", async () => {
    stubEnv({ ...ENV, R2_ACCOUNT_ID: "", R2_ENDPOINT: "https://custom.example.com/" });
    const fn = mockFetch(null);
    await replicateBackupToR2([{ key: "data/a.gz", body: Buffer.from("a") }], Date.now() + 10_000);
    const urls = calls(fn).map((r) => r.url);
    expect(urls[0]).toBe(`https://custom.example.com/fg-backups/${R2_MANIFEST_KEY}`);
    expect(urls).toContain("https://custom.example.com/fg-backups/data/a.gz");
  });
});

describe("firma SigV4 y URLs", () => {
  it("PUT va a <endpoint>/<bucket>/<key> con Authorization AWS4-HMAC-SHA256 y payload hash", async () => {
    stubEnv(ENV);
    const fn = mockFetch(null); // primera corrida: manifest 404
    const body = Buffer.from("hola mundo");
    const res = await replicateBackupToR2([{ key: "data/cheques.ndjson.gz", body }], Date.now() + 10_000);

    expect(res.errores).toEqual([]);
    expect(res.subidos).toBe(1);
    expect(res.bytes).toBe(body.length);

    const reqs = calls(fn);
    // GET manifest + PUT archivo + PUT manifest
    expect(reqs.map((r) => r.method)).toEqual(["GET", "PUT", "PUT"]);

    const put = reqs[1];
    expect(put.url).toBe(`${BASE}/data/cheques.ndjson.gz`);
    expect(put.headers.get("content-type")).toBe("application/gzip");
    const auth = put.headers.get("authorization") || "";
    expect(auth).toContain("AWS4-HMAC-SHA256");
    expect(auth).toContain(`Credential=${ENV.R2_ACCESS_KEY_ID}/`);
    expect(auth).toContain("/auto/s3/aws4_request");
    // aws4fetch firma el payload → header con el sha256 real del body
    expect(put.headers.get("x-amz-content-sha256")).toBe(fileSignature(body).split("|")[1]);

    const putManifest = reqs[2];
    expect(putManifest.url).toBe(`${BASE}/${R2_MANIFEST_KEY}`);
    expect(putManifest.headers.get("content-type")).toBe("application/json");
  });
});

describe("diff por manifest (incremental)", () => {
  it("omite archivos con la misma firma y sube solo lo cambiado", async () => {
    stubEnv(ENV);
    const same = Buffer.from("sin cambios");
    const changed = Buffer.from("contenido nuevo");
    const fn = mockFetch({
      "data/igual.ndjson.gz": fileSignature(same),
      "data/cambio.ndjson.gz": "999|hashviejo",
    });

    const res = await replicateBackupToR2(
      [
        { key: "data/igual.ndjson.gz", body: same },
        { key: "data/cambio.ndjson.gz", body: changed },
      ],
      Date.now() + 10_000,
    );

    expect(res.omitidos).toBe(1);
    expect(res.subidos).toBe(1);
    expect(res.errores).toEqual([]);

    const putUrls = calls(fn).filter((r) => r.method === "PUT").map((r) => r.url);
    expect(putUrls).toEqual([`${BASE}/data/cambio.ndjson.gz`, `${BASE}/${R2_MANIFEST_KEY}`]);

    // Manifest final: conserva el sin-cambios y actualiza el cambiado.
    const manifestReq = calls(fn)[calls(fn).length - 1];
    const manifestBody = JSON.parse(await manifestReq.text()) as Record<string, string>;
    expect(manifestBody["data/igual.ndjson.gz"]).toBe(fileSignature(same));
    expect(manifestBody["data/cambio.ndjson.gz"]).toBe(fileSignature(changed));
  });

  it("deadline vencido → archivos quedan pendientes (sin PUT) y el manifest igual se sube", async () => {
    stubEnv(ENV);
    const fn = mockFetch(null);
    const res = await replicateBackupToR2(
      [
        { key: "data/a.ndjson.gz", body: Buffer.from("a") },
        { key: "data/b.ndjson.gz", body: Buffer.from("b") },
      ],
      Date.now() - 1, // ya vencido
    );
    expect(res.pendientes).toBe(2);
    expect(res.subidos).toBe(0);
    const putUrls = calls(fn).filter((r) => r.method === "PUT").map((r) => r.url);
    expect(putUrls).toEqual([`${BASE}/${R2_MANIFEST_KEY}`]);
  });

  it("PUT fallido → error reportado y el archivo NO entra al manifest (retry mañana)", async () => {
    stubEnv(ENV);
    const fn = mockFetch(null, 403);
    const res = await replicateBackupToR2(
      [{ key: "data/x.ndjson.gz", body: Buffer.from("x") }],
      Date.now() + 10_000,
    );
    expect(res.subidos).toBe(0);
    // PUT archivo (403) + PUT manifest (403) → 2 errores, pero nunca lanza
    expect(res.errores.length).toBe(2);
    expect(res.errores[0]).toMatch(/data\/x\.ndjson\.gz: HTTP 403/);

    const manifestReq = calls(fn).filter((r) => r.method === "PUT")[1];
    const manifestBody = JSON.parse(await manifestReq.text()) as Record<string, string>;
    expect(manifestBody).toEqual({});
  });
});
