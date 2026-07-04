// Export Excel del reporte de comisiones (tab Comisiones) — tres salidas:
// detalle por vendedor (VENTAS/COBROS/CIERRE), resumen por empresa y
// consolidado todas-las-empresas. Migrados al estilo de la casa
// (src/lib/excel-export.ts, hallazgo I11): banda de título navy, subtítulo
// MID (período + regla del banner), headers navy, zebra, totales en banda
// PRI. Moneda MONEY_FMT y % PCT_FMT como números reales.

import type { WorkSheet, Range } from "xlsx-js-style";
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

// ── Detalle por vendedor: UNA hoja con secciones apiladas ────────────────────
// Misma estructura vertical que el original: título, sección VENTAS (tabla +
// total), sección COBROS (tabla + total), sección CIERRE (bases × tasas +
// comisión total). Solo cambia la paleta/estilo unificado. Como el layout es
// propio (multi-sección) usa makeCellStyles, no buildReportSheet (solo tablas
// simples).

/** Construcción pura del sheet del detalle (sin DOM) — testeable. */
export async function buildComisionDetalleSheet(
  d: ComisionDetalle,
  empresaNombre: string,
): Promise<WorkSheet> {
  const { makeCellStyles, CASA_PALETTE, MONEY_FMT, PCT_FMT, addr } = await import("@/lib/excel-export");
  const { band, hdr, td, tdN, tot, fillRow } = makeCellStyles(CASA_PALETTE);
  const periodo = `${MESES[d.mes - 1]} ${d.year}`;

  const ws: WorkSheet = {};
  const merges: Range[] = [];
  const heights: number[] = [];
  const lastCol = 4;
  let r = 0;

  // Título + subtítulo (empresa · período) + separador — patrón de la casa.
  band(ws, r, lastCol, merges, `Comisión — ${d.vendedor}`, CASA_PALETTE.pri, 14);
  heights[r] = 30; r++;
  band(ws, r, lastCol, merges, `${empresaNombre} · ${periodo}`, CASA_PALETTE.mid, 10);
  heights[r] = 20; r++;
  fillRow(ws, r, lastCol, CASA_PALETTE.sep);
  merges.push({ s: { r, c: 0 }, e: { r, c: lastCol } });
  heights[r] = 4; r++;

  const section = (label: string) => {
    band(ws, r, lastCol, merges, label, CASA_PALETTE.mid, 11);
    heights[r] = 20; r++;
  };
  const spacer = () => { heights[r] = 8; r++; };

  // ── VENTAS ──
  section("VENTAS");
  ["Fecha", "Cliente", "Factura", "Subtotal", "% Utilidad"].forEach((h, i) => {
    ws[addr(r, i)] = hdr(h, i >= 3 ? "right" : "left");
  });
  heights[r] = 22; r++;
  d.ventas.forEach((v, idx) => {
    const alt = idx % 2 === 0;
    ws[addr(r, 0)] = td(fmtDate(v.fecha), alt);
    ws[addr(r, 1)] = td(v.cliente, alt);
    ws[addr(r, 2)] = td(v.secuencial, alt);
    ws[addr(r, 3)] = tdN(v.subtotal, alt, { fmt: MONEY_FMT });
    ws[addr(r, 4)] = v.pct_utilidad == null
      ? td("", alt)
      : tdN(v.pct_utilidad / 100, alt, { fmt: PCT_FMT });
    heights[r] = 18; r++;
  });
  ws[addr(r, 0)] = tot("", { ha: "left" });
  ws[addr(r, 1)] = tot("", { ha: "left" });
  ws[addr(r, 2)] = tot("Total ventas", { ha: "right" });
  ws[addr(r, 3)] = tot(d.ventas_base, { fmt: MONEY_FMT });
  ws[addr(r, 4)] = tot("", { ha: "left" });
  heights[r] = 22; r++;
  spacer();

  // ── COBROS ──
  section("COBROS");
  ["Fecha", "Cliente", "Monto"].forEach((h, i) => {
    ws[addr(r, i)] = hdr(h, i === 2 ? "right" : "left");
  });
  heights[r] = 22; r++;
  d.cobros.forEach((c, idx) => {
    const alt = idx % 2 === 0;
    ws[addr(r, 0)] = td(fmtDate(c.fecha), alt);
    ws[addr(r, 1)] = td(c.cliente, alt);
    ws[addr(r, 2)] = tdN(c.monto, alt, { fmt: MONEY_FMT });
    heights[r] = 18; r++;
  });
  ws[addr(r, 0)] = tot("", { ha: "left" });
  ws[addr(r, 1)] = tot("Total cobros", { ha: "right" });
  ws[addr(r, 2)] = tot(d.cobros_base, { fmt: MONEY_FMT });
  heights[r] = 22; r++;
  spacer();

  // ── CIERRE ──
  section("CIERRE");
  const cierre: [string, number, string, number][] = [
    ["Ventas", d.ventas_base, `× ${(d.tasa_venta * 100).toFixed(2)}%`, d.comision_venta],
    ["Cobros", d.cobros_base, `× ${(d.tasa_cobro * 100).toFixed(2)}%`, d.comision_cobro],
  ];
  cierre.forEach(([label, base, tasa, comision], idx) => {
    const alt = idx % 2 === 0;
    ws[addr(r, 0)] = td(label, alt);
    ws[addr(r, 1)] = tdN(base, alt, { fmt: MONEY_FMT });
    ws[addr(r, 2)] = td(tasa, alt, { ha: "right" });
    ws[addr(r, 3)] = tdN(comision, alt, { fmt: MONEY_FMT });
    heights[r] = 18; r++;
  });
  ws[addr(r, 0)] = tot("Comisión total", { ha: "left" });
  ws[addr(r, 1)] = tot("", { ha: "left" });
  ws[addr(r, 2)] = tot("", { ha: "left" });
  ws[addr(r, 3)] = tot(d.comision_total, { fmt: MONEY_FMT });
  heights[r] = 22; r++;

  ws["!ref"] = `A1:${addr(r - 1, lastCol)}`;
  ws["!merges"] = merges;
  ws["!cols"] = [{ wch: 14 }, { wch: 32 }, { wch: 16 }, { wch: 14 }, { wch: 12 }];
  ws["!rows"] = heights.map((h) => ({ hpt: h || 16 }));
  return ws;
}

