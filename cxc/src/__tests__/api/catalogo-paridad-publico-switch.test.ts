// ─────────────────────────────────────────────────────────────────────────────
// PARIDAD 3 MARCAS — el pedido del LINK PÚBLICO **NO** sale solo a Switch.
//
// 🔴 ESTE ARCHIVO CAMBIÓ DE DIRECCIÓN EL 14-ago-2026, y el cambio es el punto
// del PR. Desde el 25-jul fijaba lo contrario: que confirmar dejara el pedido
// 'confirmado' con el cliente de MOSTRADOR + el vendedor DEFAULT guardados y
// disparara `enviarPedidoSwitch` en el acto.
//
// Daniel pidió al revés, textual: *"cuando alguien interno le llega el pedido
// por WhatsApp, pueda entrar al sistema interno, escoger, editar precio,
// agregar o quitar y **ponerle el nombre del cliente para así mandarlo a
// Switch**"*. Y no era solo preferencia: un pedido que ya está en Switch queda
// BLOQUEADO para editar (`switch-lock` responde 409), así que con el auto-envío
// puesto **nada de lo que pidió era posible**. Medido en producción
// (`scripts/_diag-pedidos-link.ts`): PED-022 "Nathalie" es el único pedido del
// link que llegó al ERP, salió a nombre del mostrador y hoy no se puede tocar.
//
// Contrato que fijan estos tests, IGUAL para Reebok, Joybees y Tommy:
//   · confirmar numera el pedido y responde 200 con su número (el cliente NO
//     pierde nada de lo que ya tenía),
//   · NO llama a enviarPedidoSwitch — ni una vez, en ninguna marca,
//   · deja el pedido 'confirmado' (lo confirmó el cliente) pero SIN
//     cliente_switch_id ni vendedor_switch_id: escribir ahí el mostrador
//     volvería a poner el default silencioso que este cambio vino a sacar,
//   · ni siquiera consulta el mostrador ni el vendedor DEFAULT,
//   · el aviso a Telegram PIDE el paso que falta,
//   · sigue cerrando la sesión de Switch en el finally (hoy no abre ninguna,
//     pero la higiene se conserva por si mañana vuelve a haber un camino).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeDb, type MockDb } from "../helpers/catalogo-mock-db";
import { makeReq } from "../helpers/catalogo-request";

let mainDb: MockDb;
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (t: string) => mainDb.from(t),
    rpc: (...a: unknown[]) => mainDb.rpc(...a),
  }),
}));
vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: {
    from: (t: string) => mainDb.from(t),
    rpc: (...a: unknown[]) => mainDb.rpc(...a),
  },
}));

let marcaDb: MockDb;
const marcaClient = {
  from: (t: string) => marcaDb.from(t),
  rpc: (...a: unknown[]) => marcaDb.rpc(...a),
};
vi.mock("@/lib/reebok-supabase-server", () => ({ reebokServer: marcaClient }));
vi.mock("@/lib/joybees-supabase-server", () => ({ joybeesServer: marcaClient }));
vi.mock("@/lib/tommy-supabase-server", () => ({ tommyServer: marcaClient }));

const mockTelegram = vi.fn(async () => {});
vi.mock("@/lib/telegram", () => ({
  sendTelegramAlert: (...a: unknown[]) => mockTelegram(...a),
  shortError: (m: string) => m,
}));

vi.mock("@/lib/reebok-category-lookup", () => ({
  fetchReebokCategoryMap: vi.fn(async () => new Map([[P1, "footwear"]])),
}));

interface EnvioArgs {
  empresaKey: string;
  enviosTable: string;
  orderId: string;
  orderNumber: string;
  clienteId: number;
  vendedorId: number;
  items: { product_id: string }[];
}
const mockEnviar = vi.fn(async (_p: EnvioArgs) => ({ kind: "ok" as const }));
vi.mock("@/lib/catalogo/switch-envio", () => ({
  enviarPedidoSwitch: (p: EnvioArgs) => mockEnviar(p),
}));

const mockLogout = vi.fn(async () => {});
vi.mock("@/lib/switch-api/client", () => ({
  logoutAllSwitchSessions: () => mockLogout(),
  createSwitchClient: () => ({}),
}));

import type { NextRequest } from "next/server";
import { POST as confirmarPost } from "@/app/api/catalogo/[marca]/pedido-publico/[id]/confirmar/route";

const P1 = "11111111-1111-4111-8111-111111111111";
const ORDER_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

const confirmar = (marca: string) =>
  confirmarPost(makeReq("/x", { method: "POST", body: {} }) as NextRequest, {
    params: { marca, id: "abc12345" },
  });

/** Las 3 marcas con sus tablas y su empresa de Switch (paridad exacta). */
const MARCAS = [
  {
    marca: "reebok",
    publicos: "reebok_pedidos_publicos",
    orders: "reebok_orders",
    items: "reebok_order_items",
    envios: "reebok_switch_envios",
    empresa: "active_shoes",
    numero: "PED-060",
    stockTable: "inventory",
    stockRow: [{ product_id: P1, quantity: 100 }],
  },
  {
    marca: "joybees",
    publicos: "joybees_pedidos_publicos",
    orders: "joybees_orders",
    items: "joybees_order_items",
    envios: "joybees_switch_envios",
    empresa: "joystep",
    numero: "JBP-060",
    stockTable: "joybees_products",
    stockRow: [{ id: P1, stock: 100 }],
  },
  {
    marca: "tommy",
    publicos: "tommy_pedidos_publicos",
    orders: "tommy_orders",
    items: "tommy_order_items",
    envios: "tommy_switch_envios",
    empresa: "fashion_shoes",
    numero: "TOM-002",
    stockTable: "tommy_products",
    stockRow: [{ id: P1, stock: 100 }],
  },
] as const;

