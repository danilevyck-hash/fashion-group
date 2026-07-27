// @vitest-environment node
// (entorno node: el parser multipart de undici en NextRequest.formData() choca
// con los globals File/FormData de jsdom; este archivo no necesita DOM)
//
// ─────────────────────────────────────────────────────────────────────────────
// PR-0 paridad catálogos — CONTRATO de sync-status, upload (validación) y
// orders/[id]/pdf para ambas marcas.
//
// DIVERGENCIAS ACTUALES capturadas a propósito:
//   · upload: reebok permite admin+secretaria; joybees SOLO admin (secretaria 403)
//   · upload: reebok guarda en el Storage del proyecto Reebok; joybees en el
//     del proyecto principal
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { makeDb, makeStorage, type MockDb } from "../helpers/catalogo-mock-db";

let reebokDb: MockDb;
let reebokStorage = makeStorage();
vi.mock("@/lib/reebok-supabase-server", () => ({
  reebokServer: {
    from: (t: string) => reebokDb.from(t),
    rpc: (...a: unknown[]) => reebokDb.rpc(...a),
    storage: { from: (b: string) => reebokStorage.from(b) },
  },
}));

let joybeesDb: MockDb;
vi.mock("@/lib/joybees-supabase-server", () => ({
  joybeesServer: {
    from: (t: string) => joybeesDb.from(t),
    rpc: (...a: unknown[]) => joybeesDb.rpc(...a),
  },
}));

let mainDb: MockDb;
let mainStorage = makeStorage();
vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: {
    from: (t: string) => mainDb.from(t),
    rpc: (...a: unknown[]) => mainDb.rpc(...a),
    storage: { from: (b: string) => mainStorage.from(b) },
  },
}));

// PR-1: rutas dinámicas [marca] — un solo handler por endpoint; los wrappers
// inyectan la marca del segmento (mismas aserciones que el arnés de PR-0).
import type { NextRequest } from "next/server";
import { GET as syncStatusGet } from "@/app/api/catalogo/[marca]/sync-status/route";
import { POST as uploadPost } from "@/app/api/catalogo/[marca]/upload/route";
import { GET as pdfGet } from "@/app/api/catalogo/[marca]/orders/[id]/pdf/route";
type IdCtx = { params: { id: string } };
const rSyncStatus = (req: NextRequest) => syncStatusGet(req, { params: { marca: "reebok" } });
const jSyncStatus = (req: NextRequest) => syncStatusGet(req, { params: { marca: "joybees" } });
const rUpload = (req: NextRequest) => uploadPost(req, { params: { marca: "reebok" } });
const jUpload = (req: NextRequest) => uploadPost(req, { params: { marca: "joybees" } });
const rPdf = (req: NextRequest, ctx: IdCtx) => pdfGet(req, { params: { marca: "reebok", ...ctx.params } });
const jPdf = (req: NextRequest, ctx: IdCtx) => pdfGet(req, { params: { marca: "joybees", ...ctx.params } });
import { makeReq, TEST_SECRET } from "../helpers/catalogo-request";

beforeAll(() => {
  process.env.SESSION_SECRET = TEST_SECRET;
});

const OID = "33333333-3333-4333-8333-333333333333";
const P1 = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  reebokDb = makeDb();
  joybeesDb = makeDb();
  mainDb = makeDb();
  reebokStorage = makeStorage("https://cdn.test/reebok/product-images/x");
  mainStorage = makeStorage("https://cdn.test/main/product-images/x");
});

// ─── sync-status ─────────────────────────────────────────────────────────────

describe("GET /sync-status — última corrida del cron de catálogo", () => {
  it("401 sin sesión — ambas marcas", async () => {
    expect((await rSyncStatus(makeReq("/x"))).status).toBe(401);
    expect((await jSyncStatus(makeReq("/x"))).status).toBe(401);
  });

  it("bodega 403 (roles admin/secretaria/vendedor) — ambas marcas", async () => {
    expect((await rSyncStatus(makeReq("/x", { role: "bodega" }))).status).toBe(403);
    expect((await jSyncStatus(makeReq("/x", { role: "bodega" }))).status).toBe(403);
  });

  it("cada marca consulta SU cron en cron_heartbeats y responde {lastSync}", async () => {
    mainDb.queue("cron_heartbeats", { data: { last_success_at: "2026-07-23T12:10:00Z" } });
    const rRes = await rSyncStatus(makeReq("/x", { role: "vendedor" }));
    expect(await rRes.json()).toEqual({ lastSync: "2026-07-23T12:10:00Z" });
    expect(mainDb.chainsFor("cron_heartbeats")[0]._calls.eq).toContainEqual([
      "cron_name",
      "reebok-catalogo",
    ]);

    mainDb.queue("cron_heartbeats", { data: null });
    const jRes = await jSyncStatus(makeReq("/x", { role: "admin" }));
    expect(await jRes.json()).toEqual({ lastSync: null });
    expect(mainDb.chainsFor("cron_heartbeats")[1]._calls.eq).toContainEqual([
      "cron_name",
      "joybees-catalogo",
    ]);
  });
});

