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
//       barra lateral), lo que se desliza son las empresas, no el Total. Y
//       cuando tapa algo lo DICE: la sombra a su izquierda sale solo mientras
//       el contenedor tenga columnas debajo (medido con scroll + tamaño).
//   3 · La 1.ª columna y el Total van con `px-3` también en xl: con `xl:px-4`
//       sobraban 16 px y «Reynaldo Espinosa» se partía en dos líneas a 1440.
//       El chip «No pagable» es `inline-block whitespace-nowrap`: el nombre se
//       parte ANTES del chip y el chip nunca por dentro.
// Medido después del arreglo, con los no pagables a la vista: 1440 → tabla
// 1.138 = tarjeta, Joystep entero, sin sombra; 1366 → Total tapa 24 px con
// sombra; 1280 → tapa 110 px con sombra.
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
  const celdasTotal = (tabla: HTMLTableElement) => [
    [...tabla.querySelectorAll("thead th")].at(-1) as HTMLElement,
    ...[...tabla.querySelectorAll("tbody tr[data-se-paga]")].map((tr) => tr.querySelector("td:last-child") as HTMLElement),
    tabla.querySelector("tfoot td:last-child") as HTMLElement,
  ];

  it("cabecera, cada fila y el pie llevan `sticky right-0`, con `px-3` y sin `xl:px-4`", async () => {
    const tabla = await abrirConNoPagables();
    const celdas = celdasTotal(tabla);
    expect(celdas.length).toBe(6);
    expect(celdas[0].textContent).toBe("Total");
    for (const c of celdas) {
      expect(c.className).toMatch(/\bsticky\b/);
      expect(c.className).toMatch(/\bright-0\b/);
      expect(c.className).toMatch(/\bpx-3\b/);
      expect(c.className).not.toMatch(/xl:px-4/);
    }
    for (const td of tabla.querySelectorAll("tbody tr[data-se-paga] td:first-child")) {
      expect(td.className).not.toMatch(/xl:px-4/);
    }
  });

  it("la sombra sale SOLO mientras haya columnas debajo del Total", async () => {
    const tabla = await abrirConNoPagables();
    const wrap = tabla.parentElement as HTMLDivElement;
    expect(wrap.className).toContain("overflow-x-auto");
    // jsdom no mide: scrollWidth = clientWidth = 0 → nada debajo → sin sombra.
    expect(wrap.dataset.desliza).toBe("no");
    for (const c of celdasTotal(tabla)) expect(c.className).not.toMatch(/shadow-\[/);
    // La tabla no cabe (1366 con la barra lateral): 1.016 px en 993.
    Object.defineProperty(wrap, "scrollWidth", { value: 1016, configurable: true });
    Object.defineProperty(wrap, "clientWidth", { value: 993, configurable: true });
    fireEvent.scroll(wrap);
    await waitFor(() => expect(wrap.dataset.desliza).toBe("si"));
    for (const c of celdasTotal(tabla)) expect(c.className).toMatch(/shadow-\[-8px_0_8px_-8px/);
    // Deslizada hasta el final: ya no hay nada debajo → la sombra se va.
    Object.defineProperty(wrap, "scrollLeft", { value: 23, configurable: true, writable: true });
    fireEvent.scroll(wrap);
    await waitFor(() => expect(wrap.dataset.desliza).toBe("no"));
    for (const c of celdasTotal(tabla)) expect(c.className).not.toMatch(/shadow-\[/);
  });

  it("el chip «No pagable» baja entero: inline-block y nowrap", async () => {
    const tabla = await abrirConNoPagables();
    const chips = [...tabla.querySelectorAll("tbody td:first-child span")].filter((s) => s.textContent === "No pagable");
    expect(chips.length).toBe(2);
    for (const c of chips) expect(c.className).toMatch(/\binline-block\b.*\bwhitespace-nowrap\b|\bwhitespace-nowrap\b.*\binline-block\b/);
  });

  it("y ningún número cambia: el pie sigue sumando solo lo pagable", async () => {
    const tabla = await abrirConNoPagables();
    // Reynaldo 2001.25 + 1286.57 + María 315 = 3602.82; Oficina y Daniel no entran.
    expect(tabla.querySelector("tfoot td:last-child")?.textContent).toBe("$3,602.82");
  });
});
