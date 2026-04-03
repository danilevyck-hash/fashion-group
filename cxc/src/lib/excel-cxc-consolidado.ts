import XLSX from "xlsx-js-style";
import type { ConsolidatedClient } from "./types";
import type { Company } from "./companies";
import { fmt } from "./format";

function addr(r: number, c: number) { return XLSX.utils.encode_cell({ r, c }); }

const PRI = "1B3A5C";
const MID = "2E5E8E";
const SEP = "D4E6F1";
const LBL_BG = "EBF5FB";
const DATA_BG = "F8F9F9";
const BRD = "D5DBDB";
const GREEN = "15803D";
const AMBER = "C2410C";
const RED = "DC2626";
const GREEN_BG = "F0FDF4";
const AMBER_BG = "FFF7ED";
const RED_BG = "FEF2F2";

const B = {
  top: { style: "thin", color: { rgb: BRD } },
  bottom: { style: "thin", color: { rgb: BRD } },
  left: { style: "thin", color: { rgb: BRD } },
  right: { style: "thin", color: { rgb: BRD } },
} as const;

const hdrStyle = (ha = "center") => ({
  font: { bold: true, sz: 10, color: { rgb: "FFFFFF" }, name: "Calibri" },
  fill: { fgColor: { rgb: PRI } },
  alignment: { horizontal: ha, vertical: "center" },
  border: B,
});

const cellStyle = (fg = "111111", bold = false, ha = "left", bg = DATA_BG) => ({
  font: { bold, sz: 10, color: { rgb: fg }, name: "Calibri" },
  fill: { fgColor: { rgb: bg } },
  alignment: { horizontal: ha },
  border: B,
});

const numFmt = '"$"#,##0.00';

function fillRow(cols: number, r: number, ws: XLSX.WorkSheet, bg: string) {
  for (let i = 0; i <= cols; i++) if (!ws[addr(r, i)]) ws[addr(r, i)] = { v: "", t: "s", s: { fill: { fgColor: { rgb: bg } } } };
}

function addTitle(ws: XLSX.WorkSheet, merges: XLSX.Range[], heights: number[], cols: number, date: string): number {
  let r = 0;
  ws[addr(r, 0)] = { v: "FASHION GROUP", t: "s", s: { font: { bold: true, sz: 18, color: { rgb: "FFFFFF" }, name: "Calibri" }, fill: { fgColor: { rgb: PRI } }, alignment: { horizontal: "center", vertical: "center" } } };
  fillRow(cols, r, ws, PRI); merges.push({ s: { r, c: 0 }, e: { r, c: cols } }); heights[r] = 32; r++;

  ws[addr(r, 0)] = { v: `Cartera Consolidada — ${date}`, t: "s", s: { font: { bold: true, sz: 12, color: { rgb: "FFFFFF" }, name: "Calibri" }, fill: { fgColor: { rgb: MID } }, alignment: { horizontal: "center", vertical: "center" } } };
  fillRow(cols, r, ws, MID); merges.push({ s: { r, c: 0 }, e: { r, c: cols } }); heights[r] = 22; r++;

  fillRow(cols, r, ws, SEP); merges.push({ s: { r, c: 0 }, e: { r, c: cols } }); heights[r] = 6; r++;
  return r;
}

