// Helper estándar de exports Excel (xlsx-js-style) — hallazgo I11.
//
// "Estilo de la casa" extraído del patrón Guías/Proveedores: banda de título
// navy PRI + subtítulo MID + separador SEP, encabezados navy, filas zebra
// Calibri 10, fila de totales en banda PRI, moneda como NÚMERO real con
// numFmt (nunca string "$1,234.56"), fechas dd/mm/yyyy, nombre de archivo
// kebab-case con fecha ISO.
//
// Todos los exports de reportes del sistema deben construirse con esto.
// La paleta es parametrizable: los catálogos Reebok/Joybees usan su navy de
// marca (REEBOK_PALETTE) manteniendo la MISMA estructura. El Depurador de
// productos queda EXENTO (sus salidas son plantillas que se suben a Switch,
// no reportes para humanos).
//
// Dos niveles de uso:
//  - buildReportSheet(): el reporte tabular estándar (título/sub/headers/
//    zebra/totales) — cubre la mayoría de los exports.
//  - makeCellStyles(): fábrica de celdas estilizadas (hdr/td/tdN/band...)
//    para generadores con layout propio (fichas de Reclamos, multi-hoja)
//    que quieren la misma paleta sin el layout tabular.

import XLSX from "xlsx-js-style";

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

/** Navy de marca Reebok (brandbook) — solo catálogos Reebok/Joybees. */
export const REEBOK_PALETTE: ExcelPalette = {
  pri: "1A2656",
  mid: "2A3666",
  sep: "AAB0CC",
  brd: "D5DBDB",
  dataBg: "F8F9F9",
  altBg: "FFFFFF",
};

/** Moneda como número real: se ve "$1,234.56" y Excel puede sumar. */
export const MONEY_FMT = "$#,##0.00";
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
  /** Título de la banda principal, ej. "FASHION GROUP — Guías de Transporte". */
  title: string;
  /** Subtítulo (filtros aplicados, período...). Banda MID. */
  subtitle?: string;
  columns: ReportColumn[];
  rows: ReportCell[][];
  /** Fila de totales (banda PRI). Mismo largo que columns; null = celda vacía. */
  totals?: ReportCell[];
  palette?: ExcelPalette;
}

export function buildReportSheet(opts: ReportSheetOpts): XLSX.WorkSheet {
  const p = opts.palette || CASA_PALETTE;
  const { hdr, td, tdN, tot, band, fillRow } = makeCellStyles(p);
  const ws: XLSX.WorkSheet = {};
  const merges: XLSX.Range[] = [];
  const heights: number[] = [];
  const lastCol = opts.columns.length - 1;
  let r = 0;

  band(ws, r, lastCol, merges, opts.title, p.pri, 14);
  heights[r] = 30; r++;
  if (opts.subtitle) {
    band(ws, r, lastCol, merges, opts.subtitle, p.mid, 10);
    heights[r] = 20; r++;
  }
  fillRow(ws, r, lastCol, p.sep);
  merges.push({ s: { r, c: 0 }, e: { r, c: lastCol } });
  heights[r] = 4; r++;

  opts.columns.forEach((c, i) => { ws[addr(r, i)] = hdr(c.header, c.align || "left"); });
  heights[r] = 22; r++;

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

  ws["!ref"] = `A1:${addr(r - 1, lastCol)}`;
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

/** Para API routes: buffer listo para NextResponse con Content-Disposition. */
export function workbookBuffer(wb: XLSX.WorkBook): Buffer {
  return XLSX.write(wb, { bookType: "xlsx", type: "buffer" }) as Buffer;
}

/** Para client-side: dispara la descarga con Blob + anchor. */
export function downloadWorkbook(wb: XLSX.WorkBook, filename: string) {
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([buf], { type: XLSX_MIME });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
