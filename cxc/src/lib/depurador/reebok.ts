// Flujo Reebok → Active Shoes · lógica pura (sin DOM, sin xlsx).
//
// SEPARADO del Depurador CK/TH: Reebok usa otro formato de Excel del proveedor
// (Book4: headers en la 2.ª fila, columnas New Article / SKU / RRP / WholesalePrice
// y una columna de mes con piezas por SKU) y otra lógica de precio. NO pasa por
// processRows() del Depurador. Reusa el orden de columnas Switch (OUT_COLS_DEFAULT),
// TEXT_COLS y el patrón xlsx-js-style del cliente. Dos salidas:
//   A) Catálogo para clientes (una fila por PO NAME + New Article).
//   B) Plantilla Switch (una fila por SKU, 24 cols FOB, formato tipo Vistana).

import { OUT_COLS_DEFAULT, TEXT_COLS } from "./logic";
import type { Cell, SheetRow } from "./logic";

export { OUT_COLS_DEFAULT, TEXT_COLS };

/* ============ CONSTANTES ============ */
export const REEBOK_PROVEEDOR = "LATIN FITNESS GROUP";

// Meses en español para autodetectar la columna de piezas del mes (JULIO, AGOSTO…).
export const MESES_ES = [
  "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
  "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
];

/* ============ UTILES ============ */
const normH = (s: Cell): string => String(s ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().toUpperCase();
const round2 = (x: number): number => Math.round(x * 100) / 100;

function num(v: Cell): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return v;
  const n = parseFloat(String(v).replace(/,/g, "").trim());
  return isNaN(n) ? null : n;
}

/** Siguiente entero PAR hacia arriba: ceil(x); si es impar, +1.
 *  (37.752/0.75=50.34 → 51 → 52 · 37.752/0.80=47.19 → 48 → 48) */
export function ceilPar(x: number): number {
  const c = Math.ceil(Math.round(x * 10000) / 10000);
  return c % 2 === 0 ? c : c + 1;
}

const esFootwear = (dept: Cell): boolean => normH(dept).includes("FOOTWEAR");
const unidadPara = (dept: Cell): string => (esFootwear(dept) ? "PAR" : "PIEZA");

/** Costo FOB de Salida B: usa "WholesalePrice OFF" si viene con valor; si no,
 *  footwear → WholesalePrice×0.8; apparel/hardware → WholesalePrice×0.7. */
export function fobReebok(dept: Cell, wholesale: number, off: number | null): number {
  if (off !== null && off > 0) return off;
  return wholesale * (esFootwear(dept) ? 0.8 : 0.7);
}

/* ============ DETECCIÓN DE HOJA / HEADERS ============ */
export interface ReebokCols {
  po: number; newArticle: number; sku: number; name: number; department: number;
  category: number; ageGroup: number; colorName: number; gender: number;
  sellIn: number; rrp: number; wholesale: number; wholesaleOff: number; talla: number;
}

const findCol = (headers: Cell[], names: string[]): number => {
  const H = headers.map(normH);
  for (const n of names) { const i = H.indexOf(normH(n)); if (i !== -1) return i; }
  return -1;
};

/** Fila de headers = la que contiene New Article + SKU + WholesalePrice (el Book4
 *  trae una fila de basura arriba con totales precalculados). */
export function findHeaderRow(rows: SheetRow[]): number {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const H = (rows[i] || []).map(normH);
    if (H.includes("NEW ARTICLE") && H.includes("SKU") && H.includes("WHOLESALEPRICE")) return i;
  }
  return -1;
}

export function findReebokCols(headers: Cell[]): ReebokCols {
  return {
    po: findCol(headers, ["PO NAME"]),
    newArticle: findCol(headers, ["New Article"]),
    sku: findCol(headers, ["SKU"]),
    name: findCol(headers, ["Name"]),
    department: findCol(headers, ["Department"]),
    category: findCol(headers, ["CATEGORY"]),
    ageGroup: findCol(headers, ["AGE GROUP"]),
    colorName: findCol(headers, ["COLOR NAME"]),
    gender: findCol(headers, ["GENDER"]),
    sellIn: findCol(headers, ["SELL-IN QUARTER"]),
    rrp: findCol(headers, ["RRP"]),
    wholesale: findCol(headers, ["WholesalePrice"]),
    wholesaleOff: findCol(headers, ["WholesalePrice OFF", "WholesalePriceOFF", "WHOLESALE OFF"]),
    talla: findCol(headers, ["Talla", "SIZE"]),
  };
}

