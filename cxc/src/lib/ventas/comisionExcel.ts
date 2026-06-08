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

// ── Export del RESUMEN del tab (vista actual: empresa + mes + año) ────────────
// Una fila por vendedor + fila Total. Misma regla del banner en el encabezado.
export interface ComisionResumenRow {
  vendedor: string;
  base: number;           // ventas base
  comision: number;       // com. venta
  base_cobro: number;     // cobros
  comision_cobro: number; // com. cobro
  comision_total: number;
}
export interface ComisionResumen {
  empresaKey: string;
  empresaNombre: string;
  year: number;
  mes: number;
  vendedores: ComisionResumenRow[];
}

// Misma nota que el banner del tab (regla visible).
const REGLA_NOTA =
  "Venta: facturas con utilidad >20% menos notas de crédito. Cobro: recibos del mes, " +
  "excluyendo retenciones de ITBMS. Ambas excluyen intercompañía y clientes internos, " +
  "y se asignan al vendedor dueño del cliente. Fuente: reportes de Switch.";

export async function exportComisionesResumen(r: ComisionResumen): Promise<void> {
  const XLSX = (await import("xlsx-js-style")).default;
  const periodo = `${MESES[r.mes - 1]} ${r.year}`;
  const rows: (string | number | null)[][] = [];

  rows.push([`Comisiones — ${r.empresaNombre}`]);
  rows.push([periodo]);
  rows.push([REGLA_NOTA]);
  rows.push([]);
  rows.push(["Vendedor", "Ventas", "Com. Venta", "Cobros", "Com. Cobro", "Com. Total"]);
  const dataStart = rows.length;

  for (const v of r.vendedores) {
    rows.push([v.vendedor, v.base, v.comision, v.base_cobro, v.comision_cobro, v.comision_total]);
  }

  // Total = suma de las filas (no recálculo), consistente con el tab.
  const tot = r.vendedores.reduce(
    (a, v) => ({
      base: a.base + (v.base ?? 0),
      comision: a.comision + (v.comision ?? 0),
      base_cobro: a.base_cobro + (v.base_cobro ?? 0),
      comision_cobro: a.comision_cobro + (v.comision_cobro ?? 0),
      comision_total: a.comision_total + (v.comision_total ?? 0),
    }),
    { base: 0, comision: 0, base_cobro: 0, comision_cobro: 0, comision_total: 0 },
  );
  rows.push(["Total", tot.base, tot.comision, tot.base_cobro, tot.comision_cobro, tot.comision_total]);
  const totalRow = rows.length - 1;

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 26 }, { wch: 14 }, { wch: 13 }, { wch: 14 }, { wch: 13 }, { wch: 13 }];
  ws["!merges"] = [{ s: { r: 2, c: 0 }, e: { r: 2, c: 5 } }];

  const cell = (rr: number, cc: number) => ws[XLSX.utils.encode_cell({ r: rr, c: cc })];
  const money = { numFmt: MONEY };

  if (cell(0, 0)) cell(0, 0)!.s = { font: { bold: true, sz: 14 } };
  if (cell(1, 0)) cell(1, 0)!.s = { font: { italic: true, sz: 10, color: { rgb: "666666" } } };
  if (cell(2, 0)) cell(2, 0)!.s = { font: { italic: true, sz: 9, color: { rgb: "888888" } }, alignment: { wrapText: true, vertical: "top" } };

  // headers
  for (let c = 0; c < 6; c++) if (cell(4, c)) cell(4, c)!.s = { font: { bold: true }, alignment: { horizontal: c === 0 ? "left" : "right" } };

  // datos: moneda en columnas 1..5
  for (let rr = dataStart; rr <= totalRow; rr++) {
    for (let c = 1; c < 6; c++) if (cell(rr, c)) cell(rr, c)!.s = { ...money };
  }
  // fila Total en negrita
  for (let c = 0; c < 6; c++) {
    if (!cell(totalRow, c)) continue;
    cell(totalRow, c)!.s = c === 0 ? { font: { bold: true } } : { font: { bold: true }, ...money };
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Comisiones");
  XLSX.writeFile(wb, `comisiones-${r.empresaKey}-${String(r.mes).padStart(2, "0")}-${r.year}.xlsx`);
}

