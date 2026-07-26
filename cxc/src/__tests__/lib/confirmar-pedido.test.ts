// Tests del núcleo de confirmación de pedidos públicos:
// idempotencia, FOTO del stock al confirmar (25-jul-2026: ya NO hay 409
// stock_corto ni aceptar_stock — el pedido entra directo y la cantidad real
// queda registrada), tolerancia a la migración pendiente (marcarConfirmado
// falla pero la conversión sigue) y fail-open del chequeo de stock.
// La I/O va inyectada (ConfirmarDeps) — sin mocks de supabase.

import { describe, it, expect, vi } from "vitest";
import {
  computeLineasCortas,
  computeStockLineas,
  confirmarPedidoPublico,
  soloCortas,
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
    const res = await confirmarPedidoPublico(depsBase({ getPedido: async () => null }), "x");
    expect(res).toEqual({ status: 404 });
  });

  it("404 si el pedido está borrado (soft-delete)", async () => {
    const res = await confirmarPedidoPublico(
      depsBase({ getPedido: async () => pedidoBase({ deleted: true }) }),
      "abc12345",
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
    );
    expect(res).toEqual({ status: 200, numero: "PED-013", ya_confirmado: true, stock: [] });
    expect(convertir).not.toHaveBeenCalled();
  });

  it("SIN modal: con stock corto confirma igual y devuelve la cantidad REAL", async () => {
    const convertir = vi.fn(async () => ({ numero: "PED-099", yaConvertida: false }));
    const res = await confirmarPedidoPublico(
      depsBase({
        getDisponibles: async () => new Map([["p1", 8], ["p2", 100]]),
        convertir,
      }),
      "abc12345",
    );
    expect(res.status).toBe(200);
    expect(convertir).toHaveBeenCalledOnce(); // el pedido NO se frena
    if (res.status !== 200) return;
    const cortas = soloCortas(res.stock);
    expect(cortas).toHaveLength(1);
    expect(cortas[0]).toMatchObject({
      product_id: "p1",
      pedido_pzas: 24,
      disponible_pzas: 8,
      bulto_pzas: 12,
    });
  });

  it("la foto de stock se guarda junto con la confirmación (misma llamada)", async () => {
    const marcarConfirmado = vi.fn(async () => {});
    await confirmarPedidoPublico(
      depsBase({ getDisponibles: async () => new Map([["p1", 8], ["p2", 6]]), marcarConfirmado }),
      "abc12345",
    );
    expect(marcarConfirmado).toHaveBeenCalledOnce();
    const [sid, stock] = marcarConfirmado.mock.calls[0] as unknown as [string, unknown[]];
    expect(sid).toBe("abc12345");
    expect(stock).toHaveLength(2); // TODAS las líneas, no solo las cortas
  });

  it("fail-open: si el stock no se puede leer (null) confirma sin foto", async () => {
    const res = await confirmarPedidoPublico(
      depsBase({ getDisponibles: async () => null }),
      "abc12345",
    );
    expect(res).toEqual({ status: 200, numero: "PED-099", ya_confirmado: false, stock: [] });
  });

  it("tolerancia sin columna: marcarConfirmado no rompe la conversión", async () => {
    // marcarConfirmado del route NO lanza (loguea el error de columna), pero
    // incluso si lanzara aguas arriba, el pedido debe quedar confirmado igual.
    const marcarConfirmado = vi.fn(async () => {
      console.warn("columna confirmado_cliente_at no existe (migración pendiente)");
    });
    const res = await confirmarPedidoPublico(depsBase({ marcarConfirmado }), "abc12345");
    expect(marcarConfirmado).toHaveBeenCalledOnce();
    expect(res).toMatchObject({ status: 200, numero: "PED-099", ya_confirmado: false });
  });

  it("500 amigable si la RPC de conversión falla", async () => {
    const res = await confirmarPedidoPublico(
      depsBase({
        convertir: async () => {
          throw new Error("rpc down");
        },
      }),
      "abc12345",
    );
    expect(res.status).toBe(500);
  });
});
