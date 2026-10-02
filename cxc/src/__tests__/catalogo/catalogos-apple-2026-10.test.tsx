// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO · Catálogos estilo Apple (`CATALOGOS_APPLE_2026_10`, 1-oct-2026)
//
// Lo que NO puede cambiar con la propuesta: el precio, el carrito, el
// checkout y el payload del pedido. El interruptor solo acomoda la pantalla.
//   1. Hoy sigue apagado (`false` = la pantalla de hoy).
//   2. El interruptor solo vive en los archivos de pantalla: ningún
//      archivo del carrito, del checkout ni del envío lo lee.
//   3. Los filtros mandan los MISMOS valores con la propuesta y sin ella.
//   4. La rama apagada conserva literal la clase de hoy.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import fs from "fs";
import path from "path";
import CatalogoFilters from "@/components/catalogo/CatalogoFilters";
import {
  CATALOGOS_APPLE_2026_10,
  clasesBarraFiltros,
  puestosConOrden,
} from "@/lib/catalogo/catalogos-2026-10";

const RAIZ = process.cwd();
const leer = (p: string) => fs.readFileSync(path.join(RAIZ, p), "utf8");

afterEach(() => cleanup());

function listar(dir: string): string[] {
  return fs.readdirSync(path.join(RAIZ, dir), { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "__tests__" ? [] : listar(p);
    return /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });
}

describe("1 · el interruptor", () => {
  it("hoy está APAGADO: la pantalla de hoy hasta el «sí» de Daniel", () => {
    expect(CATALOGOS_APPLE_2026_10).toBe(false);
  });

  it("🔴 solo lo leen los archivos de pantalla, nunca el carrito, el checkout ni el envío", () => {
    const quienes = listar("src")
      .filter((p) => leer(p).includes("CATALOGOS_APPLE_2026_10"))
      .map((p) => p.split(path.sep).join("/"))
      .sort();
    expect(quienes).toEqual([
      "src/app/catalogos/marcas/page.tsx",
      "src/components/catalogo/CatalogoFilters.tsx",
      "src/components/catalogo/CatalogoVendedorPage.tsx",
      "src/lib/catalogo/catalogos-2026-10.ts",
    ]);
    // CatalogoFilters recibe la propuesta por prop (`apple`), y solo se la
    // pasa el catálogo interno: el público y Administrar no.
    for (const p of [
      "src/components/catalogo/CatalogoPublicoPage.tsx",
      "src/app/catalogos/admin/[marca]/AdminCatalogoClient.tsx",
    ]) {
      expect(leer(p), p).not.toMatch(/\bapple=/);
    }
    for (const p of [
      "src/components/catalogo/CheckoutClient.tsx",
      "src/components/catalogo/CatalogoStickyCartBar.tsx",
      "src/components/catalogo/LineasPedidoEditables.tsx",
      "src/components/catalogo/CatalogoProductCard.tsx",
      "src/lib/catalogo/carrito.ts",
      "src/lib/catalogo/precio.ts",
    ]) {
      expect(leer(p), p).not.toContain("catalogos-2026-10");
    }
  });
});

describe("2 · la cuenta de «Filtros»", () => {
  it("el orden de siempre no cuenta; otro orden suma uno", () => {
    expect(puestosConOrden(0, "relevancia")).toBe(0);
    expect(puestosConOrden(0, "")).toBe(0);
    expect(puestosConOrden(0, "precio-asc")).toBe(1);
    expect(puestosConOrden(2, "nombre-az")).toBe(3);
  });

  it("cerrado, en el celular solo se ven el buscador, «Filtros» y la cantidad", () => {
    const c = clasesBarraFiltros(false);
    expect(c.desplegables.startsWith("hidden ")).toBe(true);
    expect(c.precio.startsWith("hidden ")).toBe(true);
    expect(c.orden.startsWith("hidden ")).toBe(true);
    const a = clasesBarraFiltros(true);
    expect(a.desplegables.startsWith("hidden ")).toBe(false);
    expect(a.orden.startsWith("hidden ")).toBe(false);
  });
});

describe("3 · 🔴 los filtros mandan lo mismo con la propuesta y sin ella", () => {
  function montar(apple: boolean) {
    const cb = {
      onSearchChange: vi.fn(), onGenderChange: vi.fn(), onCategoryChange: vi.fn(),
      onSortByChange: vi.fn(), onClearAll: vi.fn(),
    };
    render(
      <CatalogoFilters
        marca="tommy"
        searchInput="EN0"
        gender=""
        category=""
        sortBy="relevancia"
        filteredCount={420}
        genderOptions={[{ value: "women", label: "Women" }, { value: "men", label: "Men" }]}
        categoryOptions={[{ value: "sneakers", label: "Sneakers" }]}
        apple={apple}
        {...cb}
      />,
    );
    return cb;
  }

  for (const apple of [false, true]) {
    it(`apple=${apple}: buscar, ordenar y limpiar llaman igual`, () => {
      const cb = montar(apple);
      fireEvent.change(screen.getByPlaceholderText(/Buscar/), { target: { value: "ABC" } });
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "precio-asc" } });
      fireEvent.click(screen.getByText("Limpiar filtros"));
      expect(cb.onSearchChange).toHaveBeenCalledWith("ABC");
      expect(cb.onSortByChange).toHaveBeenCalledWith("precio-asc");
      expect(cb.onClearAll).toHaveBeenCalledTimes(1);
      expect(screen.getByText("420 productos")).toBeTruthy();
      // Los mismos controles, ni uno de más: un solo buscador y un solo orden.
      expect(screen.getAllByRole("combobox")).toHaveLength(1);
      expect(screen.getAllByPlaceholderText(/Buscar/)).toHaveLength(1);
    });
  }
});

describe("4 · apagado = la pantalla de hoy, literal", () => {
  it("el catálogo interno conserva la fila del «hace X h» y el encabezado de hoy", () => {
    const v = leer("src/components/catalogo/CatalogoVendedorPage.tsx");
    expect(v).toContain('<div className="flex items-center justify-between gap-2 mb-4">');
    expect(v).toContain(") : theme.vendorShare.enHeader ? (");
  });
  it("el hub conserva los cuatro botones de hoy", () => {
    const h = leer("src/app/catalogos/marcas/page.tsx");
    expect(h).toContain("<div className={clasesBotonesDeLaMarca()}>");
  });
  it("los filtros de hoy conservan su fila", () => {
    const f = leer("src/components/catalogo/CatalogoFilters.tsx");
    expect(f).toContain('className="flex flex-wrap items-center justify-between gap-2"');
    expect(f).toContain("apple = false");
  });
});
