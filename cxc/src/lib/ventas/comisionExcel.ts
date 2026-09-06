// Export Excel del reporte de comisiones (tab Comisiones) — tres salidas:
// detalle por vendedor (VENTAS/COBROS/CIERRE), resumen por empresa y
// consolidado todas-las-empresas. Migrados al estilo de la casa
// (src/lib/excel-export.ts, hallazgo I11): banda de título navy, subtítulo
// MID (período + regla del banner), headers navy, zebra, totales en banda
// PRI. Moneda MONEY_FMT y % PCT_FMT como números reales.

import type { WorkSheet, Range } from "xlsx-js-style";
import { fmtDate } from "@/lib/format";
import { ETIQUETA_DEFAULT } from "@/lib/comisiones/vendedor-default";
import { nombreVendedorEnPantalla } from "@/lib/comisiones/alias";
import { ROTULO_NO_SE_PAGA, sumarPagable } from "@/lib/comisiones/sin-pago";
import { sinRetirados } from "@/lib/comisiones/retirados";
import { nombreArchivoComision } from "@/lib/comisiones/nombre-archivo";
import { etiquetaPeriodo, sufijoArchivoPeriodo } from "@/lib/comisiones/periodo";

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

// ── Detalle por vendedor: UNA hoja con secciones apiladas ────────────────────
//
// 🔴 TÍTULO EN LA FILA 1, FILA 2 VACÍA, ENCABEZADOS EN LA FILA 3 — con FILTRO y
// con la fila fija al bajar (6-sep-2026). Daniel, textual: *«se puede mover a la
// fila 3 para separación y con filtro»*.
//
// 🩸 ANTES eran cinco filas antes de la primera columna: banda de título (1),
// subtítulo con empresa y período (2), una franja separadora de 4 puntos de alto
// que en pantalla se ve como una fila escondida (3), la banda «VENTAS» (4) y
// recién ahí los encabezados (5) — sin filtro y sin fila fija, porque
// `!autofilter` necesita saber dónde empiezan. Es la MISMA queja que ya había
// arreglado `buildReportSheet` para el resto del sistema: *«la tercera fila está
// como escondido, no me deja filtrar desde los nombres importantes»*.
//
// Ahora la fila 1 dice todo de una: `Comisión — Edwin · Vistana · Agosto 2026`
// (con el nombre CORTO de la empresa, diccionario § 0), la 2 queda vacía para
// separar, y la 3 son los encabezados de la tabla de facturas.
//
// ⚠️ **UN SOLO FILTRO, Y VA EN LAS FACTURAS.** Daniel: *«como está entonces,
// filtro en facturas nomás»*. Una hoja de Excel admite UN autofiltro y él lo
// sabe: COBROS y CIERRE se quedan sin filtro a propósito. Por eso la banda
// «VENTAS» ya no hace falta —lo que hay debajo del título ES la tabla de
// facturas— mientras que «COBROS» y «CIERRE» conservan la suya, que es lo que
// marca dónde termina una sección y empieza la otra.
//
// ⚠️ **EL Nº DE FACTURA SE QUEDA LARGO** (`11-000003022`). En pantalla se
// muestran los últimos 4 dígitos; acá no, y es una decisión de Daniel («no»):
// este es el papel que se concilia contra Switch. Y las columnas siguen siendo
// **cinco**: nada de «% de utilidad» ni «Comisión» por línea — *«es a
// propósito»*.
//
// Como el layout es propio (multi-sección) usa makeCellStyles, no
// buildReportSheet (que es solo para tablas simples).

/** Construcción pura del sheet del detalle (sin DOM) — testeable.
 *  `descuentos` = descuentos ACTIVOS del mes (se restan del total a pagar).
 *  NO incluye utilidad (reporte físico que ven los vendedores). */
