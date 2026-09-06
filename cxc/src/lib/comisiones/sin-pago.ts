// Vendedores a los que la comisión SE CALCULA Y SE MUESTRA, pero NO SE PAGA.
//
// 🩸 Daniel, 3-sep-2026, textual: «se queda sin pagar, pero qué importa?
// Acuérdate que si yo cobro no le pago a nadie porque no me autopago».
//
// Dos nombres, y son los dos usuarios de Switch con los que la oficina vende y
// cobra: `DEFAULT` (el usuario #1 de cada empresa) y el propio Daniel. Desde
// que el cobro se paga a quien REGISTRÓ el recibo (comision_b2b_v6) esas dos
// filas juntan plata de verdad —DEFAULT ~2.869 USD y Daniel ~2.333 USD de
// cobro en ene–ago 2026— y hay que decidir qué pasa con ella. La decisión es:
// se ve cuánto sería (la fila queda, con su número) y no entra en el total a
// pagar. No se esconde: una fila que desaparece es plata que nadie cuadra.
//
// UN SOLO LUGAR. El servidor marca `se_paga` en las dos rutas de comisiones
// (`marcarSePaga`, mismo trato que `netearComisiones`), y las pantallas y el
// Excel leen esa marca: pintan la fila distinta y suman al pie SOLO lo pagable.
// Nadie vuelve a escribir «DEFAULT» o «DANIEL LEVY» en una vista.
//
// Comparación por nombre recortado y en mayúsculas: joystep registra a
// «DANIEL LEVY » con espacio final (medido, 40 recibos en 2026).

/** Los que no cobran comisión. Agregar uno es una línea acá y nada más. */
export const VENDEDORES_SIN_PAGO: readonly string[] = ["DEFAULT", "DANIEL LEVY"];

const clave = (vendedor: string): string => vendedor.trim().toUpperCase();

/** ¿A esta persona se le paga la comisión que se le calculó? */
export function sePagaComision(vendedor: string): boolean {
  const k = clave(vendedor);
  return !VENDEDORES_SIN_PAGO.some((v) => clave(v) === k);
}

export interface VendedorConPago {
  vendedor: string;
}

/** Marca cada vendedor con `se_paga`. Puro: no cambia ningún monto. */
export function marcarSePaga<T extends VendedorConPago>(
  vendedores: readonly T[],
): (T & { se_paga: boolean })[] {
  return (vendedores ?? []).map((v) => ({ ...v, se_paga: sePagaComision(v.vendedor) }));
}

/**
 * Suma SOLO lo pagable. `se_paga` ausente cuenta como pagable: una respuesta
 * vieja (o un mock) no debe vaciar el pie de la tabla.
 */
export function sumarPagable<T extends { se_paga?: boolean }>(
  filas: readonly T[],
  monto: (fila: T) => number,
): number {
  return filas.reduce((acc, f) => (f.se_paga === false ? acc : acc + monto(f)), 0);
}

/** Texto único de la marca en pantalla y en el Excel. */
export const ROTULO_NO_SE_PAGA = "no se paga";

/**
 * 🔴 LOS QUE NO SE PAGAN, DETRÁS DE «VER TODOS» (6-sep-2026).
 *
 * Daniel: *«los que no se pagan que no aparezca en la pantalla»* → y después
 * eligió (b): que se vean SOLO si tocas el enlace. Son **Oficina (DEFAULT)** y
 * **Daniel Levy** — $8.089,77 en 2026.
 *
 * 🔑 ARREGLA ALGO DE PASO: hoy las filas VISIBLES no suman el «Total a pagar»
 * —esas dos se muestran con su número y no entran—, así que la tabla parecía no
 * cuadrar. Escondiéndolas, lo que se ve suma exactamente lo que se paga.
 *
 * ⚠️ NO CAMBIA NINGÚN CÁLCULO. `VENDEDORES_SIN_PAGO` sigue siendo la fuente
 * única, el servidor sigue marcando `se_paga`, el total sigue saliendo de
 * `sumarPagable` y el Excel los sigue llevando con su «(no se paga)»: lo único
 * que cambia es que la pantalla no los dibuja hasta que se los pide.
 */
export const ROTULO_VER_NO_SE_PAGAN = "Ver los que no se pagan";
export const ROTULO_VER_MENOS = "Ver menos";

/** «Ver los que no se pagan (2)» — con cuántos hay, para no abrir a ciegas. */
export function rotuloVerNoSePagan(cuantos: number): string {
  return `${ROTULO_VER_NO_SE_PAGAN} (${cuantos})`;
}