function buildResumenSheet(clients: ConsolidatedClient[], companies: Company[], date: string): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  const h: number[] = [];
  const merges: XLSX.Range[] = [];
  const lastCol = 6; // Empresa, 0-30, 31-60, 61-90, 91-120, 121+, Total

  let r = addTitle(ws, merges, h, lastCol, date);

  // Summary by company
  const headers = ["Empresa", "0-30d", "31-60d", "61-90d", "91-120d", "121d+", "Total"];
  headers.forEach((hv, i) => { ws[addr(r, i)] = { v: hv, t: "s", s: hdrStyle(i === 0 ? "left" : "right") }; });
  h[r] = 22; r++;

  let gd0 = 0, gd1 = 0, gd2 = 0, gd3 = 0, gd4 = 0, gTotal = 0;

  for (const co of companies) {
    let cd0 = 0, cd1 = 0, cd2 = 0, cd3 = 0, cd4 = 0, cTotal = 0;
    for (const cl of clients) {
      const d = cl.companies[co.key];
      if (!d) continue;
      cd0 += d.d0_30; cd1 += d.d31_60; cd2 += d.d61_90;
      cd3 += d.d91_120;
      cd4 += d.d121_180 + d.d181_270 + d.d271_365 + d.mas_365;
      cTotal += d.total;
    }
    gd0 += cd0; gd1 += cd1; gd2 += cd2; gd3 += cd3; gd4 += cd4; gTotal += cTotal;

    const pctVencido = cTotal > 0 ? (cd4 / cTotal * 100) : 0;
    const bg = pctVencido > 20 ? RED_BG : pctVencido > 10 ? AMBER_BG : DATA_BG;

    ws[addr(r, 0)] = { v: `${co.name} (${co.brand})`, t: "s", s: cellStyle(PRI, true, "left", bg) };
    ws[addr(r, 1)] = { v: cd0, t: "n", z: numFmt, s: cellStyle("111111", false, "right", bg) };
    ws[addr(r, 2)] = { v: cd1, t: "n", z: numFmt, s: cellStyle("111111", false, "right", bg) };
    ws[addr(r, 3)] = { v: cd2, t: "n", z: numFmt, s: cellStyle("111111", false, "right", bg) };
    ws[addr(r, 4)] = { v: cd3, t: "n", z: numFmt, s: cellStyle(AMBER, true, "right", bg) };
    ws[addr(r, 5)] = { v: cd4, t: "n", z: numFmt, s: cellStyle(cd4 > 0 ? RED : "111111", cd4 > 0, "right", bg) };
    ws[addr(r, 6)] = { v: cTotal, t: "n", z: numFmt, s: cellStyle(PRI, true, "right", bg) };
    h[r] = 20; r++;
  }

  // Totals row
  const tStyle = (ha = "right") => ({
    font: { bold: true, sz: 11, color: { rgb: "FFFFFF" }, name: "Calibri" },
    fill: { fgColor: { rgb: PRI } },
    alignment: { horizontal: ha, vertical: "center" },
    border: B,
  });
  ws[addr(r, 0)] = { v: "TOTAL GRUPO", t: "s", s: tStyle("left") };
  ws[addr(r, 1)] = { v: gd0, t: "n", z: numFmt, s: tStyle() };
  ws[addr(r, 2)] = { v: gd1, t: "n", z: numFmt, s: tStyle() };
  ws[addr(r, 3)] = { v: gd2, t: "n", z: numFmt, s: tStyle() };
  ws[addr(r, 4)] = { v: gd3, t: "n", z: numFmt, s: tStyle() };
  ws[addr(r, 5)] = { v: gd4, t: "n", z: numFmt, s: tStyle() };
  ws[addr(r, 6)] = { v: gTotal, t: "n", z: numFmt, s: tStyle() };
  h[r] = 26; r++;

  // Spacer
  fillRow(lastCol, r, ws, "FFFFFF"); h[r] = 12; r++;

  // % Vencido breakdown
  ws[addr(r, 0)] = { v: "% Vencido (>90d) por Empresa", t: "s", s: { font: { bold: true, sz: 11, color: { rgb: "FFFFFF" }, name: "Calibri" }, fill: { fgColor: { rgb: MID } }, alignment: { horizontal: "center", vertical: "center" } } };
  fillRow(lastCol, r, ws, MID); merges.push({ s: { r, c: 0 }, e: { r, c: lastCol } }); h[r] = 22; r++;

  const pctHeaders = ["Empresa", "Corriente (0-90d)", "Vigilancia (91-120d)", "Vencido (121d+)", "% Vencido", "", ""];
  pctHeaders.forEach((hv, i) => { ws[addr(r, i)] = { v: hv, t: "s", s: hdrStyle(i === 0 ? "left" : "center") }; });
  h[r] = 22; r++;

  for (const co of companies) {
    let curr = 0, watch = 0, over = 0, tot = 0;
    for (const cl of clients) {
      const d = cl.companies[co.key];
      if (!d) continue;
      curr += d.d0_30 + d.d31_60 + d.d61_90;
      watch += d.d91_120;
      over += d.d121_180 + d.d181_270 + d.d271_365 + d.mas_365;
      tot += d.total;
    }
    const pct = tot > 0 ? (over / tot * 100) : 0;
    const fg = pct > 20 ? RED : pct > 10 ? AMBER : GREEN;

    ws[addr(r, 0)] = { v: co.name, t: "s", s: cellStyle(PRI, false, "left") };
    ws[addr(r, 1)] = { v: curr, t: "n", z: numFmt, s: cellStyle(GREEN, false, "center", GREEN_BG) };
    ws[addr(r, 2)] = { v: watch, t: "n", z: numFmt, s: cellStyle(AMBER, false, "center", AMBER_BG) };
    ws[addr(r, 3)] = { v: over, t: "n", z: numFmt, s: cellStyle(RED, false, "center", RED_BG) };
    ws[addr(r, 4)] = { v: `${pct.toFixed(1)}%`, t: "s", s: cellStyle(fg, true, "center") };
    ws[addr(r, 5)] = { v: "", t: "s", s: { fill: { fgColor: { rgb: DATA_BG } }, border: B } };
    ws[addr(r, 6)] = { v: "", t: "s", s: { fill: { fgColor: { rgb: DATA_BG } }, border: B } };
    h[r] = 18; r++;
  }

  ws["!ref"] = `A1:G${r}`;
  ws["!merges"] = merges;
  ws["!cols"] = [{ wch: 34 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
  ws["!rows"] = h.map((v) => ({ hpt: v || 16 }));
  return ws;
}

function buildEmpresaSheet(clients: ConsolidatedClient[], companyKey: string, companyName: string, date: string): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  const h: number[] = [];
  const merges: XLSX.Range[] = [];
  const lastCol = 10;

  // Title
  let r = 0;
  ws[addr(r, 0)] = { v: "FASHION GROUP", t: "s", s: { font: { bold: true, sz: 16, color: { rgb: "FFFFFF" }, name: "Calibri" }, fill: { fgColor: { rgb: PRI } }, alignment: { horizontal: "center", vertical: "center" } } };
  fillRow(lastCol, r, ws, PRI); merges.push({ s: { r, c: 0 }, e: { r, c: lastCol } }); h[r] = 28; r++;

  ws[addr(r, 0)] = { v: `${companyName} — ${date}`, t: "s", s: { font: { bold: true, sz: 11, color: { rgb: "FFFFFF" }, name: "Calibri" }, fill: { fgColor: { rgb: MID } }, alignment: { horizontal: "center", vertical: "center" } } };
  fillRow(lastCol, r, ws, MID); merges.push({ s: { r, c: 0 }, e: { r, c: lastCol } }); h[r] = 20; r++;

  fillRow(lastCol, r, ws, SEP); merges.push({ s: { r, c: 0 }, e: { r, c: lastCol } }); h[r] = 4; r++;

  // Headers
  const headers = ["Cliente", "Código", "0-30d", "31-60d", "61-90d", "91-120d", "121-180d", "181-270d", "271-365d", "+365d", "Total"];
  headers.forEach((hv, i) => { ws[addr(r, i)] = { v: hv, t: "s", s: hdrStyle(i <= 1 ? "left" : "right") }; });
  h[r] = 22; r++;

  // Filter and sort clients for this company
  const coClients = clients
    .filter((c) => c.companies[companyKey] && c.companies[companyKey].total > 0)
    .map((c) => ({ ...c, coData: c.companies[companyKey] }))
    .sort((a, b) => b.coData.total - a.coData.total);

  let tD0 = 0, tD1 = 0, tD2 = 0, tD3 = 0, tD4 = 0, tD5 = 0, tD6 = 0, tD7 = 0, tTotal = 0;

  for (const cl of coClients) {
    const d = cl.coData;
    const overdue = d.d121_180 + d.d181_270 + d.d271_365 + d.mas_365;
    const rowBg = overdue > 0 ? "FEF7F7" : d.d91_120 > 0 ? "FFFBF5" : DATA_BG;

    ws[addr(r, 0)] = { v: cl.nombre_normalized, t: "s", s: cellStyle("111111", false, "left", rowBg) };
    ws[addr(r, 1)] = { v: d.codigo || "", t: "s", s: cellStyle("666666", false, "left", rowBg) };
    ws[addr(r, 2)] = { v: d.d0_30, t: "n", z: numFmt, s: cellStyle("111111", false, "right", rowBg) };
    ws[addr(r, 3)] = { v: d.d31_60, t: "n", z: numFmt, s: cellStyle("111111", false, "right", rowBg) };
    ws[addr(r, 4)] = { v: d.d61_90, t: "n", z: numFmt, s: cellStyle("111111", false, "right", rowBg) };
    ws[addr(r, 5)] = { v: d.d91_120, t: "n", z: numFmt, s: cellStyle(d.d91_120 > 0 ? AMBER : "111111", d.d91_120 > 0, "right", rowBg) };
    ws[addr(r, 6)] = { v: d.d121_180, t: "n", z: numFmt, s: cellStyle(d.d121_180 > 0 ? RED : "111111", false, "right", rowBg) };
    ws[addr(r, 7)] = { v: d.d181_270, t: "n", z: numFmt, s: cellStyle(d.d181_270 > 0 ? RED : "111111", false, "right", rowBg) };
    ws[addr(r, 8)] = { v: d.d271_365, t: "n", z: numFmt, s: cellStyle(d.d271_365 > 0 ? RED : "111111", false, "right", rowBg) };
    ws[addr(r, 9)] = { v: d.mas_365, t: "n", z: numFmt, s: cellStyle(d.mas_365 > 0 ? RED : "111111", false, "right", rowBg) };
    ws[addr(r, 10)] = { v: d.total, t: "n", z: numFmt, s: cellStyle(PRI, true, "right", rowBg) };

    tD0 += d.d0_30; tD1 += d.d31_60; tD2 += d.d61_90; tD3 += d.d91_120;
    tD4 += d.d121_180; tD5 += d.d181_270; tD6 += d.d271_365; tD7 += d.mas_365;
    tTotal += d.total;
    h[r] = 18; r++;
  }

  // Totals row
  const ts = (ha = "right") => ({
    font: { bold: true, sz: 10, color: { rgb: "FFFFFF" }, name: "Calibri" },
    fill: { fgColor: { rgb: PRI } },
    alignment: { horizontal: ha, vertical: "center" },
    border: B,
  });
  ws[addr(r, 0)] = { v: `TOTAL ${companyName.toUpperCase()}`, t: "s", s: ts("left") };
  ws[addr(r, 1)] = { v: `${coClients.length} clientes`, t: "s", s: ts("left") };
  ws[addr(r, 2)] = { v: tD0, t: "n", z: numFmt, s: ts() };
  ws[addr(r, 3)] = { v: tD1, t: "n", z: numFmt, s: ts() };
  ws[addr(r, 4)] = { v: tD2, t: "n", z: numFmt, s: ts() };
  ws[addr(r, 5)] = { v: tD3, t: "n", z: numFmt, s: ts() };
  ws[addr(r, 6)] = { v: tD4, t: "n", z: numFmt, s: ts() };
  ws[addr(r, 7)] = { v: tD5, t: "n", z: numFmt, s: ts() };
  ws[addr(r, 8)] = { v: tD6, t: "n", z: numFmt, s: ts() };
  ws[addr(r, 9)] = { v: tD7, t: "n", z: numFmt, s: ts() };
  ws[addr(r, 10)] = { v: tTotal, t: "n", z: numFmt, s: ts() };
  h[r] = 24; r++;

  ws["!ref"] = `A1:K${r}`;
  ws["!merges"] = merges;
  ws["!cols"] = [{ wch: 30 }, { wch: 12 }, { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 15 }];
  ws["!rows"] = h.map((v) => ({ hpt: v || 16 }));
  return ws;
}

