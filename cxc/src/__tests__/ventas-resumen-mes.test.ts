import { describe, expect, it } from "vitest";
import { cifrasDelMes, delPeriodo, mesValido, rotuloDelPeriodo, RESUMEN_MES_2026_10 } from "@/lib/ventas/resumen-mes";
import { readFileSync } from "fs";
import { join } from "path";
import type { EmpresaMonthlySales } from "@/components/ventas/types";

const serie = (m9: number) => [100, 0, 0, 0, 0, 0, 0, 0, m9, null, null, null];
function emp(v: number, u: number, vp: number, up: number): EmpresaMonthlySales {
  return {
    empresa: { id: "vistana", nombre: "Vistana", tipo: "b2b" },
    ventas2026: serie(v), ventas2025: serie(vp), ventasPrevFull: serie(vp),
    utilidad2026: serie(u), utilidad2025: serie(up), ventasParaMargen: serie(v),
    margenPct: 0, margenPctPrev: 0, costoHasta: null,
  } as EmpresaMonthlySales;
}

describe("Resumen por mes (RESUMEN_MES_2026_10)", () => {
  // Daniel aprobó el 4-oct-2026 («sigue»).
  it("está prendido", () => expect(RESUMEN_MES_2026_10).toBe(true));

  it("el selector cerrado dice «Año 2026» o el mes completo", () => {
    expect(rotuloDelPeriodo(2026, 0)).toBe("Año 2026");
    expect(rotuloDelPeriodo(2026, 9)).toBe("Septiembre 2026");
  });

  it("la nota de mayoreo (del año) solo sale con «Todo el año»", () => {
    const src = readFileSync(join(process.cwd(), "src/components/ventas/celular/ResumenCelular.tsx"), "utf8");
    expect(src).toContain("{mes === 0 && multiMayoreoNota && (");
  });

  it("un mes que no empezó, o basura, cae a todo el año", () => {
    expect(mesValido("9", 10, true)).toBe(9);
    expect(mesValido("11", 10, true)).toBe(0);
    expect(mesValido("11", 10, false)).toBe(11);
    expect(mesValido("x", 10, true)).toBe(0);
  });

  it("todo el año es la suma de los meses; un mes es ese mes", () => {
    expect(delPeriodo(serie(50), 0)).toBe(150);
    expect(delPeriodo(serie(50), 9)).toBe(50);
  });

  it("el margen del mes excluye la empresa-mes sin costo, como el servidor", () => {
    // La segunda empresa no tiene costo (utilidad = venta): no entra al margen.
    const c = cifrasDelMes([emp(200, 50, 100, 20), emp(80, 80, 0, 0)], 9);
    expect(c.ventas).toBe(280);
    expect(c.utilidad).toBe(130);
    expect(c.margen).toBeCloseTo(0.25);
    expect(c.margenPrevio).toBeCloseTo(0.2);
  });
});
