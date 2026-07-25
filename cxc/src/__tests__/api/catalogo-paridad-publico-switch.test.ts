// ─────────────────────────────────────────────────────────────────────────────
// PARIDAD 3 MARCAS — los pedidos del LINK PÚBLICO llegan a Switch.
//
// BUG que fija (25-jul-2026): el endpoint público de confirmación marcaba
// confirmado_cliente_at, llamaba la RPC de conversión (que deja el pedido en
// 'borrador', sin cliente ni vendedor de Switch) y mandaba un Telegram — pero
// NUNCA llamaba a enviarPedidoSwitch. Resultado en producción: TOM-001 en
// 'borrador' y tommy_switch_envios con CERO filas; nada del link llegó jamás al
// ERP en ninguna de las 3 marcas.
//
// Contrato que fijan estos tests, IGUAL para Reebok, Joybees y Tommy:
//   · confirmar deja el pedido en 'confirmado' con cliente_switch_id y
//     vendedor_switch_id guardados (así el "Reintentar" del admin funciona),
//   · dispara enviarPedidoSwitch contra la empresa Switch de la marca,
//   · si Switch falla el cliente NO pierde el pedido (200 con su número) y el
//     equipo recibe una alerta accionable,
//   · cierra la sesión de Switch en el finally (sesión única por empresa: un
//     2do login mata el token del 1ro y tumba los crons).
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

function seed(m: (typeof MARCAS)[number], opts: { conVendedor?: boolean } = {}) {
  const { conVendedor = true } = opts;
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
  // Cliente/vendedor REALES que resuelve publico-switch-actor.
  mainDb.queue("switch_clientes", { data: { cliente_switch_id: 1, nombre: "Contado" } });
  mainDb.queue("vendedores", conVendedor ? { data: { switch_id: 3, nombre: "DEFAULT" } } : { data: null });
  if (!conVendedor) mainDb.queue("fg_user_switch_vendedor", { data: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  mainDb = makeDb();
  marcaDb = makeDb();
  mockEnviar.mockResolvedValue({ kind: "ok" });
});

describe("confirmar del link → Switch (las 3 marcas)", () => {
  for (const m of MARCAS) {
    it(`${m.marca}: confirma, deja el pedido 'confirmado' con cliente/vendedor y lo MANDA a ${m.empresa}`, async () => {
      seed(m);
      const res = await confirmar(m.marca);
      expect(res.status).toBe(200);
      expect((await res.json()).numero).toBe(m.numero);

      // 1) el envío se disparó contra la empresa correcta de la marca
      expect(mockEnviar).toHaveBeenCalledOnce();
      const args = mockEnviar.mock.calls[0][0];
      expect(args).toMatchObject({
        empresaKey: m.empresa,
        enviosTable: m.envios,
        orderId: ORDER_ID,
        orderNumber: m.numero,
        clienteId: 1,
        vendedorId: 3,
      });
      expect(args.items).toHaveLength(1);

      // 2) el pedido quedó 'confirmado' con los ids guardados (sin eso el
      //    "Reintentar" del admin responde 422)
      const updates = marcaDb
        .chainsFor(m.orders)
        .flatMap((c) => (c._calls.update || []) as unknown[][]);
      expect(updates[0]?.[0]).toMatchObject({
        status: "confirmado",
        cliente_switch_id: 1,
        vendedor_switch_id: 3,
      });

      // 3) sesión única: se cierra la sesión de Switch pase lo que pase
      expect(mockLogout).toHaveBeenCalledOnce();
    });

    it(`${m.marca}: si Switch rechaza, el cliente NO pierde el pedido y queda reintentable`, async () => {
      seed(m);
      mockEnviar.mockResolvedValue({ kind: "prevalidacion" } as unknown as { kind: "ok" });
      const res = await confirmar(m.marca);
      expect(res.status).toBe(200); // el pedido ya está guardado y numerado
      expect((await res.json()).numero).toBe(m.numero);
      const alertas = mockTelegram.mock.calls.map((c) => String(c[0]));
      expect(alertas.some((a) => a.includes("NO salió a Switch") && a.includes("Reintentar"))).toBe(true);
      expect(mockLogout).toHaveBeenCalledOnce();
    });

    it(`${m.marca}: si el motor lanza (Switch caído), la confirmación igual responde 200`, async () => {
      seed(m);
      mockEnviar.mockRejectedValue(new Error("ECONNRESET"));
      const res = await confirmar(m.marca);
      expect(res.status).toBe(200);
      expect((await res.json()).numero).toBe(m.numero);
      expect(mockLogout).toHaveBeenCalledOnce();
    });

    it(`${m.marca}: sin vendedor mapeado NO inventa ids — no envía y avisa`, async () => {
      seed(m, { conVendedor: false });
      const res = await confirmar(m.marca);
      expect(res.status).toBe(200);
      expect(mockEnviar).not.toHaveBeenCalled();
      const alertas = mockTelegram.mock.calls.map((c) => String(c[0]));
      expect(alertas.some((a) => a.includes("NO salió a Switch"))).toBe(true);
    });
  }
});
