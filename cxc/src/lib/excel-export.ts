// Helper estándar de exports Excel (xlsx-js-style) — hallazgo I11.
//
// "Estilo de la casa": **encabezados navy en la FILA 1**, con filtro y con la
// fila fija al bajar; filas zebra Calibri 10, fila de totales en banda PRI,
// moneda como NÚMERO real con numFmt (nunca string "$1,234.56"), fechas
// dd/mm/yyyy, nombre de archivo kebab-case con fecha ISO — que es el que dice
// de qué es el archivo, para que la hoja no tenga que gastar filas diciéndolo.
//
// Todos los exports de reportes del sistema deben construirse con esto.
// La paleta es parametrizable: los catálogos Reebok/Joybees usan su navy de
// marca (REEBOK_PALETTE) manteniendo la MISMA estructura. El Depurador de
// productos queda EXENTO (sus salidas son plantillas que se suben a Switch,
// no reportes para humanos).
//
// Dos niveles de uso:
//  - buildReportSheet(): el reporte tabular estándar (headers/zebra/totales)
//    — cubre la mayoría de los exports.
//  - makeCellStyles(): fábrica de celdas estilizadas (hdr/td/tdN/band...)
//    para generadores con layout propio (fichas de Reclamos, multi-hoja)
//    que quieren la misma paleta sin el layout tabular.

import XLSX from "xlsx-js-style";

import { congelarEncabezadosXlsx } from "./excel-panel-fijo";

// ─── Paletas ─────────────────────────────────────────────────────────────────

export interface ExcelPalette {
  /** Banda principal: título, encabezados y fila de totales. */
  pri: string;
  /** Banda de subtítulo. */
  mid: string;
  /** Fila separadora fina bajo el subtítulo. */
  sep: string;
  /** Bordes thin de todas las celdas. */
  brd: string;
  /** Zebra: fondo de filas pares / impares. */
  dataBg: string;
  altBg: string;
}

/** Estilo de la casa (Guías/Proveedores): navy Fashion Group. */
export const CASA_PALETTE: ExcelPalette = {
  pri: "1B3A5C",
  mid: "2E5E8E",
  sep: "D4E6F1",
  brd: "D5DBDB",
  dataBg: "F8F9F9",
  altBg: "FFFFFF",
};

/** Navy de marca Reebok (brandbook) — catálogo Reebok. */
export const REEBOK_PALETTE: ExcelPalette = {
  pri: "1A2656",
  mid: "2A3666",
  sep: "AAB0CC",
  brd: "D5DBDB",
  dataBg: "F8F9F9",
  altBg: "FFFFFF",
};

/** Gris de marca Joybees (#404041) con el amarillo #FFE443 en el separador. */
export const JOYBEES_PALETTE: ExcelPalette = {
  pri: "404041",
  mid: "5C5C5E",
  sep: "FFE443",
  brd: "D5DBDB",
  dataBg: "F8F9F9",
  altBg: "FFFFFF",
};

/** Navy de marca Tommy Hilfiger (#152342) con el rojo #AE0029 en el separador. */
export const TOMMY_PALETTE: ExcelPalette = {
  pri: "152342",
  mid: "23355E",
  sep: "AE0029",
  brd: "D5DBDB",
  dataBg: "F8F9F9",
  altBg: "FFFFFF",
};

/** Negro de marca Calvin Klein (#1A1A1A) — blanco/negro minimalista: el
 *  separador también va en negro, la marca no tiene color de acento. */
export const CALVIN_PALETTE: ExcelPalette = {
  pri: "1A1A1A",
  mid: "3D3D3D",
  sep: "1A1A1A",
  brd: "D5DBDB",
  dataBg: "F8F9F9",
  altBg: "FFFFFF",
};

/** Paleta de Excel por marca de catálogo — fuente única. Antes las 3 marcas
 *  usaban REEBOK_PALETTE, así que el Excel de Joybees y el de Tommy salían con
 *  el navy de Reebok. */
export const CATALOGO_PALETTES: Record<string, ExcelPalette> = {
  reebok: REEBOK_PALETTE,
  joybees: JOYBEES_PALETTE,
  tommy: TOMMY_PALETTE,
  calvin: CALVIN_PALETTE,
};

