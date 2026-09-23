// ─────────────────────────────────────────────────────────────────────────────
// QUÉ RENGLONES VAN AL PAPEL DEL VENDEDOR — solo lo PAGABLE. (módulo PURO)
//
// 🩸 POR QUÉ (22-sep-2026). El PDF y el Excel del MISMO vendedor no decían lo
// mismo. El RPC lista a propósito las facturas con utilidad ≤ 20 % con aporte
// $0.00 (en pantalla van en gris y con la columna «% utilidad», que las
// explica); el Excel las quitaba (`ventasPagables`) y el PDF no. Medido en los
// papeles reales de agosto 2026: Reynaldo · Fashion Wear **51 renglones en el
// PDF contra 49 en el Excel**; Edwin · Vistana «De Moda 11-000003024 FA $0.00»
// (utilidad 9,68 %). El papel no tiene la columna que lo explica, así que el
// vendedor lee «mi venta a De Moda vale $0» y nadie le dice por qué. Y un
// recibo en $0.00 («20 ago · Jerusalem De Panama») salía en los dos.
//
// Daniel, textual: *«3. b) no salen»* y *«recibo $0.00: a) se quita del papel»*.
//
// 🔴 UNA SOLA FUNCIÓN DECIDE, Y LA LEEN LOS DOS PAPELES (`renglonesDelPapel`):
// `reporte-comision.ts` (lo que dibuja el PDF) y `comisionExcel.ts`. Dos
// filtros —aunque copien la misma línea— es cómo se llegó a 51 contra 49.
//
// 🔴 NINGÚN TOTAL SE MUEVE. `ventas_base`, `cobros_base`, `comision_venta`,
// `comision_cobro` y `comision_total` son los del RPC y no se recalculan acá;
// un renglón en $0 no suma nada, así que quitarlo deja el mismo total. Medido
// el 22-sep-2026 contra producción: agosto 2026 sigue dando **$5.978,55** a
// pagar con y sin esos renglones (`scripts/_medir-comisiones-papel-pagable.mjs`).
//
// 🔴 ES LA MISMA REGLA QUE CUENTAS POR COBRAR: «recibos en cero no cuentan»
// (`lib/cxc/pagos-por-fecha.ts`).
//
// ⚠️ La PANTALLA no cambia: el detalle sigue mostrando esas facturas en gris,
// con su % de utilidad. Esto es solo el papel que se le entrega al vendedor.
// ─────────────────────────────────────────────────────────────────────────────

import type { CobroDoc, ComisionDetalle, VentaDoc } from "@/lib/ventas/comisionExcel";

/**
 * El interruptor. En `true` el PDF y el Excel llevan SOLO lo pagable; en `false`
 * cada papel se porta EXACTAMENTE como antes del 22-sep-2026 (el Excel sin las
 * facturas en $0 —ya lo hacía—, el PDF con todo, y los recibos en cero en los dos).
 */
export const PAPEL_SOLO_PAGABLE = true;

/** Las facturas que de verdad comisionan: aporte distinto de cero. */
export function ventasDelPapel(ventas: readonly VentaDoc[] | null | undefined): VentaDoc[] {
  return (ventas ?? []).filter((v) => v.subtotal !== 0);
}

/** Los recibos que de verdad cobran: monto distinto de cero. */
export function cobrosDelPapel(cobros: readonly CobroDoc[] | null | undefined): CobroDoc[] {
  return (cobros ?? []).filter((c) => c.monto !== 0);
}

/** Lo que el papel lista, en el orden en que llegó del RPC. */
export interface RenglonesDelPapel {
  ventas: VentaDoc[];
  cobros: CobroDoc[];
}

/**
 * Los renglones del reporte de UN vendedor en UNA empresa. Con el interruptor
 * prendido, solo lo pagable; apagado, todo lo que trajo el RPC (como antes).
 */
export function renglonesDelPapel(
  data: Pick<ComisionDetalle, "ventas" | "cobros">,
  soloPagable: boolean = PAPEL_SOLO_PAGABLE,
): RenglonesDelPapel {
  if (!soloPagable) return { ventas: [...(data.ventas ?? [])], cobros: [...(data.cobros ?? [])] };
  return { ventas: ventasDelPapel(data.ventas), cobros: cobrosDelPapel(data.cobros) };
}
