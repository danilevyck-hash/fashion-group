// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO — TODO PANEL DE PERÍODO LLEVA ‹ › (6-oct-2026).
//
// Daniel vio que en Comisiones v2, en la computadora, «Octubre 2026 ⌄» no tenía
// cómo ir al mes anterior sin abrir el panel; Multifashion y Ventas › Productos
// sí. Regla: «‹ Octubre 2026 ›» en TODAS las pantallas con el panel de período,
// y la › no aparece en el mes (o el año) en curso: nunca al futuro.
// Las ‹ › las dibuja el MISMO control (`ComisionesPeriodo`), así que Comisiones,
// Ventas › Resumen y Guías las heredan; Multifashion y Productos usan
// `PeriodoSelect` con sus vecinos. Solo la portada del celular de Comisiones
// dibuja las suyas (`conFlechas={false}`).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { readFileSync } from "fs";
import path from "path";

vi.mock("@/lib/fecha-panama", () => ({ hoyPanama: () => "2026-10-06" }));

import { ComisionesPeriodo, periodoVecino } from "@/components/comisiones/ComisionesPeriodo";
import { MES_TODO_EL_ANIO } from "@/lib/comisiones/periodo";

const leer = (rel: string) => readFileSync(path.join(process.cwd(), "src", rel), "utf8");
afterEach(cleanup);

const LIM = { minAnio: 2023, anioActual: 2026, mesActual: 10 };

describe("el período vecino", () => {
  it("un mes atrás y adelante, cruzando el año", () => {
    expect(periodoVecino(2026, 1, -1, LIM)).toEqual({ year: 2025, mes: 12 });
    expect(periodoVecino(2025, 12, 1, LIM)).toEqual({ year: 2026, mes: 1 });
  });
  it("🔴 nunca al futuro, ni antes del primer año", () => {
    expect(periodoVecino(2026, 10, 1, LIM)).toBeNull();
    expect(periodoVecino(2023, 1, -1, LIM)).toBeNull();
  });
  it("con «Todo el año» se mueve de año", () => {
    expect(periodoVecino(2026, MES_TODO_EL_ANIO, -1, LIM)).toEqual({ year: 2025, mes: MES_TODO_EL_ANIO });
    expect(periodoVecino(2026, MES_TODO_EL_ANIO, 1, LIM)).toBeNull();
  });
});

describe("‹ Octubre 2026 ›", () => {
  const anios = [2024, 2025, 2026];
  it("en el mes en curso: ‹ sí, › no", () => {
    render(<ComisionesPeriodo year={2026} mes={10} availableYears={anios} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Período anterior" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Período siguiente" })).toBeNull();
  });
  it("en un mes pasado: las dos", () => {
    render(<ComisionesPeriodo year={2026} mes={8} availableYears={anios} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Período anterior" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Período siguiente" })).toBeTruthy();
  });
  it("y el que ya dibuja las suyas puede apagarlas", () => {
    render(<ComisionesPeriodo year={2026} mes={8} availableYears={anios} onChange={() => {}} conFlechas={false} />);
    expect(screen.queryByRole("button", { name: "Período anterior" })).toBeNull();
  });
});

describe("🔴 ninguna pantalla con el panel se queda sin ‹ ›", () => {
  it("Comisiones (computadora v2), Ventas y Guías heredan las flechas: nadie las apaga", () => {
    for (const f of ["components/comisiones/ComisionesComputadoraV2.tsx", "app/ventas/VentasShell.tsx", "app/guias/page.tsx", "components/comisiones/ComisionesView.tsx"]) {
      const src = leer(f);
      expect(src, f).toContain("<ComisionesPeriodo");
      expect(src, f).not.toContain("conFlechas={false}");
    }
  });
  it("el celular de Comisiones dibuja las suyas, y por eso apaga las del control", () => {
    const portada = leer("components/comisiones/celular/PortadaComisionesCelular.tsx");
    expect(portada).toContain("conFlechas={false}");
    expect(portada).toContain("onClick={() => irA(anterior)}");
    expect(portada).toContain("onClick={() => irA(siguiente)}");
  });
  it("Multifashion y Ventas › Productos pasan sus vecinos al PeriodoSelect compacto", () => {
    for (const f of ["app/multifashion/MultifashionShell.tsx", "components/ventas/usePeriodoProductos.tsx"]) {
      const src = leer(f);
      const usos = src.split("<PeriodoSelect").slice(1);
      expect(usos.length, f).toBeGreaterThan(0);
      for (const u of usos) {
        const tag = u.slice(0, u.indexOf("/>"));
        if (!tag.includes("compacto")) continue;
        expect(tag, f).toContain("anterior={");
        expect(tag, f).toContain("siguiente={");
      }
    }
  });
});
