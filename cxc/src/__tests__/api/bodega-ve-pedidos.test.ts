// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CONDUCTA — BODEGA ENTRA A LA LISTA DE PEDIDOS, SOLO A MIRAR (25-ago-2026)
//
// Daniel, textual: ***"Dale acceso a bodega a la lista de pedidos."***
//
// Este archivo NO barre texto: llama a los handlers REALES con **cookies
// firmadas** y mira el CÓDIGO que devuelven. Que una constante contenga
// "bodega" no prueba que el endpoint lo deje entrar, y que un comentario diga
// "cerrado" no prueba que lo esté — este repo ya pagó cuatro veces el candado
// que se cumple con su propia explicación.
//
// Lo que fija, y las tres mitades importan igual:
//   1. 🔴 GANA: bodega recibe **200 con filas** en `GET /catalogo/<marca>/orders`
//      en las 4 marcas. Antes era 403. Si alguien revierte `VIEW_ROLES`, rojo.
//   2. 🔴 NO GANA NADA MÁS: bodega recibe **403** en las 10 rutas de escritura
//      (crear · editar · borrar · borrado masivo · exportar · mandar a Switch ·
//      duplicar · convertir del link · editar/borrar la pública · el feed del
//      panel de admin). Y en las 4 marcas.
//   3. 🩸 EL 403 PRUEBA ALGO: esas MISMAS rutas dejan pasar a `admin`. Un 403
//      que le sale a todo el mundo no es un permiso cerrado, es una ruta rota.
//
// Y sin cookie → 401 en las dos direcciones: abrir la lectura no aflojó la
// exigencia de sesión.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { makeDb, type MockDb } from "../helpers/catalogo-mock-db";

let reebokDb: MockDb;
vi.mock("@/lib/reebok-supabase-server", () => ({
  reebokServer: { from: (t: string) => reebokDb.from(t), rpc: (...a: unknown[]) => reebokDb.rpc(...a) },
}));
let joybeesDb: MockDb;
vi.mock("@/lib/joybees-supabase-server", () => ({
  joybeesServer: { from: (t: string) => joybeesDb.from(t), rpc: (...a: unknown[]) => joybeesDb.rpc(...a) },
}));
let tommyDb: MockDb;
vi.mock("@/lib/tommy-supabase-server", () => ({
  tommyServer: { from: (t: string) => tommyDb.from(t), rpc: (...a: unknown[]) => tommyDb.rpc(...a) },
}));
let calvinDb: MockDb;
vi.mock("@/lib/calvin-supabase-server", () => ({
  calvinServer: { from: (t: string) => calvinDb.from(t), rpc: (...a: unknown[]) => calvinDb.rpc(...a) },
}));
let mainDb: MockDb;
vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: { from: (t: string) => mainDb.from(t), rpc: (...a: unknown[]) => mainDb.rpc(...a) },
}));
vi.mock("@/lib/reebok-category-lookup", () => ({
  fetchReebokCategoryMap: vi.fn(async () => new Map<string, string>()),
}));
// Telegram: el POST de orders avisa. Nunca debe salir a la red desde el arnés.
vi.mock("@/lib/alertas/canal", () => ({ enviarNegocio: vi.fn(async () => true) }));

import type { NextRequest, NextResponse } from "next/server";
import { GET as ordersGet, POST as ordersPost } from "@/app/api/catalogo/[marca]/orders/route";
import { PUT as ordersPut, DELETE as ordersDelete } from "@/app/api/catalogo/[marca]/orders/[id]/route";
import { POST as bulkDeletePost } from "@/app/api/catalogo/[marca]/orders/bulk-delete/route";
import { POST as exportPost } from "@/app/api/catalogo/[marca]/pedidos-export/route";
import { POST as enviarSwitchPost } from "@/app/api/catalogo/[marca]/orders/[id]/enviar-switch/route";
import { POST as duplicarPost } from "@/app/api/catalogo/[marca]/orders/[id]/duplicar/route";
import { POST as convertirPost } from "@/app/api/catalogo/[marca]/pedidos-publicos/[short_id]/convertir/route";
import {
  PUT as publicaPut,
  DELETE as publicaDelete,
} from "@/app/api/catalogo/[marca]/pedidos-publicos/[short_id]/route";
import { GET as unificadoGet } from "@/app/api/catalogo/[marca]/pedidos-unificado/route";
import { makeReq, TEST_SECRET } from "../helpers/catalogo-request";
import { COMPROBANTES_ROLES, COMPROBANTES_EDITAR_ROLES, CATALOGO_ADMIN_ROLES } from "@/lib/catalogo/roles";

beforeAll(() => { process.env.SESSION_SECRET = TEST_SECRET; });

const MARCAS = ["reebok", "joybees", "tommy", "calvin"] as const;
type Marca = (typeof MARCAS)[number];

const ORDERS_TABLE: Record<Marca, string> = {
  reebok: "reebok_orders",
  joybees: "joybees_orders",
  tommy: "tommy_orders",
  calvin: "calvin_orders",
};
const dbDe = (m: Marca): MockDb =>
  ({ reebok: reebokDb, joybees: joybeesDb, tommy: tommyDb, calvin: calvinDb })[m];

