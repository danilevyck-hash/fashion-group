// Tests de la validación server-side del POST público de pedidos Reebok.
// Funciones puras (sin I/O): validatePedidoBody (estructura/límites) y
// applyDbPrices (precios reales de la DB, anti-manipulación).

import { describe, it, expect } from "vitest";
import {
  validatePedidoBody,
  applyDbPrices,
  MAX_ITEMS,
  type PedidoItem,
  type ProductPriceInfo,
} from "@/lib/reebok-pedido-publico-validate";

const UUID = "11111111-2222-4333-8444-555555555555";
const UUID2 = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function validItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    product_id: UUID,
    sku: "RBK-001",
    name: "Classic Leather",
    image_url: "https://example.com/foto.jpg",
    quantity: 2,
    unit_price: 45,
    category: "footwear",
    ...overrides,
  };
}

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { items: [validItem()], cliente_nombre: "María Pérez", ...overrides };
}

describe("validatePedidoBody", () => {
  it("acepta un pedido válido y sanea los items (whitelist de campos)", () => {
    const res = validatePedidoBody(validBody());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.cliente_nombre).toBe("María Pérez");
    expect(res.items).toHaveLength(1);
    expect(res.items[0]).toEqual({
      product_id: UUID,
      sku: "RBK-001",
      name: "Classic Leather",
      image_url: "https://example.com/foto.jpg",
      quantity: 2,
      unit_price: 45,
      category: "footwear",
    });
  });

  it("descarta campos extra no whitelisteados del item", () => {
    const res = validatePedidoBody(validBody({ items: [validItem({ hacker: "x", total: 999999 })] }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.items[0]).not.toHaveProperty("hacker");
    expect(res.items[0]).not.toHaveProperty("total");
  });

  it("rechaza body no-objeto (JSON inválido)", () => {
    const res = validatePedidoBody(null);
    expect(res.ok).toBe(false);
  });

  it("rechaza carrito vacío con el mensaje original", () => {
    const res = validatePedidoBody(validBody({ items: [] }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe("El carrito está vacío");
  });

  it("rechaza nombre vacío", () => {
    const res = validatePedidoBody(validBody({ cliente_nombre: "" }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain("nombre");
  });

  // El mínimo subió de 2 a 3 LETRAS (25-jul-2026): con 2 entraron pedidos
  // reales con cliente_nombre "ff". Regla única en lib/catalogo/nombre-cliente.
  it("rechaza nombres de 1 y 2 letras y acepta el mínimo de 3", () => {
    expect(validatePedidoBody(validBody({ cliente_nombre: "A" })).ok).toBe(false);
    expect(validatePedidoBody(validBody({ cliente_nombre: "ff" })).ok).toBe(false);
    expect(validatePedidoBody(validBody({ cliente_nombre: "Ana" })).ok).toBe(true);
  });

  it("rechaza nombre de más de 120 caracteres", () => {
    const res = validatePedidoBody(validBody({ cliente_nombre: "x".repeat(121) }));
    expect(res.ok).toBe(false);
  });

  it("rechaza quantity 0", () => {
    const res = validatePedidoBody(validBody({ items: [validItem({ quantity: 0 })] }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain("cantidad");
  });

  it("rechaza quantity no entera, negativa o mayor a 500", () => {
    expect(validatePedidoBody(validBody({ items: [validItem({ quantity: 1.5 })] })).ok).toBe(false);
    expect(validatePedidoBody(validBody({ items: [validItem({ quantity: -3 })] })).ok).toBe(false);
    expect(validatePedidoBody(validBody({ items: [validItem({ quantity: 501 })] })).ok).toBe(false);
    expect(validatePedidoBody(validBody({ items: [validItem({ quantity: "2" })] })).ok).toBe(false);
    expect(validatePedidoBody(validBody({ items: [validItem({ quantity: 500 })] })).ok).toBe(true);
  });

  it("rechaza precio negativo, cero, infinito o mayor a 10000", () => {
    expect(validatePedidoBody(validBody({ items: [validItem({ unit_price: -45 })] })).ok).toBe(false);
    expect(validatePedidoBody(validBody({ items: [validItem({ unit_price: 0 })] })).ok).toBe(false);
    expect(validatePedidoBody(validBody({ items: [validItem({ unit_price: Infinity })] })).ok).toBe(false);
    expect(validatePedidoBody(validBody({ items: [validItem({ unit_price: 10001 })] })).ok).toBe(false);
    expect(validatePedidoBody(validBody({ items: [validItem({ unit_price: "45" })] })).ok).toBe(false);
  });

  it("rechaza product_id que no es UUID", () => {
    expect(validatePedidoBody(validBody({ items: [validItem({ product_id: "1; DROP TABLE" })] })).ok).toBe(false);
    expect(validatePedidoBody(validBody({ items: [validItem({ product_id: 123 })] })).ok).toBe(false);
  });

  it("rechaza name vacío o de más de 200 chars", () => {
    expect(validatePedidoBody(validBody({ items: [validItem({ name: "" })] })).ok).toBe(false);
    expect(validatePedidoBody(validBody({ items: [validItem({ name: "x".repeat(201) })] })).ok).toBe(false);
  });

  it("rechaza más de 200 items", () => {
    const many = Array.from({ length: MAX_ITEMS + 1 }, () => validItem());
    const res = validatePedidoBody(validBody({ items: many }));
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain("demasiados");
  });

  it("normaliza image_url no-string a null", () => {
    const res = validatePedidoBody(validBody({ items: [validItem({ image_url: 42 })] }));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.items[0].image_url).toBeNull();
  });
});

describe("applyDbPrices", () => {
  const dbItem = (overrides: Partial<PedidoItem> = {}): PedidoItem => ({
    product_id: UUID,
    sku: "RBK-001",
    name: "Classic Leather",
    image_url: null,
    quantity: 2,
    unit_price: 45,
    category: "footwear",
    ...overrides,
  });

  it("con precio correcto: total al centavo y adjusted=false", () => {
    const map = new Map<string, ProductPriceInfo>([[UUID, { price: 45, category: "footwear" }]]);
    const res = applyDbPrices([dbItem()], map);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // footwear = bulto de 12: 2 bultos × 12 pzas × $45
    expect(res.total).toBe(2 * 12 * 45);
    expect(res.adjusted).toBe(false);
  });

  it("PRECIO MANIPULADO: usa el de la DB para el total y marca adjusted", () => {
    const map = new Map<string, ProductPriceInfo>([[UUID, { price: 45, category: "footwear" }]]);
    const res = applyDbPrices([dbItem({ unit_price: 0.01 })], map);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.items[0].unit_price).toBe(45);
    expect(res.total).toBe(2 * 12 * 45);
    expect(res.adjusted).toBe(true);
  });

  it("CATEGORÍA MANIPULADA (cambia el bulto 12→6): usa la de la DB", () => {
    // Cliente dice apparel (bulto 6) para pagar menos; DB dice footwear (bulto 12).
    const map = new Map<string, ProductPriceInfo>([[UUID, { price: 45, category: "footwear" }]]);
    const res = applyDbPrices([dbItem({ category: "apparel" })], map);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.items[0].category).toBe("footwear");
    expect(res.total).toBe(2 * 12 * 45);
    expect(res.adjusted).toBe(true);
  });

  it("rechaza product_id que no existe en products", () => {
    const map = new Map<string, ProductPriceInfo>([[UUID2, { price: 45, category: "footwear" }]]);
    const res = applyDbPrices([dbItem()], map);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain("ya no está disponible");
  });

  it("rechaza si el precio en DB es 0 o inválido", () => {
    const map = new Map<string, ProductPriceInfo>([[UUID, { price: 0, category: "footwear" }]]);
    const res = applyDbPrices([dbItem()], map);
    expect(res.ok).toBe(false);
  });

  it("varios items: suma con el bulto correcto por categoría", () => {
    const map = new Map<string, ProductPriceInfo>([
      [UUID, { price: 45, category: "footwear" }],
      [UUID2, { price: 10, category: "apparel" }],
    ]);
    const res = applyDbPrices(
      [dbItem(), dbItem({ product_id: UUID2, name: "Tee", category: "apparel", quantity: 3, unit_price: 10 })],
      map,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // 2×12×45 + 3×6×10
    expect(res.total).toBe(1080 + 180);
    expect(res.adjusted).toBe(false);
  });
});