/** Columnas candidatas a "piezas del mes" (para el dropdown). Marca cuál es un mes. */
export interface MonthOption { idx: number; label: string; isMonth: boolean }
export function monthOptions(headers: Cell[]): MonthOption[] {
  return headers
    .map((h, idx) => ({ idx, label: String(h ?? "").trim(), isMonth: MESES_ES.includes(normH(h)) }))
    .filter((o) => o.label !== "");
}

/** Autodetecta la columna de mes (primer header que sea un mes en español). -1 si ninguno. */
export function detectMonthCol(headers: Cell[]): number {
  for (let i = 0; i < headers.length; i++) if (MESES_ES.includes(normH(headers[i]))) return i;
  return -1;
}

/* ============ PARSEO ============ */
export interface ReebokItem {
  po: string; newArticle: string; sku: string; name: string; department: string;
  category: string; ageGroup: string; colorName: string; gender: string;
  sellIn: string; wholesale: number | null; wholesaleOff: number | null;
  talla: string; piezas: number;
}

export interface ParseResult { items: ReebokItem[]; headerRow: number; cols: ReebokCols; warnings: string[] }

/** Parsea el Book4 crudo. `monthColIdx` = columna de piezas (autodetectada o elegida). */
export function parseReebok(rows: SheetRow[], monthColIdx: number): ParseResult {
  const headerRow = findHeaderRow(rows);
  if (headerRow === -1) {
    throw new Error("No encontré la fila de encabezados (busco New Article + SKU + WholesalePrice). ¿Es el Excel de Reebok?");
  }
  const headers = rows[headerRow];
  const cols = findReebokCols(headers);
  const missing: string[] = [];
  if (cols.newArticle === -1) missing.push("New Article");
  if (cols.sku === -1) missing.push("SKU");
  if (cols.wholesale === -1) missing.push("WholesalePrice");
  if (cols.department === -1) missing.push("Department");
  if (missing.length) throw new Error("Faltan columnas en el archivo: " + missing.join(", ") + ".");

  const warnings: string[] = [];
  const items: ReebokItem[] = [];
  const val = (row: SheetRow, i: number): string => (i === -1 ? "" : String(row[i] ?? "").trim());

  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every((c) => c === null || c === undefined || c === "")) continue;
    const newArticle = val(row, cols.newArticle);
    const sku = val(row, cols.sku);
    if (!newArticle && !sku) continue;
    const wholesale = num(row[cols.wholesale]);
    if (wholesale === null) warnings.push(`${newArticle || sku}: sin WholesalePrice`);
    const piezas = monthColIdx === -1 ? 0 : (num(row[monthColIdx]) || 0);
    items.push({
      po: val(row, cols.po),
      newArticle,
      sku,
      name: val(row, cols.name),
      department: val(row, cols.department),
      category: val(row, cols.category),
      ageGroup: val(row, cols.ageGroup),
      colorName: val(row, cols.colorName),
      gender: val(row, cols.gender),
      sellIn: val(row, cols.sellIn),
      wholesale,
      wholesaleOff: cols.wholesaleOff === -1 ? null : num(row[cols.wholesaleOff]),
      talla: val(row, cols.talla),
      piezas,
    });
  }
  if (items.length === 0) throw new Error("No se encontraron filas de productos válidas.");
  return { items, headerRow, cols, warnings };
}

/* ============ SALIDA A · CATÁLOGO CLIENTES ============ */
// Una fila por PO NAME + New Article. Costo = WholesalePrice × 0.80 × 1.1 (flat).
// Precio A = ceil_par(Costo / 0.75) · Precio B = ceil_par(Costo / 0.80).

export interface CatalogoRow {
  po: string; newArticle: string; name: string; department: string; category: string;
  ageGroup: string; colorName: string; gender: string;
  wholesale: number | null; costo: number | null; precioA: number | null; precioB: number | null;
  piezas: number;
}

