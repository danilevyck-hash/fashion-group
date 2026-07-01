import XLSX from "xlsx-js-style";
import { supabaseServer } from "@/lib/supabase-server";
import { buildReclamoSheet } from "@/lib/excel-reclamo";
import { adjuntarFacturaUrls } from "./factura-storage";
import { reclamoGaleriaUrl } from "./gallery-token";
import { reclamoTaxes, TASA_IMPORTACION, TASA_ITBMS, FACTOR_TOTAL } from "@/lib/reclamos/tax";

const LINK_FG = "0563C1"; // azul de hyperlink

const PRI = "1B3A5C";
const MID = "2E5E8E";
const SEP = "D4E6F1";
const DATA_BG = "F8F9F9";
const BRD = "D5DBDB";
const B = {
  top: { style: "thin", color: { rgb: BRD } },
  bottom: { style: "thin", color: { rgb: BRD } },
  left: { style: "thin", color: { rgb: BRD } },
  right: { style: "thin", color: { rgb: BRD } },
};

interface ReclamoItem {
  referencia?: string;
  descripcion?: string;
  talla?: string;
  cantidad?: number;
  precio_unitario?: number;
  motivo?: string;
  nro_factura?: string;
  nro_orden_compra?: string;
}

interface ReclamoFoto {
  url?: string;
  storage_path: string;
}

interface ReclamoFull {
  id: string;
  nro_reclamo?: string;
  empresa?: string;
  proveedor?: string;
  marca?: string;
  nro_factura?: string;
  nro_orden_compra?: string;
  fecha_reclamo?: string;
  estado?: string;
  notas?: string;
  factura_pdf_path?: string | null;
  factura_pdf_url?: string | null; // signed URL web (la adjunta adjuntarFacturaUrls)
  reclamo_items?: ReclamoItem[];
  reclamo_fotos?: ReclamoFoto[];
}

export interface BulkSelector {
  reclamo_ids?: string[];
  all_with_filter?: { tab?: string; search?: string };
}

interface Contacto {
  nombre?: string;
  nombre_contacto?: string;
  correo?: string;
}

