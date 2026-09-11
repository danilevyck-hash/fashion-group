// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CON «TODO EL AÑO» Y UNA EMPRESA, LA FILA NO ABRE EL DETALLE (11-sep-2026).
//
// 🩸 La matriz de Fashion Group tenía el candado `conDetalle = !esTodoElAnio(mes)`
// y la vista de una empresa no tenía ninguno: tocar una fila abría el detalle y
// mostraba el error crudo del servidor «mes inválido (1..12)», mientras el pie
// seguía diciendo «Toca para ver el detalle». Se monta la vista REAL en los dos
// períodos y se mira qué pasa al tocar.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within, fireEvent } from "@testing-library/react";
import { ComisionesPorEmpresaView } from "@/components/comisiones/ComisionesPorEmpresaView";
import { MES_TODO_EL_ANIO } from "@/lib/comisiones/periodo";
import { nombreVendedorEnPantalla } from "@/lib/comisiones/alias";

const RESPUESTA = {
  empresa_key: "vistana", year: 2026, mes: 0,
  vendedores: [{ vendedor: "EDWIN", base: 1000, tasa: 0.005, comision: 5, base_cobro: 200, tasa_cobro: 0.005, comision_cobro: 1, comision_total: 6, descuento: 0 }],
};

const llamadas: string[] = [];
beforeEach(() => {
  llamadas.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    llamadas.push(String(url));
    return new Response(JSON.stringify(RESPUESTA), { status: 200, headers: { "content-type": "application/json" } });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function filaDeEdwin() {
  const tabla = await screen.findByRole("table");
  const fila = within(tabla).getAllByRole("row").find((r) => within(r).queryByText(nombreVendedorEnPantalla("EDWIN")));
  expect(fila).toBeTruthy();
  return fila!;
}

describe("🔴 «Todo el año» + una empresa", () => {
  it("la fila no se ofrece como tocable, tocarla no abre nada, y el pie dice «Elige un mes»", async () => {
    render(<ComisionesPorEmpresaView empresa="vistana" year={2026} mes={MES_TODO_EL_ANIO} />);
    const fila = await filaDeEdwin();
    expect(fila.getAttribute("title")).toBeNull();
    expect(fila.className).not.toContain("cursor-pointer");
    fireEvent.click(fila);
    expect(screen.queryByText(/mes inválido/)).toBeNull();
    expect(screen.queryByText(/Reporte detallado|Descargar el detalle/)).toBeNull();
    // ni una sola lectura del detalle
    expect(llamadas.some((u) => u.includes("/api/ventas/comisiones/detalle"))).toBe(false);
    expect(screen.getByText("Elige un mes para ver el detalle")).toBeTruthy();
    expect(screen.queryByText("Toca para ver el detalle")).toBeNull();
  });

  it("⚠️ CONTROL: con un mes, la fila sigue tocable y el pie dice «Toca para ver el detalle»", async () => {
    render(<ComisionesPorEmpresaView empresa="vistana" year={2026} mes={7} />);
    const fila = await filaDeEdwin();
    expect(fila.getAttribute("title")).toBe("Ver reporte detallado");
    expect(fila.className).toContain("cursor-pointer");
    expect(screen.getByText("Toca para ver el detalle")).toBeTruthy();
  });
});
