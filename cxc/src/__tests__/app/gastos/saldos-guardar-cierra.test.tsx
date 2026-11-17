// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO — Gastos › Saldos de banco: «Guardar saldo» cierra el formulario
// (16-nov-2026, error de los videos #33).
//
// 🩸 Al guardar, la recarga traía la carga de HOY y el formulario —que seguía
// abierto con la fecha de hoy— pasaba solo a «Corregir» con «Vas a corregir el
// saldo del…». Ahora al guardar la fila se cierra y muestra el saldo nuevo al
// instante (UI optimista); si el servidor falla, vuelve lo de antes y la fila
// se reabre con lo escrito.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { SWRConfig } from "swr";
import { ToastProvider } from "@/components/ToastSystem";
import SaldosBancoTab from "@/app/gastos-contabilidad/components/saldos/SaldosBancoTab";
import { historialPorEmpresa, type FilaSaldo } from "@/lib/saldos-banco/historial";
import { hoyISO } from "@/app/gastos-contabilidad/components/saldos/types";

let filas: FilaSaldo[] = [];
let postFalla = false;
const respuesta = () => {
  const h = historialPorEmpresa(filas);
  return { bancos: [...h.values()].map((c) => c[0]), historial: Object.fromEntries(h) };
};

beforeEach(() => {
  filas = [{ empresa_key: "confecciones_boston", saldo: 1000, fecha_dato: "2026-11-01" }];
  postFalla = false;
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      if (postFalla) return { ok: false, status: 500, json: async () => ({ ok: false }) };
      const b = JSON.parse(String(init.body));
      filas = [...filas.filter((f) => !(f.empresa_key === b.empresa_key && f.fecha_dato === b.fecha_dato)), b];
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    }
    return { ok: true, status: 200, json: async () => respuesta() };
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function pintar() {
  await act(async () => {
    render(
      <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
        <ToastProvider><SaldosBancoTab apple /></ToastProvider>
      </SWRConfig>,
    );
  });
  await screen.findByText("$1,000.00");
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Boston/ })); });
  const input = screen.getByPlaceholderText("0.00");
  fireEvent.change(input, { target: { value: "2500" } });
}

describe("#33 Saldos de banco — guardar", () => {
  it("cierra el formulario, no queda en «Corregir» y la fila trae el saldo nuevo", async () => {
    await pintar();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Guardar saldo" })); });
    const fila = () => screen.getByRole("button", { name: /Boston/ });
    await vi.waitFor(() => expect(fila().textContent).toContain("$2,500.00"));
    expect(screen.queryByRole("button", { name: "Corregir" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Guardar saldo" })).toBeNull();
    expect(screen.queryByText(/Vas a corregir/)).toBeNull();
    expect(screen.getByRole("button", { name: /Boston/ }).getAttribute("aria-expanded")).toBe("false");
    expect(filas.find((f) => f.fecha_dato === hoyISO())?.saldo).toBe(2500);
  });

  it("si el servidor falla, vuelve el saldo de antes y la fila se reabre con lo escrito", async () => {
    postFalla = true;
    await pintar();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Guardar saldo" })); });
    await screen.findByText(/No se pudo guardar/);
    expect(screen.getByRole("button", { name: /Boston/ }).textContent).toContain("$1,000.00");
    expect((screen.getByPlaceholderText("0.00") as HTMLInputElement).value).toMatch(/2,?500/);
  });
});
