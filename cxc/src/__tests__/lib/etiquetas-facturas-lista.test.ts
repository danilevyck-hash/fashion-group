// Etiquetas › Nuevo envío: la fecha al lado de la factura (14-nov-2026).
import { describe, it, expect } from "vitest";
import { fechaDeLaFactura, separarRecientes } from "@/lib/guias/atajos-facturas";

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

describe("separarRecientes: más de 30 días, plegado en «Ver más»", () => {
  const f = (fecha: string) => ({ fecha });
  it("parte por fecha de factura en Panamá, sin reordenar", () => {
    const lista = [f("2026-11-12T15:00:00Z"), f("2026-10-15T15:00:00Z"), f("2026-10-14T15:00:00Z"), f("2026-03-04T15:00:00Z")];
    const { recientes, viejas } = separarRecientes(lista, "2026-11-14");
    expect(recientes).toEqual([lista[0], lista[1]]);
    expect(viejas).toEqual([lista[2], lista[3]]);
  });
  it("el borde del día es el de Panamá: 15-oct 03:00 UTC es 14-oct allá", () => {
    expect(separarRecientes([f("2026-11-12T15:00:00Z"), f("2026-10-15T03:00:00Z")], "2026-11-14").viejas).toHaveLength(1);
  });
  it("🔴 si ninguna es reciente no se esconde nada (la búsqueda de un número viejo)", () => {
    const lista = [f("2026-05-14T15:00:00Z"), f("2026-03-04T15:00:00Z")];
    expect(separarRecientes(lista, "2026-11-14")).toEqual({ recientes: lista, viejas: [] });
  });
});
