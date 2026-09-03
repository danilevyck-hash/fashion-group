// ─────────────────────────────────────────────────────────────────────────────
// Multifashion › Vendedoras — el rótulo de la columna Δ dice CONTRA QUÉ compara.
//
// 🩸 Decía «Δ vs año pasado» en los seis chips, pero en los dos de MES la RPC
// (`multifashion_vendedoras_v3`, `p_periodo = 'mes'`) compara contra el MES
// ANTERIOR: medido el 3-sep-2026, «Agosto (cerrado)» decía +30,1% «vs año
// pasado» y era +30,1% contra JULIO ($53.012 contra $40.741, que es julio
// entero al centavo). Daniel: arreglar el RÓTULO, dejar la comparación.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  mesComparadoVendedoras,
  notaComparacionVendedoras,
  rotuloDeltaVendedoras,
} from "@/lib/multifashion/vendedoras-rotulo";

describe("los chips de MES dicen el mes contra el que comparan", () => {
  it("«Septiembre (en curso)» → «Δ vs agosto 2026»", () => {
    expect(rotuloDeltaVendedoras("en_curso", 9, 2026)).toEqual({ columna: "Δ vs agosto 2026", corto: "vs agosto 2026" });
  });

  it("«Agosto (cerrado)» → «Δ vs julio 2026» — se NOMBRA el mes, no «mes anterior» a secas", () => {
    // «vs mes anterior» en el chip de agosto es ambiguo: ¿anterior a hoy
    // (agosto) o anterior a agosto (julio)? La RPC compara contra julio.
    const r = rotuloDeltaVendedoras("mes_anterior", 8, 2026);
    expect(r.columna).toBe("Δ vs julio 2026");
    expect(r.columna).not.toMatch(/año pasado/);
    expect(r.columna).not.toMatch(/mes anterior/);
  });

  it("enero compara contra diciembre del año ANTERIOR", () => {
    expect(mesComparadoVendedoras(1, 2027)).toEqual({ mes: 12, year: 2026 });
    expect(rotuloDeltaVendedoras("en_curso", 1, 2027).columna).toBe("Δ vs diciembre 2026");
    // Y el chip cerrado de enero (que pide diciembre) compara contra noviembre.
    expect(rotuloDeltaVendedoras("mes_anterior", 12, 2026).columna).toBe("Δ vs noviembre 2026");
  });
});

describe("los chips que SÍ comparan contra el año pasado lo siguen diciendo", () => {
  it("YTD y «Últimos N meses» → «Δ vs año pasado»", () => {
    for (const chip of ["ytd", "ultimos_3", "ultimos_6", "ultimos_12"] as const) {
      expect(rotuloDeltaVendedoras(chip, 9, 2026)).toEqual({ columna: "Δ vs año pasado", corto: "vs año pasado" });
    }
  });
});

describe("la nota bajo el subtítulo", () => {
  it("mes en curso: nombra el mes y dice que son los mismos días", () => {
    expect(notaComparacionVendedoras("en_curso", 9, 2026, true, "2026-08-03"))
      .toBe("La Δ compara contra agosto 2026, los mismos días (del 1 al 3).");
  });

  it("mes cerrado: el mes anterior completo", () => {
    expect(notaComparacionVendedoras("mes_anterior", 8, 2026, false, "2026-07-31"))
      .toBe("La Δ compara contra julio 2026 completo.");
  });

  it("en los chips de año no hay nota: el rótulo ya lo dice", () => {
    expect(notaComparacionVendedoras("ytd", 9, 2026, true, "2025-09-03")).toBeNull();
    expect(notaComparacionVendedoras("ultimos_12", 9, 2026, true, "2025-09-03")).toBeNull();
  });
});

describe("candado estático: la pantalla no clava «vs año pasado» en el JSX", () => {
  it("VendedorasSubtab.tsx toma el rótulo de `rotuloDeltaVendedoras`, no de un texto fijo", () => {
    const src = readFileSync("src/components/multifashion/VendedorasSubtab.tsx", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:])\/\/.*$/gm, "$1")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ");
    expect(src).toMatch(/rotuloDeltaVendedoras\(/);
    // Ni en la tabla ni en la tarjeta: el texto fijo era el error.
    expect(src).not.toMatch(/>\s*Δ vs año pasado\s*</);
    expect(src).not.toMatch(/>\s*vs año pasado\s*</);
  });
});
