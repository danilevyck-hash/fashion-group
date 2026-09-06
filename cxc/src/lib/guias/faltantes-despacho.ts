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
  /** La fecha de la guía (`guia_transporte.fecha`, YYYY-MM-DD). */
  fecha?: string | null;
  placa?: string | null;
  receptor_nombre?: string | null;
  cedula?: string | null;
}

/**
 * 🔴 EL DÍA EN QUE PLACA · QUIÉN RECIBIÓ · CÉDULA EMPEZARON A BLOQUEAR EL
 * DESPACHO. Antes de esta fecha una guía podía cerrarse sin ellos; desde acá,
 * no.
 */
export const FECHA_BLOQUEO_DESPACHO = "2026-08-10";

const vacio = (s: string | null | undefined) => !String(s ?? "").trim();

/**
 * ¿Esta guía es de antes de que placa/receptor/cédula bloquearan?
 *
 * Sin fecha legible se contesta `false` — o sea, se marca. Ante la duda se
 * dice, que es el lado seguro: callar sobre una guía que sí se podía arreglar
 * es peor que un ámbar de más.
 */
function esAnteriorAlBloqueo(fecha: string | null | undefined): boolean {
  const f = String(fecha ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return false;
  return f < FECHA_BLOQUEO_DESPACHO;
}

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
  // 🔴 EL ÁMBAR SOLO PARA LO QUE SE PUEDE ARREGLAR (5-sep-2026). Daniel: *«sí,
  // ya que igual no se puede editar después de cerrarlas ni cerrarlas sin los
  // campos obligatorios»*.
  //
  // 🩸 Medido contra producción el 5-sep-2026: las **65** guías marcadas «Salió
  // incompleta» son **TODAS anteriores al 10-ago-2026**, y desde entonces son
  // **0 de 45**. Esos tres campos siguen cerrados a propósito en una guía
  // firmada, así que la marca acusaba sin dar salida — y el MISMO color ámbar
  // marca las **22** guías a las que sí les falta el N° del transportista y sí
  // se pueden arreglar. 65 marcas permanentes que nadie puede quitar entrenan a
  // la gente a ignorar el color justo donde importa.
  //
  // ⚠️ La regla NO se apagó: se acotó. Si el bloqueo del despacho fallara
  // mañana, una guía nueva incompleta se marca igual que siempre. Y el N° del
  // transportista tiene su propia marca (`guiaSinNumeroTransp`), que NO lleva
  // corte: ese sí se anota tarde, en una guía de cualquier fecha.
  if (esAnteriorAlBloqueo(g.fecha)) return [];
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
