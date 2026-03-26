import * as XLSX from "xlsx";

type CellStyle = {
  font?: { bold?: boolean; sz?: number; color?: { rgb: string }; italic?: boolean };
  fill?: { fgColor: { rgb: string } };
  alignment?: { horizontal?: string; vertical?: string };
  border?: Record<string, { style: string; color: { rgb: string } }>;
  numFmt?: string;
};

type Cell = { v: string | number | null; t: string; s?: CellStyle; z?: string };

function fmtDate(d: string) { if (!d) return ""; const [y, m, day] = d.split("-"); return `${day}/${m}/${y}`; }

const B = { top: { style: "thin", color: { rgb: "E0E0E0" } }, bottom: { style: "thin", color: { rgb: "E0E0E0" } }, left: { style: "thin", color: { rgb: "E0E0E0" } }, right: { style: "thin", color: { rgb: "E0E0E0" } } };

function headerBand(v: string, sz = 14, italic = false): Cell {
  return { v, t: "s", s: { font: { bold: !italic, sz, color: { rgb: "FFFFFF" }, italic }, fill: { fgColor: { rgb: "1A1A1A" } }, alignment: { horizontal: "left", vertical: "center" } } };
}
function label(v: string): Cell {
  return { v, t: "s", s: { font: { sz: 9, color: { rgb: "999999" } }, alignment: { horizontal: "left" } } };
}
function val(v: string | number, bold = false): Cell {
  return { v: String(v), t: "s", s: { font: { bold, sz: 10 }, alignment: { horizontal: "left" } } };
}
function thCell(v: string): Cell {
  return { v, t: "s", s: { font: { bold: true, sz: 9, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "1A1A1A" } }, alignment: { horizontal: "left", vertical: "center" }, border: B } };
}
function thRight(v: string): Cell {
  return { ...thCell(v), s: { ...thCell(v).s!, alignment: { horizontal: "right", vertical: "center" } } };
}
function td(v: string | number | null, alt: boolean): Cell {
  const bg = alt ? "FAFAFA" : "FFFFFF";
  return { v: v ?? "", t: "s", s: { font: { sz: 10 }, fill: { fgColor: { rgb: bg } }, alignment: { horizontal: "left" }, border: B } };
}
function tdNum(v: number, alt: boolean): Cell {
  const bg = alt ? "FAFAFA" : "FFFFFF";
  return { v, t: "n", z: '"$"#,##0.00', s: { font: { sz: 10 }, fill: { fgColor: { rgb: bg } }, alignment: { horizontal: "right" }, border: B } };
}
function totLabel(v: string): Cell {
  return { v, t: "s", s: { font: { sz: 10, color: { rgb: "444444" } }, fill: { fgColor: { rgb: "F9F9F9" } }, alignment: { horizontal: "right" }, border: B } };
}
function totVal(v: number): Cell {
  return { v, t: "n", z: '"$"#,##0.00', s: { font: { sz: 10 }, fill: { fgColor: { rgb: "F9F9F9" } }, alignment: { horizontal: "right" }, border: B } };
}
function totalBand(v: string): Cell {
  return { v, t: "s", s: { font: { bold: true, sz: 11, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "1A1A1A" } }, alignment: { horizontal: "left", vertical: "center" } } };
}
function totalBandNum(v: number): Cell {
  return { v, t: "n", z: '"$"#,##0.00', s: { font: { bold: true, sz: 11, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "1A1A1A" } }, alignment: { horizontal: "right", vertical: "center" } } };
}

function addr(r: number, c: number) { return XLSX.utils.encode_cell({ r, c }); }

