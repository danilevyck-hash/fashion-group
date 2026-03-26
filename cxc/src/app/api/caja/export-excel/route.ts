import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import * as XLSX from "xlsx";

function fmtDate(d: string) { if (!d) return ""; const [y, m, day] = d.split("-"); return `${day}/${m}/${y}`; }
function addr(r: number, c: number) { return XLSX.utils.encode_cell({ r, c }); }

const B = { top: { style: "thin", color: { rgb: "E8E8E8" } }, bottom: { style: "thin", color: { rgb: "E8E8E8" } }, left: { style: "thin", color: { rgb: "E8E8E8" } }, right: { style: "thin", color: { rgb: "E8E8E8" } } };

function band(v: string, bg: string, fg: string, sz: number, bold: boolean, italic = false) {
  return { v, t: "s", s: { font: { bold, sz, color: { rgb: fg }, italic, name: "Calibri" }, fill: { fgColor: { rgb: bg } }, alignment: { horizontal: "left", vertical: "center" } } };
}
function hdr(v: string, right = false) {
  return { v, t: "s", s: { font: { bold: true, sz: 9, color: { rgb: "FFFFFF" }, name: "Calibri" }, fill: { fgColor: { rgb: "111111" } }, alignment: { horizontal: right ? "right" : "left", vertical: "center" }, border: B } };
}
function td(v: string, alt: boolean, opts: { sz?: number; fg?: string; italic?: boolean } = {}) {
  return { v, t: "s", s: { font: { sz: opts.sz || 10, color: { rgb: opts.fg || "333333" }, italic: opts.italic, name: "Calibri" }, fill: { fgColor: { rgb: alt ? "FAFAFA" : "FFFFFF" } }, alignment: { horizontal: "left" }, border: B } };
}
function tdN(v: number, alt: boolean, bold = false, sz = 10, fg = "333333") {
  return { v, t: "n", z: '"$"#,##0.00', s: { font: { sz, bold, color: { rgb: fg }, name: "Calibri" }, fill: { fgColor: { rgb: alt ? "FAFAFA" : "FFFFFF" } }, alignment: { horizontal: "right" }, border: B } };
}

