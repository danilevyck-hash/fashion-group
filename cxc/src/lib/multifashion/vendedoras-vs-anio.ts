// ─────────────────────────────────────────────────────────────────────────────
// COMISIONES › MULTIFASHION · LA Δ CONTRA EL MISMO MES DEL AÑO PASADO Y LA
// PARTE DE CADA VENDEDORA (2-oct-2026, `MULTIFASHION_TOTAL_PERSONA_2026_10`).
//
// Daniel aprobó la tabla ordenada con dos cambios:
//   1. La Δ va contra el MISMO MES DEL AÑO PASADO (septiembre 2026 vs
//      septiembre 2025), no contra el mes anterior. Mes cerrado: entero contra
//      entero. Mes abierto: los MISMOS DÍAS, con la regla única del sistema
//      (`ventanaUnAnioAntes`, último día cargado). Sin ventas ese mes del año
//      pasado: «Nueva». Encabezado: «Δ vs sep 2025».
//   2. Debajo de Ventas, su parte de la venta del mes («34%»).
//
// 🔴 Ninguna cuenta de pago se toca. La venta del año pasado sale de la MISMA
// vista que la RPC (`_multifashion_sf_vw`), con el MISMO filtro de vendedor
// (sin vacío ni DEFAULT) y por `vendedor_canonico`. La base mínima del % es la
// de siempre (`variacionPct`, $100). Módulo PURO.
// ─────────────────────────────────────────────────────────────────────────────

import { ventanaUnAnioAntes, type VentanaComparativa } from "@/lib/ventas/clientes-corte-comparativo";
import { variacionPct } from "@/lib/variacion";

const MES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MES_LARGO = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const dd = (n: number) => String(n).padStart(2, "0");

/** La ventana del año pasado para un MES (inclusiva, YYYY-MM-DD). */
export function ventanaMesAnioPasado(
  year: number,
  mes: number,
  ultimoDiaCargado: string | null,
  ahora: Date,
): VentanaComparativa {
  const fin = new Date(Date.UTC(year, mes, 0)).getUTCDate();
  return ventanaUnAnioAntes(
    { desde: `${year}-${dd(mes)}-01`, hasta: `${year}-${dd(mes)}-${dd(fin)}` },
    ultimoDiaCargado,
    ahora,
  );
}

export interface FilaVentaAnioPasado {
  vendedor: string | null;
  vendedor_canonico: string | null;
  subtotal: number | string | null;
}

/** Venta por vendedora (canónica), con el MISMO filtro que la RPC. */
export function ventasPorVendedora(filas: readonly FilaVentaAnioPasado[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of filas) {
    const crudo = (f.vendedor ?? "").trim();
    if (!crudo || crudo.toUpperCase() === "DEFAULT" || !f.vendedor_canonico) continue;
    out[f.vendedor_canonico] = (out[f.vendedor_canonico] ?? 0) + Number(f.subtotal ?? 0);
  }
  return out;
}

/** 🔴 5-oct-2026: toda la venta de la TIENDA (sin filtro de vendedora): el total compara tienda contra tienda. */
export function ventaTienda(filas: readonly FilaVentaAnioPasado[]): number {
  return filas.reduce((a, f) => a + Number(f.subtotal ?? 0), 0);
}

export type DeltaAnioPasado =
  | { tipo: "nueva" }
  | { tipo: "pct"; ratio: number | null };

/** «Nueva» si no vendió ese mes del año pasado; si no, el % de siempre (base mínima $100). */
export function deltaVsAnioPasado(actual: number, anioPasado: number | undefined): DeltaAnioPasado {
  if (anioPasado == null || anioPasado <= 0) return { tipo: "nueva" };
  return { tipo: "pct", ratio: variacionPct(actual, anioPasado) };
}

/** Su parte de la venta del mes (fracción) o null sin total. */
export function participacion(ventas: number, total: number): number | null {
  return total > 0 ? ventas / total : null;
}

/** «Δ vs sep 2025». */
export function rotuloDeltaAnioPasado(year: number, mes: number): { columna: string; corto: string } {
  const corto = `vs ${MES_CORTO[mes - 1]} ${year - 1}`;
  return { columna: `Δ ${corto}`, corto };
}

/** La línea final de la tabla (4-oct-2026): contra qué se compara y, si el mes va abierto, que son los mismos días. */
export function notaAnioPasado(year: number, mes: number, ventana: { hasta: string; parcial: boolean }): string {
  const nombre = `${MES_CORTO[mes - 1]} ${year - 1}`;
  return ventana.parcial ? `vs ${nombre}, mismos días` : `vs ${nombre}`;
}

/**
 * 🔴 5-oct-2026 (Daniel): la línea del pie con la variación del TOTAL, tienda
 * contra tienda: «+12% vs oct 2025, mismos días». Sin historia o sin la venta
 * de la tienda, solo la nota (nunca un % inventado).
 */
export function notaTotalAnioPasado(
  year: number,
  mes: number,
  ventana: { hasta: string; parcial: boolean; tienda?: number; tienda_actual?: number },
): string {
  const nota = notaAnioPasado(year, mes, ventana);
  if (ventana.tienda == null || ventana.tienda_actual == null) return nota;
  const d = deltaVsAnioPasado(ventana.tienda_actual, ventana.tienda);
  if (d.tipo !== "pct" || d.ratio == null) return nota;
  const pct = `${d.ratio >= 0 ? "+" : ""}${(d.ratio * 100).toFixed(0)}%`;
  return `${pct} ${nota}`;
}
