import { describe, expect, it } from "vitest";
import { cifrasDelMes, delPeriodo, memoriaAlAbrir, mesAlAbrir, mesValido, rotuloDelPeriodo, RESUMEN_MES_2026_10 } from "@/lib/ventas/resumen-mes";
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

  // Daniel, 11-oct-2026: «se debe de abrir siempre en el mes en curso».
  it("sin ?mes= abre en el mes en curso de Panamá; la URL manda", () => {
    expect(mesAlAbrir("", 2026, "2026-10-11")).toBe("10");
    expect(mesAlAbrir("", 2026, "2026-01-01")).toBe("1");
    expect(mesAlAbrir("9", 2026, "2026-10-11")).toBe("9");
    expect(mesAlAbrir("0", 2026, "2026-10-11")).toBe("0"); // «Todo el año», elegido
    expect(mesAlAbrir("", 2025, "2026-10-11")).toBe("0"); // un año cerrado no tiene mes en curso
  });

  it("al abrir el Resumen no se mira el año recordado; con algo en la URL, sí", () => {
    expect(memoriaAlAbrir("resumen", "", "", "2025")).toBe("");
    expect(memoriaAlAbrir("resumen", "", "9", "2025")).toBe("2025");
    expect(memoriaAlAbrir("resumen", "2025", "", "2024")).toBe("2024");
    expect(memoriaAlAbrir("clientes", "", "", "ultimos-12")).toBe("ultimos-12");
  });

  it("la pantalla usa esas dos reglas y el reloj de Panamá", () => {
    const src = readFileSync(join(process.cwd(), "src/app/ventas/VentasShell.tsx"), "utf8");
    expect(src).toContain('useUrlState("mes", "")');
    expect(src).toContain("mesAlAbrir(mesUrl, selectedYear, hoyPanama())");
    expect(src).toContain("memoriaAlAbrir(tab, periodoUrl, mesUrl, periodoRecordado)");
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
