import XLSX from "xlsx-js-style";
import { reclamoGaleriaUrl } from "@/lib/reclamos/gallery-token";
import { reclamoTaxes, ocultaPedido, impLabel } from "@/lib/reclamos/tax";
import { addr, makeCellStyles, CASA_PALETTE, MONEY_FMT } from "@/lib/excel-export";

interface ReclamoFoto {
  url?: string;
  storage_path: string;
}

// Paleta y celdas del estilo de la casa (helper estándar de exports — I11):
// PRI/MID/SEP/bordes vienen de CASA_PALETTE vía makeCellStyles.
const { B, fillRow, hdr, td, tdN, band, palette } = makeCellStyles(CASA_PALETTE);

// Fondos propios de la FICHA de reclamo (label azul claro / valor casi blanco).
// El helper no los provee — quedan como constantes del módulo.
const LBL_BG = "EBF5FB";
const VAL_BG = "FDFEFE";
const LINK_FG = "0563C1"; // azul de hyperlink
const CMAX = 7; // 8 columnas (0..7): Código, Descripción, Talla, Género, Cant., Precio, Subtotal, Motivo

/**
 * Hoja Excel de un reclamo. Los links son URLs WEB que abren con un clic en el
 * navegador (Mac/Windows), sin extraer nada ni permisos:
 *   - Factura: rec.factura_pdf_url (signed URL larga; bucket privado, no expuesto).
 *   - Fotos:   galería web del reclamo (página con todas las fotos, token HMAC).
 * El caller adjunta factura_pdf_url vía adjuntarFacturaUrls (factura-storage.ts).
 */
