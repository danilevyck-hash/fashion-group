// ─────────────────────────────────────────────────────────────────────────────
// PR-0 paridad catálogos — CONTRATO de orders/[id]/enviar-switch (GET + POST)
// SIN llegar a Switch: el motor enviarPedidoSwitch se mockea y se fija el
// contrato del handler compartido (lib/catalogo/enviar-switch-route):
//   · roles admin/secretaria/vendedor
//   · 404 pedido inexistente, 400 no-confirmado / sin items
//   · 422 sin cliente/vendedor Switch (Joybees no tiene fallback; Reebok
//     legacy cae a Contado id=1 + Reinaldo id=2)
//   · dry:true = pre-validación (preview)
//   · mapeo EnvioResult → status HTTP (409 ya_enviado/carrera, 502, 422, 200)
//   · higiene de sesión: el POST reebok/joybees SIEMPRE cierra sesión Switch
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
let mainDb: MockDb;
vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: { from: (t: string) => mainDb.from(t), rpc: (...a: unknown[]) => mainDb.rpc(...a) },
}));

// Motor de envío mockeado — el arnés NUNCA toca Switch.
const mockEnviar = vi.fn();
vi.mock("@/lib/catalogo/switch-envio", () => ({
  enviarPedidoSwitch: (...a: unknown[]) => mockEnviar(...a),
}));

const mockLogout = vi.fn(async () => {});
vi.mock("@/lib/switch-api/client", () => ({
  logoutAllSwitchSessions: (...a: unknown[]) => mockLogout(...a),
}));

import { GET as rEnvioGet, POST as rEnvioPost } from "@/app/api/catalogo/reebok/orders/[id]/enviar-switch/route";
import { GET as jEnvioGet, POST as jEnvioPost } from "@/app/api/catalogo/joybees/orders/[id]/enviar-switch/route";
import { envioResultToResponse } from "@/lib/catalogo/enviar-switch-route";
import type { EnvioResult } from "@/lib/catalogo/switch-envio";
import { makeReq, TEST_SECRET } from "../helpers/catalogo-request";

beforeAll(() => {
  process.env.SESSION_SECRET = TEST_SECRET;
});

const OID = "33333333-3333-4333-8333-333333333333";
const P1 = "11111111-1111-4111-8111-111111111111";

const confirmedOrder = (extra: Record<string, unknown> = {}) => ({
  id: OID,
  order_number: "PED-100",
  client_name: "Cliente",
  status: "confirmado",
  cliente_switch_id: null,
  vendedor_switch_id: null,
  reebok_order_items: [{ product_id: P1, sku: "S1", name: "P", quantity: 1, unit_price: 10 }],
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  reebokDb = makeDb();
  joybeesDb = makeDb();
  mainDb = makeDb();
});

describe("GET enviar-switch — estado del envío", () => {
  it("401 sin sesión, 403 bodega — ambas marcas", async () => {
    for (const get of [rEnvioGet, jEnvioGet]) {
      expect((await get(makeReq("/x"), { params: { id: OID } })).status).toBe(401);
      expect((await get(makeReq("/x", { role: "bodega" }), { params: { id: OID } })).status).toBe(403);
    }
  });

  it("sin envío registrado → {envio:null}", async () => {
    reebokDb.queue("reebok_switch_envios", { data: null });
    const res = await rEnvioGet(makeReq("/x", { role: "vendedor" }), { params: { id: OID } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ envio: null });
  });

  it("tabla de envíos ausente (DDL pendiente) → {envio:null, ddlPendiente:true}", async () => {
    joybeesDb.queue("joybees_switch_envios", {
      data: null,
      error: { code: "PGRST205", message: "could not find the table" },
    });
    const res = await jEnvioGet(makeReq("/x", { role: "admin" }), { params: { id: OID } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ envio: null, ddlPendiente: true });
  });

  it("passthrough del último envío", async () => {
    const envio = {
      estado: "verificado",
      pedido_switch_id: 489,
      numero_interno: "16-000000489",
      error_detalle: null,
      created_at: "2026-07-20T10:00:00Z",
      updated_at: "2026-07-20T10:01:00Z",
    };
    reebokDb.queue("reebok_switch_envios", { data: envio });
    const res = await rEnvioGet(makeReq("/x", { role: "admin" }), { params: { id: OID } });
    expect(await res.json()).toEqual({ envio });
  });
});