function fmtDate(d: string | undefined): string {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function addr(r: number, c: number) {
  return XLSX.utils.encode_cell({ r, c });
}

function fillRow(cMax: number, r: number, ws: XLSX.WorkSheet, bg: string) {
  for (let i = 0; i <= cMax; i++) {
    if (!ws[addr(r, i)]) ws[addr(r, i)] = { v: "", t: "s", s: { fill: { fgColor: { rgb: bg } } } };
  }
}

function buildResumenSheet(reclamos: ReclamoFull[], empresa: string): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  const h: number[] = [];
  const merges: XLSX.Range[] = [];
  // 2 columnas de links WEB (Factura PDF firmada / Fotos públicas) — abren con un
  // clic en el navegador, sin extraer ni permisos.
  const CMAX = 10;
  let r = 0;

  // Title
  ws[addr(r, 0)] = {
    v: "FASHION GROUP",
    t: "s",
    s: {
      font: { bold: true, sz: 18, color: { rgb: "FFFFFF" }, name: "Calibri" },
      fill: { fgColor: { rgb: PRI } },
      alignment: { horizontal: "center", vertical: "center" },
    },
  };
  fillRow(CMAX, r, ws, PRI);
  merges.push({ s: { r, c: 0 }, e: { r, c: CMAX } });
  h[r] = 32; r++;

  // Subtitle
  ws[addr(r, 0)] = {
    v: `Reclamos a Proveedor — ${empresa}`,
    t: "s",
    s: {
      font: { bold: true, sz: 12, color: { rgb: "FFFFFF" }, name: "Calibri" },
      fill: { fgColor: { rgb: MID } },
      alignment: { horizontal: "center", vertical: "center" },
    },
  };
  fillRow(CMAX, r, ws, MID);
  merges.push({ s: { r, c: 0 }, e: { r, c: CMAX } });
  h[r] = 22; r++;

  // Separator
  fillRow(CMAX, r, ws, SEP);
  merges.push({ s: { r, c: 0 }, e: { r, c: CMAX } });
  h[r] = 6; r++;

  // Headers
  const headers = ["N° Reclamo", "Factura", "Fecha", "Estado", "Subtotal", "Importación", "ITBMS", "Total", "# Fotos",
    "Factura PDF", "Fotos"];
  headers.forEach((hv, i) => {
    ws[addr(r, i)] = {
      v: hv,
      t: "s",
      s: {
        font: { bold: true, sz: 10, color: { rgb: "FFFFFF" }, name: "Calibri" },
        fill: { fgColor: { rgb: PRI } },
        alignment: { horizontal: "center", vertical: "center" },
        border: B,
      },
    };
  });
  h[r] = 22; r++;

  // Data rows + grand total
  let grandSub = 0;
  let grandImp = 0;
  let grandItbms = 0;
  let grandTotal = 0;
  let grandFotos = 0;
  for (const rec of reclamos) {
    const items = rec.reclamo_items || [];
    const sub = items.reduce(
      (s, i) => s + (Number(i.cantidad) || 0) * (Number(i.precio_unitario) || 0),
      0,
    );
    // Impuestos por empresa (Active Shoes: importación 15%, sin ITBMS).
    const tx = reclamoTaxes(rec.empresa, sub);
    const imp = tx.importacion;
    const itbms = tx.itbms;
    const total = tx.total;
    const nFotos = (rec.reclamo_fotos || []).length;
    grandSub += sub;
    grandImp += imp;
    grandItbms += itbms;
    grandTotal += total;
    grandFotos += nFotos;

    const txt = (v: string, ha: string, bold = false) => ({
      v,
      t: "s" as const,
      s: {
        font: { sz: 10, bold, color: { rgb: "111111" }, name: "Calibri" },
        fill: { fgColor: { rgb: DATA_BG } },
        alignment: { horizontal: ha },
        border: B,
      },
    });
    const num = (v: number, bold = false) => ({
      v,
      t: "n" as const,
      z: '"$"#,##0.00',
      s: {
        font: { sz: 10, bold, color: { rgb: "111111" }, name: "Calibri" },
        fill: { fgColor: { rgb: DATA_BG } },
        alignment: { horizontal: "right" },
        border: B,
      },
    });
    const int = (v: number) => ({
      v,
      t: "n" as const,
      s: {
        font: { sz: 10, color: { rgb: "111111" }, name: "Calibri" },
        fill: { fgColor: { rgb: DATA_BG } },
        alignment: { horizontal: "center" },
        border: B,
      },
    });

    ws[addr(r, 0)] = txt(rec.nro_reclamo || "", "left", true);
    ws[addr(r, 1)] = txt(rec.nro_factura || "", "left");
    ws[addr(r, 2)] = txt(fmtDate(rec.fecha_reclamo), "center");
    ws[addr(r, 3)] = txt(rec.estado || "", "center");
    ws[addr(r, 4)] = num(sub);
    ws[addr(r, 5)] = num(imp);
    ws[addr(r, 6)] = num(itbms);
    ws[addr(r, 7)] = num(total, true);
    ws[addr(r, 8)] = int(nFotos);
    // Links WEB (abren con un clic, sin extraer): factura = signed URL larga
    // (bucket privado); fotos = galería web del reclamo (todas las fotos, token).
    const linkCell = (label: string, target: string) => ({
      v: label,
      t: "s" as const,
      s: {
        font: { sz: 10, color: { rgb: LINK_FG }, underline: true, name: "Calibri" },
        fill: { fgColor: { rgb: DATA_BG } },
        alignment: { horizontal: "center" },
        border: B,
      },
      l: { Target: target, Tooltip: label },
    });
    ws[addr(r, 9)] = rec.factura_pdf_url
      ? linkCell("Ver factura", rec.factura_pdf_url)
      : txt("—", "center");
    ws[addr(r, 10)] = nFotos > 0
      ? linkCell("Ver fotos", reclamoGaleriaUrl(rec.id))
      : txt("—", "center");
    h[r] = 18; r++;
  }

  // Total row
  const tBand = (v: string, ha: string) => ({
    v,
    t: "s" as const,
    s: {
      font: { bold: true, sz: 11, color: { rgb: "FFFFFF" }, name: "Calibri" },
      fill: { fgColor: { rgb: PRI } },
      alignment: { horizontal: ha, vertical: "center" },
    },
  });
  const tNum = (v: number) => ({
    v,
    t: "n" as const,
    z: '"$"#,##0.00',
    s: {
      font: { bold: true, sz: 11, color: { rgb: "FFFFFF" }, name: "Calibri" },
      fill: { fgColor: { rgb: PRI } },
      alignment: { horizontal: "right", vertical: "center" },
    },
  });
  const tInt = (v: number) => ({
    v,
    t: "n" as const,
    s: {
      font: { bold: true, sz: 11, color: { rgb: "FFFFFF" }, name: "Calibri" },
      fill: { fgColor: { rgb: PRI } },
      alignment: { horizontal: "center", vertical: "center" },
    },
  });
  ws[addr(r, 0)] = tBand("TOTAL GENERAL", "left");
  for (let c = 1; c <= 3; c++) ws[addr(r, c)] = tBand("", "left");
  ws[addr(r, 4)] = tNum(grandSub);
  ws[addr(r, 5)] = tNum(grandImp);
  ws[addr(r, 6)] = tNum(grandItbms);
  ws[addr(r, 7)] = tNum(grandTotal);
  ws[addr(r, 8)] = tInt(grandFotos);
  ws[addr(r, 9)] = tBand("", "center"); ws[addr(r, 10)] = tBand("", "center");
  merges.push({ s: { r, c: 0 }, e: { r, c: 3 } });
  h[r] = 24; r++;

  ws["!ref"] = `A1:${XLSX.utils.encode_col(CMAX)}${r}`;
  ws["!merges"] = merges;
  ws["!cols"] = [
    { wch: 16 },
    { wch: 18 },
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 16 },
    { wch: 9 },
    { wch: 14 },
    { wch: 12 },
  ];
  ws["!rows"] = h.map((v) => ({ hpt: v || 16 }));
  return ws;
}

