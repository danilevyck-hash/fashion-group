// Export Excel de la lista de Proveedores (CxP). Mismo estilo de la casa que
// excel-guias.ts (xlsx-js-style, paleta navy, moneda $#,##0.00 como números
// reales — ver CLAUDE.md § Exports).

import XLSX from "xlsx-js-style";

export interface ProveedorExportRow {
  nombre: string;
  comprado_ytd: number;
  aging_current: number;
  aging_watch: number;
  aging_overdue: number;
  saldo_total: number;
  ultimo_pago_dias: number | null;
  empresas_count: number;
}

function addr(r: number, c: number) { return XLSX.utils.encode_cell({ r, c }); }

const PRI = "1B3A5C";
const MID = "2E5E8E";
const SEP = "D4E6F1";
const BRD = "D5DBDB";
const DATA_BG = "F8F9F9";
const ALT_BG = "FFFFFF";
const MONEY = "$#,##0.00";

const B = {
  top: { style: "thin", color: { rgb: BRD } },
  bottom: { style: "thin", color: { rgb: BRD } },
  left: { style: "thin", color: { rgb: BRD } },
  right: { style: "thin", color: { rgb: BRD } },
} as const;

function fillRow(cols: number, r: number, ws: XLSX.WorkSheet, bg: string) {
  for (let i = 0; i <= cols; i++)
    if (!ws[addr(r, i)]) ws[addr(r, i)] = { v: "", t: "s", s: { fill: { fgColor: { rgb: bg } } } };
}

function hdr(v: string, ha = "left") {
  return {
    v, t: "s", s: {
      font: { bold: true, sz: 10, color: { rgb: "FFFFFF" }, name: "Calibri" },
      fill: { fgColor: { rgb: PRI } },
      alignment: { horizontal: ha, vertical: "center" },
      border: B,
    },
  };
}

function td(v: string, alt: boolean, opts: { fg?: string; bold?: boolean; sz?: number } = {}) {
  return {
    v, t: "s", s: {
      font: { sz: opts.sz || 10, color: { rgb: opts.fg || "333333" }, bold: opts.bold || false, name: "Calibri" },
      fill: { fgColor: { rgb: alt ? DATA_BG : ALT_BG } },
      alignment: { horizontal: "left" },
      border: B,
    },
  };
}

function money(v: number, alt: boolean, opts: { fg?: string; bold?: boolean } = {}) {
  return {
    v, t: "n", z: MONEY, s: {
      font: { sz: 10, bold: opts.bold || false, color: { rgb: opts.fg || "333333" }, name: "Calibri" },
      fill: { fgColor: { rgb: alt ? DATA_BG : ALT_BG } },
      alignment: { horizontal: "right" },
      border: B,
    },
  };
}

function tdN(v: number | string, alt: boolean) {
  return {
    v, t: typeof v === "number" ? "n" : "s", s: {
      font: { sz: 10, color: { rgb: "555555" }, name: "Calibri" },
      fill: { fgColor: { rgb: alt ? DATA_BG : ALT_BG } },
      alignment: { horizontal: "right" },
      border: B,
    },
  };
}

