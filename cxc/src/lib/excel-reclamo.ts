import XLSX from "xlsx-js-style";

function fmtDate(d: string) { if (!d) return ""; const [y, m, day] = d.split("-"); return `${day}/${m}/${y}`; }
function addr(r: number, c: number) { return XLSX.utils.encode_cell({ r, c }); }

interface ReclamoFoto {
  url?: string;
  storage_path: string;
}

// Blue corporate palette
const PRI = "1B3A5C"; const MID = "2E5E8E"; const SEP = "D4E6F1"; const LBL_BG = "EBF5FB"; const VAL_BG = "FDFEFE"; const DATA_BG = "F8F9F9"; const BRD = "D5DBDB";
const B = { top: { style: "thin", color: { rgb: BRD } }, bottom: { style: "thin", color: { rgb: BRD } }, left: { style: "thin", color: { rgb: BRD } }, right: { style: "thin", color: { rgb: BRD } } };
const ESTADO_FG: Record<string, string> = { "Enviado": "1D4ED8", "En Revisión": "C2410C", "N/C Aprobada": "15803D", "Aplicada": "374151" };

function fill(c: number, r: number, ws: XLSX.WorkSheet, bg: string) { for (let i = 0; i <= c; i++) if (!ws[addr(r, i)]) ws[addr(r, i)] = { v: "", t: "s", s: { fill: { fgColor: { rgb: bg } } } }; }

