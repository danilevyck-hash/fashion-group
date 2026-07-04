// Export Excel de Guías de Transporte — construido con el helper estándar
// src/lib/excel-export.ts (hallazgo I11). Output visualmente idéntico al
// generador manual anterior: mismas columnas, título, colores de estado y
// fila de totales en banda navy.

import {
  buildReportSheet,
  workbookFromSheets,
  downloadWorkbook,
  exportFilename,
  fmtFechaExcel,
  CASA_PALETTE,
  type ReportCell,
  type ReportColumn,
} from "@/lib/excel-export";
import XLSX from "xlsx-js-style";
import type { Guia, GuiaItem } from "./types";

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

function estadoColor(estado: string | undefined): string {
  return estado === "Completada" ? "15803D" : estado === "Rechazada" ? "DC2626" : "C2410C";
}

const COLUMNS: ReportColumn[] = [
  { header: "N° Guía", wch: 12 },
  { header: "Fecha", wch: 12 },
  { header: "Transportista", wch: 20 },
  { header: "Clientes", wch: 24 },
  { header: "Empresa", wch: 20 },
  { header: "Facturas", wch: 28 },
  { header: "Bultos", wch: 10, align: "right" },
  { header: "Estado", wch: 16 },
  { header: "N° Guía Transp.", wch: 18 },
];

/** Construcción pura de la hoja (sin DOM) — testeable. */
export function buildGuiasSheet(guias: Guia[], subtitle?: string): XLSX.WorkSheet {
  const rows: ReportCell[][] = guias.map((g) => {
    const items = g.guia_items || [];
    return [
      { v: fmtGuia(g.numero), fg: CASA_PALETTE.pri, bold: true, sz: 10 },
      { v: fmtFechaExcel(g.fecha), fg: "555555", sz: 9 },
      g.transportista || "",
      { v: clientesSummary(items), sz: 9, fg: "444444" },
      { v: empresasSummary(items), sz: 9, fg: "555555" },
      { v: facturasSummary(items), sz: 9, fg: "666666" },
      g.total_bultos || 0,
      { v: g.estado || "", sz: 9, fg: estadoColor(g.estado) },
      { v: g.numero_guia_transp || "—", sz: 9, fg: "555555" },
    ];
  });

  const totalBultos = guias.reduce((s, g) => s + (g.total_bultos || 0), 0);

  return buildReportSheet({
    title: "FASHION GROUP — Guías de Transporte",
    subtitle: subtitle || "Todas las guías",
    columns: COLUMNS,
    rows,
    totals: [`${guias.length} guías`, null, null, null, null, null, totalBultos, null, null],
  });
}

export function exportGuiasExcel(guias: Guia[], subtitle?: string) {
  const wb = workbookFromSheets([{ name: "Guías", ws: buildGuiasSheet(guias, subtitle) }]);
  downloadWorkbook(wb, exportFilename("guias-transporte"));
}