export function exportProveedoresExcel(rows: ProveedorExportRow[], subtitle?: string, fileLabel?: string) {
  const ws: XLSX.WorkSheet = {};
  const heights: number[] = [];
  const merges: XLSX.Range[] = [];
  const lastCol = 7; // 8 columnas (0-7)
  let r = 0;

  // Título
  ws[addr(r, 0)] = {
    v: "FASHION GROUP — Proveedores (Cuentas por Pagar)", t: "s", s: {
      font: { bold: true, sz: 14, color: { rgb: "FFFFFF" }, name: "Calibri" },
      fill: { fgColor: { rgb: PRI } },
      alignment: { horizontal: "center", vertical: "center" },
    },
  };
  fillRow(lastCol, r, ws, PRI);
  merges.push({ s: { r, c: 0 }, e: { r, c: lastCol } });
  heights[r] = 30;
  r++;

  // Subtítulo
  ws[addr(r, 0)] = {
    v: subtitle || "Todo el grupo", t: "s", s: {
      font: { bold: true, sz: 10, color: { rgb: "FFFFFF" }, name: "Calibri" },
      fill: { fgColor: { rgb: MID } },
      alignment: { horizontal: "center", vertical: "center" },
    },
  };
  fillRow(lastCol, r, ws, MID);
  merges.push({ s: { r, c: 0 }, e: { r, c: lastCol } });
  heights[r] = 20;
  r++;

  // Separador
  fillRow(lastCol, r, ws, SEP);
  merges.push({ s: { r, c: 0 }, e: { r, c: lastCol } });
  heights[r] = 4;
  r++;

  // Encabezados
  const headers = ["Proveedor", "Comprado YTD", "0-90d", "91-120d", "121d+", "Por pagar", "Último pago", "Empresas"];
  headers.forEach((h, i) => {
    ws[addr(r, i)] = hdr(h, i === 0 ? "left" : "right");
  });
  heights[r] = 22;
  r++;

  // Filas
  const tot = { comprado: 0, current: 0, watch: 0, overdue: 0, saldo: 0 };
  rows.forEach((p, idx) => {
    const alt = idx % 2 === 0;
    ws[addr(r, 0)] = td(p.nombre, alt, { bold: p.saldo_total > 0 });
    ws[addr(r, 1)] = money(p.comprado_ytd, alt);
    ws[addr(r, 2)] = money(p.aging_current, alt);
    ws[addr(r, 3)] = money(p.aging_watch, alt, { fg: p.aging_watch > 0 ? "B45309" : undefined });
    ws[addr(r, 4)] = money(p.aging_overdue, alt, { fg: p.aging_overdue > 0 ? "B91C1C" : undefined });
    ws[addr(r, 5)] = money(p.saldo_total, alt, { bold: true, fg: p.saldo_total < 0 ? "2563EB" : undefined });
    ws[addr(r, 6)] = tdN(p.ultimo_pago_dias != null ? `hace ${p.ultimo_pago_dias}d` : "—", alt);
    ws[addr(r, 7)] = tdN(p.empresas_count, alt);
    tot.comprado += p.comprado_ytd;
    tot.current += p.aging_current;
    tot.watch += p.aging_watch;
    tot.overdue += p.aging_overdue;
    tot.saldo += p.saldo_total;
    heights[r] = 18;
    r++;
  });

  // Espaciador
  heights[r] = 6;
  r++;

  // Totales
  const tStyle = (ha = "right") => ({
    font: { bold: true, sz: 10, color: { rgb: "FFFFFF" }, name: "Calibri" },
    fill: { fgColor: { rgb: PRI } },
    alignment: { horizontal: ha, vertical: "center" },
    border: B,
  });
  ws[addr(r, 0)] = { v: `${rows.length} proveedores`, t: "s", s: tStyle("left") };
  ws[addr(r, 1)] = { v: tot.comprado, t: "n", z: MONEY, s: tStyle() };
  ws[addr(r, 2)] = { v: tot.current, t: "n", z: MONEY, s: tStyle() };
  ws[addr(r, 3)] = { v: tot.watch, t: "n", z: MONEY, s: tStyle() };
  ws[addr(r, 4)] = { v: tot.overdue, t: "n", z: MONEY, s: tStyle() };
  ws[addr(r, 5)] = { v: tot.saldo, t: "n", z: MONEY, s: tStyle() };
  ws[addr(r, 6)] = { v: "", t: "s", s: tStyle() };
  ws[addr(r, 7)] = { v: "", t: "s", s: tStyle() };
  heights[r] = 22;
  r++;

  ws["!ref"] = `A1:H${r}`;
  ws["!merges"] = merges;
  ws["!cols"] = [
    { wch: 34 }, // Proveedor
    { wch: 14 }, // Comprado YTD
    { wch: 12 }, // 0-90d
    { wch: 12 }, // 91-120d
    { wch: 12 }, // 121d+
    { wch: 14 }, // Por pagar
    { wch: 12 }, // Último pago
    { wch: 10 }, // Empresas
  ];
  ws["!rows"] = heights.map((h) => ({ hpt: h || 16 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Proveedores");
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const date = new Date().toISOString().slice(0, 10);
  const suffix = fileLabel ? `_${fileLabel.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase()}` : "";
  a.download = `Proveedores${suffix}_${date}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
