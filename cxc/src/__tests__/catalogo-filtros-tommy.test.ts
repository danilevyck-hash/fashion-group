// ─────────────────────────────────────────────────────────────────────────────
// Filtros extra del catálogo — SOLO Tommy (25-jul-2026).
//
// Daniel aprobó dos filtros nuevos únicamente para Tommy Hilfiger:
//   · chip "2 bultos o más" (24 pzas: el bulto de Tommy es 12),
//   · select de rango de precio POR PIEZA, 4 tramos medidos.
// Reebok y Joybees NO los llevan — "un filtro que casi no corta enreda al
// vendedor": medido contra producción, en Joybees el corte de bultos deja pasar
// el 92% y sus precios no tienen dispersión; en Reebok el precio es ~90%
// redundante con los chips de categoría.
//
// Estos tests fijan ese contrato de PARIDAD INVERSA (igual de fuerte que la
// paridad de las cards, pero al revés: acá lo que se defiende es que las otras
// dos marcas NO lo muestren) y los umbrales medidos:
//   umbral bultos = 2 completos, tramos = [0,23) [23,32) [32,49) [49,∞),
//   P25 de disponibilidad de Tommy = 23 pzas (una sola por debajo de 2 bultos),
//   367 de 490 productos visibles pasan el corte (74,9%).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "fs";
import path from "path";

vi.mock("@/lib/tommy-supabase-server", () => ({ tommyServer: {} }));
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: {} }));

import { MARCA_THEME, type MarcaUiKey } from "@/lib/catalogo/marcas-ui";
import {
  MIN_BULTOS, BULTOS_CHIP_LABEL, PRECIO_RANGO_OPTIONS,
  cumpleBultosMinimos, precioEnRango, esPrecioRango, type PrecioRango,
} from "@/lib/catalogo/filtros-extra";
import CatalogoFilters from "@/components/catalogo/CatalogoFilters";

