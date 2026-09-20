// ─────────────────────────────────────────────────────────────────────────────
// GUÍAS › CONFIGURACIÓN — LAS PALABRAS DE LA PANTALLA (módulo PURO).
//
// 🩸 Daniel preguntó qué hace «el de siempre» y pidió simplificar la pantalla.
// El diagnóstico: ahí conviven **dos listas que se llamaban las dos
// «destinos»** y no son lo mismo —
//   · `guias_destino_cliente`: a dónde entrega CADA CLIENTE. Lo marcado se
//     escribe solo al armar la guía. Lo administran admin y secretaria.
//   · `guias_destino_lista`: los BOTONES DE LUGARES que salen debajo del campo
//     dirección. No está atada a ningún cliente, y bodega también agrega.
// Llamarlas igual obliga a leer las dos tarjetas enteras para saber cuál es
// cuál.
//
// 🔴 NO SE FUSIONAN: tienen dueños y permisos distintos, y es un invariante
// escrito. Lo único que cambia acá son los RÓTULOS y una línea de ayuda por
// tarjeta. Cero cambios en la base, cero en lo que se guarda, cero en los
// permisos.
//
// 🩸 Y la otra confusión: «el de siempre» aparecía como ESTADO y como ACCIÓN
// con la MISMA frase. Ahora son dos palabras distintas: el que ya lo es dice
// **«Siempre»**; el que no lo es ofrece **«Poner siempre»**.
//
// Las palabras viven acá y no sueltas en el JSX para que el candado lea la
// MISMA fuente que la pantalla — si no, un rótulo se corrige en un lado y el
// candado sigue vigilando el otro.
// ─────────────────────────────────────────────────────────────────────────────

/** Tarjeta 1: los destinos DE CADA CLIENTE (`guias_destino_cliente`). */
export const ROTULO_DONDE_ENTREGA_CADA_CLIENTE = "Dónde entrega cada cliente";
export const AYUDA_DONDE_ENTREGA_CADA_CLIENTE = "Lo marcado se escribe solo al armar la guía.";

/** Tarjeta 2: la lista general de lugares (`guias_destino_lista`). */
export const ROTULO_DIRECCIONES_QUE_SUGIERE = "Direcciones que sugiere el sistema";
export const AYUDA_DIRECCIONES_QUE_SUGIERE =
  "Los botones que salen debajo del campo dirección. No están atados a ningún cliente.";

/** 🔴 El que YA es el que se llena solo: se lee como ESTADO, no como acción. */
export const MARCA_SIEMPRE = "Siempre";

/** 🔴 El que NO lo es: se lee como ACCIÓN. La misma palabra en los dos casos. */
export const ACCION_PONER_SIEMPRE = "Poner siempre";

/**
 * La palabra de la marca de un destino, según ya lo sea o no.
 *
 * ⚠️ Una sola función para los DOS lugares donde aparece —el renglón de un
 * destino definido y el chip de un destino del histórico— justamente para que
 * no se vuelvan a llamar distinto.
 */
export function palabraDeLaMarca(esElQueSeLlenaSolo: boolean): string {
  return esElQueSeLlenaSolo ? MARCA_SIEMPRE : ACCION_PONER_SIEMPRE;
}