// ── Export CONSOLIDADO (vista "Todas las empresas") ──────────────────────────
// Matriz vendedor × empresa con columna TOTAL. Cada celda = comisión total de esa
// empresa (ya netea sus propios negativos); TOTAL = suma de la fila. Nunca se
// redistribuye entre empresas.
export interface ComisionConsolidadoRow {
  vendedor: string;
  porEmpresa: Record<string, number>; // empresaKey -> comisión total de esa empresa
  total: number;
}
export interface ComisionConsolidado {
  year: number;
  mes: number;
  empresas: { key: string; nombre: string }[]; // orden de columnas
  vendedores: ComisionConsolidadoRow[];         // ya ordenados por total desc
  sinAsignar?: ComisionConsolidadoRow | null;   // fila DEFAULT consolidada
}

export async function exportComisionesConsolidado(c: ComisionConsolidado): Promise<void> {
  const XLSX = (await import("xlsx-js-style")).default;
  const periodo = `${MESES[c.mes - 1]} ${c.year}`;
  const rows: (string | number | null)[][] = [];

  rows.push(["Comisiones — Todas las empresas"]);
  rows.push([periodo]);
  rows.push([REGLA_NOTA]);
  rows.push([]);

  const header = ["Vendedor", ...c.empresas.map((e) => e.nombre), "Total"];
  rows.push(header);
  const dataStart = rows.length;

  const rowFor = (r: ComisionConsolidadoRow) => [
    r.vendedor,
    ...c.empresas.map((e) => r.porEmpresa[e.key] ?? 0),
    r.total,
  ];

  for (const v of c.vendedores) rows.push(rowFor(v));
  if (c.sinAsignar) rows.push(rowFor({ ...c.sinAsignar, vendedor: "Sin asignar" }));

  // Total general = suma de TODAS las filas mostradas (vendedores + sin asignar).
  const allRows = [...c.vendedores, ...(c.sinAsignar ? [c.sinAsignar] : [])];
  const totalRowVals: (string | number)[] = ["Total"];
  for (const e of c.empresas) {
    totalRowVals.push(allRows.reduce((a, r) => a + (r.porEmpresa[e.key] ?? 0), 0));
  }
  totalRowVals.push(allRows.reduce((a, r) => a + (r.total ?? 0), 0));
  rows.push(totalRowVals);
  const totalRow = rows.length - 1;

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const nCols = header.length;
  ws["!cols"] = [{ wch: 26 }, ...c.empresas.map(() => ({ wch: 15 })), { wch: 15 }];
  ws["!merges"] = [{ s: { r: 2, c: 0 }, e: { r: 2, c: nCols - 1 } }];

  const cell = (rr: number, cc: number) => ws[XLSX.utils.encode_cell({ r: rr, c: cc })];
  const money = { numFmt: MONEY };

  if (cell(0, 0)) cell(0, 0)!.s = { font: { bold: true, sz: 14 } };
  if (cell(1, 0)) cell(1, 0)!.s = { font: { italic: true, sz: 10, color: { rgb: "666666" } } };
  if (cell(2, 0)) cell(2, 0)!.s = { font: { italic: true, sz: 9, color: { rgb: "888888" } }, alignment: { wrapText: true, vertical: "top" } };

  // headers
  for (let c2 = 0; c2 < nCols; c2++) {
    if (cell(4, c2)) cell(4, c2)!.s = { font: { bold: true }, alignment: { horizontal: c2 === 0 ? "left" : "right" } };
  }
  // datos: moneda en columnas 1..nCols-1
  for (let rr = dataStart; rr <= totalRow; rr++) {
    for (let c2 = 1; c2 < nCols; c2++) if (cell(rr, c2)) cell(rr, c2)!.s = { ...money };
  }
  // columna TOTAL destacada (negrita) por fila de datos
  for (let rr = dataStart; rr < totalRow; rr++) {
    if (cell(rr, nCols - 1)) cell(rr, nCols - 1)!.s = { font: { bold: true }, ...money };
  }
  // fila Total en negrita
  for (let c2 = 0; c2 < nCols; c2++) {
    if (!cell(totalRow, c2)) continue;
    cell(totalRow, c2)!.s = c2 === 0 ? { font: { bold: true } } : { font: { bold: true }, ...money };
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Consolidado");
  XLSX.writeFile(wb, `comisiones-consolidado-${String(c.mes).padStart(2, "0")}-${c.year}.xlsx`);
}
