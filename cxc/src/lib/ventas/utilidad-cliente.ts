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

// Export Excel — todas las filas (no solo las visibles). Patrón xlsx-js-style,
// igual que el tab Productos. Montos como números reales con formato contable.
export async function exportUtilidadToExcel(resp: UtilidadClienteResponse): Promise<void> {
  const XLSX = (await import("xlsx-js-style")).default;

  const rows: (string | number)[][] = [
    [`FASHION GROUP — Utilidad por cliente · ${resp.year} · 5 empresas B2B`],
    [
      `Ventas ${fmtMoneyPlain(resp.totales.ventas)} · Costo ${fmtMoneyPlain(resp.totales.costo)} · ` +
      `Utilidad ${fmtMoneyPlain(resp.totales.utilidad)} · Margen ${resp.totales.margen != null ? (resp.totales.margen * 100).toFixed(1) + "%" : "—"}`,
    ],
    [],
    ["Cliente", "Empresa", "# Docs", "Ventas", "Costo", "Utilidad", "Margen%"],
  ];

  for (const r of resp.rows) {
    rows.push([r.cliente, r.empresa, r.nDocs, r.ventas, r.costo, r.utilidad, r.margen ?? 0]);
  }

  const totalDocs = resp.rows.reduce((s, r) => s + r.nDocs, 0);
  rows.push(["TOTAL", "", totalDocs, resp.totales.ventas, resp.totales.costo, resp.totales.utilidad, resp.totales.margen ?? 0]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 34 }, { wch: 20 }, { wch: 8 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 10 }];
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } },
  ];

  const titleCell = ws[XLSX.utils.encode_cell({ r: 0, c: 0 })];
  if (titleCell) titleCell.s = { font: { bold: true, sz: 14 } };
  const noteCell = ws[XLSX.utils.encode_cell({ r: 1, c: 0 })];
  if (noteCell) noteCell.s = { font: { italic: true, sz: 10, color: { rgb: "666666" } } };
  for (let c = 0; c < 7; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: 3, c })];
    if (cell) cell.s = { font: { bold: true } };
  }

  const currFmt = { numFmt: "$#,##0.00;[Red]-$#,##0.00" };
  const pctFmt = { numFmt: "0.0%" };
  const numFmt = { numFmt: "#,##0" };
  const lastRow = rows.length - 1;
  for (let r = 4; r <= lastRow; r++) {
    const isTotal = r === lastRow;
    const base = isTotal ? { font: { bold: true } } : {};
    const setFmt = (c: number, fmt: object) => {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell) cell.s = { ...base, ...fmt };
    };
    if (isTotal) {
      const nCell = ws[XLSX.utils.encode_cell({ r, c: 0 })];
      if (nCell) nCell.s = { font: { bold: true } };
    }
    setFmt(2, numFmt);  // # docs
    setFmt(3, currFmt); // ventas
    setFmt(4, currFmt); // costo
    setFmt(5, currFmt); // utilidad
    setFmt(6, pctFmt);  // margen
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Utilidad por cliente");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `utilidad-por-cliente-${resp.year}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

function fmtMoneyPlain(n: number): string {
  const sign = n < 0 ? "-" : "";
  return sign + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
