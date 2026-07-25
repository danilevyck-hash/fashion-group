// Ajuste del nombre de la card a UNA sola línea (Daniel, 25-jul-2026).
// La parte medible sin DOM es `tamanoNombre`: dado el ancho del texto a 14px y
// el ancho útil de la card, ¿qué tamaño de fuente se usa?

import { describe, it, expect } from "vitest";
import { tamanoNombre, NOMBRE_PX_BASE, NOMBRE_PX_MIN } from "@/lib/catalogo/fit-one-line";

describe("tamanoNombre — nunca dos líneas", () => {
  it("si cabe, no achica nada", () => {
    expect(tamanoNombre(100, 200)).toBe(NOMBRE_PX_BASE);
    expect(tamanoNombre(200, 200)).toBe(NOMBRE_PX_BASE);
  });

  it("achica PROGRESIVAMENTE, no de golpe al mínimo", () => {
    // Se pasa un 5% → 13px, no 11.
    const casi = tamanoNombre(210, 200);
    expect(casi).toBeLessThan(NOMBRE_PX_BASE);
    expect(casi).toBeGreaterThanOrEqual(13);
    // Cuanto más largo el texto, más chica la fuente (monótona).
    const anchos = [205, 220, 240, 260, 300];
    const tamanos = anchos.map((a) => tamanoNombre(a, 200));
    for (let i = 1; i < tamanos.length; i++) {
      expect(tamanos[i]).toBeLessThanOrEqual(tamanos[i - 1]);
    }
  });

  it("nunca baja del piso legible: ahí corta el CSS con '…'", () => {
    expect(tamanoNombre(1000, 200)).toBe(NOMBRE_PX_MIN);
    expect(tamanoNombre(99999, 173)).toBe(NOMBRE_PX_MIN);
  });

  it("el tamaño elegido SÍ hace caber el texto (mientras no toque el piso)", () => {
    const disponible = 200;
    for (const anchoBase of [201, 215, 233, 249, 254]) {
      const px = tamanoNombre(anchoBase, disponible);
      if (px > NOMBRE_PX_MIN) {
        // El ancho escala lineal con el tamaño de fuente.
        expect((anchoBase * px) / NOMBRE_PX_BASE).toBeLessThanOrEqual(disponible);
      }
    }
  });

  it("escalones de medio píxel (se ve progresivo, no a saltos)", () => {
    for (const anchoBase of [201, 208, 219, 227, 236]) {
      const px = tamanoNombre(anchoBase, 200);
      expect(Math.round(px * 2) / 2).toBe(px);
    }
  });

  it("entradas raras (0, negativo, NaN) no rompen la card", () => {
    expect(tamanoNombre(0, 200)).toBe(NOMBRE_PX_BASE);
    expect(tamanoNombre(100, 0)).toBe(NOMBRE_PX_BASE);
    expect(tamanoNombre(NaN, 200)).toBe(NOMBRE_PX_BASE);
    expect(tamanoNombre(100, NaN)).toBe(NOMBRE_PX_BASE);
  });
});