export function buildReclamoSheet(
  rec: Record<string, unknown>,
  items: Record<string, unknown>[],
  fotos: ReclamoFoto[] = [],
): XLSX.WorkSheet {
  const facturaUrl = (rec.factura_pdf_url as string | null | undefined) || null;
  const nroReclamo = String(rec.nro_reclamo || "");
  const empresa = String(rec.empresa || "");
  const reclamoId = String(rec.id || "");
  const ws: XLSX.WorkSheet = {};
  const h: number[] = [];
  const merges: XLSX.Range[] = [];
  let r = 0;

  // Título / subtítulo / separador — bandas estándar de la casa.
  band(ws, r, CMAX, merges, "FASHION GROUP", palette.pri, 18); h[r] = 32; r++;
  band(ws, r, CMAX, merges, "Reclamo a Proveedor", palette.mid, 12); h[r] = 22; r++;
  fillRow(ws, r, CMAX, palette.sep); merges.push({ s: { r, c: 0 }, e: { r, c: CMAX } }); h[r] = 6; r++;

  // Metadata helpers (layout de ficha: label LBL_BG / valor VAL_BG)
  const mLbl = (v: string) => ({ v, t: "s", s: { font: { bold: true, sz: 10, color: { rgb: palette.pri }, name: "Calibri" }, fill: { fgColor: { rgb: LBL_BG } }, alignment: { horizontal: "left" }, border: B } });
  const mVal = (v: string, bold = false) => ({ v, t: "s", s: { font: { bold, sz: 10, color: { rgb: "111111" }, name: "Calibri" }, fill: { fgColor: { rgb: VAL_BG } }, alignment: { horizontal: "left" }, border: { bottom: { style: "thin", color: { rgb: palette.brd } } } } });

  // Metadata rows: N° Reclamo / Empresa / Proveedor / N° Factura / N° Pedido.
  // Active Shoes no usa N° de pedido → se omite esa fila.
  const meta: [string, string, boolean][] = [
    ["N° Reclamo", nroReclamo, true],
    ["Empresa", String(rec.empresa || ""), false],
    ["Proveedor", String(rec.proveedor || ""), false],
    ["N° Factura", String(rec.nro_factura || ""), true],
    ...(ocultaPedido(empresa) ? [] : [["N° Pedido", String(rec.nro_orden_compra || "—"), false] as [string, string, boolean]]),
  ];

  for (const [lbl, val, bold] of meta) {
    ws[addr(r, 0)] = mLbl(lbl);
    ws[addr(r, 1)] = mVal(val, bold as boolean);
    for (let c = 2; c <= CMAX; c++) ws[addr(r, c)] = { v: "", t: "s", s: { fill: { fgColor: { rgb: VAL_BG } } } };
    merges.push({ s: { r, c: 1 }, e: { r, c: CMAX } });
    h[r] = 18; r++;
  }

  // Separator
  fillRow(ws, r, CMAX, palette.sep); merges.push({ s: { r, c: 0 }, e: { r, c: CMAX } }); h[r] = 8; r++;

  // Table header (Género entre Talla y Cant.)
  const headers = ["Código", "Descripción", "Talla", "Género", "Cant.", "Precio Unit.", "Subtotal", "Motivo"];
  headers.forEach((hv, i) => { ws[addr(r, i)] = hdr(hv, "center"); });
  h[r] = 22; r++;

  // Items (celdas td/tdN del helper; alt=true → fondo dataBg uniforme)
  let subtotal = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const cant = Number(item.cantidad) || 0; const precio = Number(item.precio_unitario) || 0; const sub = cant * precio;
    subtotal += sub;
    ws[addr(r, 0)] = td(String(item.referencia || ""), true, { sz: 9 });
    ws[addr(r, 1)] = td(String(item.descripcion || ""), true, { fg: "111111" });
    ws[addr(r, 2)] = td(String(item.talla || ""), true, { fg: "555555", sz: 9, ha: "center" });
    ws[addr(r, 3)] = td(String(item.genero || ""), true, { fg: "555555", sz: 9, ha: "center" });
    ws[addr(r, 4)] = tdN(cant, true, { fg: "111111" });
    ws[addr(r, 5)] = tdN(precio, true, { fmt: MONEY_FMT, fg: "111111" });
    ws[addr(r, 6)] = tdN(sub, true, { fmt: MONEY_FMT, bold: true, fg: "111111" });
    const motivo = td(String(item.motivo || ""), true, { fg: "666666", sz: 9 });
    Object.assign(motivo.s.font, { italic: true });
    ws[addr(r, 7)] = motivo;
    h[r] = 18; r++;
  }

  // Spacer
  ws[addr(r, 0)] = { v: "", t: "s", s: { fill: { fgColor: { rgb: "FFFFFF" } } } };
  h[r] = 6; r++;

  // Totals (labels en col 6, valores en col 7). Impuestos por empresa
  // (Active Shoes: importación 15%, sin ITBMS).
  const tx = reclamoTaxes(empresa, subtotal);
  const tLbl = (v: string) => ({ v, t: "s", s: { font: { bold: true, sz: 9, color: { rgb: palette.pri }, name: "Calibri" }, fill: { fgColor: { rgb: "FFFFFF" } }, alignment: { horizontal: "right" } } });
  const tVal = (v: number) => ({ v, t: "n", z: MONEY_FMT, s: { font: { sz: 10, name: "Calibri" }, fill: { fgColor: { rgb: "FFFFFF" } }, alignment: { horizontal: "right" }, border: { bottom: { style: "thin", color: { rgb: palette.brd } } } } });

  ws[addr(r, 6)] = tLbl("Subtotal:"); ws[addr(r, 7)] = tVal(subtotal); h[r] = 16; r++;
  ws[addr(r, 6)] = tLbl(`Importación (${impLabel(empresa)}):`); ws[addr(r, 7)] = tVal(tx.importacion); h[r] = 16; r++;
  if (tx.hasItbms) { ws[addr(r, 6)] = tLbl("ITBMS (7%):"); ws[addr(r, 7)] = tVal(tx.itbms); h[r] = 16; r++; }

  // Final total — banda PRI 13pt (layout de ficha, conservado): banda 0..6 + valor en col 7
  const totalRow = r;
  const tBand = (v: string, ha: string) => ({ v, t: "s", s: { font: { bold: true, sz: 13, color: { rgb: "FFFFFF" }, name: "Calibri" }, fill: { fgColor: { rgb: palette.pri } }, alignment: { horizontal: ha, vertical: "center" } } });
  for (let c = 0; c <= 6; c++) ws[addr(r, c)] = tBand(c === 0 ? "TOTAL A ACREDITAR" : "", "center");
  ws[addr(r, 7)] = { v: tx.total, t: "n", z: MONEY_FMT, s: { font: { bold: true, sz: 13, color: { rgb: "FFFFFF" }, name: "Calibri" }, fill: { fgColor: { rgb: palette.pri } }, alignment: { horizontal: "right", vertical: "center" } } };
  merges.push({ s: { r: totalRow, c: 0 }, e: { r: totalRow, c: 6 } });
  h[r] = 28; r++;

  // Archivos (factura + evidencia) — links WEB de un clic (celdas .l)
  const linkRow = (label: string, linkText: string, target: string) => {
    ws[addr(r, 0)] = { v: label, t: "s", s: { font: { bold: true, sz: 9, color: { rgb: palette.pri }, name: "Calibri" }, fill: { fgColor: { rgb: LBL_BG } }, alignment: { horizontal: "left" }, border: B } };
    ws[addr(r, 1)] = { v: linkText, t: "s", s: { font: { sz: 9, color: { rgb: LINK_FG }, underline: true, name: "Calibri" }, fill: { fgColor: { rgb: VAL_BG } }, alignment: { horizontal: "left" }, border: B }, l: { Target: target, Tooltip: linkText } };
    for (let c = 2; c <= CMAX; c++) ws[addr(r, c)] = { v: "", t: "s", s: { fill: { fgColor: { rgb: VAL_BG } }, border: B } };
    merges.push({ s: { r, c: 1 }, e: { r, c: CMAX } });
    h[r] = 18; r++;
  };

  const tieneSeccion = !!facturaUrl || fotos.length > 0;
  if (tieneSeccion) {
    // Spacer
    fillRow(ws, r, CMAX, "FFFFFF"); merges.push({ s: { r, c: 0 }, e: { r, c: CMAX } }); h[r] = 10; r++;
    // Section header
    band(ws, r, CMAX, merges, "ARCHIVOS Y EVIDENCIA", palette.mid, 11); h[r] = 22; r++;

    // Factura PDF — link WEB (signed URL larga; bucket privado, no expuesto).
    if (facturaUrl) {
      linkRow("Factura", "Ver factura", facturaUrl);
    }

    // Fotos — galería web del reclamo: UN link a una página con TODAS las fotos
    // (token HMAC), abre con un clic sin extraer ni permisos. Sin id no se firma.
    if (fotos.length > 0 && reclamoId) {
      linkRow("Fotos", `Ver fotos (${fotos.length})`, reclamoGaleriaUrl(reclamoId));
    }
  }

  ws["!ref"] = `A1:${XLSX.utils.encode_col(CMAX)}${r}`;
  ws["!merges"] = merges;
  ws["!cols"] = [{ wch: 14 }, { wch: 24 }, { wch: 8 }, { wch: 10 }, { wch: 7 }, { wch: 14 }, { wch: 14 }, { wch: 22 }];
  ws["!rows"] = h.map((v) => ({ hpt: v || 16 }));

  return ws;
}
