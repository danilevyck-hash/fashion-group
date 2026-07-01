// Flujo Reebok → Active Shoes · lógica pura (sin DOM, sin xlsx).
//
// SEPARADO del Depurador CK/TH: Reebok usa otro formato de Excel del proveedor
// (Book4: headers en la 2.ª fila, columnas New Article / SKU / RRP / WholesalePrice
// y una columna de mes con piezas por SKU) y otra lógica de precio. NO pasa por
// processRows() del Depurador. Reusa el orden de columnas Switch (OUT_COLS_DEFAULT),
// TEXT_COLS y el patrón xlsx-js-style del cliente. Dos salidas:
//   A) Catálogo para clientes (una fila por PO NAME + New Article).
//   B) Plantilla Switch (una fila por ARTÍCULO, 24 cols FOB, formato tipo Vistana).

import { OUT_COLS_DEFAULT, TEXT_COLS, ceilPar, calcPrecio } from "./logic";
import type { Cell, SheetRow, Redondeo } from "./logic";

export { OUT_COLS_DEFAULT, TEXT_COLS, ceilPar };

/* ============ CONSTANTES ============ */
export const REEBOK_PROVEEDOR = "LATIN FITNESS GROUP";

// Reebok entra al sistema de fórmulas por marca (FormulasConfig) como DOS marcas
// editables: "Reebok Precio A" y "Reebok Precio B". Defaults equivalentes al cálculo
// histórico (÷0.75 / ÷0.80, redondeo al par hacia arriba), pero editables.
export const REEBOK_MARCA_A = "Reebok Precio A";
export const REEBOK_MARCA_B = "Reebok Precio B";
export const REEBOK_EMPRESA = "Active Shoes";

export interface PriceFormula { divisor: number; extra: number; redondeo: Redondeo }
export const REEBOK_FORMULA_A_DEFAULT: PriceFormula = { divisor: 0.75, extra: 0, redondeo: "par" };
export const REEBOK_FORMULA_B_DEFAULT: PriceFormula = { divisor: 0.8, extra: 0, redondeo: "par" };

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

/* ============ ORDEN Y TALLA-MUESTRA ============ */
// Ambas salidas se ordenan por PO NAME → Name → Género.
const cmpPoNameGender = (a: { po: string; name: string; gender: string }, b: { po: string; name: string; gender: string }): number =>
  a.po.localeCompare(b.po, "es") || a.name.localeCompare(b.name, "es") || a.gender.localeCompare(b.gender, "es");

/** true si el artículo es Kids/Unisex para la talla-muestra:
 *  AGE GROUP presente y ≠ Adult, o GENDER = Unisex. */
const esKidsUnisex = (it: ReebokItem): boolean => {
  const ag = normH(it.ageGroup);
  return (ag !== "" && ag !== "ADULT") || normH(it.gender) === "UNISEX";
};

interface SampleResult { sku: string; talla: string; fallback: boolean }

/** Elige el código de barra representativo (talla-muestra) de un artículo:
 *  - Footwear Male → 9 · Female → 7 · Kids/Unisex → mediana de las tallas.
 *    Si la talla exacta (9/7) no existe: la numérica más cercana + fallback (ámbar).
 *  - Apparel/Hardware → M; si no hay M → la talla única. */
function pickSample(group: ReebokItem[]): SampleResult {
  const first = group[0];
  // Mapa talla → sku (primera aparición). Tallas numéricas ordenadas para mediana/cercanía.
  const bySize = new Map<string, string>();
  for (const it of group) { const t = it.talla.trim(); if (t && !bySize.has(t)) bySize.set(t, it.sku); }
  const nums = [...bySize.keys()]
    .map((t) => ({ t, n: num(t) }))
    .filter((x): x is { t: string; n: number } => x.n !== null)
    .sort((a, b) => a.n - b.n);
  const skuOf = (t: string): string => bySize.get(t) ?? first.sku;
  const fallbackAll = (): SampleResult => {
    const t = [...bySize.keys()][0] ?? first.talla;
    return { sku: skuOf(t), talla: t, fallback: bySize.size > 1 };
  };

  if (esFootwear(first.department)) {
    if (esKidsUnisex(first) || (normH(first.gender) !== "MALE" && normH(first.gender) !== "FEMALE")) {
      if (nums.length === 0) return fallbackAll();
      const mid = nums[Math.floor((nums.length - 1) / 2)]; // mediana (talla real, sin fallback)
      return { sku: skuOf(mid.t), talla: mid.t, fallback: false };
    }
    const target = normH(first.gender) === "MALE" ? 9 : 7;
    if (nums.length === 0) return fallbackAll();
    const exact = nums.find((x) => x.n === target);
    if (exact) return { sku: skuOf(exact.t), talla: exact.t, fallback: false };
    // Más cercana + fallback ámbar (empate → la menor).
    const nearest = nums.reduce((best, x) =>
      Math.abs(x.n - target) < Math.abs(best.n - target) ? x : best, nums[0]);
    return { sku: skuOf(nearest.t), talla: nearest.t, fallback: true };
  }
  // Apparel / Hardware → M; si no hay M → talla única.
  const m = [...bySize.keys()].find((t) => normH(t) === "M");
  if (m) return { sku: skuOf(m), talla: m, fallback: false };
  return fallbackAll();
}

