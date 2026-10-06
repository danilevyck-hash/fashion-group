// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO — EL DETALLE DEL VENDEDOR, v3 (6-oct-2026). APAGADO.
// Ver `lib/comisiones/detalle-v3.ts`. Sostiene: el interruptor nace apagado;
// arriba el título en una línea, el total grande y «Comisión de ventas · de
// cobros»; cada documento en dos renglones SIN tabla (nada se desliza de lado);
// la nota de crédito con su chip; «Sin cobros en el período»; la línea del pie;
// lo que se quitó no vuelve; Enviar + UN Descargar; y ningún número cambia.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import {
  COMISIONES_DETALLE_V3_2026_10,
  baseSinCentavos,
  lineaDeComisiones,
  lineaDelPie,
  rotuloFactura,
  tituloDelDetalle,
} from "@/lib/comisiones/detalle-v3";
import { ComisionesDetalleModal } from "@/components/comisiones/ComisionesDetalleModal";

/** Edwin en Vistana, octubre 2026 (medido): una factura y dos notas de crédito. */
const DETALLE = {
  empresa_key: "vistana", year: 2026, mes: 10, vendedor: "EDWIN",
  tasa_venta: 0.005, tasa_cobro: 0.005, ventas_base: 16098.5, cobros_base: 0,
  comision_venta: 80.49, comision_cobro: 0, comision_total: 80.49,
  ventas: [
    { fecha: "2026-10-01", cliente: "Jerusalem Duty Free", secuencial: "16-000123", tipo: "Factura", subtotal: 16144.5, pct_utilidad: 32.1 },
    { fecha: "2026-10-01", cliente: "Wolf Mall Center", secuencial: "17-000045", tipo: "Nota de Crédito", subtotal: -17, pct_utilidad: null },
    { fecha: "2026-10-05", cliente: "City Paso Canoas", secuencial: "17-000046", tipo: "Nota de Crédito", subtotal: -29, pct_utilidad: null },
  ],
  cobros: [],
};

beforeEach(() => {
  vi.stubGlobal("fetch", async (url: string) => {
    const body = String(url).includes("/detalle") ? DETALLE : { descuentos: [] };
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const abrir = async () => {
  render(<ComisionesDetalleModal inline v2 v3 empresa="vistana" empresaNombre="Vistana" year={2026} mes={10} vendedor="EDWIN" onClose={() => {}} />);
  const hoja = document.querySelector("[data-detalle-v3]") as HTMLElement;
  await waitFor(() => expect(within(hoja).getAllByText("Jerusalem Duty Free").length).toBe(1));
  return hoja;
};

describe("el interruptor", () => {
  it("nace APAGADO", () => expect(COMISIONES_DETALLE_V3_2026_10).toBe(false));
});

describe("los textos", () => {
  it("arriba: título en una línea y «Comisión de ventas · de cobros»", () => {
    expect(tituloDelDetalle("Edwin", "Vistana", "Octubre 2026")).toBe("Edwin · Vistana · Octubre 2026");
    expect(lineaDeComisiones(80.49, 0)).toBe("Comisión de ventas $80.49 · de cobros $0.00");
  });
  it("al pie: las tasas sobre las bases, sin centavos", () => {
    expect(lineaDelPie(DETALLE)).toBe("0.50% de $16,099 en ventas · 0.50% de $0 en cobros");
    expect(baseSinCentavos(-1500.4)).toBe("−$1,500");
  });
  it("la factura dice su número; la nota de crédito, solo el número (el chip dice qué es)", () => {
    expect(rotuloFactura("16-000123", false)).toBe("Factura N° 16-000123");
    expect(rotuloFactura("17-000045", true)).toBe("N° 17-000045");
    expect(rotuloFactura("", false)).toBe("");
  });
});

describe("la pantalla", () => {
  it("el total grande es el mismo de hoy, y la línea gris dice QUÉ comisión es", async () => {
    const hoja = await abrir();
    expect(within(hoja).getByText("Edwin · Vistana · Octubre 2026")).toBeTruthy();
    expect(hoja.querySelector("[data-total-detalle]")!.textContent).toBe("$80.49");
    expect(within(hoja).getByText("Comisión de ventas $80.49 · de cobros $0.00")).toBeTruthy();
  });

  it("🔴 sin tabla: cada documento en dos renglones, y la nota de crédito con su chip", async () => {
    const hoja = await abrir();
    expect(hoja.querySelector("table")).toBeNull();
    expect(hoja.querySelectorAll("[data-renglon-venta]")).toHaveLength(3);
    expect(within(hoja).getAllByText("Nota de crédito")).toHaveLength(2);
    // La comisión de la línea es la de siempre (`comisionLinea`).
    expect(within(hoja).getByText("Comisión $80.72")).toBeTruthy();
  });

  it("sin cobros: UNA línea gris", async () => {
    const hoja = await abrir();
    expect(hoja.querySelectorAll("[data-renglon-cobro]")).toHaveLength(0);
    expect(within(hoja).getByText("Sin cobros en el período")).toBeTruthy();
  });

  it("al pie, una sola línea; lo repetido se fue", async () => {
    const hoja = await abrir();
    expect(hoja.querySelector("[data-pie-detalle]")!.textContent).toBe("0.50% de $16,099 en ventas · 0.50% de $0 en cobros");
    for (const t of [/TOTAL VENTAS \+ COBROS/i, /^Resumen$/, /Switch no envía el número de recibo/, /COMISIÓN TOTAL/]) {
      expect(within(hoja).queryByText(t)).toBeNull();
    }
  });

  it("Enviar es la acción principal y hay UN Descargar", async () => {
    const hoja = await abrir();
    expect(within(hoja).getByRole("button", { name: /Enviar/ })).toBeTruthy();
    expect(within(hoja).getAllByRole("button", { name: /^Descargar/ })).toHaveLength(1);
  });

  it("no queda tapado por el encabezado pegajoso", async () => {
    const hoja = await abrir();
    expect(hoja.style.scrollMarginTop).toContain("--fg-altura-encabezado");
  });
});
