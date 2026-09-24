// ─────────────────────────────────────────────────────────────────────────────
// MARCACIÓN «UN TOQUE» — las reglas de la pantalla nueva (24-sep-2026).
// Módulo PURO: sin React, sin red, sin base, sin `new Date()`.
//
// Medido contra producción el 24-sep-2026, antes de tocar nada:
//   · 19 marcas por teléfono en toda la historia; 15 son uso REAL, del 22 y el
//     23 de septiembre, de cuatro personas (Ana, Cindy, Angel, Yeisibeth).
//   · Esas cuatro DEJARON el reloj físico: ni una marca de reloj esos dos días.
//   · Selfie 19 de 19, ubicación 19 de 19. «Deshacer» no se usó NUNCA.
//   · Marcar son CUATRO toques (botón → disparador → «Usar foto» → «Enviar»).
//   · El botón principal SALTA 142 px entre estados: 202 px sin marcas, 344 px
//     con la entrada puesta. El pulgar nunca aprende dónde está.
//   · «Deshacer la entrada» cae a 243–287 px, encima de donde estaba el botón
//     de marcar (202–258 px): se pisan 15 px.
//
// Lo que Daniel aprobó (mockup `cel-marcacion.html`, columna «Recomendación»):
//
//   1. 🔴 UN BOTÓN, UN LUGAR. Fijo abajo, ancho completo, y NUNCA cambia de
//      posición: dice «Marcar entrada», después «Marcar salida», y con las dos
//      hechas queda gris en «Listo por hoy». La geometría sale de UNA
//      constante (`CLASES_BOTON_UN_TOQUE`) para que no pueda diferir entre
//      estados.
//   2. 🔴 ACEPTAR LA FOTO ES MARCAR. Se retira la pantalla intermedia con
//      «Enviar» y «Volver a tomarla»: la cámara de iOS ya preguntó «¿Usar
//      foto?». La red es «Deshacer», los 2 minutos que ya existían, y vive
//      DENTRO de la pastilla verde — arriba, lejos del botón.
//   3. 🔴 CÁMARA NORMAL, NO SELFIE. Daniel: *«sus fotos son del lugar, no de
//      su cara»*. La foto sigue siendo OBLIGATORIA en entrada y salida y se
//      guarda igual: lo único que cambia es hacia dónde mira la cámara.
//   4. 🔴 LA UBICACIÓN SE PIDE AL ABRIR, no después de la foto. Negada, se
//      dice ANTES de gastar la foto y con la instrucción de iOS escrita.
//   5. 🔴 UNA SOLA CONFIRMACIÓN: la pastilla verde. Se van la nota («Acuérdate
//      de marcar la salida», que repetía el botón) y la lista «Mis marcas»
//      —la contadora la ve en Asistencia—. Lo de ayer se dice UNA vez y solo
//      cuando falta algo.
//
// 🔴 EL INTERRUPTOR. `false` = la pantalla de antes, intacta, hasta el último
// texto. Nada de lo que se GUARDA cambia con él: la marca entra a
// `asistencia_marcaciones` con exactamente los mismos campos (candado
// `marcacion-payload-igual`).
// ─────────────────────────────────────────────────────────────────────────────

import { estadoDelBoton, QUIEN_CORRIGE, type DiaMarcado, type EstadoBoton } from "./marcacion";

/** 🔴 El interruptor. `true` = un botón fijo abajo y aceptar la foto es marcar. */
export const MARCACION_UN_TOQUE = true;

// ── 1. EL BOTÓN QUE NO SE MUEVE ──────────────────────────────────────────────

/**
 * 🔴 LA GEOMETRÍA DEL BOTÓN, EN UNA SOLA CONSTANTE. Los tres estados
 * —«Marcar entrada», «Marcar salida», «Listo por hoy»— la usan TAL CUAL, así
 * que no pueden medir ni ubicarse distinto. Lo único que cambia entre ellos es
 * el color (`TONO_BOTON_*`), que no mueve un píxel.
 *
 * 52 px de alto mínimo: por encima de los 44 de la regla de la casa, porque
 * éste es el único botón de la pantalla y se toca con el pulgar en la calle.
 */
export const CLASES_BOTON_UN_TOQUE =
  "min-h-[52px] w-full rounded-xl px-4 py-4 text-[17px] font-semibold transition active:scale-[0.97]";

/** El botón vivo: negro, como todo botón principal de la casa. */
export const TONO_BOTON_VIVO = "bg-black text-white";

/** El botón apagado: gris, sin acción. No es un error, es que ya no hay nada
 *  que marcar hoy. */
export const TONO_BOTON_APAGADO = "cursor-default bg-gray-100 text-gray-400";

