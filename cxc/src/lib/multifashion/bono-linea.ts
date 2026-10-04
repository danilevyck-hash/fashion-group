// ─────────────────────────────────────────────────────────────────────────────
// LA LÍNEA DEL BONO (23-sep-2026) — reemplaza la columna «Bono» de Vendedoras.
//
// 🩸 La columna decía «al cierre» en las cuatro filas durante 29 días de cada
// 30: solo tiene dato el mes cerrado. Ahora es UNA línea debajo de la tabla:
//
//   · mes en curso → «Bono: se define al cerrar el mes (retail contra retail).
//                     En agosto: Jennifer Miranda $100 · Sheynee Batista $50.»
//   · mes cerrado  → «Bono de agosto 2026 (retail contra retail): Jennifer
//                     Miranda $100 · Sheynee Batista $50.»
//
// 🔁 1-oct-2026 (Daniel: «Badge de bono sí, como antes»): con el mes CERRADO
// la frase de abajo se fue y el bono es un CHIP en la fila (`chipDeBono`); con
// el mes EN CURSO queda UNA línea ARRIBA de la tabla con la regla (`lineaBono`).
// 🔁 4-oct-2026 (Daniel: «quítame estos mensajes que no son necesarios»): ya no
// va arriba. Al FINAL de la tabla dice solo «bono al cierre del mes» (`bonoCorto`)
// y la regla entera (`lineaBono`) queda detrás del ⓘ.
//
// ⚠️ Ni el monto ni la regla del bono viven aquí: los decide la RPC
// (`multifashion_bonos_v5`, retail contra retail; cae a la v4). Esto solo elige
// las palabras. Módulo PURO.
// ─────────────────────────────────────────────────────────────────────────────

import type { BonosMultifashion } from "@/components/ventas/types";

const MES_LARGO = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/**
 * 🔴 EL BONO VUELVE A SER UN CHIP EN LA FILA (1-oct-2026). Daniel: *«Badge de
 * bono sí, como antes»*.
 *
 * 🩸 Hasta hoy, con el mes CERRADO, quién ganó salía en una frase gris chica
 * debajo de la tabla («Bono de septiembre 2026, por la venta de la tienda:
 * Jennifer Miranda $100 · Sheynee Batista $50.») y la fila ganadora solo tenía
 * un fondo ámbar tenue. Ahora, como en junio: un chip junto al nombre —«Bono
 * $50» ámbar para la vendedora, «Bono gerente $100» verde para la gerente— y la
 * frase de abajo se va. Con el mes EN CURSO, sin chips: «bono al cierre del mes»
 * en la línea final de la tabla y la regla detrás del ⓘ. En un rango de meses, nada.
 *
 * ⚠️ La regla dicha en la línea es la de `multifashion_bonos_v5`: $50 a la
 * no-gerente que más vende el mes, y a la gerente $50 si la tienda (sin
 * mayoreo) crece ≥ 5 % contra el mismo mes del año pasado, $100 si crece ≥ 10 %.
 */

/** El bono de la vendedora: la RPC solo dice QUIÉN (`bono_vendedora`), no
 *  cuánto. Es el mismo $50 que la RPC usa en su regla y que decía la línea. */
export const BONO_VENDEDORA = 50;

const MONTO_GERENTE_5 = 50;
const MONTO_GERENTE_10 = 100;

/** La línea del mes en curso; `null` = no hay nada que decir (mes cerrado,
 *  sin datos). Los rangos de meses ni montan el bono. */
export function lineaBono(visto: BonosMultifashion | null | undefined): string | null {
  if (!visto || visto.sin_data || visto.es_elegible) return null;
  return `Bono de ${MES_LARGO[visto.mes_evaluado.mes - 1]}: se define al cerrar el mes · $${BONO_VENDEDORA} a la que más venda y $${MONTO_GERENTE_5}/$${MONTO_GERENTE_10} a la gerente si la tienda crece ≥5 %/≥10 %`;
}

/** Lo corto que va en la línea final de la tabla (4-oct-2026); el detalle
 *  (`lineaBono`) queda detrás del ⓘ. `null` = mes cerrado o sin datos. */
