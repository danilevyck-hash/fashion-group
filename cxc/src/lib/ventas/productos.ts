// Capa compartida del tab "Productos" de /ventas: tipos, lista de empresas,
// cálculo de rango de fechas por período y export a Excel. Lo consumen las dos
// rutas API (nivel 1 + drill-down) y el componente ProductosView.

import { MONTHS } from "./format";
// El criterio de "la misma ventana un año antes" vive en UN solo lugar (ver la
// nota de esa función). Acá se importa, no se copia.
import { unAnioAntes } from "@/lib/multifashion/productos-ranking";

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
  /** Qué período resolvió el servidor. Ausente en respuestas viejas = "ytd". */
  periodo?: ProductosPeriodo;
  desde: string;
  hasta: string;
  /** Ventana contra la que se mide el Δ. La devuelve el servidor para que la
   *  pantalla pueda DECIR contra qué compara, en vez de que Daniel lo adivine. */
  comparativo?: { desde: string; hasta: string };
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

// ── PERÍODOS ────────────────────────────────────────────────────────────────
//
// Los cuatro que pidió Daniel, textual: "año en curso, últimos 6 meses, últimos
// 12 meses, año pasado". El MES SUELTO que ya existía se queda: es lo que se usa
// para cerrar un mes contra el mismo mes del año pasado.
//
// 🩸 LOS RELATIVOS NO MIRAN EL AÑO DEL SELECTOR DE ARRIBA, Y ES A PROPÓSITO.
// "Últimos 12 meses" es una ventana anclada en HOY: pararla en el año 2025 del
// selector global no significaría nada. Por eso la pantalla imprime SIEMPRE las
// dos fechas del período debajo del total — un rótulo relativo sin fechas es
// justo el que se malinterpreta.
//
// Los cortes son el 1 del mes, nunca "hace 180 días": una ventana cuyo piso se
// corre un día por día es una ventana que cambia sola, y "del 25 de febrero al
// 24 de agosto" no es un período que nadie sepa repetir. Mismo criterio que
// `rango12Meses` de Multifashion.

export type ProductosPeriodo = "ytd" | "6m" | "12m" | "anio_pasado";

export const PRODUCTOS_PERIODO_KEYS: readonly ProductosPeriodo[] = [
  "ytd",
  "6m",
  "12m",
  "anio_pasado",
] as const;

export function esProductosPeriodo(v: string): v is ProductosPeriodo {
  return (PRODUCTOS_PERIODO_KEYS as readonly string[]).includes(v);
}

/** Panamá = UTC-5 fijo, todo el año (CLAUDE.md § Base de datos). */
const PANAMA_OFFSET_MS = 5 * 60 * 60 * 1000;

