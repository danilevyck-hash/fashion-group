/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CANDADO — EL CORREO DEL CLIENTE: DE DÓNDE SALE Y DÓNDE QUEDA (6-sep-2026)
 *
 * 🩸 Medido contra producción el 7-sep-2026: `client_email` está VACÍO en los
 * 56 pedidos vivos (Reebok 15 · Tommy 32 · Calvin 5 · Joybees 4) aunque la
 * columna existe desde el día uno. Se tecleaba a mano cada vez y el sistema lo
 * tiraba.
 *
 * Daniel, textual: *«no quiero que sea obligatorio mandar el correo, pero sí
 * que sea opcional, ya escrito automáticamente el mail del cliente»*.
 *
 * Lo que vigila:
 *   1. El correo sale del DIRECTORIO por CÓDIGO — nunca por nombre.
 *   2. Falla ABIERTA: sin código, sin fila, sin correo o con la lectura rota,
 *      `null`, y el campo queda vacío como siempre.
 *   3. `send-order` lo ANOTA en el pedido, y solo DESPUÉS de que Resend
 *      confirma — el patrón del CXC. Un correo que no salió no se anota.
 *   4. 🔴 Solo cuando fue al CLIENTE: el aviso interno va a daniel@fashiongr.com
 *      y ése no es el correo de nadie.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { makeDb, type MockDb } from "../helpers/catalogo-mock-db";

let tommyDb: MockDb;
vi.mock("@/lib/tommy-supabase-server", () => ({
  tommyServer: { from: (t: string) => tommyDb.from(t), rpc: (...a: unknown[]) => tommyDb.rpc(...a) },
}));
let mainDb: MockDb;
vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: { from: (t: string) => mainDb.from(t), rpc: (...a: unknown[]) => mainDb.rpc(...a) },
}));
vi.mock("@/lib/catalogo/order-pdf", () => ({
  buildCatalogoOrderPdf: vi.fn(async () => Buffer.from("%PDF-1.3 fake")),
}));

import type { NextRequest } from "next/server";
import { POST as sendOrderPost } from "@/app/api/catalogo/[marca]/send-order/route";
import { correoDelDirectorio } from "@/lib/catalogo/correo-del-cliente";
import { makeReq, TEST_SECRET } from "../helpers/catalogo-request";

const OID = "66666666-6666-4666-8666-666666666666";

beforeAll(() => {
  process.env.SESSION_SECRET = TEST_SECRET;
  process.env.RESEND_API_KEY = "re_test";
});

beforeEach(() => {
  tommyDb = makeDb();
  mainDb = makeDb();
});

