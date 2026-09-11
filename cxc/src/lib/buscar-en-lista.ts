// ─────────────────────────────────────────────────────────────────────────────
// BUSCAR DENTRO DE UNA LISTA QUE YA ESTÁ EN PANTALLA (11-sep-2026).
//
// Daniel: *«pon buscador en módulos o tabs que lo ameriten, como colaboradores
// por ejemplo»* → *«pon buscador a lo que normalmente llevaría buscador, no es
// tan complicado»*.
//
// 🔴 ESTO NO LE PREGUNTA NADA AL SERVIDOR. Filtra lo que el navegador ya tiene
// cargado — son listas de 12 a 42 filas; pedirlas otra vez para tachar renglones
// sería abrir una petición por tecla. Quien SÍ busca contra el servidor
// (Clientes, el ⌘K global, la pestaña Asistencia) tiene su propio camino y no
// pasa por acá.
//
// 🔴 SUBCADENA EXACTA NORMALIZADA, NUNCA POR PARECIDO. Es la regla de la casa
// —la misma de `switch_clientes`, la de los destinos de Guías y la de los alias
// de Comisiones—: `Outlet Duty Free N2` y `N3` son cosas distintas, y una
// distancia de edición las junta. Acá el único permiso es ignorar acentos,
// mayúsculas y signos, porque nadie teclea «MUÑOZ» con la ñ ni «D-142» con el
// guion. Eso ya lo resuelve `coincideBusqueda` y se reusa tal cual.
//
// ═════════════════════════════════════════════════════════════════════════════
// 🔴 LA REGLA DEL TOTAL — **O EL TOTAL SIGUE AL FILTRO, O NO HAY BUSCADOR.**
// ═════════════════════════════════════════════════════════════════════════════
//
// 🩸 Esta misma mañana la regla estaba AL REVÉS: el buscador tachaba renglones y
// el pie seguía sumando la lista entera, con un renglón de letra chica abajo
// explicándolo. Daniel, al verlo en la Planilla: *«entonces no lo pongas en
// planilla»*. Y después, sobre el resto: *«pon buscador a lo que normalmente
// llevaría buscador»*.
//
// 🔑 Las dos frases dicen lo mismo. Una lista recortada al lado de un total que
// no lo está hace dudar de cuál de los dos manda, y ninguna nota al pie arregla
// esa duda: la confiesa. Entonces, para cada lista, hay exactamente DOS salidas
// y no una tercera:
//
//   a) **El total sigue al filtro** — se suma sobre lo que se ve, y al lado se
//      dice «3 de 12 colaboradores» para que nadie lea el total recortado como
//      si fuera el de todos. Es lo que hacen Cuentas por Cobrar, Préstamos,
//      Caja Menuda y Gastos.
//   b) **No hay buscador** — cuando el total es plata que se PAGA y no admite
//      recorte ni con aviso. Es la Planilla: su pie es la quincena que se cierra
//      y que baja al Excel, así que ahí no se busca (11-sep-2026).
//
// 🔴 Lo que NUNCA se recorta es lo que SALE de la pantalla: el Excel, el PDF y
// cualquier acción en lote salen de la lista COMPLETA, aunque la pantalla esté
// filtrada. La única excepción es un botón que DIGA a cuántos afecta —«Sí a los
// 3 que ves»— y entonces afecta exactamente a esos (Aprobaciones).
// ─────────────────────────────────────────────────────────────────────────────

import { coincideBusqueda } from "./buscar-normalizado";

/** El texto del buscador viaja en la URL con esta llave, la MISMA en todas las pantallas. */
export const PARAM_BUSCAR = "buscar";

/** Lo que dice el campo cuando está vacío. */
export const PLACEHOLDER_COLABORADOR = "Buscar colaborador…";

/** Lo que dice la lista cuando la búsqueda no encontró a nadie. */
export const VACIO_BUSQUEDA = "No se encontró a nadie con ese nombre";

/** El botón que devuelve la lista completa. */
export const LIMPIAR_BUSQUEDA = "Ver a todos";

/** Caja Menuda: los gastos de un período. */
export const PLACEHOLDER_GASTO = "Buscar gasto…";
export const VACIO_GASTO = "Ningún gasto coincide con lo que escribiste";

/** Plantilla Switch › Historial: las descargas de plantilla. */
export const PLACEHOLDER_DESCARGA = "Buscar descarga…";
export const VACIO_DESCARGA = "Ninguna descarga coincide con lo que escribiste";

/** Gastos (Egresos Varios): las cuentas de una empresa. */
export const PLACEHOLDER_CUENTA = "Buscar cuenta…";
export const VACIO_CUENTA = "Ninguna cuenta coincide con lo que escribiste";

/**
 * Filtra una lista por el texto tecleado, mirando los campos que `campos`
 * devuelva de cada fila (nombre y código, en las listas de personas).
 *
 * Texto vacío → la lista ENTERA, sin copiar ni reordenar nada.
 */
export function filtrarPorTexto<T>(
  lista: readonly T[],
  consulta: string,
  campos: (fila: T) => (string | null | undefined)[],
): T[] {
  if (!consulta.trim()) return lista as T[];
  return lista.filter((fila) => coincideBusqueda(consulta, campos(fila)));
}

/**
 * «12 de 42 colaboradores» mientras hay búsqueda escrita; sin búsqueda, cadena
 * vacía (no se dibuja nada: un contador permanente es una palabra de más).
 */
export function textoDeConteo(
  visibles: number,
  total: number,
  consulta: string,
  sustantivo: readonly [string, string] = ["colaborador", "colaboradores"],
): string {
  if (!consulta.trim()) return "";
  return `${visibles} de ${total} ${total === 1 ? sustantivo[0] : sustantivo[1]}`;
}

/**
 * 🔴 LO QUE SE VE, EN UNA SOLA CUENTA.
 *
 * Devuelve juntas las tres cosas que una pantalla con buscador necesita —las
 * filas visibles, el conteo «3 de 12 colaboradores» y si la búsqueda no encontró
 * a nadie— para que no puedan separarse. Separarlas es cómo se llega a una lista
 * que muestra tres filas y un conteo que dice doce.
 *
 * 🔴 El TOTAL de la pantalla se suma sobre `visibles`, nunca sobre la lista
 * entera: ver la regla del total, arriba.
 */
export function vistaDeLista<T>(
  lista: readonly T[] | null | undefined,
  consulta: string,
  campos: (fila: T) => (string | null | undefined)[],
  sustantivo: readonly [string, string] = ["colaborador", "colaboradores"],
): { visibles: T[]; conteo: string; buscando: boolean; sinResultados: boolean } {
  const todas = lista ?? [];
  const visibles = filtrarPorTexto(todas, consulta, campos);
  const buscando = consulta.trim() !== "";
  return {
    visibles,
    conteo: textoDeConteo(visibles.length, todas.length, consulta, sustantivo),
    buscando,
    sinResultados: buscando && visibles.length === 0,
  };
}

/**
 * Lo que un botón de lote DICE cuando hay búsqueda escrita: «Sí a los 3 que
 * ves». Sin búsqueda devuelve el rótulo de siempre — un botón que dijera «todo»
 * y decidiera solo lo filtrado dejaría trabajo sin hacer sin que nadie se
 * entere, y al revés es igual de malo.
 */
export function rotuloDeLote(
  rotuloCompleto: string,
  visibles: number,
  buscando: boolean,
): string {
  if (!buscando) return rotuloCompleto;
  return visibles === 1 ? "Sí al que ves" : `Sí a los ${visibles} que ves`;
}
