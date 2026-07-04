// Capa compartida del tab "Productos" de /ventas: tipos, lista de empresas,
// cálculo de rango de fechas por período y export a Excel. Lo consumen las dos
// rutas API (nivel 1 + drill-down) y el componente ProductosView.

import { MONTHS } from "./format";

// Las 7 empresas con switch_articulo_diario poblado (todo el grupo menos
// Confecciones Boston, que no se backfilleó). Default Fashion Wear.
export const PRODUCTOS_EMPRESAS: { key: string; nombre: string }[] = [
  { key: "fashion_wear", nombre: "Fashion Wear" },
  { key: "vistana", nombre: "Vistana International" },
  { key: "fashion_shoes", nombre: "Fashion Shoes" },
  { key: "active_shoes", nombre: "Active Shoes" },
  { key: "active_wear", nombre: "Active Wear" },
  { key: "joystep", nombre: "Joystep" },
  { key: "american_classic", nombre: "Multifashion" },
];

export const PRODUCTOS_EMPRESA_KEYS = PRODUCTOS_EMPRESAS.map(e => e.key);
export const DEFAULT_PRODUCTOS_EMPRESA = "fashion_wear";

export function empresaNombre(key: string): string {
  return PRODUCTOS_EMPRESAS.find(e => e.key === key)?.nombre ?? key;
}

export interface ProductoNivel1 {
  descripcion: string;
  num_codigos: number;
  cantidad: number;
  venta: number;
  costo: number;
  margen: number | null;
}

export interface ProductoCodigo {
  codigo: string;
  descripcion: string;
  cantidad: number;
  venta: number;
  costo: number;
  margen: number | null;
}

export interface ProductosResponse {
  empresa: string;
  year: number;
  mes: number | null;
  desde: string;
  hasta: string;
  meses: number[];
  totales: { venta: number; costo: number; margen: number | null };
  productos: ProductoNivel1[];
}

// Período → rango de fechas [desde, hasta] (YYYY-MM-DD).
//   mes 1..12 → mes calendario completo.
//   mes null  → YTD: 1-ene del año hasta hoy (o fin de año si es año cerrado).
export function productosRange(year: number, mes: number | null): { desde: string; hasta: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  if (mes && mes >= 1 && mes <= 12) {
    const lastDay = new Date(year, mes, 0).getDate(); // día 0 del mes siguiente = último día de `mes`
    return { desde: `${year}-${pad(mes)}-01`, hasta: `${year}-${pad(mes)}-${pad(lastDay)}` };
  }
  const yearEnd = `${year}-12-31`;
  const todayStr = new Date().toISOString().slice(0, 10);
  return { desde: `${year}-01-01`, hasta: todayStr < yearEnd ? todayStr : yearEnd };
}

export function periodoLabel(year: number, mes: number | null): string {
  return mes ? `${MONTHS[mes - 1]} ${year}` : `YTD ${year}`;
}

// Margen como % sin signo forzado, 1 decimal. "—" si no aplica.
export function fmtMargen(d: number | null | undefined): string {
  if (d == null) return "—";
  return (d * 100).toFixed(1) + "%";
}

// Export Excel del nivel 1 (todas las descripciones, no solo el Top 20).
// Estilo de la casa (src/lib/excel-export.ts, hallazgo I11): título navy,
// subtítulo MID con venta total y margen, headers navy, zebra, fila TOTAL en
// banda PRI. Venta MONEY_FMT y margen PCT_FMT como números reales.

/** Construcción pura del sheet (sin DOM) — testeable. */
export async function buildProductosSheet(resp: ProductosResponse): Promise<import("xlsx-js-style").WorkSheet> {
  const { buildReportSheet, MONEY_FMT, PCT_FMT } = await import("@/lib/excel-export");
  const nombre = empresaNombre(resp.empresa);
  const periodo = periodoLabel(resp.year, resp.mes);

  const totalCant = resp.productos.reduce((s, p) => s + p.cantidad, 0);

  return buildReportSheet({
    title: `FASHION GROUP — Productos · ${nombre} · ${periodo}`,
    subtitle: `Venta total ${fmtMoneyPlain(resp.totales.venta)} · Margen ${resp.totales.margen != null ? (resp.totales.margen * 100).toFixed(1) + "%" : "—"}`,
    columns: [
      { header: "Descripción", wch: 34 },
      { header: "# Códigos", wch: 11, align: "right", fmt: "#,##0" },
      { header: "Cantidad", wch: 12, align: "right", fmt: "#,##0" },
      { header: "Venta", wch: 16, align: "right", fmt: MONEY_FMT },
      { header: "Margen%", wch: 10, align: "right", fmt: PCT_FMT },
    ],
    rows: resp.productos.map(p => [p.descripcion, p.num_codigos, p.cantidad, p.venta, p.margen ?? 0]),
    totals: ["TOTAL", null, totalCant, resp.totales.venta, resp.totales.margen ?? 0],
  });
}

export async function exportProductosToExcel(resp: ProductosResponse): Promise<void> {
  const ws = await buildProductosSheet(resp);
  const { workbookFromSheets, downloadWorkbook } = await import("@/lib/excel-export");
  downloadWorkbook(
    workbookFromSheets([{ name: "Productos", ws }]),
    `productos-${resp.empresa}-${resp.mes ? String(resp.mes).padStart(2, "0") : "ytd"}-${resp.year}.xlsx`,
  );
}

function fmtMoneyPlain(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
