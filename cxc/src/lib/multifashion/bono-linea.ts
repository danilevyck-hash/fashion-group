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
 * frase de abajo se va. Con el mes EN CURSO, UNA línea arriba de la tabla con la
 * regla, sin chips. En un rango de meses, nada.
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
  if (!resp || resp.sin_data || !resp.es_elegible) return null;
  if (v.manager) {
    const monto = resp.gerente?.bono ?? 0;
    return monto > 0 ? { tipo: "gerente", texto: `Bono gerente $${monto}` } : null;
  }
  const fila = (resp.vendedoras ?? []).find((x) => x.nombre === v.nombre);
  return fila?.bono_vendedora ? { tipo: "vendedora", texto: `Bono $${BONO_VENDEDORA}` } : null;
}
