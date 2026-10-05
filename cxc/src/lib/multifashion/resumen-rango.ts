// MULTIFASHION › RESUMEN CON «RANGO DE FECHAS» (Daniel, 5-oct-2026).
// (módulo PURO)
//
// El mismo botón «Rango de fechas» de Vendedoras, Productos y Clientes, ahora
// también en el Resumen. Con un rango se ve la venta RETAIL del rango (el número
// grande, `is_wholesale = false` de `_multifashion_sf_vw`, la MISMA fuente y
// regla que el detalle del mes) contra los MISMOS DÍAS del año pasado
// (`mismosDiasAnioPasado`, 29-feb → 28-feb), y el día por día.
//
// 🔴 El corte: si el rango llega a días sin datos todavía (hoy), se compara
// hasta el ÚLTIMO DÍA CARGADO, como el mes en curso. El mes no cambia en nada.
//
// `RESUMEN_RANGO_2026_10 = false` → el Resumen vuelve a ser solo por mes.
// Candado: `src/__tests__/lib/multifashion-resumen-rango.test.ts`.

import { mismosDiasAnioPasado } from "@/lib/comisiones/vendedores-rango";

export const RESUMEN_RANGO_2026_10 = true;

export interface FilaRetail { fecha: string; subtotal: number | null }
export interface DiaRango { fecha: string; ventas: number }
export interface TramoRango { desde: string; hasta: string; ventas: number; tickets: number; dias: DiaRango[] }
export interface ResumenRango { actual: TramoRango; previo: TramoRango }

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Suma por día (tickets = filas, como `multifashion_detalle_mensual_v3`). */
export function tramoDe(desde: string, hasta: string, filas: readonly FilaRetail[]): TramoRango {
  const porDia = new Map<string, number>();
  let ventas = 0;
  let tickets = 0;
  for (const f of filas) {
    const dia = f.fecha.slice(0, 10);
    if (dia < desde || dia > hasta) continue;
    const v = Number(f.subtotal ?? 0);
    porDia.set(dia, (porDia.get(dia) ?? 0) + v);
    ventas += v;
    tickets += 1;
  }
  const dias = [...porDia.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([fecha, v]) => ({ fecha, ventas: r2(v) }));
  return { desde, hasta, ventas: r2(ventas), tickets, dias };
}

/** El último día con venta del rango (o `hasta` si no hay nada). */
export function corteDelRango(desde: string, hasta: string, filas: readonly FilaRetail[]): string {
  let max = "";
  for (const f of filas) {
    const d = f.fecha.slice(0, 10);
    if (d >= desde && d <= hasta && d > max) max = d;
  }
  return max || hasta;
}

/** Las fechas contra las que se compara: los mismos días del año pasado, hasta el corte. */
export function comparacionDelRango(desde: string, corte: string): { desde: string; hasta: string } {
  return mismosDiasAnioPasado(desde, corte);
}
