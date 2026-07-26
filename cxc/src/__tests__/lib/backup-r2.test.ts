// Tests de src/lib/backup/r2.ts — réplica off-site del backup a Cloudflare R2.
//
// Dos bloques:
//  1) Con fetch mockeado (R2 en memoria): skip sin env vars, firma SigV4,
//     diff por manifest, presupuesto de tiempo, verificación HEAD post-subida,
//     re-subida de lo omitido que YA NO está en R2, réplica de Storage.
//  2) Lógica pura sin red: paths con fecha, poda del manifest, política de
//     retención abuelo-padre-hijo, ventana rotativa, parseo del ListObjectsV2.
//
// Todo corre SIN credenciales reales: las de producción están marcadas
// Sensitive en Vercel y no se pueden leer ni con `vercel env pull` ni con la
// API (`type: "sensitive"`, value vacío).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { webcrypto } from "crypto";
import {
  replicateBackupToR2,
  replicateStorageToR2,
  r2Configured,
  fileSignature,
  r2DataKey,
  pruneDataManifest,
  r2RetentionPlan,
  RETENCION_R2,
  ventanaVerificacion,
  parseDataDates,
  parseListKeys,
  listR2DataKeys,
  evaluarFechasR2,
  R2_METAS_POR_GRUPO,
  R2_MANIFEST_KEY,
  R2_STORAGE_MANIFEST_KEY,
  R2_DATA_PREFIX,
  R2_STORAGE_PREFIX,
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

interface MockOpts {
  /** Status de los PUT (default 200). */
  putStatus?: number;
  /** Objetos que YA existen en R2 (key → size), para los HEAD de verificación. */
  existentes?: Record<string, number>;
  /** PUT "exitoso" pero que no deja el objeto (simula el 200-mentiroso). */
  putFantasma?: boolean;
  /** HEAD que responde 200 SIN content-length (R2 sirve los .json comprimidos
   *  y undici borra el header al descomprimir — visto en producción 25-jul). */
  headSinLargo?: boolean;
}

/**
 * R2 en memoria: GET manifest, PUT (guarda el tamaño), HEAD (404 si no está).
 * Devuelve el mock y el mapa de objetos para inspeccionarlo.
 */
function mockFetch(manifest: Record<string, string> | null, opts: MockOpts = {}) {
  const { putStatus = 200, existentes = {}, putFantasma = false, headSinLargo = false } = opts;
  const objetos = new Map<string, number>(Object.entries(existentes));
  const fn = vi.fn(async (input: Request | string | URL) => {
    const req = input as Request;
    const key = decodeURIComponent(new URL(req.url).pathname.replace("/fg-backups/", ""));
    if (req.method === "GET") {
      if (manifest === null) return new Response("not found", { status: 404 });
      return new Response(JSON.stringify(manifest), { status: 200 });
    }
    if (req.method === "HEAD") {
      const size = objetos.get(key);
      if (size === undefined) return new Response(null, { status: 404 });
      if (headSinLargo) return new Response(null, { status: 200 });
      return new Response(null, { status: 200, headers: { "content-length": String(size) } });
    }
    // PUT
    if (putStatus === 200 && !putFantasma) {
      objetos.set(key, Number(req.headers.get("content-length") ?? "0"));
    }
    return new Response(putStatus === 200 ? "" : "err body", { status: putStatus });
  });
  vi.stubGlobal("fetch", fn);
  return { fn: fn as FetchMock, objetos };
}

function calls(fn: FetchMock): Request[] {
  return fn.mock.calls.map((c) => c[0] as Request);
}

const urlsDe = (fn: FetchMock, metodo: string) =>
  calls(fn).filter((r) => r.method === metodo).map((r) => r.url);

beforeEach(() => {
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("r2Configured / skip sin env vars", () => {
  it("sin env vars → enabled:false con nota y CERO llamadas a la red", async () => {
    const { fn } = mockFetch({});
    expect(r2Configured()).toBe(false);
    const res = await replicateBackupToR2(
      [{ key: "data/2026-07-25/x.ndjson.gz", body: Buffer.from("x") }],
      Date.now() + 10_000,
    );
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
    const { fn } = mockFetch(null);
    await replicateBackupToR2([{ key: "data/2026-07-25/a.gz", body: Buffer.from("a") }], Date.now() + 10_000);
    const urls = calls(fn).map((r) => r.url);
    expect(urls[0]).toBe(`https://custom.example.com/fg-backups/${R2_MANIFEST_KEY}`);
    expect(urls).toContain("https://custom.example.com/fg-backups/data/2026-07-25/a.gz");
  });
});

describe("firma SigV4 y URLs", () => {
  it("PUT va a <endpoint>/<bucket>/<key> con Authorization AWS4-HMAC-SHA256 y payload hash", async () => {
    stubEnv(ENV);
    const { fn } = mockFetch(null); // primera corrida: manifest 404
    const body = Buffer.from("hola mundo");
    const key = r2DataKey("2026-07-25", "cheques.ndjson.gz");
    const res = await replicateBackupToR2([{ key, body }], Date.now() + 10_000);

    expect(res.errores).toEqual([]);
    expect(res.subidos).toBe(1);
    expect(res.bytes).toBe(body.length);

    const reqs = calls(fn);
    // GET manifest + PUT archivo + HEAD verificación + PUT manifest
    expect(reqs.map((r) => r.method)).toEqual(["GET", "PUT", "HEAD", "PUT"]);

    const put = reqs[1];
    expect(put.url).toBe(`${BASE}/${key}`);
    expect(put.headers.get("content-type")).toBe("application/gzip");
    const auth = put.headers.get("authorization") || "";
    expect(auth).toContain("AWS4-HMAC-SHA256");
    expect(auth).toContain(`Credential=${ENV.R2_ACCESS_KEY_ID}/`);
    expect(auth).toContain("/auto/s3/aws4_request");
    // aws4fetch firma el payload → header con el sha256 real del body
    expect(put.headers.get("x-amz-content-sha256")).toBe(fileSignature(body).split("|")[1]);

    const putManifest = reqs[3];
    expect(putManifest.url).toBe(`${BASE}/${R2_MANIFEST_KEY}`);
    expect(putManifest.headers.get("content-type")).toBe("application/json");
  });
});

describe("meta.json en R2 (bloqueante del restore off-site)", () => {
  it("el meta se replica como un objeto más, bajo la carpeta de la fecha", async () => {
    stubEnv(ENV);
    const { fn, objetos } = mockFetch(null);
    const metaBuf = Buffer.from(JSON.stringify({ format: "v2-ndjson-gz" }), "utf-8");
    const res = await replicateBackupToR2(
      [{ key: r2DataKey("2026-07-25", "meta.json"), body: metaBuf }],
      Date.now() + 10_000,
    );
    expect(res.subidos).toBe(1);
    expect(objetos.has("data/2026-07-25/meta.json")).toBe(true);
    const put = calls(fn).filter((r) => r.method === "PUT")[0];
    expect(put.headers.get("content-type")).toBe("application/json");
  });
});

describe("diff por manifest (incremental)", () => {
  it("omite archivos con la misma firma y sube solo lo cambiado", async () => {
    stubEnv(ENV);
    const same = Buffer.from("sin cambios");
    const changed = Buffer.from("contenido nuevo");
    const kIgual = "data/2026-07-25/igual.ndjson.gz";
    const kCambio = "data/2026-07-25/cambio.ndjson.gz";
    const { fn } = mockFetch(
      { [kIgual]: fileSignature(same), [kCambio]: "999|hashviejo" },
      { existentes: { [kIgual]: same.length } },
    );

    const res = await replicateBackupToR2(
      [
        { key: kIgual, body: same },
        { key: kCambio, body: changed },
      ],
      Date.now() + 10_000,
    );

    expect(res.omitidos).toBe(1);
    expect(res.verificados).toBe(1);
    expect(res.reparados).toBe(0);
    expect(res.subidos).toBe(1);
    expect(res.errores).toEqual([]);

    expect(urlsDe(fn, "PUT")).toEqual([`${BASE}/${kCambio}`, `${BASE}/${R2_MANIFEST_KEY}`]);

    // Manifest final: conserva el sin-cambios y actualiza el cambiado.
    const manifestReq = calls(fn)[calls(fn).length - 1];
    const manifestBody = JSON.parse(await manifestReq.text()) as Record<string, string>;
    expect(manifestBody[kIgual]).toBe(fileSignature(same));
    expect(manifestBody[kCambio]).toBe(fileSignature(changed));
  });

  it("deadline vencido → archivos quedan pendientes (sin PUT) y el manifest igual se sube", async () => {
    stubEnv(ENV);
    const { fn } = mockFetch(null);
    const res = await replicateBackupToR2(
      [
        { key: "data/2026-07-25/a.ndjson.gz", body: Buffer.from("a") },
        { key: "data/2026-07-25/b.ndjson.gz", body: Buffer.from("b") },
      ],
      Date.now() - 1, // ya vencido
    );
    expect(res.pendientes).toBe(2);
    expect(res.subidos).toBe(0);
    expect(urlsDe(fn, "PUT")).toEqual([`${BASE}/${R2_MANIFEST_KEY}`]);
  });

  it("PUT fallido → error reportado y el archivo NO entra al manifest (retry mañana)", async () => {
    stubEnv(ENV);
    const { fn } = mockFetch(null, { putStatus: 403 });
    const res = await replicateBackupToR2(
      [{ key: "data/2026-07-25/x.ndjson.gz", body: Buffer.from("x") }],
      Date.now() + 10_000,
    );
    expect(res.subidos).toBe(0);
    // PUT archivo (403) + PUT manifest (403) → 2 errores, pero nunca lanza
    expect(res.errores.length).toBe(2);
    expect(res.errores[0]).toMatch(/data\/2026-07-25\/x\.ndjson\.gz: HTTP 403/);

    const manifestReq = calls(fn).filter((r) => r.method === "PUT")[1];
    const manifestBody = JSON.parse(await manifestReq.text()) as Record<string, string>;
    expect(manifestBody).toEqual({});
  });

  it("poda: el manifest sube sin las fechas anteriores a pruneBefore", async () => {
    stubEnv(ENV);
    const viejo = "data/2026-06-01/cheques.ndjson.gz";
    const { fn } = mockFetch({ [viejo]: "1|a" });
    await replicateBackupToR2(
      [{ key: "data/2026-07-25/cheques.ndjson.gz", body: Buffer.from("hoy") }],
      Date.now() + 10_000,
      { pruneBefore: "2026-07-18" },
    );
    const manifestReq = calls(fn).filter((r) => r.method === "PUT").slice(-1)[0];
    const manifestBody = JSON.parse(await manifestReq.text()) as Record<string, string>;
    expect(manifestBody[viejo]).toBeUndefined();
    expect(manifestBody["data/2026-07-25/cheques.ndjson.gz"]).toBeDefined();
  });
});

describe("verificación post-subida y agujero del manifest", () => {
  it("PUT 200 pero el objeto no queda en R2 → error y NO entra al manifest", async () => {
    stubEnv(ENV);
    const { fn } = mockFetch(null, { putFantasma: true });
    const res = await replicateBackupToR2(
      [{ key: "data/2026-07-25/x.ndjson.gz", body: Buffer.from("x") }],
      Date.now() + 10_000,
    );
    expect(res.subidos).toBe(0);
    expect(res.errores[0]).toMatch(/HEAD devuelve 404/);
    const manifestReq = calls(fn).filter((r) => r.method === "PUT").slice(-1)[0];
    expect(JSON.parse(await manifestReq.text())).toEqual({});
  });

  it("omitido cuyo objeto YA NO está en R2 → se re-sube (antes se omitía para siempre)", async () => {
    stubEnv(ENV);
    const body = Buffer.from("contenido");
    const key = "data/2026-07-25/borrado.ndjson.gz";
    // Manifest dice que está subido, pero R2 no lo tiene (alguien lo borró).
    const { fn, objetos } = mockFetch({ [key]: fileSignature(body) }, { existentes: {} });
    const res = await replicateBackupToR2([{ key, body }], Date.now() + 10_000);

    expect(res.reparados).toBe(1);
    expect(res.subidos).toBe(1);
    expect(res.omitidos).toBe(0);
    expect(objetos.get(key)).toBe(body.length);
    expect(urlsDe(fn, "PUT")).toContain(`${BASE}/${key}`);
  });

  it("el HEAD también detecta un objeto con tamaño distinto al subido", async () => {
    stubEnv(ENV);
    // PUT guarda el tamaño real; forzamos un desajuste con un objeto previo de
    // otro tamaño que el PUT fantasma no actualiza.
    const { fn } = mockFetch(null, {
      putFantasma: true,
      existentes: { "data/2026-07-25/x.ndjson.gz": 99999 },
    });
    const res = await replicateBackupToR2(
      [{ key: "data/2026-07-25/x.ndjson.gz", body: Buffer.from("x") }],
      Date.now() + 10_000,
    );
    expect(res.subidos).toBe(0);
    expect(res.errores[0]).toMatch(/se esperaban 1/);
    expect(urlsDe(fn, "HEAD")).toHaveLength(1);
  });

  it("HEAD 200 sin content-length → vale como verificado (R2 sirve los .json comprimidos)", async () => {
    stubEnv(ENV);
    // Regresión del 25-jul contra el R2 real: los 8 .ndjson.gz verificaban bien
    // y meta-switch.json fallaba con "subido con 0 bytes, se esperaban 1463".
    const { fn, objetos } = mockFetch(null, { headSinLargo: true });
    const metaBuf = Buffer.from(JSON.stringify({ format: "v2-ndjson-gz", datasets: [] }), "utf-8");
    const key = r2DataKey("2026-07-25", "meta-switch.json");
    const res = await replicateBackupToR2([{ key, body: metaBuf }], Date.now() + 10_000);

    expect(res.errores).toEqual([]);
    expect(res.subidos).toBe(1);
    expect(objetos.has(key)).toBe(true);
    const manifestReq = calls(fn).filter((r) => r.method === "PUT").slice(-1)[0];
    expect(JSON.parse(await manifestReq.text())[key]).toBe(fileSignature(metaBuf));
  });

  it("el HEAD pide Accept-Encoding: identity para que R2 no comprima la respuesta", async () => {
    stubEnv(ENV);
    const { fn } = mockFetch(null);
    await replicateBackupToR2(
      [{ key: r2DataKey("2026-07-25", "meta.json"), body: Buffer.from("{}") }],
      Date.now() + 10_000,
    );
    const head = calls(fn).find((r) => r.method === "HEAD");
    expect(head?.headers.get("accept-encoding")).toBe("identity");
  });
});

describe("replicateStorageToR2 (fotos, facturas, adjuntos)", () => {
  const lazy = (key: string, sig: string, contenido: string, contentType?: string) => ({
    key,
    sig,
    contentType,
    load: async () => Buffer.from(contenido),
  });

  it("usa su PROPIO manifest y respeta el content-type del archivo", async () => {
    stubEnv(ENV);
    const { fn, objetos } = mockFetch(null);
    const res = await replicateStorageToR2(
      [lazy(`${R2_STORAGE_PREFIX}/product-images/tommy/a.jpg`, "123|2026-07-25", "jpegbytes", "image/jpeg")],
      Date.now() + 10_000,
    );
    expect(res.subidos).toBe(1);
    expect(objetos.has(`${R2_STORAGE_PREFIX}/product-images/tommy/a.jpg`)).toBe(true);
    expect(calls(fn)[0].url).toBe(`${BASE}/${R2_STORAGE_MANIFEST_KEY}`);
    const put = calls(fn).filter((r) => r.method === "PUT")[0];
    expect(put.headers.get("content-type")).toBe("image/jpeg");
  });

  it("no descarga (load) los archivos que ya están replicados", async () => {
    stubEnv(ENV);
    const key = `${R2_STORAGE_PREFIX}/reclamo-fotos/f.jpg`;
    const sig = "500|2026-07-01T00:00:00Z";
    const load = vi.fn(async () => Buffer.from("no debería bajarse"));
    mockFetch({ [key]: sig }, { existentes: { [key]: 500 } });
    const res = await replicateStorageToR2(
      [{ key, sig, load }],
      Date.now() + 10_000,
    );
    expect(res.omitidos).toBe(1);
    expect(res.subidos).toBe(0);
    expect(load).not.toHaveBeenCalled();
  });

  it("un archivo que falla no frena a los demás", async () => {
    stubEnv(ENV);
    const ok = lazy(`${R2_STORAGE_PREFIX}/a.jpg`, "1|x", "aa");
    const malo = {
      key: `${R2_STORAGE_PREFIX}/b.jpg`,
      sig: "2|y",
      load: async () => {
        throw new Error("download vacío");
      },
    };
    const { objetos } = mockFetch(null);
    const res = await replicateStorageToR2([malo, ok], Date.now() + 10_000);
    expect(res.subidos).toBe(1);
    expect(res.errores.some((e) => e.includes("download vacío"))).toBe(true);
    expect(objetos.has(`${R2_STORAGE_PREFIX}/a.jpg`)).toBe(true);
  });
});

// ── Lógica pura (sin red) ────────────────────────────────────────────────────

describe("r2DataKey — historia con fecha", () => {
  it("mete la fecha en el path (antes era estable y cada corrida sobreescribía)", () => {
    expect(r2DataKey("2026-07-25", "cheques.ndjson.gz")).toBe("data/2026-07-25/cheques.ndjson.gz");
    expect(r2DataKey("2026-07-25", "meta.json")).toBe("data/2026-07-25/meta.json");
  });

  it("dos días distintos NO comparten key (eso es la historia)", () => {
    expect(r2DataKey("2026-07-25", "cheques.ndjson.gz")).not.toBe(
      r2DataKey("2026-07-26", "cheques.ndjson.gz"),
    );
  });

  it("datos y storage van a prefijos y manifests distintos", () => {
    expect(R2_DATA_PREFIX).toBe("data");
    expect(R2_STORAGE_PREFIX).toBe("_storage");
    expect(R2_MANIFEST_KEY).not.toBe(R2_STORAGE_MANIFEST_KEY);
  });
});

describe("pruneDataManifest", () => {
  const manifest = {
    "data/2026-07-01/cheques.ndjson.gz": "1|a",
    "data/2026-07-20/cheques.ndjson.gz": "2|b",
    "data/2026-07-25/cheques.ndjson.gz": "3|c",
    "data/2026-07-25/meta.json": "4|d",
    "_storage/product-images/foto.jpg": "5|e",
  };

  it("quita solo las fechas anteriores al cutoff", () => {
    const out = pruneDataManifest(manifest, "2026-07-20");
    expect(Object.keys(out).sort()).toEqual([
      "_storage/product-images/foto.jpg",
      "data/2026-07-20/cheques.ndjson.gz",
      "data/2026-07-25/cheques.ndjson.gz",
      "data/2026-07-25/meta.json",
    ]);
  });

  it("no toca keys fuera de data/ (la réplica de Storage tiene su propio manifest)", () => {
    const out = pruneDataManifest(manifest, "2030-01-01");
    expect(out["_storage/product-images/foto.jpg"]).toBe("5|e");
    expect(Object.keys(out)).toHaveLength(1);
  });

  it("quita las keys PLANAS heredadas de data/ (sin carpeta de fecha)", () => {
    // 57 entradas muertas medidas en el manifest real (25-jul): nunca matchean
    // una fecha, así que se quedaban para siempre. Ningún escritor las produce.
    const out = pruneDataManifest(
      { ...manifest, "data/ventas_raw.ndjson.gz": "9|z", "data/cheques.ndjson.gz": "9|y" },
      "2026-07-20",
    );
    expect(out["data/ventas_raw.ndjson.gz"]).toBeUndefined();
    expect(out["data/cheques.ndjson.gz"]).toBeUndefined();
    expect(out["data/2026-07-25/cheques.ndjson.gz"]).toBe("3|c");
  });

  it("es pura: no muta el manifest original", () => {
    const copia = { ...manifest };
    pruneDataManifest(manifest, "2026-07-25");
    expect(manifest).toEqual(copia);
  });
});

describe("r2RetentionPlan (21 diarios + 8 lunes + 24 días 1)", () => {
  /** Fechas consecutivas hacia atrás desde `hasta` (inclusive). */
  const serie = (hasta: string, dias: number) => {
    const out: string[] = [];
    const t = Date.parse(`${hasta}T00:00:00Z`);
    for (let i = 0; i < dias; i++) out.push(new Date(t - i * 86400000).toISOString().slice(0, 10));
    return out;
  };

  it("con menos fechas que el tope diario no borra nada", () => {
    const plan = r2RetentionPlan(serie("2026-07-25", 10));
    expect(plan.borrar).toEqual([]);
    expect(plan.keep).toHaveLength(10);
  });

  it("conserva siempre los últimos 21 días (aprobado por Daniel, jul-2026)", () => {
    const plan = r2RetentionPlan(serie("2026-07-25", 200));
    for (const d of serie("2026-07-25", RETENCION_R2.diarios)) expect(plan.keep).toContain(d);
  });

  it("la ventana diaria es de 21, igual que la de Supabase Storage", () => {
    expect(RETENCION_R2.diarios).toBe(21);
  });

  it("conserva lunes y días 1 más viejos que la ventana diaria", () => {
    const plan = r2RetentionPlan(serie("2026-07-25", 200));
    expect(new Date("2026-06-29T00:00:00Z").getUTCDay()).toBe(1); // lunes, fuera de los 21 días
    expect(plan.keep).toContain("2026-06-29");
    expect(plan.keep).toContain("2026-07-01");
    expect(plan.keep).toContain("2026-06-01");
  });

  it("borra lo que no es ni diario reciente ni lunes ni día 1", () => {
    const plan = r2RetentionPlan(serie("2026-07-25", 200));
    expect(new Date("2026-06-10T00:00:00Z").getUTCDay()).toBe(3); // miércoles
    expect(plan.borrar).toContain("2026-06-10");
  });

  it("keep + borrar = el set de entrada, sin duplicados ni pérdidas", () => {
    const dates = serie("2026-07-25", 400);
    const plan = r2RetentionPlan(dates);
    expect([...plan.keep, ...plan.borrar].sort()).toEqual([...dates].sort());
    expect(new Set(plan.keep).size).toBe(plan.keep.length);
  });

  it("con 2 años de historia el set conservado cabe holgado en los 10 GB gratis", () => {
    const plan = r2RetentionPlan(serie("2026-07-25", 730));
    expect(plan.keep.length).toBeLessThanOrEqual(
      RETENCION_R2.diarios + RETENCION_R2.semanales + RETENCION_R2.mensuales,
    );
    // ~53 carpetas × ~30 MB ≈ 1.6 GB
    expect(plan.keep.length * 30).toBeLessThan(10 * 1024);
  });

  it("ignora entradas que no son fechas y deduplica", () => {
    const plan = r2RetentionPlan(["2026-07-25", "2026-07-25", "manifest.json", "basura"]);
    expect(plan.keep).toEqual(["2026-07-25"]);
    expect(plan.borrar).toEqual([]);
  });
});

describe("ventanaVerificacion (verificar lo omitido sin pagar 3.2K HEADs)", () => {
  it("sample >= total → verifica todos (caso datos, ~57 keys)", () => {
    expect(ventanaVerificacion(57, Infinity, 0).size).toBe(57);
    expect(ventanaVerificacion(5, 10, 3).size).toBe(5);
  });

  it("sample 0 o total 0 → no verifica nada", () => {
    expect(ventanaVerificacion(100, 0, 1).size).toBe(0);
    expect(ventanaVerificacion(0, 250, 1).size).toBe(0);
  });

  it("ventana acotada al tamaño del sample", () => {
    expect(ventanaVerificacion(3204, 250, 0).size).toBe(250);
  });

  it("rota con el día y cubre TODO el set en ceil(total/sample) días", () => {
    const total = 1000;
    const sample = 250;
    const vistos = new Set<number>();
    for (let d = 0; d < Math.ceil(total / sample); d++) {
      for (const i of ventanaVerificacion(total, sample, d)) vistos.add(i);
    }
    expect(vistos.size).toBe(total);
  });

  it("días consecutivos NO repiten la misma ventana", () => {
    const a = ventanaVerificacion(3204, 250, 10);
    const b = ventanaVerificacion(3204, 250, 11);
    expect([...a].some((i) => !b.has(i))).toBe(true);
  });
});

describe("parseDataDates (ListObjectsV2 con delimiter)", () => {
  it("extrae las fechas de los CommonPrefixes", () => {
    const xml = `<?xml version="1.0"?><ListBucketResult>
      <CommonPrefixes><Prefix>data/2026-07-24/</Prefix></CommonPrefixes>
      <CommonPrefixes><Prefix>data/2026-07-25/</Prefix></CommonPrefixes>
    </ListBucketResult>`;
    expect(parseDataDates(xml)).toEqual(["2026-07-24", "2026-07-25"]);
  });

  it("ignora prefijos que no son fechas y no revienta con XML vacío", () => {
    expect(parseDataDates("<ListBucketResult></ListBucketResult>")).toEqual([]);
    expect(parseDataDates("<Prefix>_storage/product-images/</Prefix>")).toEqual([]);
  });
});

describe("parseListKeys / listR2DataKeys (inventario paginado de data/)", () => {
  const xmlDe = (keys: string[], token?: string) =>
    `<?xml version="1.0"?><ListBucketResult>${keys
      .map((k) => `<Contents><Key>${k}</Key><Size>10</Size></Contents>`)
      .join("")}${token ? `<IsTruncated>true</IsTruncated><NextContinuationToken>${token}</NextContinuationToken>` : "<IsTruncated>false</IsTruncated>"}</ListBucketResult>`;

  it("extrae las keys del XML y no revienta con uno vacío", () => {
    expect(parseListKeys(xmlDe(["data/2026-07-25/meta.json"]))).toEqual(["data/2026-07-25/meta.json"]);
    expect(parseListKeys("<ListBucketResult></ListBucketResult>")).toEqual([]);
  });

  it("sigue el continuation-token hasta agotar las páginas", async () => {
    stubEnv(ENV);
    const paginas = [
      xmlDe(["data/2026-07-24/meta.json"], "TOK1"),
      xmlDe(["data/2026-07-25/meta.json", "data/2026-07-25/meta-switch.json"]),
    ];
    let i = 0;
    const fn = vi.fn(async (_input: Request | string | URL) => new Response(paginas[i++], { status: 200 }));
    vi.stubGlobal("fetch", fn);
    const keys = await listR2DataKeys();
    expect(keys).toEqual([
      "data/2026-07-24/meta.json",
      "data/2026-07-25/meta.json",
      "data/2026-07-25/meta-switch.json",
    ]);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(calls(fn as FetchMock)[1].url).toContain("continuation-token=TOK1");
  });

  it("sin env vars o con error de red devuelve [] sin lanzar", async () => {
    const { fn } = mockFetch(null);
    expect(await listR2DataKeys()).toEqual([]);
    expect(fn).not.toHaveBeenCalled();
    stubEnv(ENV);
    vi.stubGlobal("fetch", vi.fn(async (_input: Request | string | URL) => { throw new Error("ECONNRESET"); }));
    expect(await listR2DataKeys()).toEqual([]);
  });
});

describe("evaluarFechasR2 (una fecha a medias NO es un backup)", () => {
  const keysDe = (fecha: string, archivos: string[]) => archivos.map((a) => `data/${fecha}/${a}`);

  it("los dos grupos presentes → completo", () => {
    const [e] = evaluarFechasR2(
      keysDe("2026-07-26", ["meta.json", "meta-switch.json", "cheques.ndjson.gz", "switch_recibos.ndjson.gz"]),
    );
    expect(e.completo).toBe(true);
    expect(e.grupos.sort()).toEqual(["core", "switch"]);
    expect(e.faltan).toEqual([]);
    expect(e.datasets).toBe(2);
  });

  it("EL CASO REAL 25-jul: solo meta-switch.json → incompleto, falta core", () => {
    const [e] = evaluarFechasR2(keysDe("2026-07-25", ["meta-switch.json", "switch_recibos.ndjson.gz"]));
    expect(e.fecha).toBe("2026-07-25");
    expect(e.completo).toBe(false);
    expect(e.faltan).toEqual(["core"]);
    expect(e.grupos).toEqual(["switch"]);
  });

  it("solo meta.json (días previos al split core/switch) → falta switch", () => {
    const [e] = evaluarFechasR2(keysDe("2026-07-10", ["meta.json", "cheques.ndjson.gz"]));
    expect(e.faltan).toEqual(["switch"]);
    expect(e.datasets).toBe(1);
  });

  it("ignora las keys planas heredadas: no inventan una fecha", () => {
    expect(evaluarFechasR2(["data/cheques.ndjson.gz", "data/ventas_raw.ndjson.gz", "manifest.json"])).toEqual([]);
  });

  it("devuelve las fechas ordenadas ascendente", () => {
    const est = evaluarFechasR2([
      ...keysDe("2026-07-25", ["meta.json"]),
      ...keysDe("2026-07-23", ["meta.json"]),
      ...keysDe("2026-07-24", ["meta.json"]),
    ]);
    expect(est.map((e) => e.fecha)).toEqual(["2026-07-23", "2026-07-24", "2026-07-25"]);
  });

  it("los grupos vigilados son core (meta.json) y switch (meta-switch.json)", () => {
    expect(R2_METAS_POR_GRUPO).toEqual({ core: "meta.json", switch: "meta-switch.json" });
  });
});

describe("fileSignature", () => {
  it("size|sha256 y cambia con el contenido", () => {
    const a = fileSignature(Buffer.from("hola"));
    expect(a.startsWith("4|")).toBe(true);
    expect(a).not.toBe(fileSignature(Buffer.from("holb")));
    expect(a).toBe(fileSignature(Buffer.from("hola")));
  });
});
