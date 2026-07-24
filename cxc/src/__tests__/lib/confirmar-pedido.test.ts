// Tests del núcleo de confirmación de pedidos públicos (PARTE A catálogos):
// idempotencia, aviso de stock (S2), aceptar_stock, tolerancia a la migración
// pendiente (marcarConfirmado falla pero la conversión sigue) y fail-open del
// chequeo de stock. La I/O va inyectada (ConfirmarDeps) — sin mocks de supabase.

import { describe, it, expect, vi } from "vitest";
import {
  computeLineasCortas,
  confirmarPedidoPublico,
  type ConfirmarDeps,
  type PedidoPublicoRow,
} from "@/lib/catalogo/confirmar-pedido";

const bultoReebok = (category?: string) => (category === "footwear" ? 12 : 6);
const bultoJoybees = () => 12;

function pedidoBase(overrides: Partial<PedidoPublicoRow> = {}): PedidoPublicoRow {
  return {
    short_id: "abc12345",
    items: [
      { product_id: "p1", name: "Classic Leather", sku: "RBK-1", quantity: 2, category: "footwear" },
      { product_id: "p2", name: "Tee Azul", sku: "RBK-2", quantity: 1, category: "apparel" },
    ],
    cliente_nombre: "PRUEBA-BOT",
    convertida: false,
    ped_order_number: null,
    deleted: false,
    ...overrides,
  };
}

function depsBase(overrides: Partial<ConfirmarDeps> = {}): ConfirmarDeps {
  return {
    getPedido: async () => pedidoBase(),
    getDisponibles: async () => new Map([["p1", 100], ["p2", 100]]),
    getBulto: bultoReebok,
    marcarConfirmado: async () => {},
    convertir: async () => ({ numero: "PED-099", yaConvertida: false }),
    ...overrides,
  };
}

describe("computeLineasCortas", () => {
  it("sin faltantes cuando hay stock suficiente", () => {
    const lineas = computeLineasCortas(
      pedidoBase().items,
      new Map([["p1", 24], ["p2", 6]]), // exacto: 2×12 y 1×6
      bultoReebok,
    );
    expect(lineas).toEqual([]);
  });

  it("detecta líneas cortas en piezas (bultos × tamaño de bulto)", () => {
    const lineas = computeLineasCortas(
      pedidoBase().items,
      new Map([["p1", 23], ["p2", 6]]), // p1 pide 24 pzas, hay 23
      bultoReebok,
    );
    expect(lineas).toHaveLength(1);
    expect(lineas[0]).toMatchObject({
      product_id: "p1",
      pedido_bultos: 2,
      pedido_pzas: 24,
      disponible_pzas: 23,
    });
  });

  it("producto ausente del inventario cuenta como 0 disponibles", () => {
    const lineas = computeLineasCortas(pedidoBase().items, new Map([["p1", 24]]), bultoReebok);
    expect(lineas).toHaveLength(1);
    expect(lineas[0]).toMatchObject({ product_id: "p2", disponible_pzas: 0 });
  });

  it("salta pre-órdenes (no tienen stock por definición)", () => {
    const items = [
      { product_id: "p1", name: "Próximamente", quantity: 5, category: "footwear", is_preorder: true },
    ];
    expect(computeLineasCortas(items, new Map(), bultoReebok)).toEqual([]);
  });

  it("Joybees: bulto fijo 12", () => {
    const items = [{ product_id: "j1", name: "Varsity", quantity: 3 }]; // 36 pzas
    const lineas = computeLineasCortas(items, new Map([["j1", 35]]), bultoJoybees);
    expect(lineas[0]).toMatchObject({ pedido_pzas: 36, disponible_pzas: 35 });
  });
});

describe("confirmarPedidoPublico", () => {
  it("404 si el pedido no existe", async () => {
    const res = await confirmarPedidoPublico(depsBase({ getPedido: async () => null }), "x", false);
    expect(res).toEqual({ status: 404 });
  });

  it("404 si el pedido está borrado (soft-delete)", async () => {
    const res = await confirmarPedidoPublico(
      depsBase({ getPedido: async () => pedidoBase({ deleted: true }) }),
      "abc12345",
      false,
    );
    expect(res).toEqual({ status: 404 });
  });

  it("idempotente: ya convertido devuelve el mismo número sin volver a convertir", async () => {
    const convertir = vi.fn();
    const res = await confirmarPedidoPublico(
      depsBase({
        getPedido: async () => pedidoBase({ convertida: true, ped_order_number: "PED-013" }),
        convertir: convertir as unknown as ConfirmarDeps["convertir"],
      }),
      "abc12345",
      false,
    );
    expect(res).toEqual({ status: 200, numero: "PED-013", ya_confirmado: true });
    expect(convertir).not.toHaveBeenCalled();
  });

  it("409 con el detalle si hay stock corto y el cliente no aceptó", async () => {
    const convertir = vi.fn();
    const res = await confirmarPedidoPublico(
      depsBase({
        getDisponibles: async () => new Map([["p1", 12], ["p2", 100]]),
        convertir: convertir as unknown as ConfirmarDeps["convertir"],
      }),
      "abc12345",
      false,
    );
    expect(res.status).toBe(409);
    if (res.status === 409) {
      expect(res.lineas).toHaveLength(1);
      expect(res.lineas[0].product_id).toBe("p1");
    }
    expect(convertir).not.toHaveBeenCalled(); // NO se confirma
  });

  it("aceptar_stock=true confirma aunque haya stock corto (segundo POST)", async () => {
    const getDisponibles = vi.fn(async () => new Map([["p1", 0]]));
    const res = await confirmarPedidoPublico(
      depsBase({ getDisponibles }),
      "abc12345",
      true,
    );
    expect(res).toEqual({ status: 200, numero: "PED-099", ya_confirmado: false });
    expect(getDisponibles).not.toHaveBeenCalled(); // ni consulta el stock
  });

  it("fail-open: si el stock no se puede leer (null) confirma sin aviso", async () => {
    const res = await confirmarPedidoPublico(
      depsBase({ getDisponibles: async () => null }),
      "abc12345",
      false,
    );
    expect(res).toEqual({ status: 200, numero: "PED-099", ya_confirmado: false });
  });

  it("tolerancia sin columna: marcarConfirmado no rompe la conversión", async () => {
    // marcarConfirmado del route NO lanza (loguea el error de columna), pero
    // incluso si lanzara aguas arriba, el pedido debe quedar confirmado igual.
    const marcarConfirmado = vi.fn(async () => {
      console.warn("columna confirmado_cliente_at no existe (migración pendiente)");
    });
    const res = await confirmarPedidoPublico(
      depsBase({ marcarConfirmado }),
      "abc12345",
      false,
    );
    expect(marcarConfirmado).toHaveBeenCalledOnce();
    expect(res).toEqual({ status: 200, numero: "PED-099", ya_confirmado: false });
  });

  it("500 amigable si la RPC de conversión falla", async () => {
    const res = await confirmarPedidoPublico(
      depsBase({
        convertir: async () => {
          throw new Error("rpc down");
        },
      }),
      "abc12345",
      false,
    );
    expect(res.status).toBe(500);
  });
});
