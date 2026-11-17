// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO — APAGAR UN DESCUENTO MUEVE LA TABLA Y «TOTAL A PAGAR» SIN RECARGAR
// (error #7 de los videos, 16-nov-2026).
//
// 🩸 El interruptor del descuento vive en el detalle (`ComisionesDetalleModal`),
// con su estado local. Al apagarlo, el detalle restaba bien, pero la celda de la
// tabla, el pie y el «Total a pagar» (que salen de `onResumen`) seguían con el
// número viejo hasta recargar la página.
//
// 🔴 El NÚMERO no cambia: lo sigue neteando el servidor UNA vez
// (`netearComisiones`). Lo que se corrige es CUÁNDO se vuelve a leer: el detalle
// avisa (`onCambio`) y la vista vuelve a pedir con la MISMA función de siempre.
// Por eso aquí se compara contra una vista recién montada con el mismo servidor.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, within, fireEvent } from "@testing-library/react";
import { ComisionesPorEmpresaView } from "@/components/comisiones/ComisionesPorEmpresaView";
import { ComisionesConsolidadoView } from "@/components/comisiones/ComisionesConsolidadoView";
import type { ResumenDelTotal } from "@/lib/comisiones/apple-v2";

const REINALDO = "REINALDO ESPINOSA";
const BRUTO = 2859.65;
const DESCUENTO = 1573.08;

/** El «servidor»: un descuento que se prende y se apaga. */
let descuentoActivo = true;

/** Lo que devuelve `/api/ventas/comisiones` (ya neteado, como `netearComisiones`). */
function respuestaEmpresa() {
  const desc = descuentoActivo ? DESCUENTO : 0;
  return {
    empresa_key: "fashion_shoes", year: 2026, mes: 7,
    vendedores: [{
      vendedor: REINALDO,
      base: 90276, tasa: 0.01, comision: 902.76,
      base_cobro: 195688.53, tasa_cobro: 0.01, comision_cobro: 1956.89,
      comision_total: Math.round((BRUTO - desc) * 100) / 100,
      descuento: desc,
    }],
  };
}

const DETALLE = {
  empresa_key: "fashion_shoes", year: 2026, mes: 7, vendedor: REINALDO,
  tasa_venta: 0.01, tasa_cobro: 0.01, ventas_base: 90276, cobros_base: 195688.53,
  comision_venta: 902.76, comision_cobro: 1956.89, comision_total: BRUTO,
  ventas: [], cobros: [],
};

/** Un almacén en memoria (el `localStorage` de jsdom no siempre está). */
const almacen = (): Storage => {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k), clear: () => m.clear(), key: () => null,
    get length() { return m.size; },
  };
};

beforeEach(() => {
  descuentoActivo = true;
  Object.defineProperty(window, "localStorage", { value: almacen(), configurable: true, writable: true });
  Object.defineProperty(window, "sessionStorage", { value: almacen(), configurable: true, writable: true });
  sessionStorage.setItem("cxc_role", "admin");
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const u = String(url);
    let body: unknown = {};
    if (u.includes("/descuentos")) {
      if (init?.method === "POST") descuentoActivo = JSON.parse(String(init.body)).activo;
      body = { descuentos: [{ id: "d1", concepto: "Adelanto", monto: DESCUENTO, activo: descuentoActivo }] };
    } else if (u.includes("/detalle")) body = DETALLE;
    else if (u.includes("/consolidado")) body = { empresas: [respuestaEmpresa()] };
    else if (u.startsWith("/api/ventas/comisiones?")) body = respuestaEmpresa();
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

/** Apaga el descuento desde el detalle abierto. */
async function apagarDescuento() {
  const caja = await waitFor(() => {
    const c = document.querySelector<HTMLInputElement>('input[type="checkbox"]:checked');
    expect(c).toBeTruthy();
    return c!;
  });
  fireEvent.click(caja);
}

describe("🔴 #7 — apagar un descuento refresca la tabla y el total, sin recargar", () => {
  it("Por empresa: la celda, el pie y «Total a pagar» pasan de $1,286.57 a $2,859.65", async () => {
    let resumen: ResumenDelTotal | null = null;
    render(<ComisionesPorEmpresaView empresa="fashion_shoes" year={2026} mes={7} onResumen={(r) => { resumen = r; }} />);
    const tabla = await screen.findByRole("table");
    await waitFor(() => expect(resumen?.total).toBe(1286.57)); // ANTES

    const fila = within(tabla).getAllByRole("row").find((r) => r.getAttribute("data-se-paga"))!;
    fireEvent.click(fila);
    await apagarDescuento();

    await waitFor(() => expect(resumen?.total).toBe(BRUTO)); // DESPUÉS, sin recargar
    expect(within(screen.getByRole("table")).getAllByText("$2,859.65").length).toBeGreaterThan(0);
    // El detalle sigue abierto (la recarga es silenciosa).
    expect(document.querySelector('input[type="checkbox"]')).toBeTruthy();

    // 🔴 El número es el MISMO que da una vista recién montada con el mismo servidor.
    cleanup();
    let fresco: ResumenDelTotal | null = null;
    render(<ComisionesPorEmpresaView empresa="fashion_shoes" year={2026} mes={7} onResumen={(r) => { fresco = r; }} />);
    await waitFor(() => expect(fresco?.total).toBe(BRUTO));
  });

  it("Todas las empresas: el total del período pasa de $1,286.57 a $2,859.65", async () => {
    let total: number | null = null;
    render(<ComisionesConsolidadoView year={2026} mes={7} onTotal={(t) => { total = t; }} />);
    await waitFor(() => expect(total).toBe(1286.57)); // ANTES
    const celda = await screen.findByTitle(/Ver detalle · /);
    fireEvent.click(celda);
    await apagarDescuento();
    await waitFor(() => expect(total).toBe(BRUTO)); // DESPUÉS, sin recargar
    expect(document.querySelector('input[type="checkbox"]')).toBeTruthy();
  });
});