// ─── upload (validación) ─────────────────────────────────────────────────────

// multipart construido a mano: el File/FormData de jsdom no pasa el brand
// check de undici dentro de NextRequest.formData().
const BOUNDARY = "----vitestboundary123456";

function fileForm(opts: { type?: string; size?: number; sku?: string; omitFile?: boolean } = {}) {
  const { type = "image/png", size = 6 * 1024, sku, omitFile } = opts;
  const parts: (string | Uint8Array)[] = [];
  if (!omitFile) {
    parts.push(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="foto.png"\r\nContent-Type: ${type}\r\n\r\n`,
      new Uint8Array(size).fill(65),
      "\r\n",
    );
  }
  if (sku !== undefined) {
    parts.push(`--${BOUNDARY}\r\nContent-Disposition: form-data; name="sku"\r\n\r\n${sku}\r\n`);
  }
  parts.push(`--${BOUNDARY}--\r\n`);
  const chunks = parts.map((p) => (typeof p === "string" ? new TextEncoder().encode(p) : p));
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const body = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    body.set(c, off);
    off += c.length;
  }
  return body;
}

const MULTIPART_HEADERS = { "content-type": `multipart/form-data; boundary=${BOUNDARY}` };

describe("POST /upload — validación de imágenes", () => {
  it("401 sin sesión — ambas marcas", async () => {
    expect((await rUpload(makeReq("/x", { method: "POST", rawBody: fileForm(), headers: MULTIPART_HEADERS }))).status).toBe(401);
    expect((await jUpload(makeReq("/x", { method: "POST", rawBody: fileForm(), headers: MULTIPART_HEADERS }))).status).toBe(401);
  });

  // 27-jul-2026: la DIVERGENCIA se cerró. Joybees y Tommy tenían
  // upload.roles=["admin"] contra ["admin","secretaria"] de Reebok, o sea que
  // la secretaria no podía subir una foto en 2 de las 3 marcas — justo lo que
  // Daniel pidió habilitar ("catálogos como a daniel, con administrar
  // también"). Las 3 marcas usan ahora CATALOGO_ADMIN_ROLES.
  it("paridad de roles: secretaria puede subir foto en AMBAS marcas", async () => {
    for (const upload of [rUpload, jUpload]) {
      const res = await upload(
        makeReq("/x", { method: "POST", rawBody: fileForm({ sku: "SKU1" }), headers: MULTIPART_HEADERS, role: "secretaria" }),
      );
      expect(res.status).toBe(200);
    }
  });

  it("los roles que NO administran siguen sin poder subir (403) — ambas marcas", async () => {
    for (const upload of [rUpload, jUpload]) {
      for (const role of ["vendedor", "bodega", "contabilidad", "gerente_acs"]) {
        const res = await upload(
          makeReq("/x", { method: "POST", rawBody: fileForm({ sku: "SKU1" }), headers: MULTIPART_HEADERS, role }),
        );
        expect(res.status, `${role} no debe poder subir fotos`).toBe(403);
      }
    }
  });

  it("400 sin archivo — ambas marcas", async () => {
    for (const upload of [rUpload, jUpload]) {
      const res = await upload(
        makeReq("/x", { method: "POST", rawBody: fileForm({ omitFile: true }), headers: MULTIPART_HEADERS, role: "admin" }),
      );
      expect(res.status).toBe(400);
    }
  });

  it("400 si no es imagen real (content-type fuera de la lista) — ambas marcas", async () => {
    for (const upload of [rUpload, jUpload]) {
      const res = await upload(
        makeReq("/x", { method: "POST", rawBody: fileForm({ type: "text/plain" }), headers: MULTIPART_HEADERS, role: "admin" }),
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error).toContain("imagen");
    }
  });

  it("400 si pesa menos de 5KB (dañada) — ambas marcas", async () => {
    for (const upload of [rUpload, jUpload]) {
      const res = await upload(
        makeReq("/x", { method: "POST", rawBody: fileForm({ size: 1024 }), headers: MULTIPART_HEADERS, role: "admin" }),
      );
      expect(res.status).toBe(400);
    }
  });

  it("con SKU: path determinístico normalizado + cache-buster ?v= — reebok sube a SU Storage", async () => {
    const res = await rUpload(
      makeReq("/x", { method: "POST", rawBody: fileForm({ sku: "AB 12/X" }), headers: MULTIPART_HEADERS, role: "admin" }),
    );
    expect(res.status).toBe(200);
    const { url } = await res.json();
    expect(url).toMatch(/\?v=\d+$/);
    expect(reebokStorage.upload).toHaveBeenCalledTimes(1);
    expect(reebokStorage.upload.mock.calls[0][0]).toBe("products/ab_12_x");
    const opts = reebokStorage.upload.mock.calls[0][2] as Record<string, unknown>;
    expect(opts.upsert).toBe(true);
    expect(mainStorage.upload).not.toHaveBeenCalled();
  });

  it("joybees sube al Storage del proyecto PRINCIPAL (divergencia de topología actual)", async () => {
    const res = await jUpload(
      makeReq("/x", { method: "POST", rawBody: fileForm({ sku: "JB1" }), headers: MULTIPART_HEADERS, role: "admin" }),
    );
    expect(res.status).toBe(200);
    expect(mainStorage.upload).toHaveBeenCalledTimes(1);
    expect(reebokStorage.upload).not.toHaveBeenCalled();
  });

  it("sin SKU: path con timestamp (no pisa otras subidas), url sin ?v=", async () => {
    const res = await rUpload(makeReq("/x", { method: "POST", rawBody: fileForm(), headers: MULTIPART_HEADERS, role: "admin" }));
    expect(res.status).toBe(200);
    const { url } = await res.json();
    expect(url).not.toContain("?v=");
    expect(String(reebokStorage.upload.mock.calls[0][0])).toMatch(/^products\/\d+-foto\.png$/);
  });
});

// ─── orders/[id]/pdf ─────────────────────────────────────────────────────────

describe("GET /orders/[id]/pdf — PDF inline del pedido", () => {
  it("401 sin sesión, 403 bodega — ambas marcas", async () => {
    for (const get of [rPdf, jPdf]) {
      expect((await get(makeReq("/x"), { params: { id: OID } })).status).toBe(401);
      expect((await get(makeReq("/x", { role: "bodega" }), { params: { id: OID } })).status).toBe(403);
    }
  });

  it("404 si el pedido no existe — ambas marcas", async () => {
    reebokDb.queue("reebok_orders", { data: null, error: { message: "no rows" } });
    expect((await rPdf(makeReq("/x", { role: "admin" }), { params: { id: OID } })).status).toBe(404);

    joybeesDb.queue("joybees_orders", { data: null, error: { message: "no rows" } });
    expect((await jPdf(makeReq("/x", { role: "admin" }), { params: { id: OID } })).status).toBe(404);
  });

  it("200 application/pdf INLINE con el número del pedido en el filename (reebok)", async () => {
    reebokDb.queue("reebok_orders", {
      data: {
        order_number: "PED-100",
        client_name: "Cliente",
        created_at: "2026-07-20T10:00:00Z",
        reebok_order_items: [
          { product_id: P1, sku: "S1", name: "P", quantity: 1, unit_price: 10, image_url: "", is_preorder: false },
        ],
      },
    });
    reebokDb.queue("products", { data: [{ id: P1, category: "footwear" }] });
    const res = await rPdf(makeReq("/x", { role: "vendedor" }), { params: { id: OID } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    const cd = res.headers.get("content-disposition") || "";
    expect(cd).toContain("inline");
    expect(cd).toContain("Pedido-PED-100");
  }, 30000);

  it("200 application/pdf (joybees, items sin is_preorder)", async () => {
    joybeesDb.queue("joybees_orders", {
      data: {
        order_number: "JBP-100",
        client_name: "Cliente",
        created_at: "2026-07-20T10:00:00Z",
        joybees_order_items: [
          { product_id: P1, sku: "S1", name: "P", quantity: 1, unit_price: 10, image_url: "" },
        ],
      },
    });
    joybeesDb.queue("joybees_products", { data: [{ id: P1, category: "footwear" }] });
    const res = await jPdf(makeReq("/x", { role: "admin" }), { params: { id: OID } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toContain("Pedido-JBP-100");
  }, 30000);
});
