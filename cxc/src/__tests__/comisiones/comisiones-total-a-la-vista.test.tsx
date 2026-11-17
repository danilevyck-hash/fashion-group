// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO — LA COLUMNA TOTAL DE COMISIONES NO SALE DE LA VISTA (16-nov-2026,
// dudoso n.º 8 de los videos). Medido a 1440 px con la barra lateral abierta:
// al prender «Mostrar no pagables», la celda «Oficina (sin vendedor) · No
// pagable» en una sola línea forzada hacía la tabla de 1.262 px en una tarjeta
// de 1.138, y el Total (right = 1.533 px) quedaba fuera de la pantalla, sin
// aviso. Dos reglas:
//   1 · El nombre del vendedor CEDE (se parte en dos líneas); el monto nunca.
//       Ninguna celda de nombre lleva `whitespace-nowrap`, en ningún ancho.
//   2 · La columna Total va PEGADA a la derecha de la tarjeta (`sticky right-0`)
//       en cabecera, filas y pie: si la tabla igual no cabe (1366 y 1280 con la
//       barra lateral), lo que se desliza son las empresas, no el Total.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { ComisionesConsolidadoView } from "@/components/comisiones/ComisionesConsolidadoView";

const fila = (vendedor: string, comision_total: number, se_paga: boolean, descuento = 0) => ({
  vendedor, base: comision_total * 200, base_cobro: comision_total * 180, comision_total, descuento, se_paga, clientes_sin_comision: [],
});
/** Datos de ejemplo (ningún monto real): dos pagables y los dos que no se pagan. */
const CONSOLIDADO = {
  empresas: [
    { empresa_key: "vistana", vendedores: [fila("REYNALDO ESPINOSA", 2001.25, true), fila("DEFAULT", 2550, false), fila("DANIEL LEVY", 1500, false)] },
    { empresa_key: "fashion_shoes", vendedores: [fila("REYNALDO ESPINOSA", 1286.57, true, 1573.08), fila("MARIA FERNANDA GONZALEZ", 315, true, 120)] },
  ],
};

beforeEach(() => {
  vi.stubGlobal("fetch", async () =>
    new Response(JSON.stringify(CONSOLIDADO), { status: 200, headers: { "content-type": "application/json" } }),
  );
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function abrirConNoPagables() {
  render(<ComisionesConsolidadoView year={2026} mes={10} v2 />);
  await waitFor(() => expect(screen.getAllByText("Reynaldo Espinosa").length).toBeGreaterThan(0));
  fireEvent.click(screen.getAllByRole("button", { name: /Mostrar no pagables/ })[0]);
  const tabla = document.querySelector("table") as HTMLTableElement;
  await waitFor(() => expect(tabla.textContent).toContain("Oficina (sin vendedor)"));
  return tabla;
}

describe("1 · el nombre cede, el monto nunca", () => {
  it("ninguna celda de nombre fuerza una sola línea, tampoco la de «Oficina (sin vendedor) · No pagable»", async () => {
    const tabla = await abrirConNoPagables();
    const nombres = [...tabla.querySelectorAll("tbody tr[data-se-paga] td:first-child")];
    expect(nombres.length).toBe(4);
    for (const td of nombres) expect(td.className).not.toMatch(/whitespace-nowrap/);
    const oficina = nombres.find((td) => td.textContent?.includes("Oficina (sin vendedor)"));
    expect(oficina?.textContent).toContain("No pagable");
  });
});

describe("2 · la columna Total va pegada a la derecha", () => {
  it("cabecera, cada fila y el pie llevan `sticky right-0`", async () => {
    const tabla = await abrirConNoPagables();
    const th = [...tabla.querySelectorAll("thead th")].at(-1) as HTMLElement;
    expect(th.textContent).toBe("Total");
    expect(th.className).toMatch(/\bsticky\b/);
    expect(th.className).toMatch(/\bright-0\b/);
    const filas = [...tabla.querySelectorAll("tbody tr[data-se-paga]")];
    expect(filas.length).toBe(4);
    for (const tr of filas) {
      const total = tr.querySelector("td:last-child") as HTMLElement;
      expect(total.className).toMatch(/\bsticky\b/);
      expect(total.className).toMatch(/\bright-0\b/);
    }
    const pie = tabla.querySelector("tfoot td:last-child") as HTMLElement;
    expect(pie.className).toMatch(/\bsticky\b/);
    expect(pie.className).toMatch(/\bright-0\b/);
  });

  it("y ningún número cambia: el pie sigue sumando solo lo pagable", async () => {
    const tabla = await abrirConNoPagables();
    // Reynaldo 2001.25 + 1286.57 + María 315 = 3602.82; Oficina y Daniel no entran.
    expect(tabla.querySelector("tfoot td:last-child")?.textContent).toBe("$3,602.82");
  });
});
