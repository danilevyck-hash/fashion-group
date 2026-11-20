// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO · «Filtrar» del catálogo en el celular (`CATALOGO_FILTRO_2026_11`,
// 19-nov-2026, propuesta sin aprobar).
//   1. Nace APAGADO y apagado es la pantalla de hoy (ícono + hoja «Filtros»).
//   2. Prendido: el botón dice «Filtrar»; tocar una categoría aplica y CIERRA
//      (2 toques); queda «Sneakers ✕» y el botón dice «Filtrar (1)».
//   3. Género se aplica sin cerrar; la ✕ de la hoja cierra.
//   4. Una sola categoría (Joybees): sin sección Categoría.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { useState } from "react";
import CatalogoFilters from "@/components/catalogo/CatalogoFilters";
import type * as OrdenCelular from "@/lib/catalogo/orden-celular";

const estado = vi.hoisted(() => ({ prendido: false }));
vi.mock("@/lib/catalogo/orden-celular", async (orig) => {
  const real = await orig<typeof OrdenCelular>();
  return { ...real, get CATALOGO_FILTRO_2026_11() { return estado.prendido; } };
});
afterEach(() => { cleanup(); estado.prendido = false; });

const CATS = [{ value: "", label: "Todas" }, { value: "sneakers", label: "Sneakers" }, { value: "boots", label: "Boots" }];
const GENS = [{ value: "", label: "Todos" }, { value: "women", label: "Women" }, { value: "men", label: "Men" }];

function Pantalla({ categorias = CATS }: { categorias?: typeof CATS }) {
  const [category, setCategory] = useState("");
  const [gender, setGender] = useState("");
  return (
    <CatalogoFilters
      marca="tommy" searchInput="" onSearchChange={vi.fn()}
      gender={gender} onGenderChange={setGender} category={category} onCategoryChange={setCategory}
      sortBy="relevancia" onSortByChange={vi.fn()} filteredCount={10}
      onClearAll={() => { setCategory(""); setGender(""); }}
      categoryOptions={categorias} genderOptions={GENS}
    />
  );
}
const hoja = () => document.querySelector("[data-hoja-filtrar]") as HTMLElement | null;
const boton = () => document.querySelector("[data-boton-filtrar]") as HTMLElement;

describe("CATALOGO_FILTRO_2026_11", () => {
  it("nace apagado", async () => {
    const real = await vi.importActual<typeof OrdenCelular>("@/lib/catalogo/orden-celular");
    expect(real.CATALOGO_FILTRO_2026_11).toBe(false);
  });

  it("apagado: la pantalla de hoy (ícono y hoja «Filtros»)", () => {
    render(<Pantalla />);
    expect(document.querySelector("[data-boton-filtrar]")).toBeNull();
    expect(document.querySelector("[data-boton-filtros]")).not.toBeNull();
  });

  it("prendido: «Filtrar» → «Sneakers» aplica y cierra; queda «Sneakers ✕» y «Filtrar (1)»", () => {
    estado.prendido = true;
    render(<Pantalla />);
    expect(boton().textContent).toBe("Filtrar");
    fireEvent.click(boton());
    fireEvent.click(within(hoja()!).getByRole("radio", { name: "Sneakers" }));
    expect(hoja()).toBeNull();
    expect(boton().textContent).toBe("Filtrar (1)");
    const chip = document.querySelector('[data-filtro-puesto="categoria"]') as HTMLElement;
    expect(chip.textContent).toContain("Sneakers");
    fireEvent.click(chip);
    expect(document.querySelector("[data-filtro-puesto]")).toBeNull();
    expect(boton().textContent).toBe("Filtrar");
  });

  it("prendido: el género se aplica sin cerrar y la ✕ cierra", () => {
    estado.prendido = true;
    render(<Pantalla />);
    fireEvent.click(boton());
    fireEvent.click(within(hoja()!).getByRole("radio", { name: "Women" }));
    expect(hoja()).not.toBeNull();
    fireEvent.click(within(hoja()!).getAllByRole("button", { name: "Cerrar" }).at(-1)!);
    expect(hoja()).toBeNull();
    expect(screen.getByRole("button", { name: "Quitar Women" })).toBeTruthy();
  });

  it("una sola categoría: sin sección Categoría", () => {
    estado.prendido = true;
    render(<Pantalla categorias={[{ value: "", label: "Todas" }, { value: "clogs", label: "Clogs" }]} />);
    fireEvent.click(boton());
    expect(hoja()!.querySelector('[data-seccion="categoria"]')).toBeNull();
    expect(hoja()!.querySelector('[data-seccion="genero"]')).not.toBeNull();
  });
});
