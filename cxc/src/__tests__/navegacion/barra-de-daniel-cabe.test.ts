// 🔴 La barra de abajo de Daniel (17-nov-2026, su «2,4,5,7» sobre su top 10 del
// celular): Inicio · Despachos · Tienda · Ventas · Por cobrar. Ningún rótulo
// puede salir con «…» a 360 px con letra de 12 px, y «Guías» no vuelve.
//
// jsdom no mide letra: los anchos de abajo se midieron en pantalla con el arnés
// `scripts/_capturas/` (Chromium, 12 px semibold, 17-nov-2026). Un rótulo nuevo
// en la barra de Daniel hace fallar esta prueba hasta que se mida y se anote.
import { describe, expect, it } from "vitest";
import { MARGEN_TAB_BAR, pestanasDelRol, rotuloDePestana } from "@/lib/navegacion/tab-bar";
import { ALL_MODULES } from "@/lib/modules";

const ANCHO_MEDIDO_12PX: Record<string, number> = {
  Inicio: 31,
  Despachos: 65,
  Tienda: 40,
  Ventas: 40,
  "Por cobrar": 61,
};

// La cápsula: 12 px a cada lado de la pantalla y px-1 adentro; 5 botones iguales.
const ANCHO_POR_PESTANA_360 = Math.floor((360 - 2 * 12 - 2 * 4) / 5);

describe("la barra de Daniel cabe sin «…»", () => {
  const rotulos = ["Inicio", ...pestanasDelRol("admin", null, [], "/home", "daniel").map(rotuloDePestana)];

  it("es Inicio · Despachos · Tienda · Ventas · Por cobrar", () => {
    expect(MARGEN_TAB_BAR).toBeGreaterThan(0);
    expect(rotulos).toEqual(["Inicio", "Despachos", "Tienda", "Ventas", "Por cobrar"]);
  });

  it.each(rotulos)("«%s» está medido y cabe a 360 px", (r) => {
    expect(ANCHO_MEDIDO_12PX[r], `mide «${r}» con scripts/_capturas/ y anótalo`).toBeDefined();
    expect(ANCHO_MEDIDO_12PX[r]).toBeLessThanOrEqual(ANCHO_POR_PESTANA_360);
  });

  it("«Guías» no vuelve como rótulo de Despachos", () => {
    const despachos = ALL_MODULES.find((m) => m.key === "guias")!;
    expect(rotuloDePestana(despachos)).toBe("Despachos");
    expect(rotulos).not.toContain("Guías");
  });
});
