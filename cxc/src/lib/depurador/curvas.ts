// Curvas (prepack) de Fashion Shoes · lógica pura (sin DOM, sin xlsx).
//
// Del Excel crudo del proveedor (filas por REFERENCIA + TALLA + curva) calcula la
// DISTRIBUCIÓN POR BULTO de cada referencia+curva, para mandarle al cliente el
// detalle de qué tallas trae cada bulto.
//
//   bultos     = total de piezas de la curva ÷ CANTIDAD_ORD_X_PP
//   por bulto  = CANTIDAD de la talla ÷ bultos
//   validación = Σ(por bulto) debe dar CANTIDAD_ORD_X_PP exacto; si no cuadra
//                (divisiones fraccionarias, ordXPp inconsistente) se marca la
//                curva en ámbar (`cuadra=false`) pero NO se bloquea.
//
// SEPARADO del Depurador: no toca processRows/pickEAN ni ninguna regla validada.
// Solo reusa helpers exportados (norm) y el tipo SheetRow.

import { norm, type Cell, type SheetRow, type NamedSheet } from "./logic";

export type { Cell, SheetRow, NamedSheet } from "./logic";

export interface CurvaTalla {
  talla: string;
  ean: string;
  cantidadTotal: number;
  porBulto: number;
}

export interface Curva {
  referencia: string;
  estilo: string;
  /** Código de la curva/prepack (ej. W1A, W1B). */
  codigo: string;
  /** Piezas por bulto declaradas (CANTIDAD_ORD_X_PP). */
  ordXPp: number;
  /** Bultos de la curva (total ÷ ordXPp; redondeado si no es exacto). */
  bultos: number;
  totalPiezas: number;
  tallas: CurvaTalla[];
  /** true si Σ(porBulto) = ordXPp y todas las divisiones son exactas. */
  cuadra: boolean;
  avisos: string[];
}

export interface CurvasResult {
  curvas: Curva[];
  warnings: string[];
}

// Alias de columnas (el proveedor cambia nombres entre archivos; mismo criterio
// que el Depurador pero con las columnas propias del prepack).
const ALIAS: Record<string, string[]> = {
  ref: ["REFERENCIA", "REFERENCE", "REF"],
  ean: ["EAN", "CODIGO BARRA", "CODIGOBARRA", "BARCODE", "EAN_2"],
  talla: ["TALLA", "SIZE"],
  cant: ["CANTIDAD", "CANT", "QTY", "QUANTITY"],
  curva: ["CODIGO_PREPACK", "CODIGO PREPACK", "COD_PREPACK", "PREPACK"],
  ordXPp: ["CANTIDAD_ORD_X_PP", "CANTIDAD ORD X PP", "CANT_ORD_X_PP", "ORD_X_PP"],
  estilo: ["NOMBRE_DE_ESTILO", "NOMBRE DE ESTILO", "ESTILO", "STYLE NAME", "STYLE"],
};

function findCol(headers: Cell[], aliasList: string[]): number {
  const H = headers.map((h) => norm(h));
  for (const a of aliasList) {
    const i = H.indexOf(norm(a));
    if (i !== -1) return i;
  }
  for (const a of aliasList) {
    const i = H.findIndex((h) => h.includes(norm(a)));
    if (i !== -1) return i;
  }
  return -1;
}

function num(v: Cell): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return v;
  const n = parseFloat(String(v).replace(/,/g, "").trim());
  return isNaN(n) ? null : n;
}

/** Hoja con datos de prepack: la que tenga REFERENCIA + TALLA + CODIGO_PREPACK.
 *  Prioriza hojas _TXT (la cruda del proveedor), igual que el Depurador. */
