import { describe, it, expect } from "vitest";
import {
  parsePackingListText,
  validateParsedPL,
  PARSER_VERSION,
} from "@/lib/parse-packing-list";

/**
 * Fixture: texto extraído literal con pdfjs-dist de test-fixtures/42328_PList.pdf,
 * página 32 (PL #80163244, últimos dos bultos de American Fashion Wear).
 *
 * Patrón crítico que se testea: Qty ≥ 100 en un solo bulto. El PDF parte el
 * número en dos líneas por el ancho de columna de 2 dígitos:
 *
 *   Bulto 547982 primer estilo: Qty=100 = "10\n0"
 *   Bulto 547983 único estilo:  Qty=115 = "11\n5"
 *
 * El parser pre-fix descarta el dígito huérfano y suma 15/11 (diff 90/104).
 * El parser ≥ 2.0.0 fusiona el dígito al último número y calcula 100/115.
 */
const BULTOS_547982_547983 = `
PACKING LIST
NO. 80163244
FASHION WEAR
Fecha de entrega: 16/04/2026
Bulto No. OCPA200000000547982  Peso por bulto: 19.65 KG  Volumen: 0.09 CBM  Total piezas: 105
Estilo  Color  Nombre  Dim  XS  S  M  L  XL  Qty
76J4883CSY  SOFT TURQUOISE  CAMISETA PARA MUJER
15  30  10  30  15  10
0
76J4883TIB  ROSEY PINK  CAMISETA PARA MUJER
5  5
Bulto No. OCPA200000000547983  Peso por bulto: 20.90 KG  Volumen: 0.09 CBM  Total piezas: 115
Estilo  Color  Nombre  Dim  XS  S  M  L  XL  Qty
76J4883TIB  ROSEY PINK  CAMISETA PARA MUJER
10  30  30  30  15  11
5
Total bultos: 2  Peso bruto total: 40.55 KG  Volumen total: 0.18 CBM  Total de piezas: 220
`;

describe("PARSER_VERSION", () => {
  it("exposes the current version", () => {
    expect(PARSER_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe("parsePackingListText — Qty wrap fuse (Nivel 1 fix)", () => {
  const parsed = parsePackingListText(BULTOS_547982_547983);

  it("detects both bultos (547982 and 547983)", () => {
    const ids = parsed.bultos.map(b => b.id);
    expect(ids).toContain("547982");
    expect(ids).toContain("547983");
  });

  it("bulto 547982: fuses '10\\n0' into 100 for 76J4883CSY", () => {
    const bulto = parsed.bultos.find(b => b.id === "547982");
    expect(bulto).toBeDefined();
    const csy = bulto!.items.find(i => i.estilo === "76J4883CSY");
    expect(csy).toBeDefined();
    expect(csy!.qty).toBe(100);
  });

  it("bulto 547982: keeps 76J4883TIB at qty 5", () => {
    const bulto = parsed.bultos.find(b => b.id === "547982");
    const tib = bulto!.items.find(i => i.estilo === "76J4883TIB");
    expect(tib).toBeDefined();
    expect(tib!.qty).toBe(5);
  });

  it("bulto 547982: totalPiezas from PDF header is 105", () => {
    const bulto = parsed.bultos.find(b => b.id === "547982");
    expect(bulto!.totalPiezas).toBe(105);
  });

  it("bulto 547982: parser sum matches PDF header (100 + 5 = 105)", () => {
    const bulto = parsed.bultos.find(b => b.id === "547982");
    const sum = bulto!.items.reduce((s, i) => s + i.qty, 0);
    expect(sum).toBe(105);
  });

  it("bulto 547983: fuses '11\\n5' into 115 for 76J4883TIB", () => {
    const bulto = parsed.bultos.find(b => b.id === "547983");
    expect(bulto).toBeDefined();
    const tib = bulto!.items.find(i => i.estilo === "76J4883TIB");
    expect(tib).toBeDefined();
    expect(tib!.qty).toBe(115);
  });

  it("bulto 547983: parser sum matches PDF header (115)", () => {
    const bulto = parsed.bultos.find(b => b.id === "547983");
    const sum = bulto!.items.reduce((s, i) => s + i.qty, 0);
    expect(sum).toBe(115);
  });

  it("validateParsedPL returns no errors (both bultos balance)", () => {
    const errors = validateParsedPL(parsed);
    const errForWrapBultos = errors.filter(e => e.bultoId === "547982" || e.bultoId === "547983");
    expect(errForWrapBultos).toEqual([]);
  });
});

describe("parsePackingListText — no regression on simple bultos", () => {
  // Un bulto trivial sin wrap: todos los estilos tienen qty < 100.
  const SIMPLE = `
PACKING LIST
NO. 99999999
FASHION WEAR
Fecha de entrega: 01/01/2026
Bulto No. OCPA200000000111111  Peso por bulto: 5.00 KG  Volumen: 0.05 CBM  Total piezas: 30
Estilo  Color  Nombre  Dim  S  M  L  Qty
ABC123XYZ  RED  CAMISETA PARA HOMBRE
10  10  10  30
Total bultos: 1  Peso bruto total: 5.00 KG  Volumen total: 0.05 CBM  Total de piezas: 30
`;

  it("parses a simple bulto without fusing anything", () => {
    const parsed = parsePackingListText(SIMPLE);
    const bulto = parsed.bultos.find(b => b.id === "111111");
    expect(bulto).toBeDefined();
    expect(bulto!.totalPiezas).toBe(30);
    const item = bulto!.items.find(i => i.estilo === "ABC123XYZ");
    expect(item!.qty).toBe(30);
  });
});
