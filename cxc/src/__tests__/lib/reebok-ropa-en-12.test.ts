// 🔴 reebok-cat-05 (15-nov-2026): la ropa de Reebok va en bultos de 12, los
// accesorios en 6, y los pedidos VIEJOS conservan el bulto con que se pidieron.
import { describe, it, expect } from "vitest";
import { getBultoSize, bultoReebokNuevo, REEBOK_ROPA_EN_12_2026_11 } from "@/lib/reebok-bulto";
import { getBultoSize as joybees } from "@/lib/joybees-bulto";
import { getBultoSize as tommy } from "@/lib/tommy-bulto";
import { getBultoSize as calvin } from "@/lib/calvin-bulto";
import { sellarBultoReebok, conservarBultoReebok, colsConBulto, productoConBulto } from "@/lib/catalogo/bulto-renglon-reebok";
import { resolverLineas, resumirPedido } from "@/lib/catalogo/lineas-pedido";
import { calculateReebokOrderTotal } from "@/lib/reebok-order-total";
import { MARCAS_CONFIG } from "@/lib/catalogo/marcas";

const ctxReebok = { bultoSize: MARCAS_CONFIG.reebok.bultoSize, fallbackCategory: "apparel" };

describe("Reebok · ropa en bultos de 12", () => {
  it("el interruptor está prendido", () => {
    expect(REEBOK_ROPA_EN_12_2026_11).toBe(true);
  });

  it("renglón VIEJO (bulto NULL) de ropa sigue en 6 — el pedido no cambia de valor", () => {
    expect(getBultoSize("apparel", null)).toBe(6);
    expect(getBultoSize("accessories", undefined)).toBe(6);
    expect(getBultoSize("footwear", null)).toBe(12);
    const [l] = resolverLineas([{ product_id: "p1", quantity: 2, unit_price: 10, category: "apparel", bulto_pzas: null }], ctxReebok);
    expect(l.piezas).toBe(12);
    expect(l.subtotal).toBe(120);
  });

  it("renglón NUEVO de ropa sale de 12 (2 bultos × 12 × $10 = $240)", () => {
    const [it0] = sellarBultoReebok([{ product_id: "p1", quantity: 2, unit_price: 10 }], {
      vivo: true,
      categoria: () => "apparel",
    });
    expect(it0.bulto_pzas).toBe(12);
    const [l] = resolverLineas([{ ...it0, category: "apparel" }], ctxReebok);
    expect(l.piezas).toBe(24);
    expect(l.subtotal).toBe(240);
  });

  it("accesorios y lo sin categoría siguen de 6; el calzado de 12", () => {
    expect(bultoReebokNuevo("accessories")).toBe(6);
    expect(bultoReebokNuevo("otros")).toBe(6);
    expect(bultoReebokNuevo(undefined)).toBe(6);
    expect(bultoReebokNuevo("apparel")).toBe(12);
    expect(bultoReebokNuevo("footwear")).toBe(12);
  });

  it("al editar un pedido viejo, lo que ya estaba conserva su bulto (NULL) y lo agregado lleva 12", () => {
    const previos = new Map<string, number | null>([["viejo", null]]);
    const out = sellarBultoReebok(
      [{ product_id: "viejo", quantity: 1 }, { product_id: "nuevo", quantity: 1, bulto_pzas: 3 }],
      { vivo: true, categoria: () => "apparel", previos },
    );
    expect(out[0].bulto_pzas).toBeNull();
    // Lo que manda el navegador no cuenta: sale de la categoría de la base.
    expect(out[1].bulto_pzas).toBe(12);
  });

  it("SIN la migración (columna ausente) todo queda como hoy: el campo se quita", () => {
    const out = sellarBultoReebok([{ product_id: "p", quantity: 1, bulto_pzas: 12 }], { vivo: false, categoria: () => "apparel" });
    expect("bulto_pzas" in out[0]).toBe(false);
    expect(colsConBulto("id, quantity", false)).toBe("id, quantity");
    expect(colsConBulto("id, quantity", true)).toBe("id, quantity, bulto_pzas");
    expect(productoConBulto({ category: "apparel" }, false)).toEqual({ category: "apparel" });
    expect(productoConBulto({ category: "apparel" }, true)).toEqual({ category: "apparel", bulto_pzas: 12 });
  });

  it("el pedido del link conserva el bulto con que el cliente lo pidió", () => {
    const out = conservarBultoReebok([{ product_id: "a", bulto_pzas: 12 }, { product_id: "b" }], true);
    expect(out.map((i) => i.bulto_pzas)).toEqual([12, null]);
  });

  it("los 18 pedidos viejos: un pedido mixto vale lo mismo que antes", () => {
    const viejos = [
      { product_id: "z", quantity: 1, unit_price: 50, category: "footwear" },
      { product_id: "r", quantity: 2, unit_price: 10, category: "apparel" },
      { product_id: "g", quantity: 1, unit_price: 8, category: "accessories" },
    ];
    // 12×50 + 12×10 + 6×8 = 600 + 120 + 48
    expect(resumirPedido(resolverLineas(viejos, ctxReebok)).total).toBe(768);
    expect(calculateReebokOrderTotal(viejos)).toBe(768);
    expect(calculateReebokOrderTotal([{ quantity: 2, unit_price: 10, category: "apparel", bulto_pzas: 12 }])).toBe(240);
  });

  it("Joybees, Tommy y Calvin no cambian", () => {
    expect(joybees()).toBe(12);
    expect(tommy("x", null)).toBe(12);
    expect(tommy("x", 8)).toBe(8);
    expect(calvin("x", null)).toBe(12);
  });
});
