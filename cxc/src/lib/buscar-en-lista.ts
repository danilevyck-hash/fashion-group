// ─────────────────────────────────────────────────────────────────────────────
// BUSCAR DENTRO DE UNA LISTA QUE YA ESTÁ EN PANTALLA (11-sep-2026).
//
// Daniel: *«pon buscador en módulos o tabs que lo ameriten, como colaboradores
// por ejemplo»*.
//
// 🔴 ESTO NO LE PREGUNTA NADA AL SERVIDOR. Filtra lo que el navegador ya tiene
// cargado — son listas de 12 a 42 filas; pedirlas otra vez para tachar renglones
// sería abrir una petición por tecla. Quien SÍ busca contra el servidor
// (Clientes, el ⌘K global) tiene su propio camino y no pasa por acá.
//
// 🔴 SUBCADENA EXACTA NORMALIZADA, NUNCA POR PARECIDO. Es la regla de la casa
// —la misma de `switch_clientes`, la de los destinos de Guías y la de los alias
// de Comisiones—: `Outlet Duty Free N2` y `N3` son cosas distintas, y una
// distancia de edición las junta. Acá el único permiso es ignorar acentos,
// mayúsculas y signos, porque nadie teclea «MUÑOZ» con la ñ ni «D-142» con el
// guion. Eso ya lo resuelve `coincideBusqueda` y se reusa tal cual.
//
// 🔴 LOS TOTALES NO CAMBIAN DE SIGNIFICADO. En estas cuatro listas el pie sigue
// sumando TODO —en Planilla es la plata de la quincena, la misma que se cierra y
// que baja al Excel— y lo que dice cuántos se están viendo es la línea del
// buscador: «12 de 42 colaboradores». ⚠️ Es al revés que en Cuentas por Cobrar,
// donde la tira de totales SÍ suma lo filtrado, y es a propósito: allá el
// buscador es un filtro más de la misma pila (empresa · riesgo · sin pagar) y el
// total es de lo que se está mirando; acá el total es lo que se paga.
// ─────────────────────────────────────────────────────────────────────────────

import { coincideBusqueda } from "./buscar-normalizado";

/** El texto del buscador viaja en la URL con esta llave, la MISMA en las cuatro pestañas. */
export const PARAM_BUSCAR = "buscar";

/** Lo que dice el campo cuando está vacío. */
export const PLACEHOLDER_COLABORADOR = "Buscar colaborador…";

/** Lo que dice la lista cuando la búsqueda no encontró a nadie. */
export const VACIO_BUSQUEDA = "No se encontró a nadie con ese nombre";

/** El botón que devuelve la lista completa. */
export const LIMPIAR_BUSQUEDA = "Ver a todos";

/**
 * Filtra una lista por el texto tecleado, mirando los campos que `campos`
 * devuelva de cada fila (nombre y código, en las cuatro pestañas).
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
