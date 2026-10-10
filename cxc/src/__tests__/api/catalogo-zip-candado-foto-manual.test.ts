// ─────────────────────────────────────────────────────────────────────────────
// 🔴 SI NO SE PUEDE LEER EL CANDADO, EL ZIP NO CARGA NADA (9-oct-2026)
//
// 🩸 `skusConFotoManual` devolvía el conjunto VACÍO ante cualquier error de la
// base. «No pude preguntar» se leía como «nadie eligió ninguna foto», así que
// el ZIP del banco seguía y reemplazaba las fotos elegidas a mano, contándolas
// como «asignadas».
//
// Ahora la consulta que falla DETIENE la carga en sus dos puertas: al firmar
// (antes de subir la primera foto) y en el manifiesto (antes de la primera
// escritura).
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
const logActivity = vi.fn(async () => {});
vi.mock("@/lib/log-activity", () => ({ logActivity: (...a: unknown[]) => logActivity(...(a as [])) }));
vi.mock("next/cache", () => ({
  unstable_cache: (cb: (...a: unknown[]) => unknown) => (...a: unknown[]) => cb(...a),
  revalidateTag: vi.fn(),
}));

import { POST as manifiesto } from "@/app/api/catalogo/[marca]/products/variantes/manifiesto/route";
import { POST as firmar } from "@/app/api/catalogo/[marca]/products/variantes/firmar/route";
import { makeReq, TEST_SECRET } from "../helpers/catalogo-request";

const AVISO = "No se pudo comprobar las fotos elegidas a mano; no se cargó nada";
const TABLA = "tommy_products";
const PRODS = { data: [{ id: "1", sku: "AAA111" }, { id: "2", sku: "BBB222" }] };
const SE_CAYO = { data: null, error: { message: "canceling statement due to statement timeout" } };
const ITEMS = [
  { sku: "AAA111", variantes: [1, 2], elegida: 1 },
  { sku: "BBB222", variantes: [1], elegida: 1 },
];
const ctx = { params: { marca: "tommy" } };
const post = (body: unknown) => makeReq("/x", { method: "POST", body, role: "admin" });
/** Los UPDATE que llegaron a la tabla de productos. */
const updates = () => tommyDb.chainsFor(TABLA).filter((c) => c._calls.update);

beforeAll(() => { process.env.SESSION_SECRET = TEST_SECRET; });
beforeEach(() => { vi.clearAllMocks(); tommyDb = makeDb(); });

describe("🔴 la consulta de fotos elegidas a mano falla → no se carga nada", () => {
  it("el manifiesto corta con el aviso y NO escribe ninguna foto ni anota la carga", async () => {
    tommyDb.queue(TABLA, PRODS, SE_CAYO);
    const res = await manifiesto(post({ items: ITEMS }), ctx);
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe(AVISO);
    expect(updates()).toHaveLength(0);
    expect(logActivity).not.toHaveBeenCalled();
  });

  it("al firmar: no se entrega ni un permiso de subida (el ZIP se detiene antes de la primera foto)", async () => {
    tommyDb.queue(TABLA, SE_CAYO);
    const res = await firmar(post({ paths: ["tommy/_v/aaa111/1.jpg"] }), ctx);
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe(AVISO);
    expect(firmarUrl).not.toHaveBeenCalled();
  });
});

describe("la consulta responde → las fotos elegidas a mano se saltan y el resto se asigna", () => {
  it("AAA111 (elegida a mano) no se toca; BBB222 recibe la suya, sin candado", async () => {
    tommyDb.queue(TABLA, PRODS, { data: [{ sku: "AAA111" }] }, { data: { sku: "BBB222" } });
    const res = await manifiesto(post({ items: ITEMS }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ asignadas: 1, manuales: 1, sinMatch: [], errores: [] });
    const u = updates();
    expect(u).toHaveLength(1);
    expect(u[0]._calls.eq[0]).toEqual(["sku", "BBB222"]);
    expect(u[0]._calls.update[0][0]).toMatchObject({ foto_manual: false });
    expect(String(u[0]._calls.update[0][0].image_url)).toContain("tommy/_v/bbb222/1.jpg");
  });

  it("CONTROL: al firmar con la consulta bien, los permisos salen", async () => {
    tommyDb.queue(TABLA, { data: [] });
    const res = await firmar(post({ paths: ["tommy/_v/aaa111/1.jpg"] }), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).firmados).toHaveLength(1);
  });
});
