// Workbook compartido del export de pedidos de catálogos (Reebok/Joybees).
// Ambos catálogos usan la MISMA estructura estándar del helper (I11) con el
// navy de marca Reebok (REEBOK_PALETTE) — decisión: los catálogos conservan
// su navy 1A2656 en vez del navy de la casa. Reebok agrega la columna Origen
// (pedidos "míos" vs del link público); Joybees no la tiene.

import type XLSX from "xlsx-js-style";
import {
  buildReportSheet,
  workbookFromSheets,
  REEBOK_PALETTE,
  MONEY_FMT,
  type ReportCell,
  type ReportColumn,
} from "@/lib/excel-export";

export interface PedidoExportRow {
  /** Solo Reebok: pedido creado por vendedor ("mio") o por el link público ("link"). */
  origen?: "mio" | "link";
  cliente: string | null;
  vendor: string | null;
  item_count: number;
  total: number;
  created_at: string;
}

export interface PedidosWorkbookOpts {
  /** Banda de título, ej. "REEBOK — Pedidos". */
  titulo: string;
  /** true = incluye la columna Origen (solo Reebok). */
  conOrigen: boolean;
  pedidos: PedidoExportRow[];
}

/** dd/mm/yyyy en hora local desde un timestamp ISO (created_at es timestamptz). */
export function fmtFechaPedido(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/** Construye el workbook de pedidos (hoja "Pedidos"). Función pura, testeable. */
export function buildPedidosWorkbook(opts: PedidosWorkbookOpts): XLSX.WorkBook {
  const { titulo, conOrigen, pedidos } = opts;

  const columns: ReportColumn[] = [
    ...(conOrigen ? [{ header: "Origen", wch: 10 } as ReportColumn] : []),
    { header: "Cliente", wch: 28 },
    { header: "Vendedor", wch: 20 },
    { header: "Items", wch: 8, align: "right", fmt: "0" },
    { header: "Total", wch: 13, align: "right", fmt: MONEY_FMT },
    { header: "Fecha", wch: 12 },
  ];

  let grandTotal = 0;
  const rows: ReportCell[][] = pedidos.map((p) => {
    grandTotal += p.total;
    return [
      ...(conOrigen ? [p.origen === "link" ? "Del link" : "Mío"] : []),
      p.cliente || "Sin nombre",
      p.vendor || "",
      p.item_count,
      { v: p.total, bold: true },
      fmtFechaPedido(p.created_at),
    ];
  });

  const totals: ReportCell[] = [
    ...(conOrigen ? [null] : []),
    null,
    null,
    { v: "TOTAL" },
    grandTotal,
    null,
  ];

  const ws = buildReportSheet({
    title: titulo,
    subtitle: `${pedidos.length} pedido${pedidos.length !== 1 ? "s" : ""}  ·  ${fmtFechaPedido(new Date().toISOString())}`,
    columns,
    rows,
    totals,
    palette: REEBOK_PALETTE,
  });

  return workbookFromSheets([{ name: "Pedidos", ws }]);
}