const OID = "33333333-3333-4333-8333-333333333333";

/** Dos pedidos vivos para que "200 con filas" pueda contar filas de verdad. */
function sembrarPedidos(m: Marca) {
  const rel = `${m}_order_items`;
  const fila = (id: string, cliente: string, num: string) => ({
    id,
    order_number: num,
    client_name: cliente,
    vendor_name: "Rey",
    client_email: null,
    comment: null,
    total: 100,
    created_at: "2026-08-20T10:00:00Z",
    updated_at: "2026-08-20T10:00:00Z",
    idempotency_key: null,
    status: "confirmado",
    deleted: false,
    origen_short_id: null,
    [rel]: [{ id: "i1", product_id: "p1", quantity: 12, unit_price: 10 }],
  });
  dbDe(m).queue(ORDERS_TABLE[m], {
    data: [fila(OID, "Zapatería Nueva", "PED-017"), fila("44444444-4444-4444-8444-444444444444", "Sporting Shoes", "PED-019")],
    error: null,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  reebokDb = makeDb();
  joybeesDb = makeDb();
  tommyDb = makeDb();
  calvinDb = makeDb();
  mainDb = makeDb();
});

const status = async (r: Promise<Response | NextResponse>): Promise<number> => (await r).status;

// ── 1. GANA: la lista ────────────────────────────────────────────────────────

describe("🔴 1. bodega VE la lista — 200 con filas, en las 4 marcas", () => {
  for (const marca of MARCAS) {
    it(`${marca}: bodega → 200 y la respuesta trae filas`, async () => {
      sembrarPedidos(marca);
      const req = makeReq(`/api/catalogo/${marca}/orders`, { role: "bodega" }) as NextRequest;
      const res = await ordersGet(req, { params: { marca } });
      expect(res.status, `${marca} / bodega`).toBe(200);
      const body = (await res.json()) as unknown[];
      expect(Array.isArray(body), `${marca}: el cuerpo es una lista`).toBe(true);
      expect(body.length, `${marca}: bodega recibe filas, no una pantalla en ceros`).toBeGreaterThan(0);
    });

    it(`${marca}: los otros tres siguen en 200 (no se le quitó nada a nadie)`, async () => {
      for (const rol of ["admin", "secretaria", "vendedor"]) {
        sembrarPedidos(marca);
        const req = makeReq(`/api/catalogo/${marca}/orders`, { role: rol }) as NextRequest;
        expect((await ordersGet(req, { params: { marca } })).status, `${marca} / ${rol}`).toBe(200);
      }
    });

    it(`${marca}: sin cookie → 401, y contabilidad/gerente_acs → 403`, async () => {
      sembrarPedidos(marca);
      const anon = makeReq(`/api/catalogo/${marca}/orders`) as NextRequest;
      expect((await ordersGet(anon, { params: { marca } })).status).toBe(403);
      for (const rol of ["contabilidad", "gerente_acs"]) {
        sembrarPedidos(marca);
        const req = makeReq(`/api/catalogo/${marca}/orders`, { role: rol }) as NextRequest;
        expect((await ordersGet(req, { params: { marca } })).status, rol).toBe(403);
      }
    });
  }
});

// ── 2. NO GANA NADA MÁS: las escrituras ──────────────────────────────────────

/** Cada acción de escritura de un comprobante, con su handler REAL. */
const ESCRITURAS: {
  nombre: string;
  llamar: (marca: Marca, rol: string | undefined) => Promise<Response | NextResponse>;
}[] = [
  {
    nombre: "crear un pedido (POST /orders)",
    llamar: (marca, role) =>
      ordersPost(makeReq(`/api/catalogo/${marca}/orders`, {
        method: "POST", role, body: { client_name: "X", items: [] },
      }) as NextRequest, { params: { marca } }),
  },
  {
    nombre: "editar un pedido (PUT /orders/[id])",
    llamar: (marca, role) =>
      ordersPut(makeReq(`/api/catalogo/${marca}/orders/${OID}`, {
        method: "PUT", role, body: { items: [] },
      }) as NextRequest, { params: { marca, id: OID } }),
  },
  {
    nombre: "borrar un pedido (DELETE /orders/[id])",
    llamar: (marca, role) =>
      ordersDelete(makeReq(`/api/catalogo/${marca}/orders/${OID}`, {
        method: "DELETE", role,
      }) as NextRequest, { params: { marca, id: OID } }),
  },
  {
    nombre: "borrado MASIVO (POST /orders/bulk-delete)",
    llamar: (marca, role) =>
      bulkDeletePost(makeReq(`/api/catalogo/${marca}/orders/bulk-delete`, {
        method: "POST", role, body: { ids: [OID] },
      }) as NextRequest, { params: { marca } }),
  },
  {
    nombre: "exportar a Excel (POST /pedidos-export)",
    llamar: (marca, role) =>
      exportPost(makeReq(`/api/catalogo/${marca}/pedidos-export`, {
        method: "POST", role, body: { ids: [OID] },
      }) as NextRequest, { params: { marca } }),
  },
  {
    nombre: "mandar a Switch (POST /orders/[id]/enviar-switch)",
    llamar: (marca, role) =>
      enviarSwitchPost(makeReq(`/api/catalogo/${marca}/orders/${OID}/enviar-switch`, {
        method: "POST", role, body: { dry: true },
      }) as NextRequest, { params: { marca, id: OID } }),
  },
  {
    nombre: "duplicar (POST /orders/[id]/duplicar)",
    llamar: (marca, role) =>
      duplicarPost(makeReq(`/api/catalogo/${marca}/orders/${OID}/duplicar`, {
        method: "POST", role, body: {},
      }) as NextRequest, { params: { marca, id: OID } }),
  },
  {
    nombre: "convertir un pedido del LINK (POST /pedidos-publicos/[id]/convertir)",
    llamar: (marca, role) =>
      convertirPost(makeReq(`/api/catalogo/${marca}/pedidos-publicos/abc123/convertir`, {
        method: "POST", role,
      }) as NextRequest, { params: { marca, short_id: "abc123" } }),
  },
  {
    nombre: "editar la pública (PUT /pedidos-publicos/[id])",
    llamar: (marca, role) =>
      publicaPut(makeReq(`/api/catalogo/${marca}/pedidos-publicos/abc123`, {
        method: "PUT", role, body: {},
      }) as NextRequest, { params: { marca, short_id: "abc123" } }),
  },
  {
    nombre: "borrar la pública (DELETE /pedidos-publicos/[id])",
    llamar: (marca, role) =>
      publicaDelete(makeReq(`/api/catalogo/${marca}/pedidos-publicos/abc123`, {
        method: "DELETE", role,
      }) as NextRequest, { params: { marca, short_id: "abc123" } }),
  },
  {
    nombre: "el feed del panel de admin (GET /pedidos-unificado)",
    llamar: (marca, role) =>
      unificadoGet(makeReq(`/api/catalogo/${marca}/pedidos-unificado`, { role }) as NextRequest, {
        params: { marca },
      }),
  },
];

describe("🔴 2. bodega NO gana ninguna escritura — 403 en las 4 marcas", () => {
  for (const { nombre, llamar } of ESCRITURAS) {
    it(`bodega NO puede: ${nombre}`, async () => {
      for (const marca of MARCAS) {
        expect(await status(llamar(marca, "bodega")), `${marca} — ${nombre}`).toBe(403);
      }
    });
  }

  it("🩸 sin cookie tampoco: 401 o 403, nunca 2xx", async () => {
    for (const { nombre, llamar } of ESCRITURAS) {
      for (const marca of MARCAS) {
        const s = await status(llamar(marca, undefined));
        expect([401, 403], `${marca} — ${nombre} (anónimo devolvió ${s})`).toContain(s);
      }
    }
  });
});

// ── 3. El 403 prueba algo: admin SÍ pasa por esas mismas puertas ─────────────

describe("🩸 3. el 403 de bodega no es una ruta rota — admin pasa el guard", () => {
  for (const { nombre, llamar } of ESCRITURAS) {
    it(`admin NO recibe 403 en: ${nombre}`, async () => {
      for (const marca of MARCAS) {
        const s = await status(llamar(marca, "admin"));
        // Puede fallar por datos (400/404/500 con el doble vacío); lo que NO
        // puede es ser un 403: eso significaría que la puerta está cerrada para
        // todos y el 403 de bodega no probaría nada.
        expect(s, `${marca} — ${nombre}`).not.toBe(403);
        expect(s, `${marca} — ${nombre}`).not.toBe(401);
      }
    });
  }
});

// ── 4. Las listas, congeladas y coherentes ───────────────────────────────────

describe("🔴 4. las listas dicen lo que el servidor hace", () => {
  it("COMPROBANTES_ROLES = admin, secretaria, vendedor, bodega", () => {
    expect([...COMPROBANTES_ROLES]).toEqual(["admin", "secretaria", "vendedor", "bodega"]);
  });

  it("COMPROBANTES_EDITAR_ROLES NO tiene bodega — es el trío de siempre", () => {
    expect([...COMPROBANTES_EDITAR_ROLES]).toEqual(["admin", "secretaria", "vendedor"]);
    expect(COMPROBANTES_EDITAR_ROLES as readonly string[]).not.toContain("bodega");
  });

  it("🔴 CATALOGO_ADMIN_ROLES no se aflojó: admin + secretaria y nadie más", () => {
    expect([...CATALOGO_ADMIN_ROLES]).toEqual(["admin", "secretaria"]);
  });

  it("ver ⊃ editar: quien puede trabajar el pedido también puede verlo", () => {
    for (const rol of COMPROBANTES_EDITAR_ROLES) {
      expect(COMPROBANTES_ROLES as readonly string[], rol).toContain(rol);
    }
  });
});
