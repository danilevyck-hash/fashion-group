// ─────────────────────────────────────────────────────────────────────────────
// 🔴 ÚLTIMO UPLOAD MANDA (Daniel, 9-oct-2026)
//
// «Quiero que si subí una foto, y ya existe otra, que la reemplace. Último
// upload manda.»
//
// Antes el ZIP del banco se SALTABA los artículos con foto elegida a mano
// (`foto_manual`, 25-jul-2026). Ahora toda carga hecha por una persona —ZIP o
// foto suelta— reemplaza la que hubiera, y el ZIP ya no consulta esa lista.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { makeDb, type MockDb } from "../helpers/catalogo-mock-db";

let tommyDb: MockDb;
vi.mock("@/lib/tommy-supabase-server", () => ({
  tommyServer: { from: (t: string) => tommyDb.from(t) },
}));
const firmarUrl = vi.fn(async (p: string) => ({ data: { signedUrl: `https://st.test/firmada/${p}` }, error: null }));
vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: {
    storage: {
      from: () => ({
        createSignedUploadUrl: firmarUrl,
        getPublicUrl: (p: string) => ({ data: { publicUrl: `https://cdn.test/${p}` } }),
      }),
    },
  },
}));
vi.mock("@/lib/log-activity", () => ({ logActivity: vi.fn(async () => {}) }));
vi.mock("next/cache", () => ({
  unstable_cache: (cb: (...a: unknown[]) => unknown) => (...a: unknown[]) => cb(...a),
  revalidateTag: vi.fn(),
}));

import { POST as manifiesto } from "@/app/api/catalogo/[marca]/products/variantes/manifiesto/route";
import { POST as firmar } from "@/app/api/catalogo/[marca]/products/variantes/firmar/route";
import { POST as editar } from "@/app/api/catalogo/[marca]/products/route";
import { makeReq, TEST_SECRET } from "../helpers/catalogo-request";

const TABLA = "tommy_products";
const ctx = { params: { marca: "tommy" } };
const post = (body: unknown) => makeReq("/x", { method: "POST", body, role: "admin" });
/** Los payloads de UPDATE que llegaron a la tabla de productos, en orden. */
const updates = () =>
  tommyDb.chainsFor(TABLA).filter((c) => c._calls.update).map((c) => ({
    de: c._calls.eq[0][1] as string,
    ...(c._calls.update[0][0] as { image_url: string; foto_manual: boolean }),
  }));

beforeAll(() => { process.env.SESSION_SECRET = TEST_SECRET; });
beforeEach(() => { vi.clearAllMocks(); tommyDb = makeDb(); });

describe("🔴 último upload manda", () => {
  it("ZIP con foto para un artículo con foto elegida a mano → queda la del ZIP; foto suelta después → queda la suelta", async () => {
    // AAA111 tiene foto elegida a mano. Si el ZIP todavía preguntara por ellas,
    // esta segunda respuesta es la que recibiría (y se la saltaría).
    tommyDb.queue(
      TABLA,
      { data: [{ id: "1", sku: "AAA111", foto_manual: true }] },
      { data: [{ sku: "AAA111" }] },
      { data: { sku: "AAA111" } },
    );

    const res = await manifiesto(post({ items: [{ sku: "AAA111", variantes: [1, 2], elegida: 1 }] }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ asignadas: 1, sinMatch: [], errores: [] });
    expect(updates()).toHaveLength(1);
    expect(updates()[0].de).toBe("AAA111");
    expect(updates()[0].image_url).toContain("tommy/_v/aaa111/1.jpg");

    const SUELTA = "https://cdn.test/tommy/aaa111?v=2";
    const res2 = await editar(post({ sku: "AAA111", image_url: SUELTA, foto_manual: true }), ctx);
    expect(res2.status).toBe(200);
    expect(updates()).toHaveLength(2);
    expect(updates()[1]).toMatchObject({ de: "AAA111", image_url: SUELTA });
  });

  it("el ZIP no consulta las fotos elegidas a mano: ni al firmar ni en el manifiesto", async () => {
    tommyDb.queue(TABLA, { data: [{ id: "1", sku: "AAA111" }] }, { data: { sku: "AAA111" } });
    const f = await firmar(post({ paths: ["tommy/_v/aaa111/1.jpg"] }), ctx);
    expect(f.status).toBe(200);
    expect((await f.json()).firmados).toHaveLength(1);
    expect(tommyDb.chainsFor(TABLA)).toHaveLength(0);

    await manifiesto(post({ items: [{ sku: "AAA111", variantes: [1], elegida: 1 }] }), ctx);
    for (const c of tommyDb.chainsFor(TABLA)) {
      expect(JSON.stringify(c._calls.eq ?? [])).not.toContain("foto_manual");
    }
  });

  it("CONTROL (se conserva): una foto elegida que no se subió no queda asignada", async () => {
    tommyDb.queue(TABLA, { data: [{ id: "1", sku: "AAA111" }] }, { data: [] });
    const res = await manifiesto(post({ items: [{ sku: "AAA111", variantes: [2], elegida: 1 }] }), ctx);
    expect(await res.json()).toMatchObject({ asignadas: 0, errores: ["AAA111: la foto elegida no se subió"] });
    expect(updates()).toHaveLength(0);
  });
});
