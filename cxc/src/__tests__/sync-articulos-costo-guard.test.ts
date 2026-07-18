// Tests del guard-rail de costos del sync de artículos (incidente 18-jul-2026:
// decimal perdido en Switch → costo $2,365M en un día reventó el margen de
// Vista General). Umbrales: costo_total > $500k o costo unitario > $5,000.
import { describe, it, expect } from "vitest";
import { esCostoSospechoso } from "@/lib/switch-api/costo-guard";

describe("esCostoSospechoso", () => {
  it("acepta filas normales (costo razonable)", () => {
    expect(esCostoSospechoso(2365.41, 1000)).toBe(false);
    expect(esCostoSospechoso(20975.5, 3227)).toBe(false);
    expect(esCostoSospechoso(0, 0)).toBe(false);
  });

  it("rechaza la fila del incidente real (Boston 0806)", () => {
    expect(esCostoSospechoso(2365410000, 1000)).toBe(true);
  });

  it("rechaza costo_total > $500k aunque el unitario sea bajo", () => {
    expect(esCostoSospechoso(500_000.01, 1_000_000)).toBe(true);
  });

  it("rechaza costo unitario > $5,000 aunque el total sea bajo", () => {
    expect(esCostoSospechoso(10_001, 2)).toBe(true);
  });

  it("respeta los límites exactos (no sospechoso en el borde)", () => {
    expect(esCostoSospechoso(500_000, 200)).toBe(false); // total = tope, unitario 2,500
    expect(esCostoSospechoso(5_000, 1)).toBe(false); // unitario = tope
  });

  it("con cantidad 0 solo aplica el tope de total (sin división por cero)", () => {
    expect(esCostoSospechoso(400_000, 0)).toBe(false);
    expect(esCostoSospechoso(600_000, 0)).toBe(true);
  });
});
