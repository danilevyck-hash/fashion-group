// Etiquetas › Nuevo envío: la fecha al lado de la factura (14-nov-2026).
import { describe, it, expect } from "vitest";
import { fechaDeLaFactura } from "@/lib/guias/atajos-facturas";

describe("fechaDeLaFactura", () => {
  it("sin año en el año actual", () => {
    expect(fechaDeLaFactura("2026-11-12T15:00:00Z", "2026-11-14")).toBe("12 nov");
  });
  it("con año si no es el actual", () => {
    expect(fechaDeLaFactura("2026-03-04T15:00:00Z", "2027-01-02")).toBe("4 mar 2026");
  });
  it("el día es el de Panamá, no el de UTC", () => {
    expect(fechaDeLaFactura("2026-01-01T03:00:00Z", "2026-11-14")).toBe("31 dic 2025");
  });
});
