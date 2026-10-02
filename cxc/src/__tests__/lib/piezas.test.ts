// 1-oct-2026, Daniel: nombres normales de ERP («piezas/pzas» → «unidades/u», «Piezas» → «Cantidad»).
// Formato "1 bulto · 8 u" — el que ve el cliente en el pedido del link y la
// secretaria en el admin cuando hay MENOS piezas de las pedidas. Función única
// de las 3 marcas (Reebok bulto 12/6, Joybees y Tommy bulto 12).

import { describe, it, expect } from "vitest";
import { formatBultosPiezas } from "@/lib/catalogo/piezas";

describe("formatBultosPiezas", () => {
  it("formato pedido por Daniel: bultos completos + piezas sueltas", () => {
    expect(formatBultosPiezas(20, 12)).toBe("1 bulto · 8 u");
  });

  it("solo bultos completos: no imprime 0 u", () => {
    expect(formatBultosPiezas(24, 12)).toBe("2 bultos");
    expect(formatBultosPiezas(12, 12)).toBe("1 bulto");
  });

  it("menos de un bulto: solo piezas", () => {
    expect(formatBultosPiezas(8, 12)).toBe("8 u");
    expect(formatBultosPiezas(1, 12)).toBe("1 u");
  });

  it("sin nada disponible dice 0 pzas (no cadena vacía)", () => {
    expect(formatBultosPiezas(0, 12)).toBe("0 u");
  });

  it("bulto de 6 (apparel Reebok)", () => {
    expect(formatBultosPiezas(8, 6)).toBe("1 bulto · 2 u");
  });

  it("entradas basura no rompen el texto", () => {
    expect(formatBultosPiezas(-5, 12)).toBe("0 u");
    expect(formatBultosPiezas(Number.NaN, 12)).toBe("0 u");
    expect(formatBultosPiezas(8, 0)).toBe("8 bultos");
  });
});