/** Paleta de la marca; Reebok como red de seguridad si llega una marca nueva
 *  sin entrada (los catálogos nunca deben caer al navy de la casa). */
export function paletaDeMarca(marca: string): ExcelPalette {
  return CATALOGO_PALETTES[marca] ?? REEBOK_PALETTE;
}

/** Moneda como número real: se ve "$1,234.56" y Excel puede sumar. */
export const MONEY_FMT = "$#,##0.00";

/**
 * Moneda que muestra `–` en el cero, en vez de `$0.00`.
 *
 * 🩸 ES UN FORMATO, NO UN TEXTO. Los formatos de Excel tienen secciones
 * `positivo;negativo;cero`, así que la celda sigue siendo un NÚMERO (0) y solo
 * cambia cómo se ve. Escribir el guion como string rompería las filas de TOTAL
 * y el «suma de la selección» que muestra Excel abajo — que es justo la regla
 * de la casa: *"Moneda: `$#,##0.00` en Excel, números reales, no texto"*.
 */
export const MONEY_FMT_GUION = '$#,##0.00;-$#,##0.00;"–"';
export const PCT_FMT = "0.0%";

export function addr(r: number, c: number): string {
  return XLSX.utils.encode_cell({ r, c });
}

/** Fecha estándar de reportes: dd/mm/yyyy desde "YYYY-MM-DD" (o ISO). */
export function fmtFechaExcel(d: string | null | undefined): string {
  if (!d) return "";
  const [y, m, day] = d.slice(0, 10).split("-");
  return day && m && y ? `${day}/${m}/${y}` : d;
}

/** Nombre estándar: kebab-case + fecha ISO. ej. exportFilename("guias-transporte") */
export function exportFilename(base: string, ext = "xlsx"): string {
  return `${base}-${new Date().toISOString().slice(0, 10)}.${ext}`;
}

// ─── Fábrica de celdas (nivel bajo, para layouts propios) ────────────────────

export function makeCellStyles(p: ExcelPalette = CASA_PALETTE) {
  const B = {
    top: { style: "thin", color: { rgb: p.brd } },
    bottom: { style: "thin", color: { rgb: p.brd } },
    left: { style: "thin", color: { rgb: p.brd } },
    right: { style: "thin", color: { rgb: p.brd } },
  } as const;

  /** Rellena hasta lastCol las celdas vacías de la fila r con un fondo (bandas). */
  function fillRow(ws: XLSX.WorkSheet, r: number, lastCol: number, bg: string) {
    for (let i = 0; i <= lastCol; i++)
      if (!ws[addr(r, i)]) ws[addr(r, i)] = { v: "", t: "s", s: { fill: { fgColor: { rgb: bg } } } };
  }

  /** Celda de encabezado: banda PRI, texto blanco bold. */
  function hdr(v: string, ha: "left" | "center" | "right" = "left") {
    return {
      v, t: "s" as const, s: {
        font: { bold: true, sz: 10, color: { rgb: "FFFFFF" }, name: "Calibri" },
        fill: { fgColor: { rgb: p.pri } },
        alignment: { horizontal: ha, vertical: "center" },
        border: B,
      },
    };
  }

  /** Celda de texto con zebra. */
  function td(v: string, alt: boolean, opts: { fg?: string; bold?: boolean; sz?: number; ha?: "left" | "center" | "right" } = {}) {
    return {
      v, t: "s" as const, s: {
        font: { sz: opts.sz || 10, color: { rgb: opts.fg || "333333" }, bold: opts.bold || false, name: "Calibri" },
        fill: { fgColor: { rgb: alt ? p.dataBg : p.altBg } },
        alignment: { horizontal: opts.ha || "left" },
        border: B,
      },
    };
  }

  /** Celda numérica con zebra; fmt opcional (MONEY_FMT/PCT_FMT/"0"). */
  function tdN(v: number, alt: boolean, opts: { bold?: boolean; fmt?: string; fg?: string } = {}) {
    return {
      v, t: "n" as const, ...(opts.fmt ? { z: opts.fmt } : {}), s: {
        font: { sz: 10, bold: opts.bold || false, color: { rgb: opts.fg || "333333" }, name: "Calibri" },
        fill: { fgColor: { rgb: alt ? p.dataBg : p.altBg } },
        alignment: { horizontal: "right" },
        border: B,
      },
    };
  }

  /** Celda de la fila de totales: banda PRI blanca bold. */
  function tot(v: string | number, opts: { ha?: "left" | "center" | "right"; fmt?: string } = {}) {
    return {
      v, t: (typeof v === "number" ? "n" : "s") as "n" | "s", ...(opts.fmt ? { z: opts.fmt } : {}), s: {
        font: { bold: true, sz: 10, color: { rgb: "FFFFFF" }, name: "Calibri" },
        fill: { fgColor: { rgb: p.pri } },
        alignment: { horizontal: opts.ha || "right", vertical: "center" },
        border: B,
      },
    };
  }

  /** Banda de título/subtítulo mergeada (título sz 14, subtítulo sz 10). */
  function band(ws: XLSX.WorkSheet, r: number, lastCol: number, merges: XLSX.Range[], text: string, bg: string, sz: number) {
    ws[addr(r, 0)] = {
      v: text, t: "s", s: {
        font: { bold: true, sz, color: { rgb: "FFFFFF" }, name: "Calibri" },
        fill: { fgColor: { rgb: bg } },
        alignment: { horizontal: "center", vertical: "center" },
      },
    };
    fillRow(ws, r, lastCol, bg);
    merges.push({ s: { r, c: 0 }, e: { r, c: lastCol } });
  }

  return { B, fillRow, hdr, td, tdN, tot, band, palette: p };
}