export function buildCatalogo(items: ReebokItem[]): CatalogoRow[] {
  const groups = new Map<string, ReebokItem[]>();
  for (const it of items) {
    const key = `${it.po}|||${it.newArticle}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(it);
  }
  const out: CatalogoRow[] = [];
  for (const [, group] of groups) {
    const first = group[0];
    const w = first.wholesale;
    const costo = w === null ? null : round2(w * 0.8 * 1.1);
    const precioA = costo === null ? null : ceilPar(costo / 0.75);
    const precioB = costo === null ? null : ceilPar(costo / 0.8);
    const piezas = group.reduce((s, it) => s + (it.piezas || 0), 0);
    out.push({
      po: first.po, newArticle: first.newArticle, name: first.name, department: first.department,
      category: first.category, ageGroup: first.ageGroup, colorName: first.colorName, gender: first.gender,
      wholesale: w, costo, precioA, precioB, piezas,
    });
  }
  // Orden estable: PO, luego New Article.
  out.sort((a, b) => a.po.localeCompare(b.po, "es") || a.newArticle.localeCompare(b.newArticle, "es"));
  return out;
}

/** AOA del catálogo de clientes. `monthLabel` rotula la columna de piezas (ej. "JULIO"). */
export function buildCatalogoAoa(rows: CatalogoRow[], monthLabel: string): (string | number)[][] {
  const head = [
    "PO NAME", "New Article", "Name", "Department", "CATEGORY", "AGE GROUP", "COLOR NAME", "GENDER",
    "WholesalePrice", "Costo", "Precio A", "Precio B", `Piezas ${monthLabel}`.trim(),
  ];
  const aoa: (string | number)[][] = [head];
  const cell = (v: number | null): string | number => (v === null ? "" : v);
  for (const r of rows) {
    aoa.push([
      r.po, r.newArticle, r.name, r.department, r.category, r.ageGroup, r.colorName, r.gender,
      cell(r.wholesale), cell(r.costo), cell(r.precioA), cell(r.precioB), r.piezas,
    ]);
  }
  return aoa;
}

/* ============ SALIDA B · PLANTILLA SWITCH ============ */
// Una fila por SKU. 24 cols (OUT_COLS_DEFAULT, sin Composición) = mismo formato que
// Vistana/Fashion Wear. SIN Title Case (Department y proveedor tal cual, en mayúscula).

export type PrecioAB = "A" | "B";

export interface SwitchBuildConfig { precioAB: PrecioAB; temporada: string; tasa: string }

/** Filas Switch keyed por OUT_COLS_DEFAULT (una por SKU). */
export function buildSwitchRows(
  items: ReebokItem[],
  cfg: SwitchBuildConfig,
): Record<string, string | number | null>[] {
  const divisor = cfg.precioAB === "A" ? 0.75 : 0.8;
  return items.map((it) => {
    const w = it.wholesale;
    const fob = w === null ? null : round2(fobReebok(it.department, w, it.wholesaleOff));
    const cif = fob === null ? null : round2(fob * 1.1);
    const precio = cif === null ? null : ceilPar(cif / divisor);
    return {
      "Código *": it.newArticle,
      "Referencia *": it.newArticle,
      "Código Barra *": it.sku || it.newArticle,
      "Descripción *": it.name,
      "Precio *": precio,
      "Tasa de Impuesto *": cfg.tasa,
      "Costo FOB *": fob,
      "Costo CIF *": cif,
      "rubro *": it.category,       // CATEGORY (SHOES / T-SHIRTS / SOCKS / BAGS…)
      "subrubro": it.gender,        // GENDER (Male / Female / Kids / Unisex)
      "Marca *": it.department,     // Department (FOOTWEAR / APPAREL / HARDWARE)
      "Proveedor *": REEBOK_PROVEEDOR,
      "Mínimo Stock": "",
      "Código Tipo de Artículo *": "01",
      "Unidad de medida *": unidadPara(it.department),
      "Origen": "",
      "Lote": "",
      "Serie": "",
      "Stock Ideal": it.piezas,
      "Temporada": cfg.temporada,
      "Codigo CPBS": "",
      "Codigo CPBS Abrev": "",
      "Bonificación": "",
      "Cantidad por caja": "",
    };
  });
}

/** AOA de la plantilla Switch. Constructor propio SIN Title Case (a diferencia de
 *  buildAoa del Depurador): Department y proveedor van tal cual (mayúscula). */
export function buildSwitchAoa(rows: Record<string, string | number | null>[]): (string | number)[][] {
  const aoa: (string | number)[][] = [OUT_COLS_DEFAULT.slice()];
  for (const r of rows) {
    aoa.push(OUT_COLS_DEFAULT.map((c) => {
      const v = r[c];
      return v === null || v === undefined ? "" : v;
    }));
  }
  return aoa;
}