function safeSheetName(name: string, used: Set<string>): string {
  let base = (name || "Reclamo").replace(/[\\/?*[\]:]/g, "_").slice(0, 31).trim() || "Reclamo";
  let candidate = base;
  let n = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = `_${n}`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
    n++;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

export async function buildBulkReclamosExcel(
  reclamos: ReclamoFull[],
  empresa: string,
  _contacto: Contacto | null,
): Promise<Buffer> {
  // Firma las facturas (1 año, lote) → cada reclamo lleva factura_pdf_url web.
  const recs = await adjuntarFacturaUrls(reclamos);
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();

  // La hoja "Resumen" solo aporta con 2+ reclamos (es un consolidado). Con un
  // solo reclamo el Excel lleva únicamente la hoja de ese reclamo.
  if (recs.length >= 2) {
    const resumen = buildResumenSheet(recs, empresa);
    XLSX.utils.book_append_sheet(wb, resumen, safeSheetName("Resumen", used));
  }

  for (const rec of recs) {
    const items = (rec.reclamo_items || []) as Record<string, unknown>[];
    const fotos = (rec.reclamo_fotos || []) as ReclamoFoto[];
    const sheet = buildReclamoSheet(rec as unknown as Record<string, unknown>, items, fotos);
    XLSX.utils.book_append_sheet(wb, sheet, safeSheetName(rec.nro_reclamo || "Reclamo", used));
  }

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return buf as Buffer;
}

export async function fetchReclamosForEmpresa(empresa: string, sel: BulkSelector): Promise<ReclamoFull[]> {
  if (sel.reclamo_ids && sel.reclamo_ids.length > 0) {
    const { data, error } = await supabaseServer
      .from("reclamos")
      .select("*, reclamo_items(*), reclamo_fotos(*)")
      .eq("empresa", empresa)
      .in("id", sel.reclamo_ids)
      .order("created_at", { ascending: false });
    if (error) throw new Error("Error al cargar reclamos");
    return (data as ReclamoFull[]) || [];
  }

  if (sel.all_with_filter) {
    const tab = sel.all_with_filter.tab || "all";
    const search = (sel.all_with_filter.search || "").trim();
    let query = supabaseServer
      .from("reclamos")
      .select("*, reclamo_items(*), reclamo_fotos(*)")
      .eq("empresa", empresa)
      .order("created_at", { ascending: false });
    if (tab !== "all") query = query.eq("estado", tab);
    if (search) {
      const escaped = search.replace(/[%_,]/g, "\\$&");
      query = query.or(`nro_reclamo.ilike.%${escaped}%,nro_factura.ilike.%${escaped}%`);
    }
    const { data, error } = await query;
    if (error) throw new Error("Error al cargar reclamos");
    return (data as ReclamoFull[]) || [];
  }

  return [];
}

export function reclamoBulkConstants() {
  return { TASA_IMPORTACION, TASA_ITBMS, FACTOR_TOTAL };
}

export type { ReclamoFull };
