// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO — «TOTAL A PAGAR · Multifashion» = COMISIONES + BONOS (1-oct-2026).
// Daniel dijo «sí» al mockup: agosto 2026 decía $255.27 (solo comisiones) y se
// pagan $405.27 (+ $50 de Sheynee y $100 de la gerente Jennifer).
//
//   1. UNA función (`totalAPagarMultifashion`) para la barra y el Excel.
//   2. Mes cerrado: Comisiones $255.27 · Bonos $150.00 · Total $405.27.
//   3. Mes abierto: total = comisiones y no se dibuja desglose.
//   4. Solo Multifashion: nunca se suma con el total del grupo (barrido en
//      comisiones-celular.test.tsx).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: { from: vi.fn(), rpc: vi.fn() },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/comisiones",
  useSearchParams: () => new URLSearchParams(),
}));

import { render, screen, cleanup } from "@testing-library/react";
import { totalAPagarMultifashion } from "@/lib/multifashion/bono-linea";
import { filasExcelVendedoras, libroVendedoras } from "@/lib/multifashion/vendedoras-excel";
import { BarraTotalMultifashion } from "@/components/multifashion/VendedorasSubtab";
import type { BonosMultifashion, VendedoraDetalle } from "@/components/ventas/types";

afterEach(cleanup);

const fila = (nombre: string, comision: number, manager = false): VendedoraDetalle => ({
  nombre, tickets: 10, ventas: comision * 200, ticket_promedio: 20, comision, manager,
  top: false, delta_ventas_pct: null, delta_tickets_pct: null,
});

// Datos de prueba que reproducen agosto 2026: $255.27 de comisiones.
const FILAS: VendedoraDetalle[] = [
  fila("JENNIFER MIRANDA", 80, true),
  fila("SHEYNEE BATISTA", 55.53),
  fila("ANA PEREZ", 60),
  fila("LUISA GOMEZ", 59.74),
];

const AGOSTO: BonosMultifashion = {
  mes_evaluado: { year: 2026, mes: 8 }, es_elegible: true, fecha_max_data: "2026-09-22",
  ultimo_mes_elegible: { year: 2026, mes: 8 },
  gerente: { nombre: "JENNIFER MIRANDA", ventas_mes: 53193.56, ventas_mes_prev: 39453.49, delta_pct: 0.348, tiene_comparacion: true, bono: 100 },
  vendedoras: [
    { nombre: "SHEYNEE BATISTA", tickets: 1, ventas: 1, ticket_promedio: 1, manager: false, delta_ventas_pct: null, tiene_comparacion: false, bono_vendedora: true },
    { nombre: "ANA PEREZ", tickets: 1, ventas: 1, ticket_promedio: 1, manager: false, delta_ventas_pct: null, tiene_comparacion: false, bono_vendedora: false },
  ],
} as BonosMultifashion;

const ABIERTO: BonosMultifashion = { ...AGOSTO, mes_evaluado: { year: 2026, mes: 9 }, es_elegible: false };

const texto = (n: number) => `$${n.toFixed(2)}`;

describe("Total a pagar de Multifashion = comisiones + bonos", () => {
  it("agosto 2026 cerrado: $255.27 + $150.00 = $405.27", () => {
    const t = totalAPagarMultifashion(FILAS, AGOSTO);
    expect(texto(t.comisiones)).toBe("$255.27");
    expect(t.bonos).toBe(150);
    expect(texto(t.total)).toBe("$405.27");
  });

  it("mes abierto, rango o sin respuesta: total = comisiones", () => {
    for (const r of [ABIERTO, null, undefined]) {
      const t = totalAPagarMultifashion(FILAS, r);
      expect(t.bonos).toBe(0);
      expect(t.total).toBe(t.comisiones);
    }
  });

  it("la pantalla: dos renglones y el total grande (mes cerrado)", () => {
    render(<BarraTotalMultifashion pagar={totalAPagarMultifashion(FILAS, AGOSTO)} />);
    const desglose = document.querySelector("[data-desglose-multifashion]")!;
    expect(desglose.textContent).toMatch(/Comisiones\$255\.27/);
    expect(desglose.textContent).toMatch(/Bonos\$150\.00/);
    expect(document.querySelector("[data-total-multifashion]")!.textContent)
      .toBe("TOTAL A PAGAR · Multifashion$405.27");
  });

  it("la pantalla con el mes abierto: sin renglón «Bonos», total = comisiones", () => {
    render(<BarraTotalMultifashion pagar={totalAPagarMultifashion(FILAS, ABIERTO)} />);
    expect(screen.queryByText("Bonos")).toBeNull();
    expect(document.querySelector("[data-total-multifashion]")!.textContent).toContain("$255.27");
  });

  it("el Excel: columna «Bono» por fila y la fila final «Total a pagar» = $405.27", () => {
    const filas = filasExcelVendedoras(FILAS, AGOSTO);
    expect(filas.map((f) => f[7])).toEqual([100, 50, 0, 0]);
    expect(filas[1][8]).toBeCloseTo(105.53, 2);
    const ws = libroVendedoras({ filas: FILAS, periodo: "Agosto 2026", rotuloDelta: "Δ", bonos: AGOSTO }).Sheets.Vendedoras;
    const celdas = Object.values(ws).filter((c): c is { v: unknown } => typeof c === "object" && c != null && "v" in c);
    expect(celdas.some((c) => c.v === "Total a pagar")).toBe(true);
    expect(celdas.some((c) => typeof c.v === "number" && Math.abs(c.v - 405.27) < 0.001)).toBe(true);
  });

  it("pantalla y Excel usan la MISMA función", () => {
    const leer = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
    expect(leer("src/components/multifashion/VendedorasSubtab.tsx")).toContain("totalAPagarMultifashion(sortedVendedoras, bonosDelChip)");
    expect(leer("src/lib/multifashion/vendedoras-excel.ts")).toContain("totalAPagarMultifashion(e.filas, e.bonos)");
  });
});
