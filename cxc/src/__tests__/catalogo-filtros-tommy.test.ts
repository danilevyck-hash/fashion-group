// ─────────────────────────────────────────────────────────────────────────────
// Filtros extra del catálogo — SOLO Tommy (25-jul-2026).
//
// Daniel aprobó dos filtros nuevos únicamente para Tommy Hilfiger (Calvin los
// heredó después, por paridad):
//   · chip "2 bultos o más" (24 pzas: el bulto de Tommy es 12),
//   · filtro de precio POR PIEZA — nació como select de 4 tramos y desde el
//     23-ago-2026 son DOS campos que se escriben (ver catalogo-precio-exacto).
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
  MIN_BULTOS, BULTOS_CHIP_LABEL, PRECIO_VACIO, cumpleBultosMinimos,
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

// ── Tramos de precio ────────────────────────────────────────────────────────
// SE FUERON. El desplegable de 4 tramos lo retiró Daniel el 23-ago-2026 ("quita
// el dropdown del filtro de precio... y pon opcion de filtro exacto"). Lo que
// reemplaza a estos tests vive en `catalogo-precio-exacto.test.ts`, que además
// prueba la CONDUCTA del espejo pintando el componente de verdad.

// ── Flags por marca: el chip de BULTOS sigue siendo solo de Tommy ────────────
//
// 🔴 ESTE BLOQUE CAMBIÓ DE DIRECCIÓN EL 24-ago-2026, Y SOLO EN LA MITAD DEL
// PRECIO. Hasta ese día exigía `filtroPrecio === false` en Reebok y Joybees,
// o sea que FIJABA una decisión de jul-2026 que **Daniel acaba de revertir**
// (*"sí, pero no quiero botones de precios, solo escribirlo y ya"*). Un
// candado que congela una decisión del dueño en contra del dueño no protege
// nada: pone el build rojo cuando alguien hace lo que le pidieron.
// Lo que SÍ se defiende ahora es lo contrario — que el campo esté en las
// CUATRO marcas — y vive en `catalogo-precio-exacto.test.ts`.
// ⚠️ `filtroBultos` NO se tocó: sigue siendo solo de Tommy y Calvin.
describe("paridad inversa — el chip de bultos es SOLO de Tommy", () => {
  it("el chip de bultos está encendido solo en Tommy, y el precio en las cuatro", () => {
    expect(MARCA_THEME.tommy.features.filtroBultos).toBe(true);
    for (const marca of ["reebok", "joybees"] as const) {
      expect(MARCA_THEME[marca].features.filtroBultos, marca).toBe(false);
      // 🔑 El precio ahora SÍ (Daniel, 24-ago-2026 — ver marcas-ui).
      expect(MARCA_THEME[marca].features.filtroPrecio, marca).toBe(true);
    }
  });

  const props = (marca: MarcaUiKey) => ({
    marca,
    searchInput: "", onSearchChange: () => {},
    gender: "", onGenderChange: () => {},
    category: "", onCategoryChange: () => {},
    bultosFilter: false, onBultosFilterChange: () => {},
    precio: PRECIO_VACIO, onPrecioChange: () => {}, preciosDisponibles: [],
    sortBy: "relevancia", onSortByChange: () => {},
    filteredCount: 0, onClearAll: () => {},
  });

  it("Tommy muestra el chip de bultos y los DOS campos de precio", () => {
    render(createElement(CatalogoFilters, props("tommy")));
    // DOS chips: uno en la fila de píldoras (iPad/escritorio) y otro en la fila
    // de desplegables (celular) — ver `catalogo-filtros-movil.test.ts`. Solo uno
    // se ve a la vez; jsdom no aplica CSS, así que acá aparecen los dos.
    expect(screen.getAllByRole("button", { name: BULTOS_CHIP_LABEL })).toHaveLength(2);
    expect(screen.getByLabelText("Precio desde")).toBeTruthy();
    expect(screen.getByLabelText("Precio hasta")).toBeTruthy();
    // Y el desplegable de tramos NO vuelve.
    expect(screen.queryByLabelText("Filtrar por precio")).toBeNull();
  });

  it("Reebok y Joybees NO muestran el chip de bultos, pero SÍ los campos de precio", () => {
    for (const marca of ["reebok", "joybees"] as const) {
      const { unmount } = render(createElement(CatalogoFilters, props(marca)));
      expect(screen.queryByRole("button", { name: BULTOS_CHIP_LABEL }), marca).toBeNull();
      // 🔑 Los campos de precio entraron el 24-ago-2026, por pedido de Daniel.
      expect(screen.getByLabelText("Precio desde"), marca).toBeTruthy();
      expect(screen.getByLabelText("Precio hasta"), marca).toBeTruthy();
      expect(screen.queryByLabelText("Filtrar por precio"), marca).toBeNull();
      // El orden sí sigue estando en las 3 marcas.
      expect(screen.getByRole("option", { name: "Ordenar: Relevancia" }), marca).toBeTruthy();
      unmount();
    }
  });

  it("la fila de orden envuelve, aunque el select de precio ya no esté ahí", () => {
    // Nació midiendo: precio + orden daban 404px contra 358 de ancho útil a
    // 390px, y sin `flex-wrap` la PÁGINA entera se iba en scroll horizontal.
    // El select de precio se fue a su propia franja el 23-ago-2026, pero el
    // `flex-wrap` se queda: quitarlo sería apostar a que lo que queda entra.
    const filtros = src("src/components/catalogo/CatalogoFilters.tsx");
    expect(filtros).toContain('className="flex flex-wrap items-center justify-between gap-2"');
    expect(filtros).toContain('className="flex flex-wrap items-center justify-end gap-2 ml-auto"');
  });

  // ── Posición del chip en la fila (Daniel, 26-jul-2026) ──────────────────────
  // Nació al FINAL de la fila y en móvil había que arrastrarla horizontalmente
  // (Género + 7 categorías por delante) para descubrirlo. "Un filtro que no se
  // ve no existe" — y corta 123 de 490 productos en Tommy. Va PRIMERO.
  function chipsDeLaFila(container: HTMLElement): string[] {
    const fila = container.querySelector(".overflow-x-auto");
    if (!fila) throw new Error("no se encontró la fila de chips");
    return [...fila.querySelectorAll("button")].map(b => (b.textContent || "").trim());
  }

  it("en Tommy el chip de bultos es el PRIMERO de la fila, antes de Género", () => {
    const { container } = render(createElement(CatalogoFilters, props("tommy")));
    const chips = chipsDeLaFila(container);
    expect(chips[0]).toBe(BULTOS_CHIP_LABEL);
    const generos = MARCA_THEME.tommy.filtros.genderOptions.map(o => o.label);
    expect(chips.indexOf(generos[0])).toBeGreaterThan(0);
    // Y sigue apareciendo UNA sola vez (no quedó duplicado al moverlo).
    expect(chips.filter(c => c === BULTOS_CHIP_LABEL).length).toBe(1);
  });

  it("Reebok y Joybees arrancan la fila con Género, exactamente como antes", () => {
    for (const marca of ["reebok", "joybees"] as const) {
      const { container, unmount } = render(createElement(CatalogoFilters, props(marca)));
      const chips = chipsDeLaFila(container);
      expect(chips[0], marca).toBe(MARCA_THEME[marca].filtros.genderOptions[0].label);
      expect(chips, marca).not.toContain(BULTOS_CHIP_LABEL);
      unmount();
    }
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
  it("ambas filtran con cumpleBultosMinimos + el filtro de precio", () => {
    for (const [nombre, code] of [["publico", PUBLICO], ["vendedor", VENDEDOR]] as const) {
      // `bulto_pzas` (Tommy) entra en el cálculo desde el 6-ago-2026: sus bultos
      // vienen de 8 o de 12 según el estilo. El filtro "2 bultos o más" tiene que
      // contar con el tamaño REAL del estilo, no con el default de la marca.
      expect(code, nombre).toContain(
        "cumpleBultosMinimos(disponibleVendible(p), theme.bulto(p.category, p.bulto_pzas))",
      );
      expect(code, nombre).toContain("precioEnFiltro(p.price, precio.desde, precio.hasta)");
    }
  });

  it("miden DISPONIBILIDAD llamando a la regla única, nunca `_stock`", () => {
    // Desde el 26-jul-2026 `_stock` YA es disponibilidad en las dos páginas,
    // pero el filtro sigue llamando a disponibleVendible: así no depende de
    // cómo se armó `_stock` en la rama de datos de cada marca.
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
      expect(code, nombre).toContain("setBultosFilter(false); setPrecio(PRECIO_VACIO)");
    }
  });

  it("ambas los cablean detrás del flag de la marca", () => {
    for (const [nombre, code] of [["publico", PUBLICO], ["vendedor", VENDEDOR]] as const) {
      expect(code, nombre).toContain("theme.features.filtroBultos ? setBultosFilter : undefined");
      expect(code, nombre).toContain("theme.features.filtroPrecio ? setPrecio : undefined");
    }
  });
});
