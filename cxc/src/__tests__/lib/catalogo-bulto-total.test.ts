// ─────────────────────────────────────────────────────────────────────────────
// PR-0 paridad catálogos — capa de LÓGICA DE MARCA (pre-refactor).
//
// Fija el contrato de los helpers de bulto/total/orden que el refactor a
// motor multi-marca tiene que preservar EXACTO:
//   · Reebok: bulto por categoría (footwear=12, todo lo demás=6)
//   · Joybees: bulto fijo 12 (todo footwear)
//   · total = Σ quantity × bulto × unit_price (unit_price es POR PIEZA)
//   · orden canónico de items Reebok: footwear → apparel → accessories, SKU asc
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { getBultoSize as reebokBulto } from "@/lib/reebok-bulto";
import { getBultoSize as joybeesBulto } from "@/lib/joybees-bulto";
import { calculateReebokOrderTotal } from "@/lib/reebok-order-total";
import { calculateJoybeesOrderTotal } from "@/lib/joybees-order-total";
import { sortReebokOrderItems } from "@/lib/reebok-order-sort";

describe("getBultoSize — Reebok (por categoría)", () => {
  it("footwear = 12 piezas por bulto", () => {
    expect(reebokBulto("footwear")).toBe(12);
  });

  it("apparel y accessories = 6 piezas por bulto", () => {
    expect(reebokBulto("apparel")).toBe(6);
    expect(reebokBulto("accessories")).toBe(6);
  });

  it("categoría desconocida o vacía = 6 (nunca infla a 12)", () => {
    expect(reebokBulto("")).toBe(6);
    expect(reebokBulto("otra-cosa")).toBe(6);
  });
});

describe("getBultoSize — Joybees (fijo)", () => {
  it("siempre 12, con o sin categoría", () => {
    expect(joybeesBulto()).toBe(12);
    expect(joybeesBulto("footwear")).toBe(12);
    expect(joybeesBulto("apparel")).toBe(12); // Joybees ignora la categoría
  });
});

describe("calculateReebokOrderTotal", () => {
  it("mezcla de categorías: bulto correcto por línea", () => {
    const total = calculateReebokOrderTotal([
      { quantity: 2, unit_price: 10, category: "footwear" }, // 2×12×10 = 240
      { quantity: 1, unit_price: 5, category: "apparel" }, // 1×6×5 = 30
      { quantity: 3, unit_price: 2, category: "accessories" }, // 3×6×2 = 36
    ]);
    expect(total).toBe(306);
  });

  it("sin category cae a footwear=12 (contrato ACTUAL del helper)", () => {
    // OJO: el default del helper es footwear (12). Los CALLERS del API aplican
    // fallback "apparel" (6) ANTES de llamar — ese contrato se fija en los
    // tests de rutas. Aquí se fija el default crudo del helper.
    expect(calculateReebokOrderTotal([{ quantity: 1, unit_price: 10 }])).toBe(120);
  });

  it("input no-array devuelve 0", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(calculateReebokOrderTotal(null as any)).toBe(0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(calculateReebokOrderTotal(undefined as any)).toBe(0);
  });

  it("carrito vacío devuelve 0", () => {
    expect(calculateReebokOrderTotal([])).toBe(0);
  });
});

describe("calculateJoybeesOrderTotal", () => {
  it("siempre bulto 12", () => {
    const total = calculateJoybeesOrderTotal([
      { quantity: 2, unit_price: 10 }, // 240
      { quantity: 1, unit_price: 2.5 }, // 30
    ]);
    expect(total).toBe(270);
  });

  it("input no-array devuelve 0", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(calculateJoybeesOrderTotal(null as any)).toBe(0);
  });

  it("espejo de Reebok con todo footwear: mismo total", () => {
    const items = [
      { quantity: 3, unit_price: 7 },
      { quantity: 1, unit_price: 12.5 },
    ];
    expect(calculateJoybeesOrderTotal(items)).toBe(
      calculateReebokOrderTotal(items.map((i) => ({ ...i, category: "footwear" }))),
    );
  });
});

describe("sortReebokOrderItems — orden canónico", () => {
  it("footwear → apparel → accessories, SKU ascendente dentro de cada bloque", () => {
    const sorted = sortReebokOrderItems([
      { category: "accessories", sku: "A-1" },
      { category: "footwear", sku: "Z-9" },
      { category: "apparel", sku: "B-2" },
      { category: "footwear", sku: "A-1" },
    ]);
    expect(sorted.map((i) => `${i.category}:${i.sku}`)).toEqual([
      "footwear:A-1",
      "footwear:Z-9",
      "apparel:B-2",
      "accessories:A-1",
    ]);
  });

  it("categoría desconocida o nula va al final; no muta el array original", () => {
    const original = [
      { category: null, sku: "X" },
      { category: "footwear", sku: "F" },
    ];
    const copy = [...original];
    const sorted = sortReebokOrderItems(original);
    expect(sorted.map((i) => i.sku)).toEqual(["F", "X"]);
    expect(original).toEqual(copy);
  });
});
