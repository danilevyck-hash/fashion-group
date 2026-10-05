// 🔴 CANDADO (Daniel, 5-oct-2026, Multifashion › Productos en la computadora):
// «Calvin Klein ✕ · Accessories ✕ · Hombre ✕ · Men-Bags ✕» y tocar la ✕ no hacía
// nada. El ::before absoluto de CHIP_V4 (el toque de 44 px) tapaba la ✕ y el clic
// caía en el chip, que abría su lista. La ✕ va POSICIONADA encima (relative z-[1])
// y quita solo ese filtro; los que dependían de él y quedan sin opción se sueltan.

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ChipLista } from "@/components/productos/FiltrosProductos";
import { podarElegidos, type ArticuloVendido } from "@/lib/productos/filtros";

describe("la ✕ de un chip", () => {
  it("queda encima del ::before del chip y quita solo ese filtro", () => {
    const onCambiar = vi.fn();
    render(<ChipLista etiqueta="Marca" valor="Calvin Klein" opciones={[{ valor: "Calvin Klein", etiqueta: "Calvin Klein" }]} onCambiar={onCambiar} />);
    const x = screen.getByRole("button", { name: "Quitar Marca" });
    expect(x.className).toMatch(/\brelative\b/);
    expect(x.className).toMatch(/\bz-\[1\]/);
    fireEvent.click(x);
    expect(onCambiar).toHaveBeenCalledWith("");
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});

const art = (codigo: string, marca: string, departamento: string, genero: string, descripcion: string): ArticuloVendido => ({
  codigo, descripcion, unidades: 1, venta: 10, costo: 5, campos: { marca, departamento, genero, descripcion },
});
const ARTS = [
  art("A1", "Calvin Klein", "Accessories", "Hombre", "Men-Bags"),
  art("A2", "Calvin Klein", "Underwear", "Mujer", "Women-Bras"),
  art("B1", "Tommy Hilfiger", "Accessories", "Hombre", "Men-Bags"),
  art("B2", "Tommy Hilfiger", "Menswear", "Hombre", "Men-Polos"),
];

describe("podarElegidos", () => {
  const todos = { marca: "Calvin Klein", departamento: "Accessories", genero: "Hombre", descripcion: "Men-Bags" };
  it("quitar uno deja los demás si siguen siendo válidos", () => {
    expect(podarElegidos(ARTS, "", { ...todos, marca: "" }, "marca"))
      .toEqual({ departamento: "Accessories", genero: "Hombre", descripcion: "Men-Bags" });
  });
  it("cambiar uno suelta los que quedan sin opción", () => {
    expect(podarElegidos(ARTS, "", { marca: "Tommy Hilfiger", departamento: "Underwear", genero: "Mujer" }, "marca"))
      .toEqual({ marca: "Tommy Hilfiger" });
  });
});
