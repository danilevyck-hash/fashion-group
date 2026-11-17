// Error #38 (videos, 16-nov-2026): la confirmación de Reebok abría en OCTUBRE
// aunque el archivo solo trajera piezas en NOVIEMBRE, y la pantalla decía
// «No se puede descargar…» hasta cambiar el mes a mano. Regla: abre en el mes
// que SÍ tiene datos (el más reciente si hay varios), nunca en uno vacío.
import { describe, it, expect } from "vitest";
import { detectMonthCol } from "../lib/depurador/reebok";
import type { SheetRow } from "../lib/depurador/logic";

const H = ["New Article", "SKU", "WholesalePrice", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
const OCT = 3, NOV = 4, DIC = 5;
const filas = (...piezas: Array<[number | null, number | null, number | null]>): SheetRow[] =>
  piezas.map(([o, n, d], i) => [`A${i}`, `S${i}`, 10, o, n, d]);

describe("Reebok — el mes con que abre la confirmación", () => {
  it("solo NOVIEMBRE trae piezas → abre en NOVIEMBRE, no en OCTUBRE", () => {
    expect(detectMonthCol(H, filas([null, 3, null], [0, 2, null]))).toBe(NOV);
  });
  it("varios meses con piezas → el más reciente", () => {
    expect(detectMonthCol(H, filas([1, 3, null], [0, 0, 4]))).toBe(DIC);
  });
  it("ningún mes con piezas → el primero (como antes)", () => {
    expect(detectMonthCol(H, filas([null, 0, null]))).toBe(OCT);
  });
  it("sin filas → el primer mes (como antes)", () => {
    expect(detectMonthCol(H)).toBe(OCT);
  });
});

// Mismo encargo: «1 descripción(es)» y «1 bultos». Ninguna pantalla de
// Plantilla Switch vuelve a escribir el plural con paréntesis.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
describe("Plantilla Switch — plurales escritos enteros", () => {
  const dir = join(__dirname, "../app/productos/cargar");
  it.each(readdirSync(dir).filter((f) => f.endsWith(".tsx")))("%s sin «(s)» ni «(es)» en un texto", (f) => {
    const sinComentarios = readFileSync(join(dir, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    // `includes(s)` es código, no texto: lo que sigue al paréntesis decide.
    expect(sinComentarios).not.toMatch(/\p{L}\((?:s|es)\)(?=:? ?[\p{L}<{])/u);
    expect(sinComentarios).not.toMatch(/\{c\.bultos\} bultos/);
  });
});
