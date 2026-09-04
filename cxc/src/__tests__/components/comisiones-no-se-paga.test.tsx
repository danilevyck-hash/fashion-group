// ─────────────────────────────────────────────────────────────────────────────
// LA FILA QUE SE VE PERO NO SE PAGA — pintada, en las dos pestañas y el Excel.
//
// 🩸 Daniel, 3-sep-2026: «se queda sin pagar, pero qué importa? Acuérdate que
// si yo cobro no le pago a nadie porque no me autopago». Desde que el cobro
// se paga a quien REGISTRÓ el recibo (comision_b2b_v6), DEFAULT (la oficina)
// y Daniel juntan comisión de cobro de verdad. Se calcula y se muestra, pero el
// pie de la tabla suma SOLO lo pagable. Que el endpoint marque `se_paga` no
// prueba que la pantalla lo pinte ni que el Excel lo respete: acá se montan las
// vistas REALES y se lee lo que el navegador habría mostrado.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";

const excelRecibido: {
  resumen?: { vendedores: { vendedor: string; comision_total: number; se_paga?: boolean }[] };
  consolidado?: { vendedores: { vendedor: string; total: number; se_paga?: boolean }[]; sinAsignar?: { se_paga?: boolean } | null };
} = {};

vi.mock("@/lib/ventas/comisionExcel", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ventas/comisionExcel")>()),
  exportComisionesResumen: async (r: never) => { excelRecibido.resumen = r; },
  exportComisionesConsolidado: async (c: never) => { excelRecibido.consolidado = c; },
}));

import { ComisionesPorEmpresaView } from "@/components/ventas/ComisionesPorEmpresaView";
import { ComisionesConsolidadoView } from "@/components/ventas/ComisionesConsolidadoView";
import { buildComisionesResumenSheet, buildComisionesConsolidadoSheet } from "@/lib/ventas/comisionExcel";
import type { ExcelApi } from "@/components/ventas/ComisionesView";

const fila = (vendedor: string, cobro: number, se_paga: boolean) => ({
  vendedor,
  base: 0, tasa: 0.005, comision: 0,
  base_cobro: cobro * 200, tasa_cobro: 0.005, comision_cobro: cobro,
  comision_total: cobro, descuento: 0, se_paga,
});

/** Lo que devuelven las rutas REALES desde el 3-sep-2026: `se_paga` por vendedor. */
const POR_EMPRESA = {
  empresa_key: "vistana", year: 2026, mes: 7, regla_cobro: "quien_registro",
  vendedores: [fila("EDWIN", 100, true), fila("DEFAULT", 40, false), fila("DANIEL LEVY", 25, false)],
};
const CONSOLIDADO = {
  empresas: [
    { empresa_key: "vistana", regla_cobro: "quien_registro", vendedores: POR_EMPRESA.vendedores },
    { empresa_key: "fashion_wear", regla_cobro: "quien_registro", vendedores: [fila("REINALDO ESPINOSA", 300, true), fila("DEFAULT", 7, false)] },
  ],
};