function buildTop20Sheet(clients: ConsolidatedClient[], companies: Company[], date: string): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  const h: number[] = [];
  const merges: XLSX.Range[] = [];
  const lastCol = 5;

  let r = 0;
  ws[addr(r, 0)] = { v: "FASHION GROUP", t: "s", s: { font: { bold: true, sz: 16, color: { rgb: "FFFFFF" }, name: "Calibri" }, fill: { fgColor: { rgb: PRI } }, alignment: { horizontal: "center", vertical: "center" } } };
  fillRow(lastCol, r, ws, PRI); merges.push({ s: { r, c: 0 }, e: { r, c: lastCol } }); h[r] = 28; r++;

  ws[addr(r, 0)] = { v: `Top 20 Deudores del Grupo — ${date}`, t: "s", s: { font: { bold: true, sz: 11, color: { rgb: "FFFFFF" }, name: "Calibri" }, fill: { fgColor: { rgb: MID } }, alignment: { horizontal: "center", vertical: "center" } } };
  fillRow(lastCol, r, ws, MID); merges.push({ s: { r, c: 0 }, e: { r, c: lastCol } }); h[r] = 20; r++;

  fillRow(lastCol, r, ws, SEP); merges.push({ s: { r, c: 0 }, e: { r, c: lastCol } }); h[r] = 4; r++;

  // Headers
  const headers = ["#", "Cliente", "Empresas", "Corriente", "Vencido (121d+)", "Total"];
  headers.forEach((hv, i) => { ws[addr(r, i)] = { v: hv, t: "s", s: hdrStyle(i <= 2 ? "left" : "right") }; });
  h[r] = 22; r++;

  const top20 = [...clients].sort((a, b) => b.total - a.total).slice(0, 20);

  for (let i = 0; i < top20.length; i++) {
    const cl = top20[i];
    const empresas = companies
      .filter((co) => cl.companies[co.key] && cl.companies[co.key].total > 0)
      .map((co) => co.name)
      .join(", ");

    const bg = i < 3 ? RED_BG : i < 10 ? AMBER_BG : DATA_BG;

    ws[addr(r, 0)] = { v: i + 1, t: "n", s: cellStyle(PRI, true, "left", bg) };
    ws[addr(r, 1)] = { v: cl.nombre_normalized, t: "s", s: cellStyle("111111", true, "left", bg) };
    ws[addr(r, 2)] = { v: empresas, t: "s", s: cellStyle("666666", false, "left", bg) };
    ws[addr(r, 3)] = { v: cl.current, t: "n", z: numFmt, s: cellStyle(GREEN, false, "right", bg) };
    ws[addr(r, 4)] = { v: cl.overdue, t: "n", z: numFmt, s: cellStyle(cl.overdue > 0 ? RED : "111111", cl.overdue > 0, "right", bg) };
    ws[addr(r, 5)] = { v: cl.total, t: "n", z: numFmt, s: cellStyle(PRI, true, "right", bg) };
    h[r] = 20; r++;
  }

  // Total row
  const tTotal = top20.reduce((s, c) => s + c.total, 0);
  const tCurrent = top20.reduce((s, c) => s + c.current, 0);
  const tOverdue = top20.reduce((s, c) => s + c.overdue, 0);
  const ts = (ha = "right") => ({
    font: { bold: true, sz: 10, color: { rgb: "FFFFFF" }, name: "Calibri" },
    fill: { fgColor: { rgb: PRI } },
    alignment: { horizontal: ha, vertical: "center" },
    border: B,
  });
  ws[addr(r, 0)] = { v: "", t: "s", s: ts("left") };
  ws[addr(r, 1)] = { v: "TOTAL TOP 20", t: "s", s: ts("left") };
  ws[addr(r, 2)] = { v: "", t: "s", s: ts("left") };
  ws[addr(r, 3)] = { v: tCurrent, t: "n", z: numFmt, s: ts() };
  ws[addr(r, 4)] = { v: tOverdue, t: "n", z: numFmt, s: ts() };
  ws[addr(r, 5)] = { v: tTotal, t: "n", z: numFmt, s: ts() };
  h[r] = 24; r++;

  ws["!ref"] = `A1:F${r}`;
  ws["!merges"] = merges;
  ws["!cols"] = [{ wch: 4 }, { wch: 32 }, { wch: 36 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
  ws["!rows"] = h.map((v) => ({ hpt: v || 16 }));
  return ws;
}

export function exportConsolidado(clients: ConsolidatedClient[], companies: Company[]) {
  const date = new Date().toISOString().slice(0, 10);
  const wb = XLSX.utils.book_new();

  // Sheet 1: Resumen
  XLSX.utils.book_append_sheet(wb, buildResumenSheet(clients, companies, date), "Resumen");

  // Sheets 2-6: One per company
  for (const co of companies) {
    const sheetName = co.name.length > 31 ? co.name.slice(0, 31) : co.name;
    XLSX.utils.book_append_sheet(wb, buildEmpresaSheet(clients, co.key, co.name, date), sheetName);
  }

  // Sheet 7: Top 20
  XLSX.utils.book_append_sheet(wb, buildTop20Sheet(clients, companies, date), "Top 20 Grupo");

  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `CXC_Consolidado_Fashion_Group_${date}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
