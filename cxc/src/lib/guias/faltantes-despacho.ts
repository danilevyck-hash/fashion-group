// ─────────────────────────────────────────────────────────────────────────────
// QUÉ LE FALTA A UNA GUÍA QUE YA SALIÓ.  (módulo PURO)
//
// Daniel, punto 13: *"Las 68 sin placa y 65 sin recibido → marcadas para
// completarlas"*.
//
// 🩸 EL DATO, medido contra producción: de las 207 guías despachadas, **143 sin
// N° de transportista · 68 sin placa · 65 sin «Recibido por»**, y **190 de 207
// (92%) con al menos uno de los tres**. Se cerraron así porque durante meses
// nada bloqueaba: el bloqueo de placa/receptor/cédula se puso el 10-ago-2026 y
// desde entonces son 0 de 15. O sea que esto es una deuda del pasado, no un
// agujero abierto.
//
// 🔴 ESTO **MARCA**, NO ARREGLA. La placa, quién recibió y la cédula de una guía
// firmada **siguen cerradas**: no están en la lista de tres de
// `campos-editables.ts` (N° del transportista · cliente · facturas) y el
// candado del PUT las rechaza igual. Marcarlas es lo que permite ENCONTRARLAS;
// completarlas es otra decisión y no se tomó.
//
// ⚠️ Se marca lo que YA SALIÓ, nunca una pendiente: en una pendiente todavía se
// está llenando el dato, y acusarla sería ruido en la única pantalla donde
// bodega mira el trabajo del día. Es el mismo criterio que `guiaSinNumeroTransp`.
//
// ⚠️ Y EN ENTREGA DIRECTA NO SE PIDE PLACA. Sale en nuestro propio camión: la
// placa no se pide en pantalla, así que reclamarla después sería inventar una
// tarea que nadie puede hacer. Mismo criterio de siempre.
// ─────────────────────────────────────────────────────────────────────────────

import { esEntregaDirecta, guiaYaDespachada, sinCeroPelado, type GuiaModo } from "./modo-despacho";
// 🔑 El unidor de siempre, el MISMO que usan los dos botones de guardar y el de
// despachar. Un segundo idioma —uno dice "a, b y c" y el otro "a, b, c"— es lo
// que pasa cuando cada pantalla arma su lista a mano.
import { unirEnHumano } from "./falta-para-despachar";

export interface GuiaFaltantes extends GuiaModo {
  placa?: string | null;
  receptor_nombre?: string | null;
  cedula?: string | null;
}

const vacio = (s: string | null | undefined) => !String(s ?? "").trim();

/**
 * Lo que le falta a una guía DESPACHADA, en español y en el orden en que se
 * lee. Lista vacía = no le falta nada (o todavía no salió).
 *
 * ⚠️ El N° del transportista NO entra acá: ya tiene su propia marca
 * (`guiaSinNumeroTransp`) y su propia forma de completarse desde la pantalla.
 * Meterlo también acá lo diría dos veces en la misma fila.
 */
export function faltantesDeLaDespachada(g: GuiaFaltantes): string[] {
  if (!guiaYaDespachada(g.estado)) return [];
  const falta: string[] = [];
  // Un "0" pelado no es una placa: es lo que alguien tecleó para destrabar el
  // botón. Misma regla que el papel.
  if (!esEntregaDirecta(g) && vacio(sinCeroPelado(g.placa))) falta.push("la placa");
  if (vacio(g.receptor_nombre)) falta.push("quién recibió");
  if (vacio(g.cedula)) falta.push("la cédula");
  return falta;
}

/** ¿Esta guía salió incompleta? Para pintar la marca sin armar el texto. */
export function despachadaIncompleta(g: GuiaFaltantes): boolean {
  return faltantesDeLaDespachada(g).length > 0;
}

/**
 * "Salió sin la placa y la cédula" — la frase entera, o "" si no falta nada.

 */
export function textoFaltantesDespachada(g: GuiaFaltantes): string {
  const falta = faltantesDeLaDespachada(g);
  if (falta.length === 0) return "";
  return `Salió sin ${unirEnHumano(falta)}`;
}
