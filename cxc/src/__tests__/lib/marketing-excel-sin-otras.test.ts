// ─────────────────────────────────────────────────────────────────────────────
// El Excel de gastos de Marketing: sin "Otras marcas" y con `–` en el cero.
//
// Daniel, textual: *"dale, quita la columna y pon guion en vez de cero"*, después
// de ver que "Otras marcas" daba $0.00 en TODAS las filas de su Excel real.
//
// 🩸 EL GUION ES UN FORMATO, NO UN TEXTO. La regla de la casa es *"Moneda:
// `$#,##0.00` en Excel, números reales, no texto"*. Un `–` escrito como string
// rompería las filas de TOTAL y el «suma de la selección» de Excel. Por eso se
// usa la sección de cero del formato (`…;"–"`): la celda sigue valiendo 0.
//
// ⚠️ `splitMarcas` SIGUE calculando `otras` — es la red de seguridad que hace que
// `ck + th + otras` cuadre con el subtotal SIEMPRE. Hoy da 0 y por eso la columna
// se fue; si algún día deja de dar 0, hay que decidir cómo mostrarlo (pendiente
// de Daniel). Este archivo congela que el CÁLCULO no se borró junto con la
// columna.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { splitMarcas, sumarSplits, COL_OTRAS } from "@/lib/marketing/columnas-marca";
import { MONEY_FMT, MONEY_FMT_GUION } from "@/lib/excel-export";
import { readFileSync } from "fs";
import path from "path";

const zip = readFileSync(path.join(process.cwd(), "src/lib/marketing/zip-export.ts"), "utf8");

describe("la columna 'Otras marcas' salió del Excel", () => {
  it("ninguna de las dos hojas la arma", () => {
    expect(zip).not.toContain("COL_OTRAS");
    expect(zip).not.toMatch(/\bs\.otras\b/);
    expect(zip).not.toMatch(/totalesCli\.otras/);
  });

  it("pero el CÁLCULO sigue vivo: es la red que hace cuadrar el subtotal", () => {
    // 40 de una marca que no es CK ni TH sobre un gasto de 100 → otras = 60.
    const s = splitMarcas(100, [{ codigo: "CK", monto: 40 }]);
    expect(s.otras).toBe(60);
    expect(s.ck + s.th + s.otras).toBe(100);
  });

  it("el encabezado sigue exportado para cuando se decida cómo mostrarlo", () => {
    expect(COL_OTRAS).toBe("Otras marcas");
  });

  it("hoy 'otras' da 0 cuando el reparto cubre todo — por eso se pudo quitar", () => {
    const s = sumarSplits([
      splitMarcas(100, [{ codigo: "CK", monto: 60 }, { codigo: "TH", monto: 40 }]),
      splitMarcas(50, [{ codigo: "TH", monto: 50 }]),
    ]);
    expect(s.otras).toBe(0);
    expect(s.ck + s.th).toBe(150);
  });
});

describe("🔴 el guion no puede romper las sumas", () => {
  it("es un formato con sección de cero, no un texto", () => {
    expect(MONEY_FMT_GUION).toContain('"–"');
    // 3 secciones: positivo ; negativo ; cero.
    expect(MONEY_FMT_GUION.split(";")).toHaveLength(3);
    expect(MONEY_FMT_GUION.startsWith("$#,##0.00")).toBe(true);
  });

  it("solo lo usan las columnas de MARCA; el Subtotal mantiene el formato normal", () => {
    expect(zip).toContain("MONEY_FMT_GUION");
    expect(zip).toMatch(/C_RES_SUBTOTAL \? MONEY_FMT_GUION : MONEY_FMT/);
    expect(zip).toMatch(/C_SUBTOTAL \? MONEY_FMT_GUION : MONEY_FMT/);
  });
});