export async function buildComisionDetalleSheet(
  d: ComisionDetalle,
  empresaNombre: string,
  descuentos: ComisionDescuento[] = [],
): Promise<WorkSheet> {
  const { makeCellStyles, CASA_PALETTE, MONEY_FMT, PCT_FMT, addr } = await import("@/lib/excel-export");
  const { band, hdr, td, tdN, tot } = makeCellStyles(CASA_PALETTE);

  const ws: WorkSheet = {};
  const merges: Range[] = [];
  const heights: number[] = [];
  const lastCol = 4;
  let r = 0;

  // FILA 1 — qué es, de quién, de dónde y de cuándo, en una sola línea.
  // Capitalizado («Reynaldo Espinosa»), igual que en pantalla (Daniel, 3-sep-2026).
  band(
    ws, r, lastCol, merges,
    `Comisión — ${nombreVendedorEnPantalla(d.vendedor)} · ${empresaNombre} · ${etiquetaPeriodo(d.year, d.mes)}`,
    CASA_PALETTE.pri, 12,
  );
  heights[r] = 26; r++;

  // FILA 2 — vacía. Sin relleno ni merge: es separación, no una banda más.
  heights[r] = 14; r++;

  const section = (label: string) => {
    band(ws, r, lastCol, merges, label, CASA_PALETTE.mid, 11);
    heights[r] = 20; r++;
  };
  const spacer = () => { heights[r] = 8; r++; };

  // ── FILA 3: los encabezados de VENTAS ── (columna Tipo FA/NC; SIN % utilidad)
  // Solo lo PAGABLE: las facturas con aporte $0 (utilidad ≤20%) se omiten —
  // siguen visibles en el modal, pero no en el Excel que firma el vendedor.
  const ventasExcel = ventasPagables(d.ventas);
  const filaEncabezados = r;
  ["Fecha", "Cliente", "Factura", "Tipo", "Subtotal"].forEach((h, i) => {
    ws[addr(r, i)] = hdr(h, i === 4 ? "right" : i === 3 ? "center" : "left");
  });
  heights[r] = 22; r++;
  // El filtro cubre encabezados + facturas y NADA más: el total, los cobros y
  // el cierre quedan afuera para que filtrar no los esconda. Es también lo que
  // le dice a `congelarEncabezadosXlsx` qué fila dejar fija (ver
  // `excel-panel-fijo.ts`).
  const filtro = `A${filaEncabezados + 1}:${addr(filaEncabezados + ventasExcel.length, lastCol)}`;
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
  // 🔴 LA TASA ES UN PORCENTAJE DE VERDAD, NO UN TEXTO (6-sep-2026). Decía
  // `× 0.50%` escrito como cadena dentro de la celda, así que la única columna
  // que explica de dónde sale la comisión era la única que Excel no podía usar
  // para recalcular. Ahora la base es número (ya lo era) y la tasa es un número
  // con formato de porcentaje (PCT_FMT): se ve igual y se puede multiplicar.
  section("CIERRE");
  const cierre: [string, number, number, number][] = [
    ["Ventas", d.ventas_base, d.tasa_venta, d.comision_venta],
    ["Cobros", d.cobros_base, d.tasa_cobro, d.comision_cobro],
  ];
  cierre.forEach(([label, base, tasa, comision], idx) => {
    const alt = idx % 2 === 0;
    ws[addr(r, 0)] = td(label, alt);
    ws[addr(r, 1)] = tdN(base, alt, { fmt: MONEY_FMT });
    ws[addr(r, 2)] = tdN(tasa, alt, { fmt: PCT_FMT });
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
  ws["!autofilter"] = { ref: filtro };
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
  // El MISMO nombre que el PDF: qué es, de quién, de cuándo (nombre-archivo.ts).
  downloadWorkbook(
    workbookFromSheets([{ name: "Comisión", ws }]),
    `${nombreArchivoComision(d.vendedor, d.empresa_key, d.year, d.mes)}.xlsx`,
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
 *  a cualquier filtro u orden que le hagan a la hoja. Capitalizado como en
 *  pantalla («Reynaldo Espinosa», «Daniel Levy»; la oficina sigue siendo
 *  «Oficina (DEFAULT)») — Daniel, 3-sep-2026: «si capitiliza reynaldo». Solo
 *  cambia esta celda: los números salen tal cual. */
const nombreEnExcel = (v: { vendedor: string; se_paga?: boolean }): string =>
  v.se_paga === false
    ? `${nombreVendedorEnPantalla(v.vendedor)} (${ROTULO_NO_SE_PAGA})`
    : nombreVendedorEnPantalla(v.vendedor);

/** Construcción pura del sheet (sin DOM) — testeable. */
export async function buildComisionesResumenSheet(r: ComisionResumen): Promise<WorkSheet> {
  const { buildReportSheet, MONEY_FMT } = await import("@/lib/excel-export");

  // Los retirados (Aguas — Daniel: «te dije que eliminaras Rey Stoute Aguas»)
  // no van ni en las filas ni en el total, igual que en la pantalla: la vista
  // ya los quitó, y acá se vuelven a quitar por si el Excel se arma desde otro
  // lado. Lista en `lib/comisiones/retirados`.
  const vendedores = sinRetirados(r.vendedores);

  // Total = suma de las filas PAGABLES (no recálculo), consistente con el tab:
  // DEFAULT y Daniel se listan con su número pero no entran («no me autopago»).
  const tot = {
    base: sumarPagable(vendedores, (v) => v.base ?? 0),
    comision: sumarPagable(vendedores, (v) => v.comision ?? 0),
    base_cobro: sumarPagable(vendedores, (v) => v.base_cobro ?? 0),
    comision_cobro: sumarPagable(vendedores, (v) => v.comision_cobro ?? 0),
    comision_total: sumarPagable(vendedores, (v) => v.comision_total ?? 0),
  };
  const haySinPago = vendedores.some((v) => v.se_paga === false);

  return buildReportSheet({
    columns: [
      { header: "Vendedor", wch: 26 },
      { header: "Ventas", wch: 14, align: "right", fmt: MONEY_FMT },
      { header: "Com. Venta", wch: 13, align: "right", fmt: MONEY_FMT },
      { header: "Cobros", wch: 14, align: "right", fmt: MONEY_FMT },
      { header: "Com. Cobro", wch: 13, align: "right", fmt: MONEY_FMT },
      { header: "Com. Total", wch: 13, align: "right", fmt: MONEY_FMT },
    ],
    rows: vendedores.map(v => [
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
    `comisiones-${r.empresaKey}-${sufijoArchivoPeriodo(r.year, r.mes)}.xlsx`,
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

  // Sin los retirados (Aguas), igual que la matriz en pantalla: ni fila ni total.
  const vendedores = sinRetirados(c.vendedores);
  const rows = vendedores.map(rowFor);
  if (c.sinAsignar) rows.push(rowFor({ ...c.sinAsignar, vendedor: ETIQUETA_DEFAULT }));

  // Total general = suma de las filas PAGABLES (la oficina y Daniel se listan,
  // pero no entran — «no me autopago»).
  const allRows = [...vendedores, ...(c.sinAsignar ? [c.sinAsignar] : [])];
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
    `comisiones-consolidado-${sufijoArchivoPeriodo(c.year, c.mes)}.xlsx`,
  );
}