export function buildReclamoSheet(rec: Record<string, unknown>, items: Record<string, unknown>[], fotos: ReclamoFoto[] = []): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  const h: number[] = [];
  const merges: XLSX.Range[] = [];
  let r = 0;

  // Row 0: Title
  ws[addr(r, 0)] = { v: "FASHION GROUP", t: "s", s: { font: { bold: true, sz: 18, color: { rgb: "FFFFFF" }, name: "Calibri" }, fill: { fgColor: { rgb: PRI } }, alignment: { horizontal: "center", vertical: "center" } } };
  fill(6, r, ws, PRI); merges.push({ s: { r, c: 0 }, e: { r, c: 6 } }); h[r] = 32; r++;

  // Row 1: Subtitle
  ws[addr(r, 0)] = { v: "Reclamo a Proveedor", t: "s", s: { font: { bold: true, sz: 12, color: { rgb: "FFFFFF" }, name: "Calibri" }, fill: { fgColor: { rgb: MID } }, alignment: { horizontal: "center", vertical: "center" } } };
  fill(6, r, ws, MID); merges.push({ s: { r, c: 0 }, e: { r, c: 6 } }); h[r] = 22; r++;

  // Row 2: Separator
  fill(6, r, ws, SEP); merges.push({ s: { r, c: 0 }, e: { r, c: 6 } }); h[r] = 6; r++;

  // Metadata helpers
  const mLbl = (v: string) => ({ v, t: "s", s: { font: { bold: true, sz: 10, color: { rgb: PRI }, name: "Calibri" }, fill: { fgColor: { rgb: LBL_BG } }, alignment: { horizontal: "left" }, border: B } });
  const mVal = (v: string, bold = false) => ({ v, t: "s", s: { font: { bold, sz: 10, color: { rgb: "111111" }, name: "Calibri" }, fill: { fgColor: { rgb: VAL_BG } }, alignment: { horizontal: "left" }, border: { bottom: { style: "thin", color: { rgb: BRD } } } } });

  // Rows 3-6: Metadata
  const meta = [
    ["N° Reclamo", String(rec.nro_reclamo || ""), true, "Empresa", String(rec.empresa || ""), false],
    ["Proveedor", String(rec.proveedor || ""), false, "Marca", String(rec.marca || ""), false],
    ["N° Factura", String(rec.nro_factura || ""), true, "Fecha", fmtDate(String(rec.fecha_reclamo || "")), false],
    ["N° Pedido", String(rec.nro_orden_compra || "—"), false, "Estado", String(rec.estado || ""), false],
  ] as const;

  for (const [aLbl, aVal, aBold, eLbl, eVal] of meta) {
    ws[addr(r, 0)] = mLbl(aLbl);
    ws[addr(r, 1)] = mVal(aVal, aBold as boolean);
    for (let c = 2; c <= 3; c++) ws[addr(r, c)] = { v: "", t: "s", s: { fill: { fgColor: { rgb: VAL_BG } } } };
    ws[addr(r, 4)] = mLbl(eLbl);
    if (eLbl === "Estado") {
      const fg = ESTADO_FG[eVal as string] || "374151";
      const ebg = ({ "Enviado": "EBF5FB", "En Revisión": "FFF7ED", "N/C Aprobada": "F0FDF4", "Aplicada": "F9FAFB" } as Record<string, string>)[eVal as string] || VAL_BG;
      ws[addr(r, 5)] = { v: eVal, t: "s", s: { font: { bold: true, sz: 10, color: { rgb: fg }, name: "Calibri" }, fill: { fgColor: { rgb: ebg } }, alignment: { horizontal: "left" }, border: B } };
    } else {
      ws[addr(r, 5)] = mVal(eVal as string);
    }
    ws[addr(r, 6)] = { v: "", t: "s", s: { fill: { fgColor: { rgb: VAL_BG } } } };
    merges.push({ s: { r, c: 1 }, e: { r, c: 3 } });
    merges.push({ s: { r, c: 5 }, e: { r, c: 6 } });
    h[r] = 18; r++;
  }

  // Separator
  fill(6, r, ws, SEP); merges.push({ s: { r, c: 0 }, e: { r, c: 6 } }); h[r] = 8; r++;

  // Table header
  const thRow = r;
  const headers = ["Código", "Descripción", "Talla", "Cant.", "Precio Unit.", "Subtotal", "Motivo"];
  headers.forEach((hv, i) => { ws[addr(r, i)] = { v: hv, t: "s", s: { font: { bold: true, sz: 10, color: { rgb: "FFFFFF" }, name: "Calibri" }, fill: { fgColor: { rgb: PRI } }, alignment: { horizontal: "center", vertical: "center" }, border: B } }; });
  h[r] = 22; r++;

  // Items
  let subtotal = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const cant = Number(item.cantidad) || 0; const precio = Number(item.precio_unitario) || 0; const sub = cant * precio;
    subtotal += sub;
    const s = (fg: string, sz: number, ha: string, bold = false, italic = false) => ({ font: { sz, bold, italic, color: { rgb: fg }, name: "Calibri" }, fill: { fgColor: { rgb: DATA_BG } }, alignment: { horizontal: ha }, border: B });
    ws[addr(r, 0)] = { v: String(item.referencia || ""), t: "s", s: s("333333", 9, "left") };
    ws[addr(r, 1)] = { v: String(item.descripcion || ""), t: "s", s: s("111111", 10, "left") };
    ws[addr(r, 2)] = { v: String(item.talla || ""), t: "s", s: s("555555", 9, "center") };
    ws[addr(r, 3)] = { v: cant, t: "n", s: s("111111", 10, "right") };
    ws[addr(r, 4)] = { v: precio, t: "n", z: '"$"#,##0.00', s: s("111111", 10, "right") };
    ws[addr(r, 5)] = { v: sub, t: "n", z: '"$"#,##0.00', s: s("111111", 10, "right", true) };
    ws[addr(r, 6)] = { v: String(item.motivo || ""), t: "s", s: s("666666", 9, "left", false, true) };
    h[r] = 18; r++;
  }

  // Spacer
  ws[addr(r, 0)] = { v: "", t: "s", s: { fill: { fgColor: { rgb: "FFFFFF" } } } };
  h[r] = 6; r++;

  // Totals
  const imp = subtotal * 0.10; const itbms = subtotal * 0.077; const total = subtotal + imp + itbms;
  const tLbl = (v: string) => ({ v, t: "s", s: { font: { bold: true, sz: 9, color: { rgb: PRI }, name: "Calibri" }, fill: { fgColor: { rgb: "FFFFFF" } }, alignment: { horizontal: "right" } } });
  const tVal = (v: number) => ({ v, t: "n", z: '"$"#,##0.00', s: { font: { sz: 10, name: "Calibri" }, fill: { fgColor: { rgb: "FFFFFF" } }, alignment: { horizontal: "right" }, border: { bottom: { style: "thin", color: { rgb: BRD } } } } });

  ws[addr(r, 5)] = tLbl("Subtotal:"); ws[addr(r, 6)] = tVal(subtotal); h[r] = 16; r++;
  ws[addr(r, 5)] = tLbl("Importación (10%):"); ws[addr(r, 6)] = tVal(imp); h[r] = 16; r++;
  ws[addr(r, 5)] = tLbl("ITBMS (7%):"); ws[addr(r, 6)] = tVal(itbms); h[r] = 16; r++;

  // Final total
  const totalRow = r;
  const tBand = (v: string, ha: string) => ({ v, t: "s", s: { font: { bold: true, sz: 13, color: { rgb: "FFFFFF" }, name: "Calibri" }, fill: { fgColor: { rgb: PRI } }, alignment: { horizontal: ha, vertical: "center" } } });
  for (let c = 0; c <= 4; c++) ws[addr(r, c)] = tBand(c === 0 ? "TOTAL A ACREDITAR" : "", "center");
  ws[addr(r, 5)] = { v: "", t: "s", s: { fill: { fgColor: { rgb: PRI } } } };
  ws[addr(r, 6)] = { v: total, t: "n", z: '"$"#,##0.00', s: { font: { bold: true, sz: 13, color: { rgb: "FFFFFF" }, name: "Calibri" }, fill: { fgColor: { rgb: PRI } }, alignment: { horizontal: "right", vertical: "center" } } };
  merges.push({ s: { r: totalRow, c: 0 }, e: { r: totalRow, c: 4 } });
  h[r] = 28; r++;

  // Evidence photos section
  if (fotos.length > 0) {
    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

    // Spacer
    fill(6, r, ws, "FFFFFF"); merges.push({ s: { r, c: 0 }, e: { r, c: 6 } }); h[r] = 10; r++;

    // Section header
    ws[addr(r, 0)] = { v: "EVIDENCIA FOTOGRÁFICA", t: "s", s: { font: { bold: true, sz: 11, color: { rgb: "FFFFFF" }, name: "Calibri" }, fill: { fgColor: { rgb: MID } }, alignment: { horizontal: "center", vertical: "center" } } };
    fill(6, r, ws, MID); merges.push({ s: { r, c: 0 }, e: { r, c: 6 } }); h[r] = 22; r++;

    for (let i = 0; i < fotos.length; i++) {
      const foto = fotos[i];
      const publicUrl = foto.url || `${supabaseUrl}/storage/v1/object/public/reclamo-fotos/${foto.storage_path}`;
      ws[addr(r, 0)] = { v: `Foto ${i + 1}`, t: "s", s: { font: { bold: true, sz: 9, color: { rgb: PRI }, name: "Calibri" }, fill: { fgColor: { rgb: LBL_BG } }, alignment: { horizontal: "left" }, border: B } };
      ws[addr(r, 1)] = { v: publicUrl, t: "s", s: { font: { sz: 9, color: { rgb: "0563C1" }, underline: true, name: "Calibri" }, fill: { fgColor: { rgb: VAL_BG } }, alignment: { horizontal: "left" }, border: B }, l: { Target: publicUrl, Tooltip: `Ver foto ${i + 1}` } };
      for (let c = 2; c <= 6; c++) ws[addr(r, c)] = { v: "", t: "s", s: { fill: { fgColor: { rgb: VAL_BG } }, border: B } };
      merges.push({ s: { r, c: 1 }, e: { r, c: 6 } });
      h[r] = 18; r++;
    }
  }

  ws["!ref"] = `A1:G${r}`;
  ws["!merges"] = merges;
  ws["!cols"] = [{ wch: 14 }, { wch: 24 }, { wch: 8 }, { wch: 7 }, { wch: 14 }, { wch: 14 }, { wch: 22 }];
  ws["!rows"] = h.map((v) => ({ hpt: v || 16 }));

  return ws;
}