beforeEach(() => {
  delete excelRecibido.resumen;
  delete excelRecibido.consolidado;
  try { localStorage.setItem("fg_last_comision_empresa", "vistana"); } catch {}
  vi.stubGlobal("fetch", async (url: string) => {
    const body = String(url).includes("/consolidado") ? CONSOLIDADO : POR_EMPRESA;
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const filasMarcadas = (tabla: HTMLElement, valor: "si" | "no") =>
  within(tabla).getAllByRole("row").filter((r) => r.getAttribute("data-se-paga") === valor);

describe("🔴 Por empresa: la fila se ve, dice «no se paga» y el pie no la suma", () => {
  it("DEFAULT y Daniel salen con su número y la marca", async () => {
    render(<ComisionesPorEmpresaView year={2026} mes={7} />);
    const tabla = await screen.findByRole("table");
    const sinPago = filasMarcadas(tabla, "no");
    expect(sinPago).toHaveLength(2);
    for (const r of sinPago) expect(within(r).getByText("no se paga")).toBeTruthy();
    // La oficina se llama por su nombre, no «Sin asignar».
    expect(within(tabla).getByText("Oficina (DEFAULT)")).toBeTruthy();
    expect(within(tabla).queryByText("Sin asignar")).toBeNull();
    // La plata se ve: $40.00 y $25.00 están en la tabla.
    expect(within(tabla).getAllByText("$40.00").length).toBeGreaterThan(0);
    expect(within(tabla).getAllByText("$25.00").length).toBeGreaterThan(0);
  });

  it("el pie dice «Total a pagar» y suma solo a Edwin ($100.00), no $165.00", async () => {
    render(<ComisionesPorEmpresaView year={2026} mes={7} />);
    const tabla = await screen.findByRole("table");
    const pie = within(tabla).getByText("Total a pagar").closest("tr")!;
    expect(within(pie).getAllByText("$100.00").length).toBeGreaterThan(0);
    expect(within(pie).queryByText("$165.00")).toBeNull();
  });

  it("a quien sí se le paga no le aparece la marca", async () => {
    render(<ComisionesPorEmpresaView year={2026} mes={7} />);
    const tabla = await screen.findByRole("table");
    const [edwin] = filasMarcadas(tabla, "si");
    expect(within(edwin).queryByText("no se paga")).toBeNull();
  });

  it("el Excel de esa vista recibe la marca y su Total suma solo lo pagable", async () => {
    let api: ExcelApi | null = null;
    render(<ComisionesPorEmpresaView year={2026} mes={7} onExcel={(a) => { api = a; }} />);
    await screen.findByRole("table");
    api!.run();
    await vi.waitFor(() => expect(excelRecibido.resumen).toBeTruthy());
    const ws = await buildComisionesResumenSheet({
      empresaKey: "vistana", empresaNombre: "Vistana", year: 2026, mes: 7,
      vendedores: excelRecibido.resumen!.vendedores as never,
    });
    const celdas = Object.entries(ws).filter(([k]) => !k.startsWith("!")).map(([, c]) => (c as { v: unknown }).v);
    expect(celdas).toContain("Oficina (DEFAULT) (no se paga)");
    // Capitalizado desde el 3-sep-2026 («si capitiliza reynaldo»): la celda
    // del nombre se muestra «Daniel Levy», la marca sigue pegada.
    expect(celdas).toContain("Daniel Levy (no se paga)");
    expect(celdas).not.toContain("DANIEL LEVY (no se paga)");
    expect(celdas).toContain("Total a pagar");
    // La fila de totales: Com. Total = 100 (no 165). Se busca la fila cuyo A es "Total a pagar".
    const filaTotal = Object.entries(ws).find(([k, c]) => /^A\d+$/.test(k) && (c as { v: unknown }).v === "Total a pagar")![0].slice(1);
    expect((ws[`F${filaTotal}`] as { v: number }).v).toBe(100);
  });
});

describe("🔴 Todas las empresas: la matriz marca las filas y el pie suma lo pagable", () => {
  it("Daniel y la oficina llevan la marca; Edwin y Reinaldo no", async () => {
    render(<ComisionesConsolidadoView year={2026} mes={7} />);
    const tabla = await screen.findByRole("table");
    const sinPago = filasMarcadas(tabla, "no");
    // DANIEL LEVY + la fila única de la oficina (DEFAULT de las dos empresas junta).
    expect(sinPago).toHaveLength(2);
    expect(within(tabla).getByText("Oficina (DEFAULT)")).toBeTruthy();
    for (const r of sinPago) expect(within(r).getByText("no se paga")).toBeTruthy();
    expect(filasMarcadas(tabla, "si")).toHaveLength(2);
  });

  it("el pie: vistana $100.00, fashion_wear $300.00, total $400.00 — sin los $72 de DEFAULT ni los $25 de Daniel", async () => {
    render(<ComisionesConsolidadoView year={2026} mes={7} />);
    const tabla = await screen.findByRole("table");
    const pie = within(tabla).getByText("Total a pagar").closest("tr")!;
    const textos = within(pie).getAllByRole("cell").map((c) => c.textContent);
    expect(textos).toContain("$100.00");
    expect(textos).toContain("$300.00");
    expect(textos).toContain("$400.00");
    expect(textos).not.toContain("$472.00");
  });

  it("el Excel consolidado recibe la marca en las filas y en la oficina", async () => {
    let api: ExcelApi | null = null;
    render(<ComisionesConsolidadoView year={2026} mes={7} onExcel={(a) => { api = a; }} />);
    await screen.findByRole("table");
    api!.run();
    await vi.waitFor(() => expect(excelRecibido.consolidado).toBeTruthy());
    const c = excelRecibido.consolidado!;
    expect(c.vendedores.find((v) => v.vendedor === "DANIEL LEVY")?.se_paga).toBe(false);
    expect(c.vendedores.find((v) => v.vendedor === "EDWIN")?.se_paga).toBe(true);
    expect(c.sinAsignar?.se_paga).toBe(false);
    const ws = await buildComisionesConsolidadoSheet({
      year: 2026, mes: 7,
      empresas: [{ key: "vistana", nombre: "Vistana" }, { key: "fashion_wear", nombre: "Fashion Wear" }],
      vendedores: c.vendedores as never,
      sinAsignar: c.sinAsignar as never,
    });
    const filaTotal = Object.entries(ws).find(([k, cell]) => /^A\d+$/.test(k) && (cell as { v: unknown }).v === "Total a pagar")![0].slice(1);
    expect((ws[`D${filaTotal}`] as { v: number }).v).toBe(400);
  });
});