export function pickCurvasSheet(sheets: NamedSheet[]): SheetRow[] | null {
  let bestSheet: SheetRow[] | null = null;
  let bestScore = 0;
  for (const { name, rows } of sheets) {
    if (!rows.length) continue;
    const hdr = (rows[0] || []).map((h) => norm(h));
    let score = 0;
    if (hdr.some((h) => h.includes("REFERENCIA") || h === "REF")) score += 2;
    if (hdr.some((h) => h.includes("PREPACK"))) score += 4; // la columna que define este flujo
    if (hdr.some((h) => h.includes("TALLA") || h === "SIZE")) score += 1;
    if (/_TXT/i.test(name)) score += 3;
    score += Math.min(rows.length / 100, 2);
    if (score > bestScore) { bestScore = score; bestSheet = rows; }
  }
  return bestSheet;
}

// Orden natural de tallas de calzado: numéricas ascendentes, luego texto.
function cmpTalla(a: string, b: string): number {
  const na = parseFloat(a), nb = parseFloat(b);
  const aNum = !isNaN(na), bNum = !isNaN(nb);
  if (aNum && bNum) return na - nb;
  if (aNum) return -1;
  if (bNum) return 1;
  return a.localeCompare(b, "es");
}

/** Parsea la hoja cruda → curvas por referencia+prepack con distribución por bulto. */
export function parseCurvas(rows: SheetRow[]): CurvasResult {
  if (!rows.length) throw new Error("El archivo no tiene filas de datos.");
  const headers = rows[0];
  const col: Record<string, number> = {};
  for (const k in ALIAS) col[k] = findCol(headers, ALIAS[k]);

  const missing: string[] = [];
  if (col.ref === -1) missing.push("REFERENCIA");
  if (col.talla === -1) missing.push("TALLA");
  if (col.cant === -1) missing.push("CANTIDAD");
  if (col.curva === -1) missing.push("CODIGO_PREPACK");
  if (col.ordXPp === -1) missing.push("CANTIDAD_ORD_X_PP");
  if (missing.length) {
    throw new Error("No encontré estas columnas en el archivo: " + missing.join(", ") +
      ". Revisa que sea el Excel de Fashion Shoes con curvas (prepack).");
  }

  const warnings: string[] = [];
  let sinCurva = 0;

  // Agrupar por referencia+curva conservando orden de aparición. Una misma
  // talla repetida en la misma curva se SUMA (el proveedor a veces parte filas).
  interface Grupo {
    referencia: string; codigo: string; estilo: string;
    ordXPps: Set<number>; tallas: Map<string, { ean: string; cantidad: number }>;
  }
  const grupos = new Map<string, Grupo>();

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every((c) => c === null || c === undefined || c === "")) continue;
    const ref = String(row[col.ref] ?? "").trim();
    if (!ref) continue;
    const curva = String(row[col.curva] ?? "").trim();
    if (!curva) { sinCurva++; continue; }
    const talla = String(row[col.talla] ?? "").trim();
    const cantidad = num(row[col.cant]) ?? 0;
    const ordXPp = num(row[col.ordXPp]);
    const key = `${ref}|||${norm(curva)}`;
    if (!grupos.has(key)) {
      grupos.set(key, {
        referencia: ref,
        codigo: curva,
        estilo: col.estilo !== -1 ? String(row[col.estilo] ?? "").trim() : "",
        ordXPps: new Set(),
        tallas: new Map(),
      });
    }
    const g = grupos.get(key)!;
    if (ordXPp !== null && ordXPp > 0) g.ordXPps.add(ordXPp);
    if (!g.estilo && col.estilo !== -1) g.estilo = String(row[col.estilo] ?? "").trim();
    const prev = g.tallas.get(talla);
    if (prev) prev.cantidad += cantidad;
    else g.tallas.set(talla, { ean: col.ean !== -1 ? String(row[col.ean] ?? "").trim() : "", cantidad });
  }

  if (sinCurva > 0) warnings.push(`${sinCurva} fila(s) sin CODIGO_PREPACK — no llevan curva, se ignoraron.`);
  if (grupos.size === 0) throw new Error("No se encontraron referencias con curva (CODIGO_PREPACK vacío en todas las filas).");

  const curvas: Curva[] = [];
  for (const g of grupos.values()) {
    const avisos: string[] = [];
    let cuadra = true;

    const ordXPp = g.ordXPps.size ? [...g.ordXPps][0] : 0;
    if (g.ordXPps.size === 0) { avisos.push("Sin CANTIDAD_ORD_X_PP — no se puede validar el bulto."); cuadra = false; }
    if (g.ordXPps.size > 1) { avisos.push(`CANTIDAD_ORD_X_PP inconsistente en la curva: ${[...g.ordXPps].join(", ")}.`); cuadra = false; }

    const totalPiezas = [...g.tallas.values()].reduce((s, t) => s + t.cantidad, 0);
    const bultosExacto = ordXPp > 0 ? totalPiezas / ordXPp : 0;
    let bultos = Math.round(bultosExacto);
    if (ordXPp > 0 && !Number.isInteger(bultosExacto)) {
      avisos.push(`Total ${totalPiezas} pzs no es múltiplo de ${ordXPp} pzs/bulto (da ${bultosExacto.toFixed(2)} bultos).`);
      cuadra = false;
    }
    if (bultos <= 0) bultos = 1; // evita división por 0; ya quedó marcada

    const tallas: CurvaTalla[] = [...g.tallas.entries()]
      .map(([talla, t]) => {
        const exacto = t.cantidad / bultos;
        if (!Number.isInteger(exacto)) cuadra = false;
        return { talla, ean: t.ean, cantidadTotal: t.cantidad, porBulto: Math.round(exacto) };
      })
      .sort((a, b) => cmpTalla(a.talla, b.talla));

    const sumaPorBulto = tallas.reduce((s, t) => s + t.porBulto, 0);
    if (ordXPp > 0 && sumaPorBulto !== ordXPp) {
      avisos.push(`La suma por bulto da ${sumaPorBulto} pzs y el archivo dice ${ordXPp} pzs/bulto.`);
      cuadra = false;
    }

    curvas.push({
      referencia: g.referencia,
      estilo: g.estilo,
      codigo: g.codigo,
      ordXPp,
      bultos,
      totalPiezas,
      tallas,
      cuadra,
      avisos,
    });
  }

  return { curvas, warnings };
}

