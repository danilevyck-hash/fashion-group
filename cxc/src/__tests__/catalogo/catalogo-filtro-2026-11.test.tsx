// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO · La categoría como título del catálogo en el celular
// (`CATALOGO_FILTRO_2026_11`, 19-nov-2026, propuesta sin aprobar).
//   1. Nace APAGADO: con `false` la hoja «Filtros» sigue con su renglón
//      Categoría y no hay título.
//   2. Prendido: «Todas las categorías ▾» arriba; elegir manda el MISMO valor
//      que la hoja y la Categoría sale de la hoja (una sola puerta).
//   3. Con una sola categoría (Joybees: todo clogs) no hay título.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import CatalogoFilters from "@/components/catalogo/CatalogoFilters";
import * as ordenCelular from "@/lib/catalogo/orden-celular";

const estado = vi.hoisted(() => ({ prendido: false }));
vi.mock("@/lib/catalogo/orden-celular", async (orig) => {
  const real = await orig<typeof import("@/lib/catalogo/orden-celular")>();
  return { ...real, get CATALOGO_FILTRO_2026_11() { return estado.prendido; } };
});
afterEach(() => { cleanup(); estado.prendido = false; });

const CATS = [{ value: "", label: "Todas" }, { value: "sneakers", label: "Sneakers" }, { value: "boots", label: "Boots" }];

function pintar(onCategoryChange = vi.fn(), categoryOptions = CATS) {
  render(
    <CatalogoFilters
      marca="tommy" searchInput="" onSearchChange={vi.fn()}
      gender="" onGenderChange={vi.fn()} category="" onCategoryChange={onCategoryChange}
      sortBy="relevancia" onSortByChange={vi.fn()} filteredCount={10} onClearAll={vi.fn()}
      categoryOptions={categoryOptions}
    />,
  );
  return onCategoryChange;
}

describe("CATALOGO_FILTRO_2026_11", () => {
  it("nace apagado", async () => {
    const real = await vi.importActual<typeof ordenCelular>("@/lib/catalogo/orden-celular");
    expect(real.CATALOGO_FILTRO_2026_11).toBe(false);
  });

  it("apagado: sin título y la Categoría sigue en la hoja", () => {
    pintar();
    expect(document.querySelector("[data-titulo-categoria]")).toBeNull();
    fireEvent.click(document.querySelector("[data-boton-filtros]")!);
    expect(document.querySelector('[data-renglon-filtro="categoria"]')).not.toBeNull();
  });

  it("prendido: el título elige la categoría en un toque y la hoja ya no la ofrece", () => {
    estado.prendido = true;
    const cambiar = pintar();
    const titulo = document.querySelector("[data-titulo-categoria] button") as HTMLElement;
    expect(titulo.textContent).toContain("Todas las categorías");
    fireEvent.click(titulo);
    fireEvent.click(screen.getByRole("option", { name: "Sneakers" }));
    expect(cambiar).toHaveBeenCalledWith("sneakers");
    fireEvent.click(document.querySelector("[data-boton-filtros]")!);
    expect(document.querySelector('[data-renglon-filtro="categoria"]')).toBeNull();
  });

  it("prendido con una sola categoría: sin título", () => {
    estado.prendido = true;
    pintar(vi.fn(), [{ value: "", label: "Todas" }, { value: "clogs", label: "Clogs" }]);
    expect(document.querySelector("[data-titulo-categoria]")).toBeNull();
  });
});
