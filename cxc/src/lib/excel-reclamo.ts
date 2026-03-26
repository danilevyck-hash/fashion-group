import * as XLSX from "xlsx";

function fmtDate(d: string) { if (!d) return ""; const [y, m, day] = d.split("-"); return `${day}/${m}/${y}`; }
function addr(r: number, c: number) { return XLSX.utils.encode_cell({ r, c }); }

const B = { top: { style: "thin", color: { rgb: "E8E8E8" } }, bottom: { style: "thin", color: { rgb: "E8E8E8" } }, left: { style: "thin", color: { rgb: "E8E8E8" } }, right: { style: "thin", color: { rgb: "E8E8E8" } } };

const ESTADO_COLORS: Record<string, { bg: string; fg: string }> = {
  "Enviado": { bg: "EFF6FF", fg: "1D4ED8" },
  "En Revisión": { bg: "FFF7ED", fg: "C2410C" },
  "N/C Aprobada": { bg: "F0FDF4", fg: "15803D" },
  "Aplicada": { bg: "F9FAFB", fg: "374151" },
};

function bandCell(v: string, bg: string, fg: string, sz: number, bold: boolean, italic = false) {
  return { v, t: "s", s: { font: { bold, sz, color: { rgb: fg }, italic, name: "Calibri" }, fill: { fgColor: { rgb: bg } }, alignment: { horizontal: "left", vertical: "center" } } };
}
function lbl(v: string) { return { v, t: "s", s: { font: { sz: 9, color: { rgb: "888888" }, name: "Calibri" }, alignment: { horizontal: "left" } } }; }
function val(v: string, bold = false) { return { v, t: "s", s: { font: { bold, sz: 10, color: { rgb: "111111" }, name: "Calibri" }, alignment: { horizontal: "left" } } }; }
function estadoCell(estado: string) {
  const c = ESTADO_COLORS[estado] || { bg: "F9FAFB", fg: "374151" };
  return { v: estado, t: "s", s: { font: { sz: 10, color: { rgb: c.fg }, name: "Calibri" }, fill: { fgColor: { rgb: c.bg } }, alignment: { horizontal: "left" }, border: B } };
}
function hdr(v: string, right = false) {
  return { v, t: "s", s: { font: { bold: true, sz: 9, color: { rgb: "FFFFFF" }, name: "Calibri" }, fill: { fgColor: { rgb: "111111" } }, alignment: { horizontal: right ? "right" : "left", vertical: "center" }, border: B } };
}
function td(v: string, alt: boolean, opts: { center?: boolean; italic?: boolean; sz?: number; fg?: string } = {}) {
  return { v, t: "s", s: { font: { sz: opts.sz || 10, color: { rgb: opts.fg || "333333" }, italic: opts.italic, name: "Calibri" }, fill: { fgColor: { rgb: alt ? "FAFAFA" : "FFFFFF" } }, alignment: { horizontal: opts.center ? "center" : "left" }, border: B } };
}
function tdN(v: number, alt: boolean, bold = false, sz = 10) {
  return { v, t: "n", z: '"$"#,##0.00', s: { font: { sz, bold, color: { rgb: "111111" }, name: "Calibri" }, fill: { fgColor: { rgb: alt ? "FAFAFA" : "FFFFFF" } }, alignment: { horizontal: "right" }, border: B } };
}