// ─── Reporte tabular estándar (nivel alto) ───────────────────────────────────

export interface ReportColumn {
  header: string;
  /** Ancho en caracteres (!cols wch). */
  wch: number;
  align?: "left" | "center" | "right";
  /** numFmt para celdas numéricas de esta columna (ej. MONEY_FMT). */
  fmt?: string;
}

/** Celda de datos: string/number directos, o con overrides de estilo. */
export type ReportCell =
  | string
  | number
  | null
  | undefined
  | { v: string | number; fg?: string; bold?: boolean; sz?: number; fmt?: string };

export interface ReportSheetOpts {
  columns: ReportColumn[];
  rows: ReportCell[][];
  /** Fila de totales (banda PRI). Mismo largo que columns; null = celda vacía. */
  totals?: ReportCell[];
  /**
   * Una línea de aviso al PIE, debajo de todo y FUERA del rango del filtro.
   *
   * 🔴 NO ES PARA EXPLICAR EL EXCEL. *"Un ERP profesional no tiene
   * explicaciones, es intuitivo como Apple"*: el contexto va en el nombre del
   * archivo y las columnas se explican solas. Esto es para lo que un archivo
   * tiene que DECIR de sí mismo aunque nadie pregunte — hoy, que la planilla
   * bajada por un rango que no es quincena NO sirve para pagar.
   */
  nota?: string;
  palette?: ExcelPalette;
}

/**
 * La hoja estándar: **los encabezados en la FILA 1 y nada arriba de ellos.**
 *
 * 🔴 ANTES había banda de título (fila 1), subtítulo (2) y una franja
 * separadora de 4 puntos de alto (3) que en pantalla se veía como una fila
 * escondida; los encabezados quedaban en la 4. Daniel, textual: *"la tercera
 * fila esta como escondido, no me deja filtrar desde los nombres importantes,
 * y mucha informacion inecesaria… si asi se ve el modulo, asi mismo se debe de
 * descargar"*. El título se fue: el nombre del archivo ya lo dice
 * (`ventas-referencia-2026-08-27.xlsx`).
 *
 * Y con los encabezados en la 1 se puede lo que antes no: `!autofilter` sobre
 * `A1:…` (Excel filtra desde los nombres de columna) y la fila fija al bajar,
 * que la pone `congelarEncabezadosXlsx` al escribir el archivo — la librería no
 * sabe escribir paneles, ver `excel-panel-fijo.ts`.
 */