export function buildReclamoSheet(rec: Record<string, unknown>, items: Record<string, unknown>[]): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  ws["!ref"] = "A1"; // will be updated

  let r = 0;
  // Row 0: Title
  ws[addr(r, 0)] = headerBand("FASHION GROUP", 14);
  for (let c = 1; c <= 6; c++) ws[addr(r, c)] = headerBand("", 14);
  r++;
  // Row 1: Subtitle
  ws[addr(r, 0)] = headerBand("Reclamo a Proveedor", 10, true);
  for (let c = 1; c <= 6; c++) ws[addr(r, c)] = headerBand("", 10, true);
  r++;
  // Row 2: spacer
  r++;

  // Rows 3-6: Info grid
  ws[addr(r, 0)] = label("N° Reclamo"); ws[addr(r, 1)] = val(String(rec.nro_reclamo || ""), true);
  ws[addr(r, 4)] = label("Empresa"); ws[addr(r, 5)] = val(String(rec.empresa || ""), true);
  r++;
  ws[addr(r, 0)] = label("Proveedor"); ws[addr(r, 1)] = val(String(rec.proveedor || ""));
  ws[addr(r, 4)] = label("Marca"); ws[addr(r, 5)] = val(String(rec.marca || ""));
  r++;
  ws[addr(r, 0)] = label("N° Factura"); ws[addr(r, 1)] = val(String(rec.nro_factura || ""), true);
  ws[addr(r, 4)] = label("Fecha"); ws[addr(r, 5)] = val(fmtDate(String(rec.fecha_reclamo || "")));
  r++;
  ws[addr(r, 0)] = label("Estado"); ws[addr(r, 1)] = val(String(rec.estado || ""));
  ws[addr(r, 4)] = label("N° Pedido"); ws[addr(r, 5)] = val(String(rec.nro_orden_compra || "—"));
  r++;
  // Spacer
  r++;

  // Table header
  const thRow = r;
  ws[addr(r, 0)] = thCell("Código"); ws[addr(r, 1)] = thCell("Descripción"); ws[addr(r, 2)] = thCell("Talla");
  ws[addr(r, 3)] = thRight("Cant."); ws[addr(r, 4)] = thRight("Precio Unit."); ws[addr(r, 5)] = thRight("Subtotal"); ws[addr(r, 6)] = thCell("Motivo");
  r++;

  // Items
  let subtotal = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const alt = i % 2 === 0;
    const cant = Number(item.cantidad) || 0;
    const precio = Number(item.precio_unitario) || 0;
    const sub = cant * precio;
    subtotal += sub;
    ws[addr(r, 0)] = td(String(item.referencia || ""), alt);
    ws[addr(r, 1)] = td(String(item.descripcion || ""), alt);
    ws[addr(r, 2)] = td(String(item.talla || ""), alt);
    ws[addr(r, 3)] = tdNum(cant, alt);
    ws[addr(r, 4)] = tdNum(precio, alt);
    ws[addr(r, 5)] = tdNum(sub, alt);
    ws[addr(r, 6)] = td(String(item.motivo || ""), alt);
    r++;
  }

  // Spacer
  r++;

  // Totals
  const imp = subtotal * 0.10;
  const itbms = subtotal * 0.077;
  const total = subtotal + imp + itbms;

  ws[addr(r, 5)] = totLabel("Subtotal:"); ws[addr(r, 6)] = totVal(subtotal); r++;
  ws[addr(r, 5)] = totLabel("Importación (10%):"); ws[addr(r, 6)] = totVal(imp); r++;
  ws[addr(r, 5)] = totLabel("ITBMS (7% s/imp.):"); ws[addr(r, 6)] = totVal(itbms); r++;

  // Total band
  const totalRow = r;
  for (let c = 0; c <= 4; c++) ws[addr(r, c)] = totalBand(c === 0 ? "TOTAL A ACREDITAR" : "");
  ws[addr(r, 5)] = totalBandNum(total); ws[addr(r, 6)] = totalBand("");
  r++;

  // Set ref
  ws["!ref"] = `A1:G${r}`;

  // Merges
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }, // title
    { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } }, // subtitle
    { s: { r: totalRow, c: 0 }, e: { r: totalRow, c: 4 } }, // total label
  ];

  // Column widths
  ws["!cols"] = [
    { wch: 18 }, { wch: 32 }, { wch: 10 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 24 },
  ];

  // Row heights
  ws["!rows"] = [];
  ws["!rows"][0] = { hpt: 28 };
  ws["!rows"][1] = { hpt: 18 };
  ws["!rows"][2] = { hpt: 6 };
  ws["!rows"][thRow] = { hpt: 22 };
  ws["!rows"][totalRow] = { hpt: 24 };

  return ws;
}