export function buildReclamoSheet(rec: Record<string, unknown>, items: Record<string, unknown>[]): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  const rows: number[] = []; // track row heights
  let r = 0;

  // Row 0: Title
  for (let c = 0; c <= 6; c++) ws[addr(r, c)] = bandCell(c === 0 ? "FASHION GROUP" : "", "000000", "FFFFFF", 16, true);
  rows[r] = 32; r++;

  // Row 1: Subtitle
  for (let c = 0; c <= 6; c++) ws[addr(r, c)] = bandCell(c === 0 ? "Reclamo a Proveedor" : "", "1A1A1A", "AAAAAA", 10, false, true);
  rows[r] = 18; r++;

  // Row 2: spacer
  rows[r] = 6; r++;

  // Rows 3-6: Metadata
  ws[addr(r, 0)] = lbl("N° Reclamo"); ws[addr(r, 1)] = val(String(rec.nro_reclamo || ""), true);
  ws[addr(r, 4)] = lbl("Empresa"); ws[addr(r, 5)] = val(String(rec.empresa || ""), true);
  rows[r] = 18; r++;

  ws[addr(r, 0)] = lbl("Proveedor"); ws[addr(r, 1)] = val(String(rec.proveedor || ""));
  ws[addr(r, 4)] = lbl("Marca"); ws[addr(r, 5)] = val(String(rec.marca || ""));
  rows[r] = 18; r++;

  ws[addr(r, 0)] = lbl("N° Factura"); ws[addr(r, 1)] = val(String(rec.nro_factura || ""), true);
  ws[addr(r, 4)] = lbl("Fecha"); ws[addr(r, 5)] = val(fmtDate(String(rec.fecha_reclamo || "")));
  rows[r] = 18; r++;

  ws[addr(r, 0)] = lbl("Estado"); ws[addr(r, 1)] = estadoCell(String(rec.estado || ""));
  ws[addr(r, 4)] = lbl("N° Pedido"); ws[addr(r, 5)] = val(String(rec.nro_orden_compra || "—"));
  rows[r] = 18; r++;

  // Divider
  rows[r] = 8; r++;

  // Table header
  const thRow = r;
  ws[addr(r, 0)] = hdr("Código"); ws[addr(r, 1)] = hdr("Descripción"); ws[addr(r, 2)] = hdr("Talla");
  ws[addr(r, 3)] = hdr("Cant.", true); ws[addr(r, 4)] = hdr("Precio Unit.", true); ws[addr(r, 5)] = hdr("Subtotal", true); ws[addr(r, 6)] = hdr("Motivo");
  rows[r] = 20; r++;

  // Items
  let subtotal = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i]; const alt = i % 2 === 0;
    const cant = Number(item.cantidad) || 0; const precio = Number(item.precio_unitario) || 0; const sub = cant * precio;
    subtotal += sub;
    ws[addr(r, 0)] = td(String(item.referencia || ""), alt, { fg: "333333" });
    ws[addr(r, 1)] = td(String(item.descripcion || ""), alt, { fg: "111111" });
    ws[addr(r, 2)] = td(String(item.talla || ""), alt, { center: true, fg: "555555" });
    ws[addr(r, 3)] = tdN(cant, alt);
    ws[addr(r, 4)] = tdN(precio, alt);
    ws[addr(r, 5)] = tdN(sub, alt, true);
    ws[addr(r, 6)] = td(String(item.motivo || ""), alt, { italic: true, sz: 9, fg: "666666" });
    rows[r] = 18; r++;
  }

  // Spacer
  rows[r] = 8; r++;

  // Totals
  const imp = subtotal * 0.10; const itbms = subtotal * 0.077; const total = subtotal + imp + itbms;
  const totLbl = (v: string) => ({ v, t: "s", s: { font: { sz: 9, color: { rgb: "888888" }, name: "Calibri" }, alignment: { horizontal: "right" } } });
  const totNum = (v: number) => ({ v, t: "n", z: '"$"#,##0.00', s: { font: { sz: 10, name: "Calibri" }, alignment: { horizontal: "right" } } });

  ws[addr(r, 5)] = totLbl("Subtotal:"); ws[addr(r, 6)] = totNum(subtotal); rows[r] = 16; r++;
  ws[addr(r, 5)] = totLbl("Importación (10%):"); ws[addr(r, 6)] = totNum(imp); rows[r] = 16; r++;
  ws[addr(r, 5)] = totLbl("ITBMS (7% s/imp.):"); ws[addr(r, 6)] = totNum(itbms); rows[r] = 16; r++;

  // Final total
  const totalRow = r;
  for (let c = 0; c <= 4; c++) ws[addr(r, c)] = bandCell(c === 0 ? "TOTAL A ACREDITAR" : "", "000000", "FFFFFF", 11, true);
  ws[addr(r, 5)] = bandCell("", "000000", "FFFFFF", 11, true);
  ws[addr(r, 6)] = { v: total, t: "n", z: '"$"#,##0.00', s: { font: { bold: true, sz: 13, color: { rgb: "FFFFFF" }, name: "Calibri" }, fill: { fgColor: { rgb: "000000" } }, alignment: { horizontal: "right", vertical: "center" } } };
  rows[r] = 26; r++;

  ws["!ref"] = `A1:G${r}`;
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } },
    { s: { r: totalRow, c: 0 }, e: { r: totalRow, c: 4 } },
  ];
  ws["!cols"] = [{ wch: 16 }, { wch: 30 }, { wch: 9 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 26 }];
  ws["!rows"] = rows.map((h) => ({ hpt: h }));

  return ws;
}
