// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO — CUENTAS POR COBRAR «COMO LO HARÍA APPLE» NACE APAGADO (4-oct-2026).
//
// Propuesta detrás de `CXC_APPLE_2026_10` (lib/cxc/apple-2026-10.ts). Lo que
// este archivo sostiene:
//   1. Apagado, el celular y la computadora quedan como hoy.
//   2. Prendido, «Clientes +90 días» lleva los 5 con más saldo a +90 días y
//      «Otros clientes» el resto en su orden de siempre: nadie sale dos veces.
//   3. «+90 días» es 91-120 + 121 y más (la cuenta de Vista general), nunca
//      «vencido», y ningún total cambia.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import React from "react";

vi.mock("@/components/shared/LineaDeFrescura", () => ({ default: () => <span data-frescura>Actualizado 4:00 pm ↻</span> }));
vi.mock("@/components/shared/SyncStatus", () => ({ default: () => null }));
vi.mock("@/components/shared/SyncNowButton", () => ({ default: () => null }));

import PanelCxcCelular from "@/app/cxc/components/PanelCxcCelular";
import CabeceraCxcApple from "@/app/cxc/components/CabeceraCxcApple";
import { CXC_APPLE_2026_10, opcionesActualizarCxc, partirPorAtencion, saldoMas90 } from "@/lib/cxc/apple-2026-10";
import { B2B_COMPANIES } from "@/lib/companies";
import type { ConsolidatedClient } from "@/lib/types";

afterEach(cleanup);

function cli(nombre: string, current: number, watch: number, overdue: number): ConsolidatedClient {
  const total = current + watch + overdue;
  return {
    nombre_normalized: nombre.toUpperCase(),
    companies: {
      vistana: {
        nombre, codigo: `D-${nombre.length}${nombre.charCodeAt(0)}`,
        d0_30: current, d31_60: 0, d61_90: 0, d91_120: watch,
        d121_180: overdue, d181_270: 0, d271_365: 0, mas_365: 0, total,
      },
    },
    correo: "", telefono: "", celular: "", contacto: "",
    total, current, watch, overdue,
    d0_30: current, d31_60: 0, d61_90: 0, d91_120: watch, d121_plus: overdue,
    hasOverride: false,
  } as ConsolidatedClient;
}

// Siete con +90 días, uno al día y uno a favor.
const CARTERA = [
  cli("Alfa", 1000, 0, 0),
  cli("Beta", 0, 100, 0),
  cli("Gama", 0, 0, 700),
  cli("Delta", 50, 300, 300),
  cli("Epsilon", 0, 0, 200),
  cli("Zeta", 0, 50, 0),
  cli("Eta", 0, 0, 900),
  cli("Theta", 0, 10, 0),
  cli("A favor", -500, 0, 0),
];

describe("CXC_APPLE_2026_10", () => {
  it("nace apagado", () => {
    expect(CXC_APPLE_2026_10).toBe(false);
  });

  it("apagado, la computadora conserva la frescura y «Actualizar ahora» de la fila de filtros", () => {
    const page = fs.readFileSync(path.join(process.cwd(), "src/app/cxc/page.tsx"), "utf8");
    expect(page).toMatch(/\{!CXC_APPLE_2026_10 && \(\s*<SyncStatus/);
    expect(page).toMatch(/\{!CXC_APPLE_2026_10 && \(\s*<SyncNowButton/);
    expect(page).toMatch(/\{CXC_APPLE_2026_10 && \(\s*<CabeceraCxcApple/);
  });
});

describe("las reglas", () => {
  it("+90 días = 91-120 + 121 y más", () => {
    expect(saldoMas90(cli("x", 1, 2, 3))).toBe(5);
  });

  it("arriba los 5 con más saldo a +90 días; abajo el resto en su orden; nadie dos veces", () => {
    const { atencion, resto } = partirPorAtencion(CARTERA);
    expect(atencion.map((c) => c.nombre_normalized)).toEqual(["ETA", "GAMA", "DELTA", "EPSILON", "BETA"]);
    expect(resto.map((c) => c.nombre_normalized)).toEqual(["ALFA", "ZETA", "THETA", "A FAVOR"]);
    expect(atencion.length + resto.length).toBe(CARTERA.length);
  });

  it("«Actualizar»: la empresa que se mira, o las 6 del grupo una tras otra", () => {
    expect(opcionesActualizarCxc("vistana")).toEqual([{ modulo: "estadocuenta", empresa: "vistana" }]);
    const todas = opcionesActualizarCxc("all");
    expect(todas).toHaveLength(6);
    expect(todas.every((o) => o.modulo === "estadocuenta")).toBe(true);
    expect(todas.map((o) => o.empresa)).not.toContain("confecciones_boston");
  });
});

function celular(apple: boolean, extra: Partial<React.ComponentProps<typeof PanelCxcCelular>> = {}) {
  return render(
    <PanelCxcCelular
      filtered={CARTERA}
      roleClients={CARTERA}
      cxcCompanies={B2B_COMPANIES}
      search=""
      setSearch={() => {}}
      riskFilter="all"
      setRiskFilter={() => {}}
      companyFilter="all"
      setCompanyFilter={() => {}}
      onCobrar={() => {}}
      diasSinPagarDe={() => 10}
      canExport
      onDescargar={() => {}}
      empresaRestriction={null}
      onBoston={null}
      apple={apple}
      {...extra}
    />,
  );
}

describe("el celular", () => {
  it("apagado: una sola lista y la línea de siempre", () => {
    const { container } = celular(false);
    expect(container.querySelector("[data-seccion-cxc]")).toBeNull();
    expect(container.querySelector("[data-linea-cxc-apple]")).toBeNull();
    expect(container.querySelectorAll('[data-lista="cxc-celular"]')).toHaveLength(1);
  });

  it("prendido: «+90 días $X · Actualizado …» y dos secciones sin repetir a nadie", () => {
    const { container } = celular(true);
    const linea = container.querySelector("[data-linea-cxc-apple]")!;
    // 100 + 700 + 600 + 200 + 50 + 900 + 10 = 2,560
    expect(linea.textContent).toContain("+90 días $2,560");
    expect(linea.textContent).toContain("Actualizado");
    expect(linea.textContent).not.toMatch(/vencid/i);
    const arriba = container.querySelector('[data-seccion-cxc="Clientes +90 días"]') as HTMLElement;
    const abajo = container.querySelector('[data-seccion-cxc="Otros clientes"]') as HTMLElement;
    expect(within(arriba).getAllByRole("listitem")).toHaveLength(5);
    expect(within(abajo).getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getAllByText("Eta")).toHaveLength(1);
  });

  it("prendido con una búsqueda: una sola lista, como hoy", () => {
    const { container } = celular(true, { search: "a" });
    expect(container.querySelector("[data-seccion-cxc]")).toBeNull();
  });
});

describe("la computadora", () => {
  it("el total grande y el +90 días salen del mismo universo que la tira", () => {
    render(<CabeceraCxcApple clientes={CARTERA} companyFilter="all" onSuccess={() => {}} />);
    // 1000+100+700+650+200+50+900+10-500 = 3,110
    expect(screen.getByText("$3,110.00")).toBeTruthy();
    expect(screen.getByText("+90 días $2,560.00")).toBeTruthy();
    expect(screen.getByText(/9 clientes/)).toBeTruthy();
  });
});
