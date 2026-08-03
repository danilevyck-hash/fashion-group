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

import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase-server", () => ({ supabaseServer: {}, HAS_SERVICE_ROLE: false }));
vi.mock("sharp", () => ({ default: () => ({}) }));
import { splitMarcas, sumarSplits, COL_OTRAS } from "@/lib/marketing/columnas-marca";
import { MONEY_FMT, MONEY_FMT_GUION } from "@/lib/excel-export";
import XLSX from "xlsx-js-style";
import { readFileSync } from "fs";
import path from "path";

const zip = readFileSync(path.join(process.cwd(), "src/lib/marketing/zip-export.ts"), "utf8");

describe("la columna 'Otras marcas' aparece SOLA cuando hace falta", () => {
  it("la decisión es GLOBAL, una sola vez para todo el libro", () => {
    // Si se decidiera por cliente, el Resumen podría traerla y la hoja de un
    // cliente no: dos vistas del mismo dato diciendo cosas distintas.
    expect(zip).toContain("const mostrarOtras = clientes.some(");
    expect(zip.match(/const mostrarOtras =/g) ?? []).toHaveLength(1);
  });

  it("las DOS hojas usan la misma decisión", () => {
    // Resumen y detalle: encabezado, filas y fila de totales.
    expect((zip.match(/mostrarOtras \? \[COL_OTRAS\]/g) ?? []).length).toBe(2);
    expect((zip.match(/mostrarOtras \? \[s\.otras\]/g) ?? []).length).toBe(3);
  });

  it("los índices de columna se corren con ella", () => {
    expect(zip).toContain("const C_RES_SUBTOTAL = mostrarOtras ? 7 : 6;");
    expect(zip).toContain("const C_SUBTOTAL = mostrarOtras ? 9 : 8;");
    expect(zip).toContain("const C_LINK = mostrarOtras ? 10 : 9;");
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

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LAS DOS DIRECCIONES, sobre el libro DE VERDAD.
//
// Un test que solo mire "la columna no está" pasa con un Excel vacío. Y uno que
// solo mire "está" no protege el caso de hoy. Van los dos, y en cada uno se
// verifica que el archivo CUADRE.
// ─────────────────────────────────────────────────────────────────────────────
import { buildResumenGastosWorkbook } from "@/lib/marketing/zip-export";

const gasto = (subtotal: number, partes: { codigo: string; monto: number }[]) => ({
  fecha: "2026-07-01", periodo: "", concepto: "Impresión", proveedor: "Impreco",
  marca: "CK", numero: "F-1", subtotal, total: subtotal, partes,
  signed: null as string | null, etiquetaLink: "Ver factura",
});
const cli = (gastos: ReturnType<typeof gasto>[]) => [
  { nombre: "Cliente Uno", codigo: "D-1", marcas: "CK, TH", gastos, fotos: [] },
] as never;
const fila = (ws: XLSX.WorkSheet, texto: string): number => {
  const ref = XLSX.utils.decode_range(ws["!ref"] as string);
  for (let r = ref.s.r; r <= ref.e.r; r++) {
    const c = ws[XLSX.utils.encode_cell({ r, c: 0 })];
    if (String(c?.v ?? "").toUpperCase().includes(texto)) return r;
  }
  return -1;
};
const v = (ws: XLSX.WorkSheet, r: number, c: number) => ws[XLSX.utils.encode_cell({ r, c })]?.v;

describe("🔴 dirección 1 — otras = 0 en todas las filas: la columna NO está", () => {
  const wb = buildResumenGastosWorkbook(cli([gasto(100, [{ codigo: "CK", monto: 60 }, { codigo: "TH", monto: 40 }])]));
  const ws = wb.Sheets["Resumen"];

  it("el encabezado no la trae", () => {
    expect(v(ws, 0, 4)).toBe("Calvin Klein");
    expect(v(ws, 0, 5)).toBe("Tommy Hilfiger");
    expect(v(ws, 0, 6)).toBe("Subtotal (sin ITBMS)");
    expect(v(ws, 0, 7)).toBeUndefined();
  });

  it("y el archivo cuadra: Calvin + Tommy = Subtotal", () => {
    expect(Number(v(ws, 1, 4)) + Number(v(ws, 1, 5))).toBeCloseTo(Number(v(ws, 1, 6)), 2);
  });
});

describe("🔴 dirección 2 — una sola fila con otras > 0: la columna SÍ está", () => {
  // 100 de gasto con solo 30 repartidos a Calvin → 70 quedan en "otras".
  const wb = buildResumenGastosWorkbook(cli([gasto(100, [{ codigo: "CK", monto: 30 }])]));
  const ws = wb.Sheets["Resumen"];

  it("el encabezado la trae, entre Tommy y el Subtotal", () => {
    expect(v(ws, 0, 6)).toBe("Otras marcas");
    expect(v(ws, 0, 7)).toBe("Subtotal (sin ITBMS)");
  });

  it("el monto no se perdió: 70 en Otras", () => {
    expect(Number(v(ws, 1, 6))).toBeCloseTo(70, 2);
  });

  it("y el archivo cuadra: Calvin + Tommy + Otras = Subtotal", () => {
    const suma = Number(v(ws, 1, 4)) + Number(v(ws, 1, 5)) + Number(v(ws, 1, 6));
    expect(suma).toBeCloseTo(Number(v(ws, 1, 7)), 2);
  });

  it("la fila TOTAL también cuadra", () => {
    const r = fila(ws, "TOTAL");
    expect(r).toBeGreaterThan(0);
    const suma = Number(v(ws, r, 4)) + Number(v(ws, r, 5)) + Number(v(ws, r, 6));
    expect(suma).toBeCloseTo(Number(v(ws, r, 7)), 2);
  });

  it("la hoja del cliente decide IGUAL que el Resumen", () => {
    const wsCli = wb.Sheets["Cliente Uno"];
    const ref = XLSX.utils.decode_range(wsCli["!ref"] as string);
    let hay = false;
    for (let r = ref.s.r; r <= ref.e.r; r++)
      for (let c = ref.s.c; c <= ref.e.c; c++)
        if (wsCli[XLSX.utils.encode_cell({ r, c })]?.v === "Otras marcas") hay = true;
    expect(hay).toBe(true);
  });
});
