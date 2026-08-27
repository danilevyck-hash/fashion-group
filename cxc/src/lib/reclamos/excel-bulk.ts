import XLSX from "xlsx-js-style";
import { supabaseServer } from "@/lib/supabase-server";
import { buildReclamoSheet } from "@/lib/excel-reclamo";
import { adjuntarFacturaUrls } from "./factura-storage";
import { reclamoGaleriaUrl } from "./gallery-token";
import { reclamoTaxes, TASA_IMPORTACION, TASA_ITBMS, FACTOR_TOTAL } from "@/lib/reclamos/tax";
import {
  addr,
  buildReportSheet,
  fmtFechaExcel,
  workbookFromSheets,
  workbookBuffer,
  MONEY_FMT,
  type ReportCell,
} from "@/lib/excel-export";

const LINK_FG = "0563C1"; // azul de hyperlink

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

/**
 * Hoja "Resumen" — reporte tabular estándar de la casa (buildReportSheet) con
 * 2 columnas de links WEB (Factura PDF firmada / galería de fotos) que abren
 * con un clic en el navegador, sin extraer ni permisos. buildReportSheet no
 * maneja hipervínculos → se parchean sobre las celdas ya estilizadas.
 */
function buildResumenSheet(reclamos: ReclamoFull[]): XLSX.WorkSheet {
  let grandSub = 0;
  let grandImp = 0;
  let grandItbms = 0;
  let grandTotal = 0;
  let grandFotos = 0;
  const links: { row: number; col: number; target: string; tooltip: string }[] = [];

  const rows: ReportCell[][] = reclamos.map((rec, idx) => {
    const items = rec.reclamo_items || [];
    const sub = items.reduce(
      (s, i) => s + (Number(i.cantidad) || 0) * (Number(i.precio_unitario) || 0),
      0,
    );
    // Impuestos por empresa (Active Shoes: importación 15%, sin ITBMS).
    const tx = reclamoTaxes(rec.empresa, sub);
    const nFotos = (rec.reclamo_fotos || []).length;
    grandSub += sub;
    grandImp += tx.importacion;
    grandItbms += tx.itbms;
    grandTotal += tx.total;
    grandFotos += nFotos;

    // Links WEB: factura = signed URL larga (bucket privado); fotos = galería
    // web del reclamo (todas las fotos, token HMAC).
    if (rec.factura_pdf_url) links.push({ row: idx, col: 9, target: rec.factura_pdf_url, tooltip: "Ver factura" });
    if (nFotos > 0) links.push({ row: idx, col: 10, target: reclamoGaleriaUrl(rec.id), tooltip: "Ver fotos" });

    return [
      { v: rec.nro_reclamo || "", bold: true },
      rec.nro_factura || "",
      fmtFechaExcel(rec.fecha_reclamo),
      rec.estado || "",
      sub,
      tx.importacion,
      tx.itbms,
      { v: tx.total, bold: true },
      nFotos,
      rec.factura_pdf_url ? { v: "Ver factura", fg: LINK_FG } : "—",
      nFotos > 0 ? { v: "Ver fotos", fg: LINK_FG } : "—",
    ];
  });

  const ws = buildReportSheet({
    columns: [
      { header: "N° Reclamo", wch: 16 },
      { header: "Factura", wch: 18 },
      { header: "Fecha", wch: 12, align: "center" },
      { header: "Estado", wch: 12, align: "center" },
      { header: "Subtotal", wch: 14, align: "right", fmt: MONEY_FMT },
      { header: "Importación", wch: 14, align: "right", fmt: MONEY_FMT },
      { header: "ITBMS", wch: 14, align: "right", fmt: MONEY_FMT },
      { header: "Total", wch: 16, align: "right", fmt: MONEY_FMT },
      { header: "# Fotos", wch: 9, align: "center" },
      { header: "Factura PDF", wch: 14, align: "center" },
      { header: "Fotos", wch: 12, align: "center" },
    ],
    rows,
    totals: ["TOTAL GENERAL", null, null, null, grandSub, grandImp, grandItbms, grandTotal, grandFotos, null, null],
  });

  // Layout de buildReportSheet: fila 0 título, 1 subtítulo, 2 separador,
  // 3 encabezados → datos desde la fila 4.
  const DATA_START = 4;
  for (const lk of links) {
    const cell = ws[addr(DATA_START + lk.row, lk.col)];
    if (!cell) continue;
    cell.l = { Target: lk.target, Tooltip: lk.tooltip };
    Object.assign(cell.s.font, { underline: true });
  }
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
  // La empresa ya NO se escribe adentro del libro (vivía en el subtítulo, y el
  // nombre del archivo la dice). Se conserva en la firma porque la pasan las 3
  // rutas que arman este Excel; sacarla del parámetro no compra nada.
  _empresa: string,
  _contacto: Contacto | null,
): Promise<Buffer> {
  // Firma las facturas (1 año, lote) → cada reclamo lleva factura_pdf_url web.
  const recs = await adjuntarFacturaUrls(reclamos);
  const used = new Set<string>();
  const sheets: { name: string; ws: XLSX.WorkSheet }[] = [];

  // La hoja "Resumen" solo aporta con 2+ reclamos (es un consolidado). Con un
  // solo reclamo el Excel lleva únicamente la hoja de ese reclamo.
  if (recs.length >= 2) {
    sheets.push({ name: safeSheetName("Resumen", used), ws: buildResumenSheet(recs) });
  }

  for (const rec of recs) {
    const items = (rec.reclamo_items || []) as Record<string, unknown>[];
    const fotos = (rec.reclamo_fotos || []) as ReclamoFoto[];
    const sheet = buildReclamoSheet(rec as unknown as Record<string, unknown>, items, fotos);
    sheets.push({ name: safeSheetName(rec.nro_reclamo || "Reclamo", used), ws: sheet });
  }

  return workbookBuffer(workbookFromSheets(sheets));
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
