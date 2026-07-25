// ─────────────────────────────────────────────────────────────────────────────
// Paridad de las CARDS y del menú Compartir en las 3 marcas (25-jul-2026).
//
// Los ajustes de UI aprobados por Daniel viven en componentes ÚNICOS y en el
// tema, no por marca. Estos tests fijan el contrato para que nadie los
// reintroduzca por marca ni los pierda en un refactor:
//   · la card no muestra el precio del bulto (solo "Bulto de N"),
//   · el stock interno sale en UNA línea "Disponibilidad N · Existencia N",
//   · la foto es 4:3 con object-contain en las 3 marcas,
//   · el grid sube a 5 columnas SOLO en xl (iPad y móvil intactos),
//   · el menú Compartir tiene Copiar link + Descargar PDF en las 3 marcas.
//
// El último punto es la regresión reportada del PR #250 (ver PR de este
// cambio): el menú vive UNA sola vez en CatalogoVendedorPage y ninguna marca
// puede quedarse sin el PDF por config.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import path from "path";

vi.mock("@/lib/tommy-supabase-server", () => ({ tommyServer: {} }));
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: {} }));

import { MARCA_THEME } from "@/lib/catalogo/marcas-ui";

const MARCAS = ["reebok", "joybees", "tommy"] as const;

function src(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

const PRODUCT_CARD = src("src/components/catalogo/CatalogoProductCard.tsx");
const GROUPED_CARD = src("src/components/catalogo/CatalogoGroupedCard.tsx");
const VENDEDOR = src("src/components/catalogo/CatalogoVendedorPage.tsx");
const PUBLICO = src("src/components/catalogo/CatalogoPublicoPage.tsx");

describe("card de producto — paridad en las 3 marcas", () => {
  it("ninguna card muestra el precio del bulto ($X/bulto)", () => {
    for (const [nombre, code] of [["plana", PRODUCT_CARD], ["agrupada", GROUPED_CARD]] as const) {
      expect(code, nombre).not.toContain("/bulto");
      expect(code, nombre).not.toContain("bultoTotal");
    }
  });

  it("las dos cards siguen mostrando 'Bulto de N'", () => {
    expect(PRODUCT_CARD).toContain("Bulto de {bultoSize}");
    expect(GROUPED_CARD).toContain("Bulto de {BULTO_SIZE}");
  });

  it("stock interno en UNA línea con el vocabulario del sistema", () => {
    expect(PRODUCT_CARD).toContain("Disponibilidad {");
    expect(PRODUCT_CARD).toContain("Existencia {");
    // Los copys viejos de dos bloques quedaron fuera.
    expect(PRODUCT_CARD).not.toContain("Disponible: ");
    expect(PRODUCT_CARD).not.toContain("En bodega:");
  });

  it("foto 4:3 con object-contain (nunca recorta producto) en las 3 marcas", () => {
    for (const m of MARCAS) {
      const card = MARCA_THEME[m].card;
      expect(card.imageBg, m).toContain("aspect-[4/3]");
      expect(card.imageBg, m).not.toContain("aspect-square");
      expect(card.imageFit, m).toContain("object-contain");
      expect(card.imageFit, m).not.toContain("object-cover");
    }
  });
});

describe("grid del catálogo — 5 columnas SOLO en escritorio grande", () => {
  const GRID = "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5";

  it("vendedor y público usan el mismo grid en todos sus bloques", () => {
    for (const [nombre, code] of [["vendedor", VENDEDOR], ["publico", PUBLICO]] as const) {
      const conXl = code.split(GRID).length - 1;
      const total = code.split("grid-cols-2 sm:grid-cols-3 lg:grid-cols-4").length - 1;
      expect(conXl, `${nombre}: bloques con xl:grid-cols-5`).toBeGreaterThan(0);
      expect(conXl, `${nombre}: TODOS los grids llevan xl:grid-cols-5`).toBe(total);
    }
  });

  it("los breakpoints de móvil (2) y tablet (3/4) NO cambiaron", () => {
    for (const code of [VENDEDOR, PUBLICO]) {
      expect(code).not.toContain("md:grid-cols-5");
      expect(code).not.toContain("lg:grid-cols-5");
      expect(code).not.toContain("sm:grid-cols-4");
    }
  });
});

describe("menú Compartir — Copiar link + Descargar PDF en las 3 marcas", () => {
  it("el menú vive UNA sola vez y no está condicionado por marca", () => {
    expect(VENDEDOR.split("Descargar PDF").length - 1).toBe(1);
    // El ítem del PDF no puede colgar de ningún flag/feature de marca.
    const item = VENDEDOR.slice(VENDEDOR.indexOf("const shareMenu"));
    const pdfBtn = item.slice(0, item.indexOf("Descargar PDF"));
    expect(pdfBtn).not.toMatch(/theme\.features\.\w+ &&/);
  });

  it("cada marca declara su label de copiar y el dropdown completo", () => {
    for (const m of MARCAS) {
      const vs = MARCA_THEME[m].vendorShare;
      expect(vs.copyLabel, m).toMatch(/Copiar link/);
      expect(vs.panel, m).toBeTruthy();
      expect(vs.item, m).toBeTruthy();
      expect(vs.iconSize, m).toBeGreaterThan(0);
    }
  });
});

describe("taxonomía de género por marca — Tommy no arrastra la de Reebok", () => {
  it("Reebok y Joybees comparten la histórica (español, boys+girls = Niños)", () => {
    expect(MARCA_THEME.reebok.genero).toBe(MARCA_THEME.joybees.genero);
    expect(MARCA_THEME.reebok.genero.groupLabel("boys")).toBe("Ninos");
    expect(MARCA_THEME.reebok.genero.groupLabel("girls")).toBe("Ninos");
    expect(MARCA_THEME.reebok.genero.groupLabel("women")).toBe("Mujer");
  });

  it("Tommy separa Boys/Girls y etiqueta en el vocabulario de Switch", () => {
    const g = MARCA_THEME.tommy.genero;
    expect(g).not.toBe(MARCA_THEME.reebok.genero);
    expect(g.groupLabel("boys")).toBe("Boys");
    expect(g.groupLabel("girls")).toBe("Girls");
    expect(g.groupOrder("women")).toBeLessThan(g.groupOrder("men"));
    expect(g.groupOrder(null)).toBe(9);
  });

  it("ningún componente de catálogo importa un módulo de género directo", () => {
    for (const code of [VENDEDOR, PUBLICO]) {
      expect(code).not.toContain("@/lib/reebok-gender");
      expect(code).not.toContain("@/lib/tommy-gender");
    }
  });
});