const pedidoRow = () => ({
  short_id: "abc12345",
  cliente_nombre: "Cliente del link",
  convertida: false,
  ped_order_number: null,
  deleted: false,
  items: [{ product_id: P1, sku: "S1", name: "P", quantity: 2, unit_price: 10, category: "footwear" }],
});

function seed(m: (typeof MARCAS)[number]) {
  // Fila pública: lectura + update de confirmación.
  const publicosDb = m.marca === "reebok" ? mainDb : marcaDb;
  publicosDb.queue(m.publicos, { data: pedidoRow() }, { data: null, error: null });
  (m.marca === "reebok" ? mainDb : marcaDb).queueRpc({
    data: { order_number: m.numero, order_id: ORDER_ID, already_converted: false },
  });
  marcaDb.queue(m.stockTable, { data: m.stockRow });
  // Pedido recién numerado + sus items + categorías.
  marcaDb.queue(m.orders, { data: { id: ORDER_ID, order_number: m.numero } }, { data: null, error: null });
  marcaDb.queue(m.items, { data: [{ product_id: P1, sku: "S1", name: "P", quantity: 2, unit_price: 10 }] });
  marcaDb.queue("products", { data: [{ id: P1, category: "footwear" }] });
  // 🔴 El mostrador y el vendedor DEFAULT se dejan DISPONIBLES a propósito: así
  // el test prueba que la ruta no los usa aunque los tenga a mano, y no que
  // simplemente no estaban.
  mainDb.queue("switch_clientes", { data: { cliente_switch_id: 1, nombre: "Contado" } });
  mainDb.queue("vendedores", { data: { switch_id: 3, nombre: "DEFAULT" } });
}

beforeEach(() => {
  vi.clearAllMocks();
  mainDb = makeDb();
  marcaDb = makeDb();
  mockEnviar.mockResolvedValue({ kind: "ok" });
});

describe("confirmar del link — NO sale solo a Switch (las 3 marcas)", () => {
  for (const m of MARCAS) {
    it(`🔴 ${m.marca}: numera el pedido y NO manda NADA a ${m.empresa}`, async () => {
      seed(m);
      const res = await confirmar(m.marca);
      expect(res.status).toBe(200);
      expect((await res.json()).numero).toBe(m.numero);

      // LO QUE MÁS IMPORTA: el ERP no se tocó.
      expect(mockEnviar).not.toHaveBeenCalled();

      // Sesión única: la higiene del finally se conserva.
      expect(mockLogout).toHaveBeenCalledOnce();
    });

    it(`🔴 ${m.marca}: queda 'confirmado' pero SIN cliente ni vendedor de Switch`, async () => {
      seed(m);
      await confirmar(m.marca);
      const updates = marcaDb
        .chainsFor(m.orders)
        .flatMap((c) => (c._calls.update || []) as unknown[][]);
      expect(updates[0]?.[0]).toEqual({ status: "confirmado" });
      // Ni por asomo el mostrador puesto por el sistema: ése es el default
      // silencioso que este cambio vino a sacar.
      for (const u of updates) {
        expect(u[0]).not.toHaveProperty("cliente_switch_id");
        expect(u[0]).not.toHaveProperty("vendedor_switch_id");
      }
    });

    it(`🔴 ${m.marca}: ni siquiera consulta el mostrador ni el vendedor DEFAULT`, async () => {
      seed(m);
      await confirmar(m.marca);
      // `resolvePublicoSwitchActor` lee estas tres tablas. Si alguna se
      // consultara, es que alguien volvió a resolver un cliente por descarte.
      expect(mainDb.chainsFor("switch_clientes")).toHaveLength(0);
      expect(mainDb.chainsFor("vendedores")).toHaveLength(0);
      expect(mainDb.chainsFor("fg_catalogo_publico_switch")).toHaveLength(0);
    });

    it(`${m.marca}: el aviso a Telegram PIDE el paso que falta`, async () => {
      seed(m);
      await confirmar(m.marca);
      const avisos = mockTelegram.mock.calls.map((c) => String(c[0]));
      expect(avisos.some((a) => a.includes("Falta ponerle el cliente y mandarlo a Switch"))).toBe(true);
      expect(avisos.some((a) => a.includes("Entra a Switch como Contado"))).toBe(false);
    });

    it(`${m.marca}: si el post-conversión falla, la confirmación igual responde 200`, async () => {
      seed(m);
      // El pedido recién numerado no aparece → no se puede marcar 'confirmado'.
      marcaDb.queue(m.orders, { data: null, error: { message: "sin fila" } });
      const res = await confirmar(m.marca);
      expect(res.status).toBe(200);
      expect((await res.json()).numero).toBe(m.numero);
      expect(mockLogout).toHaveBeenCalledOnce();
    });
  }
});
