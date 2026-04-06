import XLSX from "xlsx-js-style";
import type { Guia, GuiaItem } from "./types";

function addr(r: number, c: number) { return XLSX.utils.encode_cell({ r, c }); }

const PRI = "1B3A5C";
const MID = "2E5E8E";
const SEP = "D4E6F1";
const BRD = "D5DBDB";
const DATA_BG = "F8F9F9";
const ALT_BG = "FFFFFF";

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

function tdN(v: number, alt: boolean, bold = false) {
  return {
    v, t: "n", s: {
      font: { sz: 10, bold, color: { rgb: "333333" }, name: "Calibri" },
      fill: { fgColor: { rgb: alt ? DATA_BG : ALT_BG } },
      alignment: { horizontal: "right" },
      border: B,
    },
  };
}

function fmtDate(d: string) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function fmtGuia(n: number) {
  return `GT-${String(n).padStart(3, "0")}`;
}

function clientesSummary(items: GuiaItem[]): string {
  if (!items || items.length === 0) return "";
  const unique = [...new Set(items.map((i) => i.cliente).filter(Boolean))];
  if (unique.length === 0) return "";
  if (unique.length === 1) return unique[0];
  return `${unique[0]} y ${unique.length - 1} mas`;
}

function empresasSummary(items: GuiaItem[]): string {
  if (!items || items.length === 0) return "";
  const unique = [...new Set(items.map((i) => i.empresa).filter(Boolean))];
  return unique.join(", ");
}

function facturasSummary(items: GuiaItem[]): string {
  if (!items || items.length === 0) return "";
  const all = items.map((i) => i.facturas).filter(Boolean);
  return all.join(", ");
}

export function exportGuiasExcel(guias: Guia[], subtitle?: string) {
  const ws: XLSX.WorkSheet = {};
  const heights: number[] = [];
  const merges: XLSX.Range[] = [];
  const lastCol = 7; // 8 columns (0-7)
  let r = 0;

  // Title row
  ws[addr(r, 0)] = {
    v: "FASHION GROUP \u2014 Gu\u00edas de Transporte", t: "s", s: {
      font: { bold: true, sz: 14, color: { rgb: "FFFFFF" }, name: "Calibri" },
      fill: { fgColor: { rgb: PRI } },
      alignment: { horizontal: "center", vertical: "center" },
    },
  };
  fillRow(lastCol, r, ws, PRI);
  merges.push({ s: { r, c: 0 }, e: { r, c: lastCol } });
  heights[r] = 30;
  r++;

  // Subtitle row
  const subText = subtitle || "Todas las gu\u00edas";
  ws[addr(r, 0)] = {
    v: subText, t: "s", s: {
      font: { bold: true, sz: 10, color: { rgb: "FFFFFF" }, name: "Calibri" },
      fill: { fgColor: { rgb: MID } },
      alignment: { horizontal: "center", vertical: "center" },
    },
  };
  fillRow(lastCol, r, ws, MID);
  merges.push({ s: { r, c: 0 }, e: { r, c: lastCol } });
  heights[r] = 20;
  r++;

  // Separator
  fillRow(lastCol, r, ws, SEP);
  merges.push({ s: { r, c: 0 }, e: { r, c: lastCol } });
  heights[r] = 4;
  r++;

  // Header row
  const headers = ["N\u00b0 Gu\u00eda", "Fecha", "Transportista", "Clientes", "Empresa", "Facturas", "Bultos", "Estado"];
  headers.forEach((h, i) => {
    ws[addr(r, i)] = hdr(h, i === 6 ? "right" : "left");
  });
  heights[r] = 22;
  r++;

  // Data rows
  let totalBultos = 0;
  guias.forEach((g, idx) => {
    const alt = idx % 2 === 0;
    const items = g.guia_items || [];

    ws[addr(r, 0)] = td(fmtGuia(g.numero), alt, { fg: PRI, bold: true, sz: 10 });
    ws[addr(r, 1)] = td(fmtDate(g.fecha), alt, { fg: "555555", sz: 9 });
    ws[addr(r, 2)] = td(g.transportista || "", alt);
    ws[addr(r, 3)] = td(clientesSummary(items), alt, { sz: 9, fg: "444444" });
    ws[addr(r, 4)] = td(empresasSummary(items), alt, { sz: 9, fg: "555555" });
    ws[addr(r, 5)] = td(facturasSummary(items), alt, { sz: 9, fg: "666666" });
    ws[addr(r, 6)] = tdN(g.total_bultos || 0, alt);
    ws[addr(r, 7)] = td(g.estado || "", alt, { sz: 9, fg: g.estado === "Completada" ? "15803D" : g.estado === "Rechazada" ? "DC2626" : "C2410C" });

    totalBultos += g.total_bultos || 0;
    heights[r] = 18;
    r++;
  });

  // Spacer
  heights[r] = 6;
  r++;

  // Totals row
  const tStyle = (ha = "right") => ({
    font: { bold: true, sz: 10, color: { rgb: "FFFFFF" }, name: "Calibri" },
    fill: { fgColor: { rgb: PRI } },
    alignment: { horizontal: ha, vertical: "center" },
    border: B,
  });
  ws[addr(r, 0)] = { v: `${guias.length} gu\u00edas`, t: "s", s: tStyle("left") };
  for (let c = 1; c <= 5; c++) ws[addr(r, c)] = { v: "", t: "s", s: tStyle("left") };
  ws[addr(r, 6)] = { v: totalBultos, t: "n", s: tStyle("right") };
  ws[addr(r, 7)] = { v: "", t: "s", s: tStyle("left") };
  heights[r] = 22;
  r++;

  // Set worksheet metadata
  ws["!ref"] = `A1:H${r}`;
  ws["!merges"] = merges;
  ws["!cols"] = [
    { wch: 12 },  // N Guia
    { wch: 12 },  // Fecha
    { wch: 20 },  // Transportista
    { wch: 24 },  // Clientes
    { wch: 20 },  // Empresa
    { wch: 28 },  // Facturas
    { wch: 10 },  // Bultos
    { wch: 16 },  // Estado
  ];
  ws["!rows"] = heights.map((h) => ({ hpt: h || 16 }));

  // Build workbook and download
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Gu\u00edas");
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const date = new Date().toISOString().slice(0, 10);
  a.download = `guias-transporte-${date}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
