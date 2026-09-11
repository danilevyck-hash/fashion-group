/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CAJA — LAS FOTOS DEL RECIBO SE VEN CON EL PERÍODO CERRADO (11-sep-2026).
 *
 * 🩸 El menú «···» que las abre se dibujaba SOLO con el período abierto, así
 * que el único archivo de comprobantes del módulo quedaba inalcanzable apenas
 * se cerraba el ciclo — hoy 2 de los 3 períodos están cerrados. Y
 * `ZonaFotos soloVer={!isOpen}` era código muerto: esa condición no podía ser
 * `true`, porque sin el menú no había forma de abrir la zona.
 *
 * 🔴 CANDADO DE CONDUCTA: se renderiza la tabla y se lee el DOM. Un barrido de
 * texto no puede ver si un menú se dibuja.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, vi, afterEach } from "vitest";

// 🔴 EL DOBLE DEL ROUTER (11-sep-2026). La lista de gastos lleva buscador y su
// texto vive en la URL (`useUrlState`, `replace`), que llama a `useRouter()`:
// sin app router montado, jsdom tira «invariant expected app router to be
// mounted» antes de dibujar una sola fila. El doble devuelve una URL VACÍA a
// propósito — sin búsqueda escrita, la lista es la de siempre, que es lo que
// este candado mira.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/caja/p1",
  useSearchParams: () => new URLSearchParams(),
}));

import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import GastoTable from "@/app/caja/components/GastoTable";
import type { CajaGasto } from "@/app/caja/components/types";

afterEach(() => cleanup());

const GASTO: CajaGasto = {
  id: "g1",
  fecha: "2026-08-20",
  descripcion: "Taxi a la aduana",
  proveedor: "Uber",
  categoria: "Transporte",
  subtotal: 10,
  itbms: 0,
  total: 10,
  fotos: 2,
} as CajaGasto;

function montar(isOpen: boolean) {
  const onDeleteGasto = vi.fn();
  render(
    <GastoTable
      gastos={[GASTO]}
      isOpen={isOpen}
      categorias={["Transporte"]}
      editingGastoId={null}
      editGasto={{}}
      setEditingGastoId={vi.fn()}
      setEditGasto={vi.fn()}
      onSaveEdit={vi.fn()}
      onDeleteGasto={onDeleteGasto}
    />,
  );
  return { onDeleteGasto };
}

describe("🔴 en un período CERRADO el recibo se puede mirar", () => {
  it("🩸 el «···» existe (antes no se dibujaba y la foto era inalcanzable)", () => {
    montar(false);
    expect(screen.getAllByRole("button", { name: /Más opciones|opciones/i }).length).toBeGreaterThan(0);
  });

  it("🔴 y lleva UNA sola cosa: la foto del recibo", () => {
    montar(false);
    const menu = screen.getAllByRole("button", { name: /Más opciones|opciones/i })[0];
    fireEvent.click(menu);
    expect(screen.getByText(/Foto del recibo/)).toBeTruthy();
    expect(screen.queryByText("Editar")).toBeNull();
    expect(screen.queryByText("Eliminar")).toBeNull();
  });

  it("🔴 la tabla no se descuadra: mismas celdas en encabezado, fila y total", () => {
    montar(false);
    const tabla = document.querySelector("table")!;
    const enc = tabla.querySelectorAll("thead tr th").length;
    const filas = Array.from(tabla.querySelectorAll("tbody tr"));
    for (const tr of filas) {
      const celdas = tr.querySelectorAll("td").length;
      if (celdas === 0) continue;
      // Una celda con colSpan cuenta por lo que abarca.
      const abarca = Array.from(tr.querySelectorAll("td")).reduce(
        (s, td) => s + (Number(td.getAttribute("colSpan") ?? td.getAttribute("colspan")) || 1),
        0,
      );
      expect(abarca).toBe(enc);
    }
  });

  it("con el período ABIERTO no se perdió nada: las tres siguen", () => {
    montar(true);
    const menu = screen.getAllByRole("button", { name: /Más opciones|opciones/i })[0];
    fireEvent.click(menu);
    expect(screen.getByText("Editar")).toBeTruthy();
    expect(screen.getByText(/Foto del recibo/)).toBeTruthy();
    expect(screen.getByText("Eliminar")).toBeTruthy();
  });
});
