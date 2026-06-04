// Export Excel del reporte detallado de comisión por vendedor (tab Comisiones).
// Replica el Excel manual de Daniel: sección VENTAS, sección COBROS, cierre.
// Usa xlsx-js-style (estándar del proyecto).

import { fmtDate } from "@/lib/format";

export interface VentaDoc {
  fecha: string;
  cliente: string;
  secuencial: string;
  tipo: string;
  subtotal: number;
  pct_utilidad: number | null;
}
export interface CobroDoc {
  fecha: string;
  cliente: string;
  monto: number;
}
export interface ComisionDetalle {
  empresa_key: string;
  year: number;
  mes: number;
  vendedor: string;
  tasa_venta: number;
  tasa_cobro: number;
  ventas: VentaDoc[];
  cobros: CobroDoc[];
  ventas_base: number;
  cobros_base: number;
  comision_venta: number;
  comision_cobro: number;
  comision_total: number;
}

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const MONEY = "$#,##0.00";
const PCT = "0.00%";

export async function exportComisionDetalle(d: ComisionDetalle, empresaNombre: string): Promise<void> {
  const XLSX = (await import("xlsx-js-style")).default;
  const periodo = `${MESES[d.mes - 1]} ${d.year}`;
  const rows: (string | number | null)[][] = [];

  rows.push([`Comisión — ${d.vendedor}`]);
  rows.push([`${empresaNombre} · ${periodo}`]);
  rows.push([]);

  // ── VENTAS ──
  rows.push(["VENTAS"]);
  rows.push(["Fecha", "Cliente", "Factura", "Subtotal", "% Utilidad"]);
  const ventasStart = rows.length;
  for (const v of d.ventas) {
    rows.push([
      fmtDate(v.fecha),
      v.cliente,
      v.secuencial,
      v.subtotal,
      v.pct_utilidad == null ? "" : v.pct_utilidad / 100,
    ]);
  }
  rows.push(["", "", "Total ventas", d.ventas_base, ""]);
  const ventasTotalRow = rows.length - 1;

  rows.push([]);

  // ── COBROS ──
  rows.push(["COBROS"]);
  rows.push(["Fecha", "Cliente", "Monto"]);
  const cobrosStart = rows.length;
  for (const c of d.cobros) {
    rows.push([fmtDate(c.fecha), c.cliente, c.monto]);
  }
  rows.push(["", "Total cobros", d.cobros_base]);
  const cobrosTotalRow = rows.length - 1;

  rows.push([]);

  // ── CIERRE ──
  rows.push(["CIERRE"]);
  rows.push(["Ventas", d.ventas_base, `× ${(d.tasa_venta * 100).toFixed(2)}%`, d.comision_venta]);
  rows.push(["Cobros", d.cobros_base, `× ${(d.tasa_cobro * 100).toFixed(2)}%`, d.comision_cobro]);
  rows.push(["Comisión total", "", "", d.comision_total]);
  const cierreStart = rows.length - 4;

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 14 }, { wch: 32 }, { wch: 16 }, { wch: 14 }, { wch: 12 }];

  const cell = (r: number, c: number) => ws[XLSX.utils.encode_cell({ r, c })];
  const bold = { font: { bold: true } };
  const money = { numFmt: MONEY };
  const pct = { numFmt: PCT };

  // título + subtítulo
  if (cell(0, 0)) cell(0, 0).s = { font: { bold: true, sz: 14 } };
  if (cell(1, 0)) cell(1, 0).s = { font: { italic: true, sz: 10, color: { rgb: "666666" } } };

  // headers de sección + tablas
  for (const r of [3, 6]) if (cell(r, 0)) cell(r, 0).s = { font: { bold: true, sz: 12 } }; // VENTAS / (COBROS movido) — set abajo dinámico
  // estilos de ventas
  if (cell(4, 0)) for (let c = 0; c < 5; c++) if (cell(4, c)) cell(4, c)!.s = bold;
  for (let r = ventasStart; r < ventasTotalRow; r++) {
    if (cell(r, 3)) cell(r, 3)!.s = money;
    if (cell(r, 4)) cell(r, 4)!.s = pct;
  }
  if (cell(ventasTotalRow, 2)) cell(ventasTotalRow, 2)!.s = bold;
  if (cell(ventasTotalRow, 3)) cell(ventasTotalRow, 3)!.s = { ...bold, ...money };

  // COBROS header (la fila "COBROS" y su header)
  const cobrosLabelRow = cobrosStart - 2;
  const cobrosHdrRow = cobrosStart - 1;
  if (cell(cobrosLabelRow, 0)) cell(cobrosLabelRow, 0)!.s = { font: { bold: true, sz: 12 } };
  for (let c = 0; c < 3; c++) if (cell(cobrosHdrRow, c)) cell(cobrosHdrRow, c)!.s = bold;
  for (let r = cobrosStart; r < cobrosTotalRow; r++) {
    if (cell(r, 2)) cell(r, 2)!.s = money;
  }
  if (cell(cobrosTotalRow, 1)) cell(cobrosTotalRow, 1)!.s = bold;
  if (cell(cobrosTotalRow, 2)) cell(cobrosTotalRow, 2)!.s = { ...bold, ...money };

  // CIERRE
  if (cell(cierreStart, 0)) cell(cierreStart, 0)!.s = { font: { bold: true, sz: 12 } };
  for (let r = cierreStart + 1; r <= cierreStart + 3; r++) {
    if (cell(r, 1)) cell(r, 1)!.s = money;
    if (cell(r, 3)) cell(r, 3)!.s = { ...bold, ...money };
  }
  if (cell(cierreStart + 3, 0)) cell(cierreStart + 3, 0)!.s = { font: { bold: true, sz: 12 } };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Comisión");
  const safe = d.vendedor.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");
  XLSX.writeFile(wb, `Comision-${safe}-${empresaNombre.replace(/\s+/g, "")}-${d.year}-${String(d.mes).padStart(2, "0")}.xlsx`);
}