// ─────────────────────────────────────────────────────────────────────────────
describe("1-2. 🔴 el correo sale del directorio POR CÓDIGO, y falla abierta", () => {
  /** Un doble mínimo de Supabase que registra los filtros usados. */
  function dbCon(email: string | null, error: unknown = null) {
    const filtros: [string, unknown][] = [];
    const chain = {
      select: () => chain,
      eq: (col: string, val: unknown) => { filtros.push([col, val]); return chain; },
      maybeSingle: async () => ({ data: email === null ? null : { email }, error }),
    } as unknown as { select: () => unknown };
    const tablas: string[] = [];
    return { db: { from: (t: string) => { tablas.push(t); return chain; } }, filtros, tablas };
  }

  it("lee `clientes_master` filtrando por CÓDIGO (y solo lo vivo)", async () => {
    const { db, filtros, tablas } = dbCon("compras@cliente.com");
    expect(await correoDelDirectorio(db, "D-42")).toBe("compras@cliente.com");
    expect(tablas).toEqual(["clientes_master"]);
    expect(filtros).toEqual([["codigo", "D-42"], ["deleted", false]]);
  });

  it("🔴 NUNCA por nombre: el módulo no nombra una sola columna de nombre", async () => {
    const { db, filtros } = dbCon("x@y.com");
    await correoDelDirectorio(db, "D-42");
    const columnas = filtros.map(([c]) => c);
    for (const prohibida of ["nombre", "nombre_normalized", "client_name", "cliente"]) {
      expect(columnas, `se unió por «${prohibida}»`).not.toContain(prohibida);
    }
  });

  it("sin código no pregunta nada", async () => {
    const { db, tablas } = dbCon("x@y.com");
    expect(await correoDelDirectorio(db, null)).toBeNull();
    expect(await correoDelDirectorio(db, "  ")).toBeNull();
    expect(tablas).toEqual([]);
  });

  it("sin fila, sin correo o con error: null, y el campo queda vacío", async () => {
    expect(await correoDelDirectorio(dbCon(null).db, "D-1")).toBeNull();
    expect(await correoDelDirectorio(dbCon("   ").db, "D-1")).toBeNull();
    expect(await correoDelDirectorio(dbCon("x@y.com", { message: "boom" }).db, "D-1")).toBeNull();
  });

  it("🔴 una lectura que revienta tampoco rompe la pantalla", async () => {
    const db = { from: () => { throw new Error("sin red"); } };
    expect(await correoDelDirectorio(db, "D-1")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("3-4. 🔴 `send-order` anota el correo DESPUÉS de que Resend confirma", () => {
  function stubResend(ok: boolean) {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("api.resend.com")) {
        return ok
          ? ({ ok: true, status: 200, json: async () => ({ id: "e1" }) } as unknown as Response)
          : ({ ok: false, status: 500, json: async () => ({ message: "no salió" }) } as unknown as Response);
      }
      return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0), json: async () => ({}) } as unknown as Response;
    }));
  }

  function prepararPedido() {
    tommyDb.queue("tommy_orders", {
      data: {
        order_number: "TOM-027", client_name: "Sporting Shoes", comment: null,
        created_at: "2026-08-25T12:00:00Z",
        tommy_order_items: [{ product_id: "p1", sku: "TH-1", name: "Tee", quantity: 2, unit_price: 18.5, image_url: "" }],
      },
      error: null,
    }, { data: null, error: null });
    tommyDb.queue("tommy_products", { data: [{ id: "p1", category: "CAMISETAS", bulto_pzas: 12 }], error: null });
    tommyDb.queue("tommy_switch_envios", { data: null, error: null });
  }

  async function mandar(body: Record<string, unknown>) {
    prepararPedido();
    const req = makeReq("https://x/api/catalogo/tommy/send-order", {
      role: "admin", method: "POST", body,
    }) as NextRequest;
    return sendOrderPost(req, { params: { marca: "tommy" } });
  }

  /** Los `.update()` que se hicieron sobre la tabla de pedidos. */
  const updates = () =>
    tommyDb.chainsFor("tommy_orders").flatMap((c) => (c._calls.update as unknown[][] | undefined) ?? []);

  it("con 200 de Resend, el correo queda guardado en el pedido", async () => {
    stubResend(true);
    const res = await mandar({ orderId: OID, clientEmail: "compras@cliente.com" });
    expect(res.status).toBe(200);
    expect(updates()).toHaveLength(1);
    expect(updates()[0][0]).toEqual({ client_email: "compras@cliente.com" });
    // Y sobre ESE pedido, no sobre otro.
    const eqs = tommyDb.chainsFor("tommy_orders").flatMap((c) => (c._calls.eq as unknown[][] | undefined) ?? []);
    expect(eqs).toContainEqual(["id", OID]);
  });

  it("🔴 si Resend falla, NO se anota: un correo que no salió no se registra", async () => {
    stubResend(false);
    const res = await mandar({ orderId: OID, clientEmail: "compras@cliente.com" });
    expect(res.status).toBe(500);
    expect(updates()).toHaveLength(0);
  });

  it("🔴 el aviso INTERNO no anota nada: daniel@ no es el correo del cliente", async () => {
    stubResend(true);
    const res = await mandar({ orderId: OID });
    expect(res.status).toBe(200);
    expect(updates()).toHaveLength(0);
  });

  it("el checkout público (sin orderId) tampoco escribe", async () => {
    stubResend(true);
    prepararPedido();
    const req = makeReq("https://x/api/catalogo/tommy/send-order", {
      role: "admin",
      method: "POST",
      body: {
        clientEmail: "cliente@x.com", clientName: "Contado", orderNumber: "TOM-999",
        items: [{ sku: "A", name: "A", quantity: 1, unit_price: 10, image_url: "" }],
        totalBultos: 1, totalPiezas: 12, total: 120,
      },
    }) as NextRequest;
    const res = await sendOrderPost(req, { params: { marca: "tommy" } });
    expect(res.status).toBe(200);
    expect(updates()).toHaveLength(0);
  });
});
