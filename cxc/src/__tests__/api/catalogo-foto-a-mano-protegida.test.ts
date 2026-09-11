// ─────────────────────────────────────────────────────────────────────────────
// LA FOTO SUBIDA A MANO QUEDA PROTEGIDA (11-sep-2026)
//
// 🩸 La subida mandaba solo `image_url` y la allow-list de la ruta rechazaba
// `foto_manual`; elegir una variante del ZIP sí ponía el candado. Medido contra
// producción: Reebok 0 fotos protegidas de 390, Joybees 0 de 81, Calvin 0 de 89
// — solo Tommy tenía 30, todas del selector de variantes. La foto que más
// trabajo costó era la única que el próximo ZIP del banco B2B pisaba sin avisar.
//
// Lo que se abre es UNA cosa y nada más: `foto_manual: true`, junto con una
// foto nueva. `false`, o sin `image_url`, o desde un rol que no administra, se
// RECHAZAN — devolver un producto al ZIP sigue siendo cosa del sync.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { makeDb, type MockDb } from "../helpers/catalogo-mock-db";

let reebokDb: MockDb;
vi.mock("@/lib/reebok-supabase-server", () => ({
  reebokServer: { from: (t: string) => reebokDb.from(t), rpc: (...a: unknown[]) => reebokDb.rpc(...a) },
}));
let mainDb: MockDb;
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: (t: string) => mainDb.from(t), rpc: (...a: unknown[]) => mainDb.rpc(...a) }),
}));
vi.mock("@/lib/log-activity", () => ({ logActivity: vi.fn(async () => {}) }));
const mockRevalidateTag = vi.fn();
vi.mock("next/cache", () => ({
  unstable_cache: (cb: (...a: unknown[]) => unknown) => (...a: unknown[]) => cb(...a),
  revalidateTag: (...a: unknown[]) => mockRevalidateTag(...a),
}));

import type { NextRequest } from "next/server";
import { PUT as productsPut, POST as productsPost } from "@/app/api/catalogo/[marca]/products/route";
import { makeReq, TEST_SECRET } from "../helpers/catalogo-request";
import { readFileSync } from "fs";
import path from "path";

const rPut = (req: NextRequest) => productsPut(req, { params: { marca: "reebok" } });
const jPost = (req: NextRequest) => productsPost(req, { params: { marca: "joybees" } });
const PID = "11111111-1111-4111-8111-111111111111";
const FOTO = "https://x/foto.jpg?v=3";

beforeAll(() => { process.env.SESSION_SECRET = TEST_SECRET; });
beforeEach(() => { vi.clearAllMocks(); reebokDb = makeDb(); mainDb = makeDb(); });

/** El payload del UPDATE que llegó a la base, por tabla y orden. */
function updateDe(db: MockDb, tabla: string, i = 0): Record<string, unknown> {
  return db.chainsFor(tabla)[i]._calls.update[0][0] as Record<string, unknown>;
}

describe("🔴 subir una foto a mano marca foto_manual = true (las dos formas de editar)", () => {
  it("Reebok (PUT por id): la foto y el candado viajan juntos a la base", async () => {
    reebokDb.queue("products", { data: { id: PID, image_url: FOTO } });
    const res = await rPut(makeReq("/x", { method: "PUT", body: { id: PID, image_url: FOTO, foto_manual: true }, role: "admin" }));
    expect(res.status).toBe(200);
    expect(updateDe(reebokDb, "products")).toEqual({ image_url: FOTO, foto_manual: true });
    expect(mockRevalidateTag).toHaveBeenCalledWith("catalogo:reebok");
  });

  it("Joybees (POST por sku): lo mismo, y la secretaria también puede", async () => {
    mainDb.queue("joybees_products", { data: { id: PID, image_url: FOTO } });
    const res = await jPost(makeReq("/x", { method: "POST", body: { sku: "S1", image_url: FOTO, foto_manual: true }, role: "secretaria" }));
    expect(res.status).toBe(200);
    expect(updateDe(mainDb, "joybees_products")).toEqual({ image_url: FOTO, foto_manual: true });
  });

  it("sin la columna (DDL pendiente) la foto se guarda igual, sin el candado", async () => {
    reebokDb.queue(
      "products",
      { data: null, error: { message: 'column "foto_manual" does not exist' } },
      { data: { id: PID, image_url: FOTO } },
    );
    const res = await rPut(makeReq("/x", { method: "PUT", body: { id: PID, image_url: FOTO, foto_manual: true }, role: "admin" }));
    expect(res.status).toBe(200);
    expect(updateDe(reebokDb, "products", 1)).toEqual({ image_url: FOTO });
  });
});

describe("🔴 lo que sigue cerrado", () => {
  it("`foto_manual: false` se rechaza — devolver un producto al ZIP es cosa del sync", async () => {
    const res = await rPut(makeReq("/x", { method: "PUT", body: { id: PID, image_url: FOTO, foto_manual: false }, role: "admin" }));
    expect(res.status).toBe(400);
    expect(reebokDb.chainsFor("products")).toHaveLength(0);
  });

  it("`foto_manual` sin una foto nueva se rechaza", async () => {
    const res = await rPut(makeReq("/x", { method: "PUT", body: { id: PID, foto_manual: true }, role: "admin" }));
    expect(res.status).toBe(400);
    const res2 = await jPost(makeReq("/x", { method: "POST", body: { sku: "S1", foto_manual: true, image_url: null }, role: "admin" }));
    expect(res2.status).toBe(400);
  });

  it("quien no administra (vendedor, bodega, gerente_boston) sigue en 403", async () => {
    for (const role of ["vendedor", "bodega", "gerente_boston"]) {
      const res = await rPut(makeReq("/x", { method: "PUT", body: { id: PID, image_url: FOTO, foto_manual: true }, role }));
      expect(res.status, role).toBe(403);
    }
  });

  it("CONTROL: cualquier otra columna sigue rechazada (el cron es el dueño)", async () => {
    const res = await rPut(makeReq("/x", { method: "PUT", body: { id: PID, image_url: FOTO, active: true }, role: "admin" }));
    expect(res.status).toBe(400);
  });
});

describe("la pantalla manda el candado al subir (las 4 marcas comparten photoUpload)", () => {
  const subir = readFileSync(path.join(process.cwd(), "src/app/catalogos/admin/[marca]/photoUpload.ts"), "utf8");
  it("las dos formas del cuerpo llevan `foto_manual: true`", () => {
    expect(subir).toContain("{ id: producto.id, image_url: url, foto_manual: true }");
    expect(subir).toContain("{ sku: producto.sku, image_url: url, foto_manual: true }");
    expect(subir).not.toMatch(/foto_manual:\s*false/);
  });
});