/* ============ SALIDA A · CATÁLOGO CLIENTES ============ */
// Una fila por PO NAME + New Article. Costo = WholesalePrice × 0.80 × 1.1 (flat).
// Precio A/B = fórmulas editables (default ÷0.75 / ÷0.80, redondeo par). Orden PO/Name/Género.

export interface CatalogoRow {
  po: string; newArticle: string; name: string; department: string; category: string;
  ageGroup: string; colorName: string; gender: string;
  wholesale: number | null; costo: number | null; precioA: number | null; precioB: number | null;
  piezas: number;
}

export interface CatalogoConfig { formulaA: PriceFormula; formulaB: PriceFormula }

export function buildCatalogo(items: ReebokItem[], cfg: CatalogoConfig): CatalogoRow[] {
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
    const precioA = calcPrecio(costo, cfg.formulaA);
    const precioB = calcPrecio(costo, cfg.formulaB);
    const piezas = group.reduce((s, it) => s + (it.piezas || 0), 0);
    out.push({
      po: first.po, newArticle: first.newArticle, name: first.name, department: first.department,
      category: first.category, ageGroup: first.ageGroup, colorName: first.colorName, gender: first.gender,
      wholesale: w, costo, precioA, precioB, piezas,
    });
  }
  out.sort(cmpPoNameGender);
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
// UNA fila por ARTÍCULO (New Article), igual que CK/TH. Cantidad = suma de todas las
// tallas del mes. Código de barra = el de la talla-muestra (pickSample). 24 cols
// (OUT_COLS_DEFAULT) = formato Vistana. SIN Title Case (Department/proveedor tal cual).

export type PrecioAB = "A" | "B";

export interface SwitchBuildConfig { formula: PriceFormula; temporada: string; tasa: string }

/** Fila Switch = las 24 columnas + metadatos de UI (talla-muestra, fallback). */
export interface SwitchRow {
  cols: Record<string, string | number | null>;
  talla: string;
  fallback: boolean;   // true si no se halló la talla exacta (9/7) → revisar (ámbar)
  po: string; name: string; gender: string;
}

/** Filas Switch, una por artículo, ordenadas por PO/Name/Género. */
export function buildSwitchRows(items: ReebokItem[], cfg: SwitchBuildConfig): SwitchRow[] {
  const groups = new Map<string, ReebokItem[]>();
  for (const it of items) {
    if (!it.newArticle) continue;
    if (!groups.has(it.newArticle)) groups.set(it.newArticle, []);
    groups.get(it.newArticle)!.push(it);
  }
  const out: SwitchRow[] = [];
  for (const [, group] of groups) {
    const first = group[0];
    const sample = pickSample(group);
    const qty = group.reduce((s, it) => s + (it.piezas || 0), 0);
    const w = first.wholesale;
    const fob = w === null ? null : round2(fobReebok(first.department, w, first.wholesaleOff));
    const cif = fob === null ? null : round2(fob * 1.1);
    const precio = calcPrecio(cif, cfg.formula);
    out.push({
      cols: {
        "Código *": first.newArticle,
        "Referencia *": first.newArticle,
        "Código Barra *": sample.sku || first.newArticle,
        "Descripción *": first.name,
        "Precio *": precio,
        "Tasa de Impuesto *": cfg.tasa,
        "Costo FOB *": fob,
        "Costo CIF *": cif,
        "rubro *": first.category,       // CATEGORY (SHOES / T-SHIRTS / SOCKS / BAGS…)
        "subrubro": first.gender,        // GENDER (Male / Female / Kids / Unisex)
        "Marca *": first.department,     // Department (FOOTWEAR / APPAREL / HARDWARE)
        "Proveedor *": REEBOK_PROVEEDOR,
        "Mínimo Stock": "",
        "Código Tipo de Artículo *": "01",
        "Unidad de medida *": unidadPara(first.department),
        "Origen": "",
        "Lote": "",
        "Serie": "",
        "Stock Ideal": qty,
        "Temporada": cfg.temporada,
        "Codigo CPBS": "",
        "Codigo CPBS Abrev": "",
        "Bonificación": "",
        "Cantidad por caja": "",
      },
      talla: sample.talla,
      fallback: sample.fallback,
      po: first.po, name: first.name, gender: first.gender,
    });
  }
  out.sort(cmpPoNameGender);
  return out;
}

/** AOA de la plantilla Switch. Constructor propio SIN Title Case (a diferencia de
 *  buildAoa del Depurador): Department y proveedor van tal cual (mayúscula). */
export function buildSwitchAoa(rows: SwitchRow[]): (string | number)[][] {
  const aoa: (string | number)[][] = [OUT_COLS_DEFAULT.slice()];
  for (const r of rows) {
    aoa.push(OUT_COLS_DEFAULT.map((c) => {
      const v = r.cols[c];
      return v === null || v === undefined ? "" : v;
    }));
  }
  return aoa;
}