/* ============ EXCEL DE SALIDA ============ */

export const CURVAS_OUT_COLS = ["Referencia", "Talla", "Código de barra", "Cantidad"];

/** Fila de metadatos por sección, para que la UI pueda estilizar los encabezados. */
export interface CurvasAoaMeta {
  /** Índices (base 0) de las filas de encabezado de columnas. */
  headerRows: number[];
}

/** AOA del Excel de salida: una sección por referencia+curva seleccionada —
 *  encabezados + una fila por talla con la cantidad POR BULTO (sin fila de
 *  título; la referencia ya va en cada fila de datos). */
export function buildCurvasAoa(seleccion: Curva[]): { aoa: (string | number)[][]; meta: CurvasAoaMeta } {
  const aoa: (string | number)[][] = [];
  const meta: CurvasAoaMeta = { headerRows: [] };
  seleccion.forEach((c, i) => {
    if (i > 0) aoa.push([]); // fila en blanco entre secciones
    meta.headerRows.push(aoa.length);
    aoa.push(CURVAS_OUT_COLS.slice());
    for (const t of c.tallas) {
      aoa.push([c.referencia, t.talla, t.ean, t.porBulto]);
    }
  });
  return { aoa, meta };
}

/** Nombre del archivo de salida: TALLAS_<REF1>[_y_N_mas].xlsx */
export function curvasFilename(seleccion: Curva[]): string {
  if (!seleccion.length) return "TALLAS.xlsx";
  const ref = seleccion[0].referencia.replace(/[^A-Za-z0-9]/g, "_").slice(0, 16).toUpperCase();
  const extra = seleccion.length > 1 ? `_y_${seleccion.length - 1}_mas` : "";
  return `TALLAS_${ref}${extra}.xlsx`;
}