describe("POST enviar-switch — validaciones previas al motor", () => {
  it("404 pedido inexistente", async () => {
    reebokDb.queue("reebok_orders", { data: null, error: { message: "no rows" } });
    const res = await rEnvioPost(makeReq("/x", { method: "POST", role: "admin" }), {
      params: { id: OID },
    });
    expect(res.status).toBe(404);
    expect(mockEnviar).not.toHaveBeenCalled();
    // Higiene: el wrapper cierra sesión Switch aunque haya fallado antes del motor.
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  it("400 si el pedido no está confirmado", async () => {
    reebokDb.queue("reebok_orders", { data: confirmedOrder({ status: "borrador" }) });
    const res = await rEnvioPost(makeReq("/x", { method: "POST", role: "admin" }), {
      params: { id: OID },
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("confirmados");
  });

  it("400 si el pedido no tiene items", async () => {
    reebokDb.queue("reebok_orders", { data: confirmedOrder({ reebok_order_items: [] }) });
    const res = await rEnvioPost(makeReq("/x", { method: "POST", role: "admin" }), {
      params: { id: OID },
    });
    expect(res.status).toBe(400);
  });

  it("joybees SIN fallback: pedido sin cliente/vendedor Switch → 422", async () => {
    joybeesDb.queue("joybees_orders", {
      data: {
        id: OID,
        order_number: "JBP-100",
        client_name: "C",
        status: "confirmado",
        cliente_switch_id: null,
        vendedor_switch_id: null,
        joybees_order_items: [{ product_id: P1, sku: "S1", name: "P", quantity: 1, unit_price: 10 }],
      },
    });
    const res = await jEnvioPost(makeReq("/x", { method: "POST", role: "admin" }), {
      params: { id: OID },
    });
    expect(res.status).toBe(422);
    expect(mockEnviar).not.toHaveBeenCalled();
  });

  it("reebok LEGACY: sin ids cae a los defaults del piloto (Contado id=1 + Reinaldo id=2)", async () => {
    reebokDb.queue("reebok_orders", { data: confirmedOrder() });
    reebokDb.queue("products", { data: [{ id: P1, category: "footwear" }] });
    mockEnviar.mockResolvedValueOnce({
      kind: "ok",
      numeroInterno: "16-000000500",
      pedidoSwitchId: 500,
      verificado: true,
      warnings: [],
    });

    const res = await rEnvioPost(makeReq("/x", { method: "POST", role: "vendedor" }), {
      params: { id: OID },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      numeroInterno: "16-000000500",
      pedidoSwitchId: 500,
      verificado: true,
      warnings: [],
    });
    const args = mockEnviar.mock.calls[0][0] as Record<string, unknown>;
    expect(args.clienteId).toBe(1);
    expect(args.clienteNombre).toBe("Contado");
    expect(args.vendedorId).toBe(2);
    expect(args.vendedorNombre).toBe("Reinaldo Espinosa");
    expect(args.empresaKey).toBe("active_shoes");
    expect(args.enviosTable).toBe("reebok_switch_envios");
    expect(args.dry).toBe(false);
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  it("dry:true = solo pre-validación → preview del motor", async () => {
    reebokDb.queue("reebok_orders", { data: confirmedOrder() });
    reebokDb.queue("products", { data: [{ id: P1, category: "footwear" }] });
    mockEnviar.mockResolvedValueOnce({ kind: "preview", preview: { lineas: 1 } });

    const res = await rEnvioPost(
      makeReq("/x", { method: "POST", body: { dry: true }, role: "admin" }),
      { params: { id: OID } },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ preview: { lineas: 1 } });
    expect((mockEnviar.mock.calls[0][0] as Record<string, unknown>).dry).toBe(true);
  });

  it("joybees con ids del checkout: nombres desde el proyecto principal y empresaKey joystep", async () => {
    joybeesDb.queue("joybees_orders", {
      data: {
        id: OID,
        order_number: "JBP-101",
        client_name: "C",
        status: "confirmado",
        cliente_switch_id: 77,
        vendedor_switch_id: 3,
        joybees_order_items: [{ product_id: P1, sku: "S1", name: "P", quantity: 2, unit_price: 4 }],
      },
    });
    mainDb.queue("switch_clientes", { data: { nombre: "Cliente Real SA" } });
    mainDb.queue("fg_user_switch_vendedor", { data: { vendedor_nombre: "Vendedora J" } });
    joybeesDb.queue("joybees_products", { data: [{ id: P1, category: "footwear" }] });
    mockEnviar.mockResolvedValueOnce({
      kind: "ok",
      numeroInterno: "23-000000010",
      pedidoSwitchId: 10,
      verificado: false,
      warnings: [],
    });

    const res = await jEnvioPost(makeReq("/x", { method: "POST", role: "admin" }), {
      params: { id: OID },
    });
    expect(res.status).toBe(200);
    const args = mockEnviar.mock.calls[0][0] as Record<string, unknown>;
    expect(args.clienteId).toBe(77);
    expect(args.clienteNombre).toBe("Cliente Real SA");
    expect(args.vendedorId).toBe(3);
    expect(args.vendedorNombre).toBe("Vendedora J");
    expect(args.empresaKey).toBe("joystep");
    expect(args.enviosTable).toBe("joybees_switch_envios");
  });
});

describe("envioResultToResponse — mapeo EnvioResult → HTTP (tabla completa)", () => {
  const cases: Array<[EnvioResult, number, (json: Record<string, unknown>) => void]> = [
    [
      { kind: "preorders", count: 2 } as EnvioResult,
      400,
      (j) => expect(String(j.error)).toContain("preventa"),
    ],
    [
      { kind: "ya_enviado", detalle: "#16-000000489" } as EnvioResult,
      409,
      (j) => expect(String(j.error)).toContain("ya fue enviado"),
    ],
    [
      { kind: "carrera" } as EnvioResult,
      409,
      (j) => expect(String(j.error)).toContain("envío en curso"),
    ],
    [
      { kind: "switch_caido", error: "Switch no responde" } as EnvioResult,
      502,
      (j) => expect(j.error).toBe("Switch no responde"),
    ],
    [
      { kind: "prevalidacion", errores: ["e1"], warnings: ["w1"] } as EnvioResult,
      422,
      (j) => {
        expect(j.errores).toEqual(["e1"]);
        expect(j.warnings).toEqual(["w1"]);
      },
    ],
    [
      { kind: "preview", preview: { x: 1 } } as EnvioResult,
      200,
      (j) => expect(j.preview).toEqual({ x: 1 }),
    ],
    [
      { kind: "rechazado", error: "rechazo", warnings: [] } as EnvioResult,
      502,
      (j) => expect(j.error).toBe("rechazo"),
    ],
    [
      { kind: "ambiguo", error: "no se sabe" } as EnvioResult,
      502,
      (j) => expect(j.ambiguo).toBe(true),
    ],
    [
      {
        kind: "ok",
        numeroInterno: "N",
        pedidoSwitchId: 9,
        verificado: true,
        warnings: [],
      } as EnvioResult,
      200,
      (j) => expect(j.ok).toBe(true),
    ],
  ];

  for (const [result, status, check] of cases) {
    it(`${(result as { kind: string }).kind} → ${status}`, async () => {
      const res = envioResultToResponse(result);
      expect(res.status).toBe(status);
      check(await res.json());
    });
  }
});
