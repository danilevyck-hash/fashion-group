// CANDADO de RESUMEN_RANGO_2026_10 (Daniel, 5-oct-2026): Multifashion › Resumen
// también acepta «Rango de fechas», con la venta retail del rango contra los
// MISMOS días del año pasado, cortados en el último día cargado.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { TIPOS_POR_TAB, ajustarPeriodo } from "@/lib/multifashion/periodo";
import { RESUMEN_RANGO_2026_10, comparacionDelRango, corteDelRango, tramoDe } from "@/lib/multifashion/resumen-rango";

const FILAS = [
  { fecha: "2026-09-15", subtotal: 100 },
  { fecha: "2026-09-15", subtotal: -20 }, // nota de crédito: resta
  { fecha: "2026-09-20", subtotal: 50.005 },
  { fecha: "2026-10-01", subtotal: 999 }, // fuera del rango
];

describe("Resumen con rango", () => {
  it("prendido y el Resumen lo sirve sin moverse al mes", () => {
    expect(RESUMEN_RANGO_2026_10).toBe(true);
    expect(TIPOS_POR_TAB.resumen.rango).toBe(true);
    const r = { tipo: "rango" as const, desde: "2026-09-15", hasta: "2026-09-30" };
    expect(ajustarPeriodo(r, "resumen", { anio: 2026, mes: 10 })).toEqual(r);
  });
  it("suma por día, las NC restan y los tickets son las filas", () => {
    const t = tramoDe("2026-09-15", "2026-09-30", FILAS);
    expect(t.ventas).toBe(130.01);
    expect(t.tickets).toBe(3);
    expect(t.dias).toEqual([{ fecha: "2026-09-15", ventas: 80 }, { fecha: "2026-09-20", ventas: 50.01 }]);
  });
  it("compara contra los mismos días del año pasado, hasta el último día cargado", () => {
    expect(corteDelRango("2026-09-15", "2026-09-30", FILAS)).toBe("2026-09-20");
    expect(comparacionDelRango("2026-09-15", "2026-09-20")).toEqual({ desde: "2025-09-15", hasta: "2025-09-20" });
    expect(comparacionDelRango("2028-02-01", "2028-02-29")).toEqual({ desde: "2027-02-01", hasta: "2027-02-28" });
  });
  it("la ruta lee solo retail de la misma vista que el mes", () => {
    const ruta = readFileSync("src/app/api/multifashion/resumen-rango/route.ts", "utf8");
    expect(ruta).toContain('.from("_multifashion_sf_vw")');
    expect(ruta).toContain('.eq("is_wholesale", false)');
  });
});