function src(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

const PUBLICO = src("src/components/catalogo/CatalogoPublicoPage.tsx");
const VENDEDOR = src("src/components/catalogo/CatalogoVendedorPage.tsx");

// ── Umbral de bultos ──────────────────────────────────────────────────────────
describe("cumpleBultosMinimos — 2 bultos completos", () => {
  const BULTO_TOMMY = MARCA_THEME.tommy.bulto("sneakers");

  it("el bulto de Tommy sale del tema y es 12 en todas sus categorías", () => {
    expect(BULTO_TOMMY).toBe(12);
    for (const cat of ["sneakers", "flip_flops", "sandals", "shoes", "slippers", "boots", null]) {
      expect(MARCA_THEME.tommy.bulto(cat)).toBe(12);
    }
  });

  it("el umbral aprobado es 2 bultos completos = 24 piezas", () => {
    expect(MIN_BULTOS).toBe(2);
    expect(cumpleBultosMinimos(24, BULTO_TOMMY)).toBe(true);
    // 23 es el percentil 25 de disponibilidad de Tommy: queda UNA pieza corto.
    expect(cumpleBultosMinimos(23, BULTO_TOMMY)).toBe(false);
  });

  it("cuenta bultos COMPLETOS: 35 pzas son 2 bultos, no 3", () => {
    expect(cumpleBultosMinimos(35, 12)).toBe(true);
    expect(cumpleBultosMinimos(12, 12)).toBe(false);
    expect(cumpleBultosMinimos(0, 12)).toBe(false);
  });

  it("no esconde producto si el tamaño de bulto viene roto (fail-open)", () => {
    expect(cumpleBultosMinimos(5, 0)).toBe(true);
    expect(cumpleBultosMinimos(5, Number.NaN)).toBe(true);
  });

  it("trata null/undefined de disponibilidad como 0 piezas", () => {
    expect(cumpleBultosMinimos(null, 12)).toBe(false);
    expect(cumpleBultosMinimos(undefined, 12)).toBe(false);
  });

  it("reproduce la distribución medida en producción (367 de 490 pasan)", () => {
    // Distribución real por bultos completos medida el 25-jul-2026 contra
    // tommy_products: 0→38, 1→85, 2→82, 3→47, 4→37, 5→26, 6+→175.
    const distribucion: Record<number, number> = { 0: 38, 1: 85, 2: 82, 3: 47, 4: 37, 5: 26, 6: 175 };
    const productos: number[] = [];
    for (const [bultos, n] of Object.entries(distribucion)) {
      for (let i = 0; i < n; i++) productos.push(Number(bultos) * 12);
    }
    expect(productos.length).toBe(490);
    const pasan = productos.filter(pzas => cumpleBultosMinimos(pzas, 12)).length;
    expect(pasan).toBe(367);
    expect(productos.length - pasan).toBe(123);
    expect(Math.round((pasan / productos.length) * 1000) / 10).toBe(74.9);
  });
});

// ── Tramos de precio ──────────────────────────────────────────────────────────
describe("precioEnRango — 4 tramos por PIEZA", () => {
  it("la primera opción del select es 'Precio: todos' y no filtra nada", () => {
    expect(PRECIO_RANGO_OPTIONS[0]).toEqual({ value: "", label: "Precio: todos" });
    expect(precioEnRango(999, "")).toBe(true);
    expect(precioEnRango(null, "")).toBe(true);
  });

  it("los labels son los tramos aprobados", () => {
    expect(PRECIO_RANGO_OPTIONS.map(o => o.label)).toEqual([
      "Precio: todos", "Hasta $22", "$23 a $31", "$32 a $48", "$49 o más",
    ]);
  });

  it("los cortes son continuos: cada precio cae en exactamente un tramo", () => {
    const rangos = PRECIO_RANGO_OPTIONS.map(o => o.value).filter(v => v) as PrecioRango[];
    for (const p of [0, 10, 17.5, 22, 22.99, 23, 28, 31, 31.99, 32, 40, 48, 48.5, 49, 54, 500]) {
      const caen = rangos.filter(r => precioEnRango(p, r));
      expect(caen.length, `precio ${p}`).toBe(1);
    }
  });

  it("respeta los bordes medidos (huecos reales 31→34 y 48→50)", () => {
    expect(precioEnRango(22, "hasta-22")).toBe(true);
    expect(precioEnRango(23, "hasta-22")).toBe(false);
    expect(precioEnRango(23, "23-31")).toBe(true);
    expect(precioEnRango(31, "23-31")).toBe(true);
    expect(precioEnRango(34, "32-48")).toBe(true);
    expect(precioEnRango(48, "32-48")).toBe(true);
    expect(precioEnRango(50, "49-mas")).toBe(true);
    // Los únicos precios con centavos del catálogo (17.50 y 19.50) caen limpio.
    expect(precioEnRango(17.5, "hasta-22")).toBe(true);
    expect(precioEnRango(19.5, "hasta-22")).toBe(true);
  });

  it("reproduce el reparto medido: 180 / 113 / 107 / 90", () => {
    const catalogo = [
      ...Array(180).fill(17.5), ...Array(113).fill(28),
      ...Array(107).fill(38), ...Array(90).fill(52),
    ];
    expect(catalogo.length).toBe(490);
    expect(catalogo.filter(p => precioEnRango(p, "hasta-22")).length).toBe(180);
    expect(catalogo.filter(p => precioEnRango(p, "23-31")).length).toBe(113);
    expect(catalogo.filter(p => precioEnRango(p, "32-48")).length).toBe(107);
    expect(catalogo.filter(p => precioEnRango(p, "49-mas")).length).toBe(90);
  });

  it("valida el rango que viene del query (dato no confiable)", () => {
    expect(esPrecioRango("32-48")).toBe(true);
    expect(esPrecioRango("")).toBe(true);
    expect(esPrecioRango(null)).toBe(true);
    expect(esPrecioRango("hasta-1000")).toBe(false);
    expect(esPrecioRango("<script>")).toBe(false);
  });
});

// ── Flags por marca: Reebok y Joybees NO llevan los filtros nuevos ────────────
describe("paridad inversa — los filtros nuevos son SOLO de Tommy", () => {
  it("los flags están encendidos solo en Tommy", () => {
    expect(MARCA_THEME.tommy.features.filtroBultos).toBe(true);
    expect(MARCA_THEME.tommy.features.filtroPrecio).toBe(true);
    for (const marca of ["reebok", "joybees"] as const) {
      expect(MARCA_THEME[marca].features.filtroBultos, marca).toBe(false);
      expect(MARCA_THEME[marca].features.filtroPrecio, marca).toBe(false);
    }
  });

  const props = (marca: MarcaUiKey) => ({
    marca,
    searchInput: "", onSearchChange: () => {},
    gender: "", onGenderChange: () => {},
    category: "", onCategoryChange: () => {},
    bultosFilter: false, onBultosFilterChange: () => {},
    precioRango: "" as PrecioRango, onPrecioRangoChange: () => {},
    sortBy: "relevancia", onSortByChange: () => {},
    filteredCount: 0, onClearAll: () => {},
  });

  it("Tommy muestra el chip de bultos y el select de precio", () => {
    render(createElement(CatalogoFilters, props("tommy")));
    expect(screen.getByRole("button", { name: BULTOS_CHIP_LABEL })).toBeTruthy();
    expect(screen.getByLabelText("Filtrar por precio")).toBeTruthy();
    for (const o of PRECIO_RANGO_OPTIONS) {
      expect(screen.getByRole("option", { name: o.label })).toBeTruthy();
    }
  });

  it("Reebok y Joybees NO los muestran, aunque les pasen los handlers", () => {
    for (const marca of ["reebok", "joybees"] as const) {
      const { unmount } = render(createElement(CatalogoFilters, props(marca)));
      expect(screen.queryByRole("button", { name: BULTOS_CHIP_LABEL }), marca).toBeNull();
      expect(screen.queryByLabelText("Filtrar por precio"), marca).toBeNull();
      expect(screen.queryByRole("option", { name: "Precio: todos" }), marca).toBeNull();
      // El orden sí sigue estando en las 3 marcas.
      expect(screen.getByRole("option", { name: "Ordenar: Relevancia" }), marca).toBeTruthy();
      unmount();
    }
  });

  it("la fila de orden envuelve: con DOS selects no entra en un iPhone", () => {
    // Medido en Chrome a 390px: precio + orden miden 404px contra 358 de ancho
    // útil, y sin `flex-wrap` la PÁGINA entera se iba en scroll horizontal.
    const filtros = src("src/components/catalogo/CatalogoFilters.tsx");
    expect(filtros).toContain('className="flex flex-wrap items-center justify-between gap-2"');
    expect(filtros).toContain('className="flex flex-wrap items-center justify-end gap-2 ml-auto"');
  });

  it("el chip usa el label exacto aprobado (no 'buen stock')", () => {
    // La card pública no muestra Disponibilidad ni Existencia: el label tiene
    // que declarar la REGLA para que se entienda por qué desaparecen productos.
    expect(BULTOS_CHIP_LABEL).toBe("2 bultos o más");
    const filtros = src("src/components/catalogo/CatalogoFilters.tsx");
    expect(filtros).not.toMatch(/buen stock/i);
  });
});

// ── Cableado: público e interno comparten el MISMO filtro ─────────────────────
describe("las dos páginas aplican el filtro igual", () => {
  it("ambas filtran con cumpleBultosMinimos + precioEnRango", () => {
    for (const [nombre, code] of [["publico", PUBLICO], ["vendedor", VENDEDOR]] as const) {
      expect(code, nombre).toContain("cumpleBultosMinimos(disponibleVendible(p), theme.bulto(p.category))");
      expect(code, nombre).toContain("precioEnRango(p.price, precioRango)");
    }
  });

  it("miden DISPONIBILIDAD (nunca `_stock`, que en vendedor es existencia)", () => {
    // En CatalogoVendedorPage `_stock` viene de `p.stock` = espejo de
    // existencia; usarlo daría 369 productos donde el link público da 367.
    for (const code of [PUBLICO, VENDEDOR]) {
      expect(code).toContain("import { disponibleVendible }");
      expect(code).not.toContain("cumpleBultosMinimos(p._stock");
    }
  });

  it("nunca hardcodean el 12: el bulto sale del tema", () => {
    for (const code of [PUBLICO, VENDEDOR]) {
      expect(code).not.toMatch(/cumpleBultosMinimos\([^)]*,\s*12\s*[,)]/);
    }
  });

  it("ambas limpian los filtros nuevos en 'Limpiar filtros'", () => {
    for (const [nombre, code] of [["publico", PUBLICO], ["vendedor", VENDEDOR]] as const) {
      expect(code, nombre).toContain('setBultosFilter(false); setPrecioRango("")');
    }
  });

  it("ambas los cablean detrás del flag de la marca", () => {
    for (const [nombre, code] of [["publico", PUBLICO], ["vendedor", VENDEDOR]] as const) {
      expect(code, nombre).toContain("theme.features.filtroBultos ? setBultosFilter : undefined");
      expect(code, nombre).toContain("theme.features.filtroPrecio ? setPrecioRango : undefined");
    }
  });
});
