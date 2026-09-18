/* ─────────────────────────────────────────────────────────────────────────────
 * ENCONTRAR RÁPIDO LOS DÍAS A REVISAR (18-sep-2026). Módulo PURO: sin base, sin
 * red, sin `new Date()` y sin un solo número de plata.
 *
 * Daniel, textual, sobre el mockup de cuatro cuadros: *«opcion a con mockup»* y
 * *«si y nada más el botón de "Solo a revisar"»*.
 *
 * O sea DOS cosas, y nada más que esas dos:
 *
 *   1. **El número de la columna «A revisar» es un enlace.** Se toca y se abre
 *      a esa persona mostrando SOLO esos días, no la quincena entera.
 *   2. **Un botón «Solo a revisar»** al lado del buscador, que deja en la tabla
 *      únicamente a quien tiene algo que revisar.
 *
 * 🔴 LO QUE **NO** SE HACE, y no es un olvido: partir la columna en «marcó de
 * más» y «le falta una marca». Se le ofreció en el mismo mockup (era la opción
 * B, con sus tres botones) y dijo que no. Agregarlo «de paso» sería inventarle
 * una decisión.
 *
 * ── 🩸 EL PROBLEMA, MEDIDO ───────────────────────────────────────────────────
 *
 * Quincena 1–15 sep, contra producción: **426 días-persona con marca**, **82 a
 * revisar**, repartidos en **34 colaboradores** de los 45 de la lista. El
 * número de la columna era MUERTO: para trabajar los 82 había que entrar a 34
 * fichas y recorrer los 11 días de cada una, uno por uno.
 *
 * ── 🔴 LA REGLA NO SE INVENTA ACÁ ────────────────────────────────────────────
 *
 * Qué es «a revisar» lo decide el motor y nada más: `revisar` en `reporte.ts`
 * (`!enCurso && buenas.length !== 4`), y el total por persona es
 * `resumen.diasARevisar`. Este módulo **solo filtra por esos dos campos**. Si
 * mañana cambia la regla —ya cambió dos veces este mes— cambia en un lugar y
 * acá no hay nada que tocar.
 *
 * ── 🔴 EL TOTAL SIGUE AL FILTRO ──────────────────────────────────────────────
 *
 * Es la regla escrita de la casa (`lib/buscar-en-lista.ts`): *«o el total sigue
 * al filtro, o no hay buscador»*. Con el botón prendido, el pie de la tabla se
 * suma sobre lo que se VE —los 34—, y al lado del botón se dice «34 de 45
 * colaboradores» para que ese total recortado no se lea como el de todos.
 *
 * 🔴 Y LO QUE SALE DE LA PANTALLA DICE A CUÁNTOS AFECTA. El Excel y el PDF
 * bajan exactamente lo que se está viendo —igual que hoy con el buscador, que
 * filtra en el SERVIDOR y por eso ya recorta los dos archivos—, y con el filtro
 * prendido los botones se llaman «Excel · 34» y «PDF · 34». Es la única
 * excepción que la regla admite: un botón que DIGA a cuántos afecta.
 *
 * ── 🔴 UNA SOLA FORMA DE LLEGAR AL DÍA ───────────────────────────────────────
 *
 * El enlace del número se arma sobre `enlaceDiasDe` (`marcas-impares.ts`), la
 * MISMA dirección que ya usan «Ver sus días ›» de la ficha y el aviso «Antes de
 * cerrar» de la Planilla. Lo único que agrega es `?diasDe=<código>`, que dice
 * cuál fila se abre y que se abre con solo sus días a revisar. Dos formas de
 * llegar al mismo día es una forma de que una de las dos deje de funcionar.
 * ────────────────────────────────────────────────────────────────────────── */

import { enlaceDiasDe } from "./marcas-impares";

/**
 * 🔴 EL FILTRO VIVE EN LA URL, CON `replace`. Es un filtro del MISMO nivel —como
 * `?buscar=`, `?empresa=` y `?desde=`—, así que no puede ensuciar el botón
 * Atrás del navegador (convención del sistema, `useUrlState`).
 */
export const PARAM_SOLO_A_REVISAR = "revisar";

/** El único valor que prende el filtro. Cualquier otra cosa es «apagado». */
export const VALOR_PRENDIDO = "1";

/**
 * Qué fila está abierta mostrando SOLO sus días a revisar. Lleva el código del
 * colaborador, por igualdad exacta — nunca por nombre.
 */
export const PARAM_DIAS_DE = "diasDe";

/** El rótulo del botón, en un solo lugar: pantalla y candado leen el mismo. */
export const ROTULO_SOLO_A_REVISAR = "Solo a revisar";

