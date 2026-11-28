// Candado del margen ESTIMADO de hoy en la tarjeta del día de Multifashion
// (`MULTIFASHION_MARGEN_ESTIMADO_2026_11`). Cuadre contra producción:
// scripts/_verif-multifashion-margen-estimado.ts (14–27 nov 2026: máx 3,24 pts).
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: {} }));
import { MULTIFASHION_MARGEN_ESTIMADO_2026_11 } from "@/lib/ui/multifashion-margen-estimado-2026-11";
import { estimarMargen, notaDeCobertura } from "@/lib/multifashion/margen-estimado";
import { TarjetaDelDia } from "@/components/multifashion/TarjetaDelDia";
import type { DiaDeLaTarjeta } from "@/lib/multifashion/tarjeta-dia";

const costos = new Map([[1, 6], [2, 20], [3, 0]]);

describe("margen estimado de hoy (Multifashion)", () => {
  it("está prendido", () => expect(MULTIFASHION_MARGEN_ESTIMADO_2026_11).toBe(true));

  it("venta − cantidad × costo actual; las NC restan y las ND no entran", () => {
    const r = estimarMargen([
      { articuloId: 1, tipo: "TQ", cantidad: 10, venta: 100 },
      { articuloId: 1, tipo: "NC", cantidad: 1, venta: 10 },
      { articuloId: 2, tipo: "ND", cantidad: 5, venta: 999 },
    ], costos);
    expect(r?.margen).toBeCloseTo((90 - 54) / 90);
    expect(r?.cobertura).toBe(1);
  });

  it("lo que no tiene costo sale de la cuenta y se DICE, nunca se inventa", () => {
    const r = estimarMargen([
      { articuloId: 1, tipo: "TQ", cantidad: 10, venta: 80 },
      { articuloId: 3, tipo: "TQ", cantidad: 1, venta: 10 },
      { articuloId: 9, tipo: "FA", cantidad: 1, venta: 10 },
    ], costos);
    expect(r?.margen).toBeCloseTo((80 - 60) / 80);
    expect(r?.cobertura).toBeCloseTo(0.8);
    expect(notaDeCobertura(r!.cobertura)).toBe("estimado sobre el 80 % de la venta");
    expect(notaDeCobertura(1)).toBeNull();
  });

  it("sin venta o sin ningún costo: null (la tarjeta dice «mañana»)", () => {
    expect(estimarMargen([], costos)).toBeNull();
    expect(estimarMargen([{ articuloId: 9, tipo: "TQ", cantidad: 1, venta: 10 }], costos)).toBeNull();
  });

  const dia = (p: Partial<DiaDeLaTarjeta>): DiaDeLaTarjeta => ({
    fecha: "2026-11-28", equivalente: "2025-11-29", esHoy: true, venta: 1000, tickets: 10, ventaPrevia: 900,
    ticketsPrevios: 9, hayHistoriaPrevia: true, margen: null, margenEstimado: false, cobertura: null, horas: Array(24).fill(0), ...p,
  });
  const pintar = (d: DiaDeLaTarjeta) =>
    render(React.createElement(TarjetaDelDia, { fecha: d.fecha, esHoy: d.esHoy, estado: { status: "listo", datos: d }, onCerrar: () => {} }));

  it("la tarjeta de hoy dice «estimado»; sin estimado sigue «mañana»", () => {
    const { unmount } = pintar(dia({ margen: 0.34, margenEstimado: true, cobertura: 0.87 }));
    expect(screen.getByText("estimado")).toBeTruthy();
    expect(screen.getByText("estimado sobre el 87 % de la venta")).toBeTruthy();
    unmount();
    pintar(dia({}));
    expect(screen.getByText("mañana")).toBeTruthy();
  });
});