export function bonoCorto(visto: BonosMultifashion | null | undefined): string | null {
  return lineaBono(visto) ? "bono al cierre del mes" : null;
}

export interface ChipDeBono {
  tipo: "vendedora" | "gerente";
  texto: string;
}

/**
 * El chip de UNA fila. Solo con el mes cerrado (`es_elegible`): la ganadora la
 * marca la RPC por nombre; la gerente es la fila `manager` y su monto el de la
 * RPC (0 = no hay chip).
 */
export function chipDeBono(
  v: { nombre: string; manager: boolean },
  resp: BonosMultifashion | null | undefined,
): ChipDeBono | null {
  const monto = bonoDeFila(v, resp);
  if (monto <= 0) return null;
  return v.manager
    ? { tipo: "gerente", texto: `Bono gerente $${monto}` }
    : { tipo: "vendedora", texto: `Bono $${monto}` };
}

/**
 * El bono de UNA fila, en dólares: el mismo dato del chip. 0 con el mes
 * abierto, en un rango o sin respuesta de la RPC.
 */
export function bonoDeFila(
  v: { nombre: string; manager: boolean },
  resp: BonosMultifashion | null | undefined,
): number {
  if (!resp || resp.sin_data || !resp.es_elegible) return 0;
  if (v.manager) return resp.gerente?.bono ?? 0;
  const fila = (resp.vendedoras ?? []).find((x) => x.nombre === v.nombre);
  return fila?.bono_vendedora ? BONO_VENDEDORA : 0;
}

/**
 * 🔴 «TOTAL A PAGAR» DE MULTIFASHION = COMISIONES + BONOS (1-oct-2026). Daniel
 * aprobó el mockup con un «sí»: agosto 2026 decía $255.27 (solo comisiones) y
 * se pagan $405.27 (+ $50 de Sheynee y $100 de Jennifer).
 *
 * UNA sola función para el mismo número: la usan la barra de la pantalla y el
 * Excel. Con el mes abierto no hay bonos y el total es igual a las comisiones.
 * 🔴 Es SOLO de Multifashion: nunca se suma con el total del grupo.
 */
export function totalAPagarMultifashion(
  filas: readonly { nombre: string; manager: boolean; comision: number | null }[],
  resp: BonosMultifashion | null | undefined,
): { comisiones: number; bonos: number; total: number } {
  let comisiones = 0;
  let bonos = 0;
  for (const v of filas) {
    comisiones += v.comision ?? 0;
    bonos += bonoDeFila(v, resp);
  }
  return { comisiones, bonos, total: comisiones + bonos };
}

/**
 * 🔴 EL TOTAL DE CADA PERSONA, EN SU FILA (2-oct-2026). Daniel: *«¿cómo harías
 * aquí para que se vea el total de la persona?»*.
 *
 * Comisiones › Multifashion, con el mes CERRADO: dos columnas al final, «Bono»
 * y «Total a pagar» (comisión + bono); el chip deja de decir el monto (un ícono
 * chico, para no decir el número dos veces) y el pie pone comisiones y bonos
 * bajo sus columnas. Con el mes abierto, nada de eso.
 * 🔴 Solo cambia la pantalla: el número sale de `totalDeFila`, el MISMO que usa
 * el Excel. `false` = la pantalla de antes.
 *
 * 🔁 Daniel aprobó el 2-oct-2026 la tabla ordenada, con dos cambios: la Δ
 * contra el MISMO MES DEL AÑO PASADO (`vendedoras-vs-anio.ts`) y la parte de
 * cada vendedora bajo Ventas. PRENDIDO.
 */
export const MULTIFASHION_TOTAL_PERSONA_2026_10 = true;

/** Lo que se le paga a UNA persona: su comisión + su bono. Pantalla y Excel. */
export function totalDeFila(
  v: { nombre: string; manager: boolean; comision: number | null },
  resp: BonosMultifashion | null | undefined,
): number {
  return (v.comision ?? 0) + bonoDeFila(v, resp);
}