export async function exportComisionDetalle(d: ComisionDetalle, empresaNombre: string): Promise<void> {
  const ws = await buildComisionDetalleSheet(d, empresaNombre);
  const { workbookFromSheets, downloadWorkbook } = await import("@/lib/excel-export");
  const safe = d.vendedor.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");
  downloadWorkbook(
    workbookFromSheets([{ name: "Comisión", ws }]),
    `Comision-${safe}-${empresaNombre.replace(/\s+/g, "")}-${d.year}-${String(d.mes).padStart(2, "0")}.xlsx`,
  );
}

// ── Export del RESUMEN del tab (vista actual: empresa + mes + año) ────────────
// Una fila por vendedor + fila Total. Misma regla del banner en el subtítulo.
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

/** Construcción pura del sheet (sin DOM) — testeable. */
export async function buildComisionesResumenSheet(r: ComisionResumen): Promise<WorkSheet> {
  const { buildReportSheet, MONEY_FMT } = await import("@/lib/excel-export");
  const periodo = `${MESES[r.mes - 1]} ${r.year}`;

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

  return buildReportSheet({
    title: `Comisiones — ${r.empresaNombre}`,
    subtitle: `${periodo} · ${REGLA_NOTA}`,
    columns: [
      { header: "Vendedor", wch: 26 },
      { header: "Ventas", wch: 14, align: "right", fmt: MONEY_FMT },
      { header: "Com. Venta", wch: 13, align: "right", fmt: MONEY_FMT },
      { header: "Cobros", wch: 14, align: "right", fmt: MONEY_FMT },
      { header: "Com. Cobro", wch: 13, align: "right", fmt: MONEY_FMT },
      { header: "Com. Total", wch: 13, align: "right", fmt: MONEY_FMT },
    ],
    rows: r.vendedores.map(v => [
      v.vendedor, v.base, v.comision, v.base_cobro, v.comision_cobro, v.comision_total,
    ]),
    totals: ["Total", tot.base, tot.comision, tot.base_cobro, tot.comision_cobro, tot.comision_total],
  });
}

export async function exportComisionesResumen(r: ComisionResumen): Promise<void> {
  const ws = await buildComisionesResumenSheet(r);
  const { workbookFromSheets, downloadWorkbook } = await import("@/lib/excel-export");
  downloadWorkbook(
    workbookFromSheets([{ name: "Comisiones", ws }]),
    `comisiones-${r.empresaKey}-${String(r.mes).padStart(2, "0")}-${r.year}.xlsx`,
  );
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

/** Construcción pura del sheet (sin DOM) — testeable. */
export async function buildComisionesConsolidadoSheet(c: ComisionConsolidado): Promise<WorkSheet> {
  const { buildReportSheet, MONEY_FMT } = await import("@/lib/excel-export");
  const periodo = `${MESES[c.mes - 1]} ${c.year}`;

  const rowFor = (r: ComisionConsolidadoRow) => [
    r.vendedor,
    ...c.empresas.map((e) => r.porEmpresa[e.key] ?? 0),
    { v: r.total, bold: true }, // columna TOTAL destacada
  ];

  const rows = c.vendedores.map(rowFor);
  if (c.sinAsignar) rows.push(rowFor({ ...c.sinAsignar, vendedor: "Sin asignar" }));

  // Total general = suma de TODAS las filas mostradas (vendedores + sin asignar).
  const allRows = [...c.vendedores, ...(c.sinAsignar ? [c.sinAsignar] : [])];
  const totals: (string | number)[] = ["Total"];
  for (const e of c.empresas) {
    totals.push(allRows.reduce((a, r) => a + (r.porEmpresa[e.key] ?? 0), 0));
  }
  totals.push(allRows.reduce((a, r) => a + (r.total ?? 0), 0));

  return buildReportSheet({
    title: "Comisiones — Todas las empresas",
    subtitle: `${periodo} · ${REGLA_NOTA}`,
    columns: [
      { header: "Vendedor", wch: 26 },
      ...c.empresas.map(e => ({ header: e.nombre, wch: 15, align: "right" as const, fmt: MONEY_FMT })),
      { header: "Total", wch: 15, align: "right", fmt: MONEY_FMT },
    ],
    rows,
    totals,
  });
}

export async function exportComisionesConsolidado(c: ComisionConsolidado): Promise<void> {
  const ws = await buildComisionesConsolidadoSheet(c);
  const { workbookFromSheets, downloadWorkbook } = await import("@/lib/excel-export");
  downloadWorkbook(
    workbookFromSheets([{ name: "Consolidado", ws }]),
    `comisiones-consolidado-${String(c.mes).padStart(2, "0")}-${c.year}.xlsx`,
  );
}
