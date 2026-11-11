/* ─────────────────────────────────────────────────────────────────────────────
 * EL SÁBADO TRABAJADO SE APRUEBA Y SE PAGA COMO EL DOMINGO (11-nov-2026)
 *
 * Daniel, textual: *«1. A»* — el sábado trabajado de quien NO trabaja los
 * sábados va EXACTAMENTE como el domingo: a Aprobaciones y, aprobado, × 1.50
 * (`recargoDomingoFeriado`), sin tardanza ni hora extra. Y *«a veces mando a
 * Rodrigo a trabajar los sábados, él debería poder marcar y editar»*: en el
 * Reporte, un día no laborable CON marcas sale como fila para arreglarlas.
 *
 * 🩸 Hasta hoy ese sábado se perdía en silencio: el motor lo mandaba a
 * `sabadoMin` —sin columna, sin plata— y la planilla solo avisaba «no se
 * pagan aquí». Y el Reporte ni lo mostraba, así que una marca mal puesta un
 * sábado no se podía corregir.
 *
 * Multifashion (lunes a SÁBADO) NO cambia: para ellos el sábado es laborable y
 * nunca pasa por acá. Feriados y día libre de la empresa, tampoco.
 *
 * Módulo PURO: ni I/O ni fechas de hoy.
 * ─────────────────────────────────────────────────────────────────────────── */

import { diaDeLaSemana } from "./horario-configurable";

/** `false` = exactamente lo de antes: el sábado a `sabadoMin`, sin fila en el Reporte. */
export const SABADO_TRABAJADO_COMO_DOMINGO = true;

/** El tipo del día que se aprueba. «sabado» = sábado trabajado por quien no lo trabaja. */
export type TipoDiaAprobable = "extra" | "domingo" | "sabado" | "feriado";

const SABADO = 6;

/** ¿Este día no laborable va al recargo del domingo? El domingo siempre; el sábado, con el interruptor. */
export function noLaborableVaComoDomingo(fecha: string): boolean {
  const dow = diaDeLaSemana(fecha);
  return dow === 0 || (SABADO_TRABAJADO_COMO_DOMINGO && dow === SABADO);
}

/** «domingo» o «sabado», para el chip de Aprobaciones. */
export function tipoDeDiaNoLaborable(fecha: string): "domingo" | "sabado" {
  return diaDeLaSemana(fecha) === SABADO ? "sabado" : "domingo";
}

/**
 * ¿Un día no laborable (ni feriado) con marcas se mide sin horario? Sí con el
 * interruptor: no hay entrada que cumplir ni salida que pasar, así que
 * tardanza, salida temprana, tiempo fuera y hora extra valen 0. Lo trabajado
 * va entero al recargo (`clasificarDia`).
 */
export function esDescansoTrabajado(habil: boolean, feriado: string | null): boolean {
  return SABADO_TRABAJADO_COMO_DOMINGO && !habil && !feriado;
}

/** Lo que dice el chip del día. */
export function textoTipoDia(tipo: TipoDiaAprobable): string {
  return tipo === "sabado" ? "sábado" : tipo;
}

/**
 * 🔴 EL RÓTULO DE LA COLUMNA QUE HASTA HOY DECÍA «DOMINGOS». Con el sábado
 * adentro, decir «Domingos» engaña a la contable; el nombre del Código de
 * Trabajo para ese día es «día de descanso» (semanal, trabajado → recargo).
 * Solo cambia el TEXTO: el dinero sigue en `domingos` / `domingo_min`, y
 * ningún número se mueve. Con el interruptor apagado, los rótulos de antes.
 */
const ON = SABADO_TRABAJADO_COMO_DOMINGO;
/** Encabezado ancho (Excel del cuadro, el corte, el PDF). */
export const ROTULO_DOMINGOS = ON ? "Descanso" : "Domingos";
/** Encabezado de dos líneas de la tabla del cuadro. */
export const ROTULO_DOMINGOS_CORTO = ON ? "Des-\ncanso" : "Domin-\ngos";
/** La línea del detalle en pantalla; le sigue «(N h)». */
export const ROTULO_DOMINGOS_DETALLE = ON ? "Descanso (domingos y sábados)" : "Domingos";
/** La hoja «Horas» del Excel. */
export const ROTULO_DOMINGO_HORAS = ON ? "Descanso (h)" : "Domingo (h)";
/** El renglón del comprobante de pago, en mayúsculas como sus vecinos. */
export const ROTULO_DOMINGO_COMPROBANTE = ON ? "DÍA DE DESCANSO" : "DOMINGO";