/** Día de calendario en Panamá para un instante dado. */
export function diaPanama(ahora: Date): string {
  return new Date(ahora.getTime() - PANAMA_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Rango del período elegido.
 *
 * PURO: `ahora` explícito (nunca `new Date()` adentro) — el bug de un borde de
 * mes aparece 1 día de cada 30 y sin esto no se puede probar.
 *
 * `ytd` delega en `productosRange` SIN TOCARLA: es el camino que la pantalla
 * viene usando y sus números no se pueden mover.
 */
export function productosRangoPeriodo(
  periodo: ProductosPeriodo,
  year: number,
  mes: number | null,
  ahora: Date,
): { desde: string; hasta: string } {
  if (periodo === "ytd") return productosRange(year, mes);

  const hoy = diaPanama(ahora);
  const anio = Number(hoy.slice(0, 4));
  const mesHoy = Number(hoy.slice(5, 7));

  // "Año pasado" = el año calendario cerrado anterior a HOY, entero.
  if (periodo === "anio_pasado") return { desde: `${anio - 1}-01-01`, hasta: `${anio - 1}-12-31` };

  // 6 o 12 meses de CALENDARIO incluido el mes en curso: el 24-ago-2026, "12
  // meses" es 1-sep-2025 → 24-ago-2026 (once cerrados + el que corre).
  const largo = periodo === "6m" ? 6 : 12;
  const desde = new Date(Date.UTC(anio, mesHoy - largo, 1)).toISOString().slice(0, 10);
  return { desde, hasta: hoy };
}

/**
 * La ventana contra la que se mide el Δ: EL MISMO PERÍODO DEL AÑO ANTERIOR.
 *
 * ── POR QUÉ HAY DOS CAMINOS Y NO UNO ────────────────────────────────────────
 *
 * · `ytd` y el mes suelto → `productosRange(year - 1, mes)`, que es EXACTAMENTE
 *   lo que la pantalla hace desde que existe. No se unificó con el otro camino
 *   a propósito: para el año en curso, `productosRange(year-1, null)` devuelve
 *   el año anterior ENTERO (12 meses) contra un año en curso PARCIAL (8 meses
 *   al 24-ago). Corregirlo movería una columna que ya está publicada, y la regla
 *   de este repo es que ningún número existente cambia sin que Daniel lo pida.
 *   Queda anotado como hallazgo, no como cambio silencioso.
 *
 * · Los períodos relativos → la MISMA ventana corrida 12 meses, punta a punta,
 *   con `unAnioAntes` (el 29-feb cae en el 28). Mismo largo y mismo corte de
 *   día, así que no hay nada que recortar ni que aclarar: es el criterio de
 *   `rangoComparativo("12m")` de Multifashion, importado y no recopiado.
 */
export function productosRangoComparativo(
  periodo: ProductosPeriodo,
  year: number,
  mes: number | null,
  ahora: Date,
): { desde: string; hasta: string } {
  if (periodo === "ytd") return productosRange(year - 1, mes);
  const r = productosRangoPeriodo(periodo, year, mes, ahora);
  return { desde: unAnioAntes(r.desde), hasta: unAnioAntes(r.hasta) };
}

/** Nombre del período para el título del Excel y el rótulo de la pantalla. */
export function periodoLabel(
  year: number,
  mes: number | null,
  periodo: ProductosPeriodo = "ytd",
  ahora: Date = new Date(),
): string {
  if (periodo === "6m") return "Últimos 6 meses";
  if (periodo === "12m") return "Últimos 12 meses";
  if (periodo === "anio_pasado") return `Año ${Number(diaPanama(ahora).slice(0, 4)) - 1}`;
  if (mes) return `${MONTHS[mes - 1]} ${year}`;
  // Un año todavía abierto es "el año en curso"; uno cerrado es el año entero.
  // "YTD" era jerga: Daniel lo nombra "año en curso".
  return year >= Number(diaPanama(ahora).slice(0, 4)) ? "Año en curso" : `Año ${year}`;
}

/** Trozo del nombre de archivo del Excel. */
export function periodoSlug(mes: number | null, periodo: ProductosPeriodo): string {
  if (periodo !== "ytd") return periodo;
  return mes ? String(mes).padStart(2, "0") : "ytd";
}

/**
 * PRECIO PROMEDIO del grupo: venta neta ÷ unidades netas.
 *
 * Se calcula sobre el AGREGADO, no se promedian los precios de cada código: en
 * "Women-T-Shirts S/S" un código de 8 unidades pesaría igual que uno de 8.000.
 *
 * `null` cuando las unidades no son positivas — un grupo que quedó en devolución
 * neta no tiene precio promedio, y un "$0.00" sería mentira. Es la misma regla
 * con la que el margen es `null` con venta ≤ 0.
 */
export function precioPromedio(
  venta: number | null | undefined,
  cantidad: number | null | undefined,
): number | null {
  if (venta == null || cantidad == null) return null;
  if (!Number.isFinite(venta) || !Number.isFinite(cantidad)) return null;
  return cantidad > 0 ? venta / cantidad : null;
}

/** Precio promedio listo para pintar. "—" cuando no hay unidades netas. */
export function fmtPrecioProm(n: number | null | undefined): string {
  if (n == null) return "—";
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  const periodo = periodoLabel(resp.year, resp.mes, resp.periodo ?? "ytd");

  const totalCant = resp.productos.reduce((s, p) => s + p.cantidad, 0);
  const totalPrecio = precioPromedio(resp.totales.venta, totalCant);

  return buildReportSheet({
    // Las dos fechas van en el subtítulo: un Excel titulado "Últimos 12 meses"
    // que se guarda y se abre en noviembre no dice qué 12 meses fueron.
    title: `FASHION GROUP — Productos · ${nombre} · ${periodo}`,
    subtitle:
      `Del ${resp.desde} al ${resp.hasta} · Venta total ${fmtMoneyPlain(resp.totales.venta)}` +
      ` · Margen ${resp.totales.margen != null ? (resp.totales.margen * 100).toFixed(1) + "%" : "—"}`,
    columns: [
      { header: "Descripción", wch: 34 },
      { header: "# Códigos", wch: 11, align: "right", fmt: "#,##0" },
      { header: "Cantidad", wch: 12, align: "right", fmt: "#,##0" },
      { header: "Venta", wch: 16, align: "right", fmt: MONEY_FMT },
      // Precio prom. va PEGADO a Venta y Cantidad, que son sus dos factores.
      // Vacío (no cero) cuando no hay unidades netas: un 0 se suma y se promedia.
      { header: "Precio prom.", wch: 14, align: "right", fmt: MONEY_FMT },
      { header: "Margen%", wch: 10, align: "right", fmt: PCT_FMT },
    ],
    rows: resp.productos.map(p => [
      p.descripcion,
      p.num_codigos,
      p.cantidad,
      p.venta,
      precioPromedio(p.venta, p.cantidad),
      p.margen ?? 0,
    ]),
    totals: ["TOTAL", null, totalCant, resp.totales.venta, totalPrecio, resp.totales.margen ?? 0],
  });
}

export async function exportProductosToExcel(resp: ProductosResponse): Promise<void> {
  const ws = await buildProductosSheet(resp);
  const { workbookFromSheets, downloadWorkbook } = await import("@/lib/excel-export");
  downloadWorkbook(
    workbookFromSheets([{ name: "Productos", ws }]),
    `productos-${resp.empresa}-${periodoSlug(resp.mes, resp.periodo ?? "ytd")}-${resp.year}.xlsx`,
  );
}

function fmtMoneyPlain(n: number): string {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