export async function POST(req: NextRequest) {
  const { periodo_id } = await req.json();
  if (!periodo_id) return NextResponse.json({ error: "No periodo_id" }, { status: 400 });

  const { data: periodo } = await supabaseServer.from("caja_periodos").select("*").eq("id", periodo_id).single();
  const { data: gastos } = await supabaseServer.from("caja_gastos").select("*").eq("periodo_id", periodo_id).order("fecha", { ascending: true });

  const fondo = periodo?.fondo_inicial || 200;
  const ws: XLSX.WorkSheet = {};
  const heights: number[] = [];
  let r = 0;

  // Title
  for (let c = 0; c <= 8; c++) ws[addr(r, c)] = band(c === 0 ? "FASHION GROUP — CAJA MENUDA" : "", "000000", "FFFFFF", 14, true);
  heights[r] = 30; r++;

  // Subtitle
  for (let c = 0; c <= 8; c++) ws[addr(r, c)] = band(c === 0 ? `Período N° ${periodo?.numero || ""}  ·  Apertura: ${fmtDate(periodo?.fecha_apertura || "")}` : "", "1A1A1A", "AAAAAA", 10, false, true);
  heights[r] = 18; r++;

  // Fondo info
  ws[addr(r, 0)] = { v: "Fondo inicial:", t: "s", s: { font: { sz: 9, color: { rgb: "888888" }, name: "Calibri" } } };
  ws[addr(r, 1)] = { v: fondo, t: "n", z: '"$"#,##0.00', s: { font: { bold: true, sz: 10, name: "Calibri" } } };
  heights[r] = 18; r++;

  // Spacer
  heights[r] = 6; r++;

  // Table header
  const cols = ["Fecha", "Descripción", "Proveedor", "Responsable", "Categoría", "N° Factura", "Sub-total", "ITBMS", "Total"];
  cols.forEach((h, i) => { ws[addr(r, i)] = hdr(h, i >= 6); });
  heights[r] = 20; r++;

  // Data rows
  let totalSub = 0, totalItbms = 0, totalTotal = 0;
  (gastos || []).forEach((g, i) => {
    const alt = i % 2 === 0;
    ws[addr(r, 0)] = td(fmtDate(g.fecha), alt, { sz: 9, fg: "555555" });
    ws[addr(r, 1)] = td(g.descripcion || g.nombre || "", alt, { fg: "111111" });
    ws[addr(r, 2)] = td(g.proveedor || "", alt, { sz: 9, fg: "666666" });
    ws[addr(r, 3)] = td(g.responsable || "", alt, { sz: 9, fg: "444444" });
    ws[addr(r, 4)] = td(g.categoria || "Varios", alt, { sz: 9, fg: "555555" });
    ws[addr(r, 5)] = td(g.nro_factura || "", alt, { sz: 9, fg: "999999", italic: true });
    ws[addr(r, 6)] = tdN(g.subtotal || 0, alt);
    ws[addr(r, 7)] = tdN(g.itbms || 0, alt, false, 9, "888888");
    ws[addr(r, 8)] = tdN(g.total || 0, alt, true);
    totalSub += g.subtotal || 0; totalItbms += g.itbms || 0; totalTotal += g.total || 0;
    heights[r] = 18; r++;
  });

  // Spacer
  heights[r] = 6; r++;

  // Totals row
  for (let c = 0; c <= 5; c++) ws[addr(r, c)] = { v: c === 5 ? "TOTALES" : "", t: "s", s: { font: { bold: true, sz: 9, name: "Calibri" }, fill: { fgColor: { rgb: "F0F0F0" } }, alignment: { horizontal: c === 5 ? "right" : "left" }, border: { ...B, top: { style: "medium", color: { rgb: "CCCCCC" } } } } };
  ws[addr(r, 6)] = { v: totalSub, t: "n", z: '"$"#,##0.00', s: { font: { bold: true, sz: 10, name: "Calibri" }, fill: { fgColor: { rgb: "F0F0F0" } }, alignment: { horizontal: "right" }, border: { ...B, top: { style: "medium", color: { rgb: "CCCCCC" } } } } };
  ws[addr(r, 7)] = { v: totalItbms, t: "n", z: '"$"#,##0.00', s: { font: { bold: true, sz: 10, name: "Calibri" }, fill: { fgColor: { rgb: "F0F0F0" } }, alignment: { horizontal: "right" }, border: { ...B, top: { style: "medium", color: { rgb: "CCCCCC" } } } } };
  ws[addr(r, 8)] = { v: totalTotal, t: "n", z: '"$"#,##0.00', s: { font: { bold: true, sz: 10, name: "Calibri" }, fill: { fgColor: { rgb: "F0F0F0" } }, alignment: { horizontal: "right" }, border: { ...B, top: { style: "medium", color: { rgb: "CCCCCC" } } } } };
  heights[r] = 20; r++;

  // Summary
  r++;
  const saldo = fondo - totalTotal;
  const saldoColor = saldo > 0 ? { bg: "F0FDF4", fg: "15803D" } : { bg: "FEF2F2", fg: "DC2626" };
  const sumLbl = (v: string) => ({ v, t: "s", s: { font: { sz: 9, color: { rgb: "888888" }, name: "Calibri" }, alignment: { horizontal: "right" } } });
  const sumNum = (v: number, style = {}) => ({ v, t: "n", z: '"$"#,##0.00', s: { font: { sz: 10, name: "Calibri", ...style }, alignment: { horizontal: "right" } } });

  ws[addr(r, 6)] = sumLbl("Fondo inicial:"); ws[addr(r, 8)] = sumNum(fondo); heights[r] = 18; r++;
  ws[addr(r, 6)] = sumLbl("Total gastado:"); ws[addr(r, 8)] = sumNum(totalTotal, totalTotal > fondo * 0.8 ? { color: { rgb: "DC2626" } } : {}); heights[r] = 18; r++;
  ws[addr(r, 6)] = { v: "Saldo disponible:", t: "s", s: { font: { bold: true, sz: 10, name: "Calibri" }, alignment: { horizontal: "right" } } };
  ws[addr(r, 8)] = { v: saldo, t: "n", z: '"$"#,##0.00', s: { font: { bold: true, sz: 11, color: { rgb: saldoColor.fg }, name: "Calibri" }, fill: { fgColor: { rgb: saldoColor.bg } }, alignment: { horizontal: "right" }, border: B } };
  heights[r] = 20; r++;

  ws["!ref"] = `A1:I${r}`;
  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 8 } }];
  ws["!cols"] = [{ wch: 11 }, { wch: 26 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 11 }, { wch: 9 }, { wch: 11 }];
  ws["!rows"] = heights.map((h) => ({ hpt: h || 16 }));

  // Sheet 2 — Category summary
  const ws2: XLSX.WorkSheet = {};
  const h2: number[] = [];
  const byCategory: Record<string, number> = {};
  for (const g of gastos || []) { const cat = g.categoria || "Varios"; byCategory[cat] = (byCategory[cat] || 0) + (g.total || 0); }
  const sorted = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
  let r2 = 0;

  for (let c = 0; c <= 2; c++) ws2[addr(r2, c)] = band(c === 0 ? "Resumen por Categoría" : "", "000000", "FFFFFF", 12, true);
  h2[r2] = 26; r2++;
  h2[r2] = 6; r2++;
  ws2[addr(r2, 0)] = hdr("Categoría"); ws2[addr(r2, 1)] = hdr("Total", true); ws2[addr(r2, 2)] = hdr("% del total", true);
  h2[r2] = 20; r2++;

  sorted.forEach(([cat, total], i) => {
    const alt = i % 2 === 0;
    const isTop = i === 0;
    const bg = isTop ? "FFF3CD" : alt ? "FAFAFA" : "FFFFFF";
    ws2[addr(r2, 0)] = { v: cat, t: "s", s: { font: { sz: 10, name: "Calibri" }, fill: { fgColor: { rgb: bg } }, alignment: { horizontal: "left" }, border: B } };
    ws2[addr(r2, 1)] = { v: total, t: "n", z: '"$"#,##0.00', s: { font: { bold: true, sz: 10, name: "Calibri" }, fill: { fgColor: { rgb: bg } }, alignment: { horizontal: "right" }, border: B } };
    ws2[addr(r2, 2)] = { v: totalTotal > 0 ? total / totalTotal : 0, t: "n", z: "0.0%", s: { font: { sz: 9, color: { rgb: "888888" }, name: "Calibri" }, fill: { fgColor: { rgb: bg } }, alignment: { horizontal: "right" }, border: B } };
    h2[r2] = 18; r2++;
  });

  // Category total
  ws2[addr(r2, 0)] = { v: "TOTAL", t: "s", s: { font: { bold: true, sz: 10, name: "Calibri" }, fill: { fgColor: { rgb: "F0F0F0" } }, border: { ...B, top: { style: "medium", color: { rgb: "CCCCCC" } } } } };
  ws2[addr(r2, 1)] = { v: totalTotal, t: "n", z: '"$"#,##0.00', s: { font: { bold: true, sz: 10, name: "Calibri" }, fill: { fgColor: { rgb: "F0F0F0" } }, alignment: { horizontal: "right" }, border: { ...B, top: { style: "medium", color: { rgb: "CCCCCC" } } } } };
  ws2[addr(r2, 2)] = { v: 1, t: "n", z: "0%", s: { font: { bold: true, sz: 9, name: "Calibri" }, fill: { fgColor: { rgb: "F0F0F0" } }, alignment: { horizontal: "right" }, border: { ...B, top: { style: "medium", color: { rgb: "CCCCCC" } } } } };
  h2[r2] = 20; r2++;

  ws2["!ref"] = `A1:C${r2}`;
  ws2["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }];
  ws2["!cols"] = [{ wch: 22 }, { wch: 14 }, { wch: 12 }];
  ws2["!rows"] = h2.map((h) => ({ hpt: h || 16 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Gastos");
  XLSX.utils.book_append_sheet(wb, ws2, "Por Categoría");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="CajaMenuda-Periodo${periodo?.numero || ""}.xlsx"`,
    },
  });
}
