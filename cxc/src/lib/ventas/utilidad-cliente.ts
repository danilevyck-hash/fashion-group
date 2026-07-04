// Utilidad real por cliente (tab Ventas). Fuente: RPC utilidad_por_cliente(p_anio)
// sobre switch_factura_utilidad (reporte web, la misma que Comisiones). Alcance:
// 2026 + 5 empresas B2B. Las NC se guardan negativas → un cliente puede tener
// utilidad/ventas netas NEGATIVAS (devoluciones > ventas): es un dato válido, no
// un error — la UI lo muestra en rojo con nota, no como fallo.

import { EMPRESA_KEY_TO_NAME } from "@/lib/empresa-mapping";

export interface UtilidadClienteRow {
  clienteSwitchId: number | null;
  cliente: string;
  empresaKey: string;
  empresa: string;
  nDocs: number;
  ventas: number;       // Σ subtotal_con_descuento (neto: NC restan)
  costo: number;        // Σ costo (neto)
  utilidad: number;     // Σ utilidad (neto)
  margen: number | null; // fracción utilidad/ventas; null si ventas <= 0
}

export interface UtilidadClienteResponse {
  year: number;
  totales: { ventas: number; costo: number; utilidad: number; margen: number | null };
  rows: UtilidadClienteRow[];
}

export function empresaNombre(key: string): string {
  return EMPRESA_KEY_TO_NAME[key] ?? key;
}

/** Margen como fracción → "28.5%" / "−12.3%" / "—" si null. */
export function fmtMargen(d: number | null | undefined): string {
  if (d == null) return "—";
  const v = d * 100;
  return (v < 0 ? "−" : "") + Math.abs(v).toFixed(1) + "%";
}

/** Dinero con signo claro: "$1,234.00" / "−$1,234.00". */
export function fmtMoneySigned(n: number): string {
  const sign = n < 0 ? "−" : "";
  return sign + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Export Excel — todas las filas (no solo las visibles). Estilo de la casa
// (src/lib/excel-export.ts, hallazgo I11): título navy, subtítulo MID con los
// totales, headers navy, zebra, fila TOTAL en banda PRI. Montos MONEY_FMT y
// margen PCT_FMT como números reales.

/** Construcción pura del sheet (sin DOM) — testeable. */
export async function buildUtilidadSheet(resp: UtilidadClienteResponse): Promise<import("xlsx-js-style").WorkSheet> {
  const { buildReportSheet, MONEY_FMT, PCT_FMT } = await import("@/lib/excel-export");

  const subtitle =
    `Ventas ${fmtMoneyPlain(resp.totales.ventas)} · Costo ${fmtMoneyPlain(resp.totales.costo)} · ` +
    `Utilidad ${fmtMoneyPlain(resp.totales.utilidad)} · Margen ${resp.totales.margen != null ? (resp.totales.margen * 100).toFixed(1) + "%" : "—"}`;

  const totalDocs = resp.rows.reduce((s, r) => s + r.nDocs, 0);

  return buildReportSheet({
    title: `FASHION GROUP — Utilidad por cliente · ${resp.year} · 5 empresas B2B`,
    subtitle,
    columns: [
      { header: "Cliente", wch: 34 },
      { header: "Empresa", wch: 20 },
      { header: "# Docs", wch: 8, align: "right", fmt: "#,##0" },
      { header: "Ventas", wch: 16, align: "right", fmt: MONEY_FMT },
      { header: "Costo", wch: 16, align: "right", fmt: MONEY_FMT },
      { header: "Utilidad", wch: 16, align: "right", fmt: MONEY_FMT },
      { header: "Margen%", wch: 10, align: "right", fmt: PCT_FMT },
    ],
    rows: resp.rows.map(r => [r.cliente, r.empresa, r.nDocs, r.ventas, r.costo, r.utilidad, r.margen ?? 0]),
    totals: ["TOTAL", null, totalDocs, resp.totales.ventas, resp.totales.costo, resp.totales.utilidad, resp.totales.margen ?? 0],
  });
}

export async function exportUtilidadToExcel(resp: UtilidadClienteResponse): Promise<void> {
  const ws = await buildUtilidadSheet(resp);
  const { workbookFromSheets, downloadWorkbook } = await import("@/lib/excel-export");
  downloadWorkbook(
    workbookFromSheets([{ name: "Utilidad por cliente", ws }]),
    `utilidad-por-cliente-${resp.year}.xlsx`,
  );
}

function fmtMoneyPlain(n: number): string {
  const sign = n < 0 ? "-" : "";
  return sign + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