export function buildReportSheet(opts: ReportSheetOpts): XLSX.WorkSheet {
  const p = opts.palette || CASA_PALETTE;
  const { hdr, td, tdN, tot } = makeCellStyles(p);
  const ws: XLSX.WorkSheet = {};
  const merges: XLSX.Range[] = [];
  const heights: number[] = [];
  const lastCol = opts.columns.length - 1;
  let r = 0;

  opts.columns.forEach((c, i) => { ws[addr(r, i)] = hdr(c.header, c.align || "left"); });
  heights[r] = 22; r++;
  // El filtro cubre encabezados + datos y NADA más: la fila de totales y la
  // nota quedan afuera a propósito, para que filtrar no las esconda.
  const filtro = `A1:${addr(opts.rows.length, lastCol)}`;

  opts.rows.forEach((row, idx) => {
    const alt = idx % 2 === 0;
    opts.columns.forEach((col, c) => {
      const cell = row[c];
      if (cell === null || cell === undefined) { ws[addr(r, c)] = td("", alt); return; }
      if (typeof cell === "number") { ws[addr(r, c)] = tdN(cell, alt, { fmt: col.fmt }); return; }
      if (typeof cell === "string") { ws[addr(r, c)] = td(cell, alt, { ha: col.align }); return; }
      if (typeof cell.v === "number") { ws[addr(r, c)] = tdN(cell.v, alt, { fmt: cell.fmt || col.fmt, bold: cell.bold, fg: cell.fg }); return; }
      ws[addr(r, c)] = td(cell.v, alt, { fg: cell.fg, bold: cell.bold, sz: cell.sz, ha: col.align });
    });
    heights[r] = 18; r++;
  });

  if (opts.totals) {
    heights[r] = 6; r++; // espaciador
    opts.totals.forEach((cell, c) => {
      const col = opts.columns[c];
      if (cell === null || cell === undefined) { ws[addr(r, c)] = tot("", { ha: "left" }); return; }
      if (typeof cell === "object") { ws[addr(r, c)] = tot(cell.v, { fmt: cell.fmt || col.fmt, ha: col.align }); return; }
      ws[addr(r, c)] = tot(cell, { fmt: typeof cell === "number" ? col.fmt : undefined, ha: typeof cell === "number" ? col.align || "right" : "left" });
    });
    heights[r] = 22; r++;
  }

  if (opts.nota) {
    heights[r] = 6; r++; // espaciador
    // Sin relleno ni merge: el texto se derrama sobre las celdas vacías de la
    // derecha, y sin merge no hay nada que estorbe si alguien ordena la tabla.
    ws[addr(r, 0)] = {
      v: opts.nota, t: "s",
      s: { font: { sz: 10, italic: true, color: { rgb: "6B7280" }, name: "Calibri" } },
    };
    heights[r] = 18; r++;
  }

  ws["!ref"] = `A1:${addr(r - 1, lastCol)}`;
  ws["!autofilter"] = { ref: filtro };
  ws["!merges"] = merges;
  ws["!cols"] = opts.columns.map((c) => ({ wch: c.wch }));
  ws["!rows"] = heights.map((h) => ({ hpt: h || 16 }));
  return ws;
}

// ─── Workbook + salida (client y server) ─────────────────────────────────────

export function workbookFromSheets(sheets: { name: string; ws: XLSX.WorkSheet }[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) XLSX.utils.book_append_sheet(wb, s.ws, s.name);
  return wb;
}

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * Los bytes del .xlsx, con la fila de encabezados ya fija.
 *
 * 🔴 TODO EXPORT SALE POR ACÁ. Escribir con `XLSX.write` a secas deja el
 * archivo sin panel fijo —la librería no sabe escribirlo— y eso no se ve hasta
 * que alguien baja por la hoja y pierde los nombres de las columnas.
 */
export function workbookBytes(wb: XLSX.WorkBook): Uint8Array {
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return congelarEncabezadosXlsx(new Uint8Array(buf));
}

/** Para API routes: buffer listo para NextResponse con Content-Disposition. */
export function workbookBuffer(wb: XLSX.WorkBook): Buffer {
  return Buffer.from(workbookBytes(wb));
}

/** El .xlsx como Blob, ya con la fila de encabezados fija. */
export function workbookBlob(wb: XLSX.WorkBook): Blob {
  const bytes = workbookBytes(wb);
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  return new Blob([ab], { type: XLSX_MIME });
}

/** Para client-side: dispara la descarga con Blob + anchor. */
export function downloadWorkbook(wb: XLSX.WorkBook, filename: string) {
  const blob = workbookBlob(wb);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
