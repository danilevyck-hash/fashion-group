/**
 * «¿CUÁNDO?» — las pastillas del renglón de escribir. **Módulo PURO** (sin
 * base, sin React, sin `new Date()` adentro: la fecha de hoy entra por
 * parámetro, que es la regla de la casa).
 *
 * ── EL RENGLÓN, EN UNA LÍNEA (5-sep-2026) ────────────────────────────────────
 *
 * Escribir un recordatorio dejó de ser «abrir menú → ventana → 4 campos →
 * guardar» y pasó a ser UNA línea siempre visible arriba de la lista:
 *
 *   ¿Qué te recuerdo?  [ Cuándo ▾ ]  [ A quién ▾ ]  [ Cliente ▾ ]  [ Guardar ]
 *
 * Las opciones de «Cuándo» son SEIS y están cerradas:
 *
 *   Mañana · Lunes · Elegir fecha · Cada día · Cada semana · Cada mes
 *
 * más un **«Hasta…» opcional** que aplica a las tres repeticiones (sin él,
 * corren hasta que alguien las borre).
 *
 * 🔴 **«Hoy» NO está, y no es un olvido.** Todo el módulo manda UN mensaje al
 * día, a las 9:00 a.m. de Panamá; para cuando alguien escribe, el de hoy ya
 * salió. El primero disponible es MAÑANA — y la validación de verdad vive en
 * `recordatorio.ts` (`fechaYaPaso`), no acá: esto solo propone la fecha.
 *
 * 🔴 **«Lunes» es el PRÓXIMO lunes, nunca hoy.** Escrito un lunes, cae en el
 * lunes siguiente: si cayera en hoy, sería la opción «Hoy» que justamente no
 * existe, y el aviso no llegaría nunca.
 */

import { sumarDias, diaSemana } from "@/lib/cheques-aviso-ventana";
import type { Repeticion } from "./recordatorio";

/** Las seis opciones, en el orden en que se dibujan. Lista CERRADA. */
export const OPCIONES_CUANDO = [
  "manana",
  "lunes",
  "elegir",
  "cada_dia",
  "cada_semana",
  "cada_mes",
] as const;
export type OpcionCuando = (typeof OPCIONES_CUANDO)[number];

/** Lo que se lee en la pastilla. En español simple, tuteo. */
export const ETIQUETA_CUANDO: Record<OpcionCuando, string> = {
  manana: "Mañana",
  lunes: "Lunes",
  elegir: "Elegir fecha",
  cada_dia: "Cada día",
  cada_semana: "Cada semana",
  cada_mes: "Cada mes",
};

/** Las que se REPITEN: son las únicas que aceptan un «Hasta…». */
export const CUANDO_QUE_SE_REPITEN: readonly OpcionCuando[] = [
  "cada_dia",
  "cada_semana",
  "cada_mes",
];

export function aceptaHasta(op: OpcionCuando): boolean {
  return CUANDO_QUE_SE_REPITEN.includes(op);
}

/** Mañana, en fecha de Panamá. El primer día que un aviso puede salir. */
export function manana(hoy: string): string {
  return sumarDias(hoy, 1);
}

/**
 * El PRÓXIMO lunes, estrictamente después de hoy. Un lunes devuelve el lunes de
 * la semana que viene (+7), nunca hoy: ver el encabezado.
 */
export function proximoLunes(hoy: string): string {
  const dow = diaSemana(hoy); // 0 = domingo … 6 = sábado
  const faltan = ((1 - dow + 7) % 7) || 7;
  return sumarDias(hoy, faltan);
}

export interface CuandoResuelto {
  fecha: string;
  repeticion: Repeticion;
}

/**
 * La pastilla elegida → la fecha y la repetición que se guardan.
 *
 * `fechaElegida` solo se usa con la opción `elegir`; en las demás se ignora a
 * propósito — si mandara la fecha de un «Elegir fecha» abandonado, un «Mañana»
 * podría guardarse con el día de la semana pasada.
 *
 * 🔴 **Las tres repeticiones arrancan MAÑANA.** Un «Cada semana» guardado hoy
 * suena por primera vez mañana, no hoy: mismo motivo que «Hoy» no exista.
 */
export function resolverCuando(
  op: OpcionCuando,
  hoy: string,
  fechaElegida?: string,
): CuandoResuelto {
  switch (op) {
    case "manana":
      return { fecha: manana(hoy), repeticion: "una_vez" };
    case "lunes":
      return { fecha: proximoLunes(hoy), repeticion: "una_vez" };
    case "elegir":
      return { fecha: fechaElegida || "", repeticion: "una_vez" };
    case "cada_dia":
      return { fecha: manana(hoy), repeticion: "cada_dia" };
    case "cada_semana":
      return { fecha: manana(hoy), repeticion: "semanal" };
    case "cada_mes":
      return { fecha: manana(hoy), repeticion: "mensual" };
  }
}