/** Lo que dice la tabla cuando el filtro no deja a nadie. Nunca una tabla en blanco. */
export const VACIO_SIN_A_REVISAR = "Nadie tiene días a revisar en este período";

/** El botón que devuelve la lista completa, al lado del vacío. */
export const VER_A_TODOS = "Ver a todos";

/** Lo que dice el número al pasar el cursor. */
export const TITULO_NUMERO = "Ver solo esos días";

/** ¿Está prendido el filtro? Solo `"1"` lo prende. */
export function filtroPrendido(valor: string | null | undefined): boolean {
  return String(valor ?? "") === VALOR_PRENDIDO;
}

/** Lo mínimo que este módulo le pide a una persona del reporte. */
export interface PersonaParaRevisar {
  codigo: string;
  resumen: { diasARevisar: number };
}

/** Lo mínimo que le pide a un día. */
export interface DiaParaRevisar {
  revisar: boolean;
}

/**
 * ¿Esta persona tiene algo que revisar? Es la MISMA cuenta que dibuja la
 * columna (`resumen.diasARevisar`), nunca una segunda pasada por los días: dos
 * cuentas del mismo número es cómo se llega a una fila que el filtro esconde y
 * la columna muestra en ámbar.
 */
export function tieneDiasARevisar(p: PersonaParaRevisar): boolean {
  return (p?.resumen?.diasARevisar ?? 0) > 0;
}

/**
 * Las personas que tienen algo que revisar.
 *
 * 🔴 FILTRA LO YA CARGADO, sin pedirle nada al servidor —igual que el buscador
 * de las otras listas—, y **no copia ni reordena** cuando no filtra: la lista
 * que entra es la misma que sale.
 */
export function soloConDiasARevisar<T extends PersonaParaRevisar>(
  lista: readonly T[] | null | undefined,
  prendido: boolean,
): T[] {
  const todas = (lista ?? []) as T[];
  if (!prendido) return todas;
  return todas.filter((p) => tieneDiasARevisar(p));
}

/**
 * Los días de una persona que hay que revisar. `revisar` lo pone el motor; acá
 * no se vuelve a decidir.
 */
export function diasARevisarDe<T extends DiaParaRevisar>(
  dias: readonly T[] | null | undefined,
  soloEsos: boolean,
): T[] {
  const todos = (dias ?? []) as T[];
  if (!soloEsos) return todos;
  return todos.filter((d) => Boolean(d?.revisar));
}

/**
 * «34 de 45 colaboradores», al lado del botón. Vacío con el filtro apagado: un
 * contador permanente es una palabra de más.
 */
export function conteoARevisar(visibles: number, total: number, prendido: boolean): string {
  if (!prendido) return "";
  return `${visibles} de ${total} ${total === 1 ? "colaborador" : "colaboradores"}`;
}

/**
 * La línea gris de la fila abierta con solo sus días. Dice cuántos se están
 * mostrando, de cuántos, y **cómo se ven los demás** — sin agregar un control
 * nuevo: tocar la fila la abre entera, que es lo que ya hacía.
 *
 * `null` cuando no hay nada que aclarar (no se está recortando, o no quedó
 * ninguno afuera).
 */
export function textoSoloEstosDias(mostrados: number, total: number): string | null {
  if (mostrados <= 0 || total <= mostrados) return null;
  const esos = mostrados === 1 ? "Solo el día a revisar" : `Solo los ${mostrados} días a revisar`;
  return `${esos}, de ${total} del período. Toca la fila para verlos todos.`;
}

/**
 * 🔴 EL BOTÓN DE DESCARGA DICE A CUÁNTOS AFECTA cuando la pantalla está
 * recortada. Es la única excepción a «lo que sale de la pantalla nunca se
 * recorta», y la regla pide justamente que el botón lo diga.
 */
export function rotuloDescarga(base: string, visibles: number, prendido: boolean): string {
  if (!prendido) return base;
  return `${base} · ${visibles}`;
}

/**
 * La dirección que abre a UNA persona con SOLO sus días a revisar.
 *
 * 🔴 Se arma sobre `enlaceDiasDe`, la dirección que el módulo ya usa para
 * llevar a los días de alguien (la ficha y el aviso «Antes de cerrar» de la
 * Planilla). Lo único propio es `?diasDe=`.
 */
export function enlaceDiasARevisarDe(
  codigo: string,
  rango: { desde: string; hasta: string } | null = null,
): string {
  const cod = String(codigo ?? "").trim();
  const base = enlaceDiasDe(cod, rango);
  return `${base}&${PARAM_DIAS_DE}=${encodeURIComponent(cod)}`;
}
