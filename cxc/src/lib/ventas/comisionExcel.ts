// Export Excel del reporte de comisiones (tab Comisiones) — tres salidas:
// detalle por vendedor (VENTAS/COBROS/CIERRE), resumen por empresa y
// consolidado todas-las-empresas. Migrados al estilo de la casa
// (src/lib/excel-export.ts, hallazgo I11): banda de título navy, subtítulo
// MID (período + regla del banner), headers navy, zebra, totales en banda
// PRI. Moneda MONEY_FMT y % PCT_FMT como números reales.

import type { WorkSheet, Range } from "xlsx-js-style";
import { fmtDate } from "@/lib/format";
import { ETIQUETA_DEFAULT, etiquetaVendedor } from "@/lib/comisiones/vendedor-default";
import { ROTULO_NO_SE_PAGA, sumarPagable } from "@/lib/comisiones/sin-pago";

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
export interface ComisionDescuento {
  id: string;
  concepto: string;
  monto: number;
  activo: boolean;
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

// FA / NC para la columna "Tipo" (dato: "Factura" | "Nota de Crédito").
export function tipoDocCorto(tipo: string): string {
  return tipo === "Nota de Crédito" ? "NC" : "FA";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Comisión de UNA línea = aporte (o monto cobrado) × tasa, a 2 decimales.
 *
 * OJO (redondeo): el total del mes NO es la suma de estas líneas. El RPC calcula
 * `comision_total = ROUND(ventas_base × tasa) + ROUND(cobros_base × tasa)` —
 * redondea los COMPONENTES, no cada documento. Sumar las líneas redondeadas
 * puede diferir 1-2 centavos. Por eso esta función es solo para MOSTRAR el
 * aporte de cada renglón; los totales que se pagan siempre salen del RPC
 * (`comision_venta` / `comision_cobro` / `comision_total`).
 */
export function comisionLinea(monto: number, tasa: number): number {
  return round2(monto * tasa);
}

/**
 * Documentos que EFECTIVAMENTE comisionan. El RPC lista las facturas con
 * utilidad ≤20% con aporte $0.00 a propósito (en pantalla salen en gris para
 * que el vendedor vea el documento y entienda por qué no le paga), pero el
 * Excel es el papel de lo PAGABLE: ahí no van.
 *
 * Quitar filas de $0 NO altera ningún total: no suman a `ventas_base`.
 */
export function ventasPagables(ventas: VentaDoc[]): VentaDoc[] {
  return ventas.filter((v) => v.subtotal !== 0);
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

/** Construcción pura del sheet del detalle (sin DOM) — testeable.
 *  `descuentos` = descuentos ACTIVOS del mes (se restan del total a pagar).
 *  NO incluye utilidad (reporte físico que ven los vendedores). */
export async function buildComisionDetalleSheet(
  d: ComisionDetalle,
  empresaNombre: string,
  descuentos: ComisionDescuento[] = [],
): Promise<WorkSheet> {
  const { makeCellStyles, CASA_PALETTE, MONEY_FMT, addr } = await import("@/lib/excel-export");
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

  // ── VENTAS ── (columna Tipo FA/NC; SIN % utilidad en el reporte físico)
  // Solo lo PAGABLE: las facturas con aporte $0 (utilidad ≤20%) se omiten —
  // siguen visibles en el modal, pero no en el Excel que firma el vendedor.
  const ventasExcel = ventasPagables(d.ventas);
  section("VENTAS");
  ["Fecha", "Cliente", "Factura", "Tipo", "Subtotal"].forEach((h, i) => {
    ws[addr(r, i)] = hdr(h, i === 4 ? "right" : i === 3 ? "center" : "left");
  });
  heights[r] = 22; r++;
  ventasExcel.forEach((v, idx) => {
    const alt = idx % 2 === 0;
    ws[addr(r, 0)] = td(fmtDate(v.fecha), alt);
    ws[addr(r, 1)] = td(v.cliente, alt);
    ws[addr(r, 2)] = td(v.secuencial, alt);
    ws[addr(r, 3)] = td(tipoDocCorto(v.tipo), alt, { ha: "center" });
    ws[addr(r, 4)] = tdN(v.subtotal, alt, { fmt: MONEY_FMT });
    heights[r] = 18; r++;
  });
  ws[addr(r, 0)] = tot("", { ha: "left" });
  ws[addr(r, 1)] = tot("", { ha: "left" });
  ws[addr(r, 2)] = tot("", { ha: "left" });
  ws[addr(r, 3)] = tot("Total ventas", { ha: "right" });
  ws[addr(r, 4)] = tot(d.ventas_base, { fmt: MONEY_FMT });
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

  const descActivos = descuentos.filter((x) => x.activo);
  if (descActivos.length === 0) {
    // Sin descuentos: el total final es la comisión total (comportamiento previo).
    ws[addr(r, 0)] = tot("Comisión total", { ha: "left" });
    ws[addr(r, 1)] = tot("", { ha: "left" });
    ws[addr(r, 2)] = tot("", { ha: "left" });
    ws[addr(r, 3)] = tot(d.comision_total, { fmt: MONEY_FMT });
    heights[r] = 22; r++;
  } else {
    // Subtotal comisión → descuentos (negativos) → Total a pagar.
    ws[addr(r, 0)] = td("Subtotal comisión", true, { bold: true });
    ws[addr(r, 1)] = td("", true);
    ws[addr(r, 2)] = td("", true);
    ws[addr(r, 3)] = tdN(d.comision_total, true, { fmt: MONEY_FMT, bold: true });
    heights[r] = 18; r++;
    descActivos.forEach((dx, idx) => {
      const alt = idx % 2 === 0;
      ws[addr(r, 0)] = td(dx.concepto, alt);
      ws[addr(r, 1)] = td("", alt);
      ws[addr(r, 2)] = td("", alt);
      ws[addr(r, 3)] = tdN(-dx.monto, alt, { fmt: MONEY_FMT, fg: "C0392B" });
      heights[r] = 18; r++;
    });
    const totalAPagar = round2(d.comision_total - descActivos.reduce((s, x) => s + x.monto, 0));
    ws[addr(r, 0)] = tot("Total a pagar", { ha: "left" });
    ws[addr(r, 1)] = tot("", { ha: "left" });
    ws[addr(r, 2)] = tot("", { ha: "left" });
    ws[addr(r, 3)] = tot(totalAPagar, { fmt: MONEY_FMT });
    heights[r] = 22; r++;
  }

  ws["!ref"] = `A1:${addr(r - 1, lastCol)}`;
  ws["!merges"] = merges;
  ws["!cols"] = [{ wch: 14 }, { wch: 32 }, { wch: 16 }, { wch: 14 }, { wch: 12 }];
  ws["!rows"] = heights.map((h) => ({ hpt: h || 16 }));
  return ws;
}

export async function exportComisionDetalle(
  d: ComisionDetalle,
  empresaNombre: string,
  descuentos: ComisionDescuento[] = [],
): Promise<void> {
  const ws = await buildComisionDetalleSheet(d, empresaNombre, descuentos);
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
  /** false = se lista con su número y «(no se paga)», y NO entra al Total. */
  se_paga?: boolean;
}
export interface ComisionResumen {
  empresaKey: string;
  empresaNombre: string;
  year: number;
  mes: number;
  vendedores: ComisionResumenRow[];
}

/** Nombre de la fila en el Excel: la marca va PEGADA al nombre para que sobreviva
 *  a cualquier filtro u orden que le hagan a la hoja. */
const nombreEnExcel = (v: { vendedor: string; se_paga?: boolean }): string =>
  v.se_paga === false ? `${etiquetaVendedor(v.vendedor)} (${ROTULO_NO_SE_PAGA})` : etiquetaVendedor(v.vendedor);

/** Construcción pura del sheet (sin DOM) — testeable. */
export async function buildComisionesResumenSheet(r: ComisionResumen): Promise<WorkSheet> {
  const { buildReportSheet, MONEY_FMT } = await import("@/lib/excel-export");

  // Total = suma de las filas PAGABLES (no recálculo), consistente con el tab:
  // DEFAULT y Daniel se listan con su número pero no entran («no me autopago»).
  const tot = {
    base: sumarPagable(r.vendedores, (v) => v.base ?? 0),
    comision: sumarPagable(r.vendedores, (v) => v.comision ?? 0),
    base_cobro: sumarPagable(r.vendedores, (v) => v.base_cobro ?? 0),
    comision_cobro: sumarPagable(r.vendedores, (v) => v.comision_cobro ?? 0),
    comision_total: sumarPagable(r.vendedores, (v) => v.comision_total ?? 0),
  };
  const haySinPago = r.vendedores.some((v) => v.se_paga === false);

  return buildReportSheet({
    columns: [
      { header: "Vendedor", wch: 26 },
      { header: "Ventas", wch: 14, align: "right", fmt: MONEY_FMT },
      { header: "Com. Venta", wch: 13, align: "right", fmt: MONEY_FMT },
      { header: "Cobros", wch: 14, align: "right", fmt: MONEY_FMT },
      { header: "Com. Cobro", wch: 13, align: "right", fmt: MONEY_FMT },
      { header: "Com. Total", wch: 13, align: "right", fmt: MONEY_FMT },
    ],
    rows: r.vendedores.map(v => [
      nombreEnExcel(v), v.base, v.comision, v.base_cobro, v.comision_cobro, v.comision_total,
    ]),
    totals: [haySinPago ? "Total a pagar" : "Total", tot.base, tot.comision, tot.base_cobro, tot.comision_cobro, tot.comision_total],
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
  /** false = se lista con su número y «(no se paga)», y NO entra al Total. */
  se_paga?: boolean;
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

  const rowFor = (r: ComisionConsolidadoRow) => [
    nombreEnExcel(r),
    ...c.empresas.map((e) => r.porEmpresa[e.key] ?? 0),
    { v: r.total, bold: true }, // columna TOTAL destacada
  ];

  const rows = c.vendedores.map(rowFor);
  if (c.sinAsignar) rows.push(rowFor({ ...c.sinAsignar, vendedor: ETIQUETA_DEFAULT }));

  // Total general = suma de las filas PAGABLES (la oficina y Daniel se listan,
  // pero no entran — «no me autopago»).
  const allRows = [...c.vendedores, ...(c.sinAsignar ? [c.sinAsignar] : [])];
  const haySinPago = allRows.some((r) => r.se_paga === false);
  const totals: (string | number)[] = [haySinPago ? "Total a pagar" : "Total"];
  for (const e of c.empresas) {
    totals.push(sumarPagable(allRows, (r) => r.porEmpresa[e.key] ?? 0));
  }
  totals.push(sumarPagable(allRows, (r) => r.total ?? 0));

  return buildReportSheet({
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
