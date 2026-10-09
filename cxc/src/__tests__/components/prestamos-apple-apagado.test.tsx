// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO — `PRESTAMOS_APPLE_2026_10` APAGADO = ASISTENCIA › PRÉSTAMOS DE
// HOY, BYTE POR BYTE (9-oct-2026).
//
// Monta la pestaña con tres fichas (una sin colaborador asignado) en la
// computadora y compara el HTML entero contra
// `__snapshots__/prestamos-apple-apagado…`, sacado con el `PrestamosTab.tsx` de
// `origin/main` ANTES de traer el rediseño. Prendido, se pone rojo, y el bloque
// de abajo dice qué trae la propuesta.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const interruptor = vi.hoisted(() => ({ prendido: false }));
vi.mock("@/lib/prestamos-apple-2026-10", async (orig) => ({
  ...(await orig<typeof import("@/lib/prestamos-apple-2026-10")>()),
  get PRESTAMOS_APPLE_2026_10() { return interruptor.prendido; },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/asistencia",
  useSearchParams: () => new URLSearchParams("tab=prestamos"),
}));
vi.mock("@/components/ui/RangoFechas", () => ({ __esModule: true, default: () => <div />, ultimoRango: () => null }));

import { render, screen, cleanup, act } from "@testing-library/react";
import { ToastProvider } from "@/components/ToastSystem";
import PrestamosTab from "@/app/asistencia/PrestamosTab";

const FICHAS = {
  puedeAnotar: true,
  fichas: [
    { id: "a", codigo: "22", nombre: "ALEJANDRA CAMAÑO", saldo: 100, saldoPrestamo: 100, saldoDano: 0, empresa: "vistana", cuota: 25, cuotaDano: 0, yaDescontado: 0 },
    { id: "b", codigo: "16", nombre: "ANDREA PEREZ", saldo: 300, saldoPrestamo: 250, saldoDano: 50, empresa: "vistana", cuota: 50, cuotaDano: 10, yaDescontado: 0 },
    { id: "c", codigo: null, nombre: "BRICEIDA MONTERO", saldo: 80, saldoPrestamo: 80, saldoDano: 0, empresa: "vistana", cuota: 20, cuotaDano: 0, yaDescontado: 0 },
  ],
};

async function montar() {
  let v: ReturnType<typeof render> | undefined;
  await act(async () => { v = render(<ToastProvider><PrestamosTab desde="2026-10-01" hasta="2026-10-15" /></ToastProvider>); });
  await screen.findAllByText(/Andrea Perez/);
  return v!.container;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes("/api/asistencia/prestamos-deuda")) return { ok: true, status: 200, json: async () => FICHAS } as Response;
    return { ok: true, status: 200, json: async () => ({}) } as Response;
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); interruptor.prendido = false; });

describe("Préstamos — interruptor APAGADO = la pantalla de hoy", () => {
  it("la lista de deuda: HTML idéntico al de origin/main", async () => {
    expect((await montar()).innerHTML).toMatchSnapshot();
  });
});

describe("Préstamos — interruptor PRENDIDO = la propuesta", () => {
  it("arriba, Saldo total y Próximo descuento; el conteo se va", async () => {
    interruptor.prendido = true;
    const c = await montar();
    const arriba = c.querySelector("[data-saldo-total-prestamos]")!;
    expect(arriba.textContent).toMatch(/Saldo total\$480\.00/);
    // préstamo 25 + 50 + 20, daño 10 = 105
    expect(arriba.textContent).toMatch(/Próximo descuento\s*\$105\.00/);
    expect(c.textContent).not.toMatch(/colaboradores con saldo/);
  });
  it("la ficha sin colaborador asignado va primero; después, el saldo mayor", async () => {
    interruptor.prendido = true;
    const c = await montar();
    const texto = c.textContent ?? "";
    const i = (n: string) => texto.indexOf(n);
    expect(i("Briceida Montero")).toBeLessThan(i("Andrea Perez"));
    expect(i("Andrea Perez")).toBeLessThan(i("Alejandra Camaño"));
  });
});