/**
 * El cajón que lo sostiene contra el borde de abajo. Va `fixed` a propósito:
 * es la ÚNICA forma de que el botón esté en el mismo píxel dibuje lo que
 * dibuje la pantalla encima. El `padding-bottom` respeta la barra del iPhone
 * (`safe-area-inset-bottom`) y deja los ~24 px que pidió el mockup.
 */
export const CLASES_CAJON_BOTON = "fixed inset-x-0 bottom-0 z-[9] bg-white px-4 pt-3";

/** El `padding-bottom` del cajón, con la barra del iPhone adentro. */
export const PADDING_ABAJO_BOTON = "calc(env(safe-area-inset-bottom, 0px) + 24px)";

/**
 * Cuánto aire se le reserva al contenido para que el botón fijo no le tape la
 * última línea. Es el alto del botón (52) + su cajón (12 + 24) + aire.
 */
export const CLASES_AIRE_PARA_EL_BOTON = "pb-36";

/** Lo que dice el botón cuando ya no hay nada que marcar. Reemplaza al «Ya
 *  marcaste hoy» de antes: dice que está LISTO, no que se acabó algo. */
export const TEXTO_LISTO_POR_HOY = "Listo por hoy";

/** Mientras la marca viaja. El botón se apaga en el MISMO lugar. */
export const TEXTO_MARCANDO = "Marcando…";

/**
 * Qué dice el botón, con la MISMA regla de siempre (`estadoDelBoton`, que
 * cuenta las marcas del día vengan del reloj, del teléfono o de la cola).
 * Lo único que cambia acá es el texto del estado apagado.
 */
export function botonUnToque(marcasHoy: number): EstadoBoton {
  const b = estadoDelBoton(marcasHoy);
  return b.apagado ? { ...b, texto: TEXTO_LISTO_POR_HOY } : b;
}

// ── 4. LA UBICACIÓN, ANTES DE LA FOTO ────────────────────────────────────────

/**
 * 🔴 SE DICE ANTES DE GASTAR LA FOTO Y CON LA SALIDA ESCRITA. En iPhone, un
 * permiso de ubicación negado no se vuelve a preguntar: la caja roja de antes
 * se repetía para siempre sin decir dónde se arregla.
 */
export const AVISO_UBICACION_NEGADA =
  "Falta el permiso de ubicación. Actívalo en Ajustes › Safari › Ubicación y vuelve a entrar.";

// ── 7. SIN SEÑAL ─────────────────────────────────────────────────────────────

/**
 * 🔴 LO QUE DE VERDAD PASA. La franja naranja del sistema decía «Sin conexion
 * — los datos mostrados pueden no estar actualizados» (sin tilde), tapaba el
 * encabezado entero y decía lo contrario de lo que ocurre acá: sin señal se
 * marca igual y la marca se manda sola.
 */
export const TEXTO_SIN_SENAL = "Sin señal — tu marca se guarda y se envía sola";

// ── 5. LO DE AYER, UNA SOLA VEZ ──────────────────────────────────────────────

/** El día-calendario anterior a `fecha` (YYYY-MM-DD). */
export function diaAnterior(fecha: string): string {
  const t = Date.parse(`${fecha}T00:00:00Z`);
  if (!Number.isFinite(t)) return fecha;
  return new Date(t - 86_400_000).toISOString().slice(0, 10);
}

/**
 * ¿AYER quedó sin salida? Solo ayer: un hueco de la semana pasada ya no es
 * algo que se arregle desde acá, y la pantalla no es una lista de pendientes.
 */
export function faltoLaSalidaDeAyer(dias: readonly DiaMarcado[], hoy: string): boolean {
  const ayer = diaAnterior(hoy);
  return dias.some((d) => d.fecha === ayer && d.faltaSalida);
}

export const TEXTO_AYER_SIN_SALIDA = "Ayer faltó la salida.";

/**
 * «Avísale a Roxana ›». El nombre sale del MISMO lugar que lo decía antes al
 * pie de «Mis marcas» (`QUIEN_CORRIGE`); sin dato, se avisa sin nombre — nunca
 * se inventa a quién.
 */
export function textoAvisarA(quien: string = QUIEN_CORRIGE): string {
  const n = String(quien ?? "").trim();
  return n === "" ? "Avísale ›" : `Avísale a ${n} ›`;
}

// ── 3. LA CÁMARA ─────────────────────────────────────────────────────────────

/**
 * 🔴 `environment` = la cámara de atrás, la normal. Antes era `user`, la de
 * selfie. Daniel: *«sus fotos son del lugar, no de su cara»*. Es lo único que
 * cambia de la foto: sigue siendo obligatoria, sigue achicándose igual y sigue
 * cayendo en el MISMO bucket con la MISMA ruta.
 */
export const CAPTURE_CAMARA = "environment" as const;
