// ─────────────────────────────────────────────────────────────────────────────
// Error n.º 40 de los videos (16-nov-2026) — Ventas › Resumen, computadora.
//
// Con «Utilidad» prendido la columna «Proyección» seguía pintando la proyección
// de VENTAS al lado de montos de utilidad. No existe una proyección de utilidad
// (la de venta sale de la RPC con ritmo + estacionalidad de la VENTA): inventarla
// sería una regla de negocio nueva. Por eso en modo Utilidad la columna NO se
// dibuja; en modo Ventas sigue igual y con el MISMO número.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { ResumenView, MODO_OPCIONES } from "@/components/ventas/ResumenView";
import type { VentasResumen, ProyeccionResp } from "@/components/ventas/types";



vi.mock("@/lib/hooks/useAuth", () => ({
  useAuth: () => ({ authChecked: true, role: "admin", userName: "Daniel" }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/ventas",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/shared/SyncNowButton", () => ({
  default: () => <button type="button">Actualizar ahora</button>,
}));
const exportResumenToExcel = vi.fn(async (_data: unknown, _modo: unknown) => {});
vi.mock("@/lib/ventas/excel", () => ({
  exportResumenToExcel: (data: unknown, modo: unknown) => exportResumenToExcel(data, modo),
}));
const logActivityClient = vi.fn((_p: unknown) => {});
vi.mock("@/lib/logActivityClient", () => ({ logActivityClient: (p: unknown) => logActivityClient(p) }));

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false) as never;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {} unobserve() {} disconnect() {}
  };
});
beforeEach(() => {
  exportResumenToExcel.mockClear();
  logActivityClient.mockClear();
  vi.stubGlobal("fetch", vi.fn(async () => (
    { ok: true, status: 200, json: async () => ({}) } as unknown as Response
  )));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// Vistana, el 11-sep-2026, con los números medidos: venta de septiembre hasta
// hoy $60.956,10; costo hasta el 10 $43.548,58; venta hasta el 10 $56.418,00.
// Utilidad ya viene con el corte aplicado (así la manda `queries.ts`).
const V_SEP = 60_956.10, C_SEP = 43_548.58, V_HASTA = 56_418;
const U_SEP = V_HASTA - C_SEP; // 12.869,42 → margen 22,8 %

const meses = (v: number, sep: number) => Array.from({ length: 12 }, (_, i) => (i < 8 ? v : i === 8 ? sep : null));

const PROYECCION = {
  anio: 2026, fecha_corte: "2026-09-11", mes_corte: 9, peso_ritmo: 0.75, peso_historico: 0.25,
  empresas: [{
    empresa: "vistana", nombre: "Vistana", ventas_ytd: 1_298_151.79, ventas_prev_ytd_sp: 1_190_000,
    ventas_prev_year: 2_340_000, cierre_anio_anterior: 2_340_000, delta_vs_anio_anterior: 214_382,
    delta_vs_anio_anterior_pct: 0.09, ritmo_actual: 1.09, ritmo_historico: 1.05, historia_disponible: 3,
    frac_ytd_estacional: 0.51, algoritmo: "estacional", factor_final: 1.09, proyeccion_cierre: 2_554_382,
    proyeccion_restante: 1_256_230, es_fallback_lineal: false, status: "verde",
  }],
  totales_grupo: {
    ventas_ytd: 1_298_151.79, proyeccion_cierre: 2_554_382, proyeccion_restante: 1_256_230,
    cierre_anio_anterior_total: 2_340_000, delta_vs_anio_anterior_total: 214_382,
    delta_vs_anio_anterior_pct: 0.09, status: "verde",
  },
} as unknown as ProyeccionResp;

function resumen(over: Partial<VentasResumen> = {}): VentasResumen {
  return {
    year: 2026,
    mesActual: 9,
    kpis: {
      ventasNetasYTD: 1_298_151.79, ventas2025YTD: 1_190_000,
      utilidadYTD: 360_000, utilidad2025YTD: 330_000,
      margenYTD: 0.279, margen2025YTD: 0.27,
    },
    empresas: [{
      empresa: { id: "vistana", nombre: "Vistana International", tipo: "b2b" },
      ventas2026: meses(150_000, V_SEP),
      ventas2025: meses(140_000, 98_000),
      ventasPrevFull: Array(12).fill(190_000),
      utilidad2026: meses(45_000, U_SEP),
      utilidad2025: meses(40_000, 28_000),
      ventasParaMargen: meses(150_000, V_HASTA),
      costoHasta: "2026-09-10",
      margenPct: 0.279, margenPctPrev: 0.27,
    }],
    es_periodo_parcial: true,
    fecha_corte: "2026-09-11",
    dia_corte_anio_anterior: "2025-09-11",
    data_actualizada_at: "2026-09-11T15:00:00Z",
    proyeccion: PROYECCION,
    corte_costo: "2026-09-10",
    ...over,
  };
}

function pintar(datos = resumen(), cerrado = false) {
  return render(
    <ResumenView data={datos} multi={null} selectedYear={datos.year} isClosedYear={cerrado} loading={false} error={null} />,
  );
}

/** La matriz del escritorio (el celular también está montado en jsdom). */
const matriz = () => document.querySelector(".min-\\[1440px\\]\\:block") as HTMLElement;
const tabsDe = (raiz: HTMLElement) => [...raiz.querySelectorAll('[role="tab"]')].map(t => (t.textContent ?? "").trim());


describe("#40 · la columna Proyección es de VENTAS", () => {
  it("en Ventas se dibuja con la proyección de siempre ($2,55M de Vistana)", () => {
    pintar();
    const th = matriz().querySelector('th[data-col-fija="proyeccion"]');
    expect(th).not.toBeNull();
    const fila = [...matriz().querySelectorAll("tbody tr")].find(tr => /Vistana/.test(tr.textContent ?? ""))!;
    expect(fila.textContent).toMatch(/2[.,]55\s?M|2[.,]554[.,]382/);
  });
  it("en Utilidad la columna no está (ni el encabezado ni las celdas)", () => {
    pintar();
    fireEvent.click(screen.getAllByRole("tab", { name: "Utilidad" })[0]);
    expect(matriz().querySelector('th[data-col-fija="proyeccion"]')).toBeNull();
    expect(matriz().textContent).not.toMatch(/2[.,]55\s?M|2[.,]554[.,]382/);
  });
});
