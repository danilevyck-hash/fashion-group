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
export async function exportProductosToExcel(resp: ProductosResponse): Promise<void> {
  const XLSX = (await import("xlsx-js-style")).default;
  const nombre = empresaNombre(resp.empresa);
  const periodo = periodoLabel(resp.year, resp.mes);

  const rows: (string | number)[][] = [
    [`FASHION GROUP — Productos · ${nombre} · ${periodo}`],
    [`Venta total ${fmtMoneyPlain(resp.totales.venta)} · Margen ${resp.totales.margen != null ? (resp.totales.margen * 100).toFixed(1) + "%" : "—"}`],
    [],
    ["Descripción", "# Códigos", "Cantidad", "Venta", "Margen%"],
  ];

  for (const p of resp.productos) {
    rows.push([p.descripcion, p.num_codigos, p.cantidad, p.venta, p.margen ?? 0]);
  }

  const totalCant = resp.productos.reduce((s, p) => s + p.cantidad, 0);
  rows.push(["TOTAL", "", totalCant, resp.totales.venta, resp.totales.margen ?? 0]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 34 }, { wch: 11 }, { wch: 12 }, { wch: 16 }, { wch: 10 }];
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } },
  ];

  const titleCell = ws[XLSX.utils.encode_cell({ r: 0, c: 0 })];
  if (titleCell) titleCell.s = { font: { bold: true, sz: 14 } };
  const noteCell = ws[XLSX.utils.encode_cell({ r: 1, c: 0 })];
  if (noteCell) noteCell.s = { font: { italic: true, sz: 10, color: { rgb: "666666" } } };
  for (let c = 0; c < 5; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: 3, c })];
    if (cell) cell.s = { font: { bold: true } };
  }

  const currFmt = { numFmt: "$#,##0.00" };
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
    setFmt(1, numFmt); // # códigos
    setFmt(2, numFmt); // cantidad
    setFmt(3, currFmt); // venta
    setFmt(4, pctFmt); // margen
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Productos");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `productos-${resp.empresa}-${resp.mes ? String(resp.mes).padStart(2, "0") : "ytd"}-${resp.year}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

function fmtMoneyPlain(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
