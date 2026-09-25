/* ─────────────────────────────────────────────────────────────────────────────
 * LA LÍNEA DEL CORTE DEL RELOJ, EN LA PLANILLA (25-sep-2026). Módulo PURO: sin
 * base, sin red, sin `new Date()`.
 *
 * Daniel, textual, mirando la Planilla en producción: *«ese mensaje no tiene que
 * decir desde el 28 si ya está en el calendario; debería decir desde cuándo lee
 * (la última apertura, día después); y algo minimalista que se sepa que es el
 * cierre del reloj»*.
 *
 * ── 🩸 LO QUE DECÍA ─────────────────────────────────────────────────────────
 *
 *     El reloj se lee hasta el 28 sep · cambiar — Del 29 al 30 se paga normal y
 *     se ajusta en la siguiente.
 *
 * Tres problemas en un renglón: repetía el 28, que el campo de al lado ya dice;
 * no decía DESDE cuándo se está leyendo el reloj (que es el dato que no está en
 * ninguna otra parte de la pantalla); y «cambiar» mandaba a un campo que está a
 * dos centímetros.
 *
 * ── 🔴 LA REGLA ─────────────────────────────────────────────────────────────
 *
 *     Corte del reloj · lee del 14 al 28 sep          (con la cola en un ⓘ)
 *
 *   · El **desde** es el día SIGUIENTE al corte de la última planilla CERRADA de
 *     esa empresa (`asistencia_planilla_guardada.corte`; sin corte, su `hasta`).
 *     Es exactamente el primer día que todavía no se ha leído.
 *   · **Sin cierre anterior**, el desde es el inicio de la quincena: no se
 *     inventa una fecha que no se puede sostener.
 *   · **Sin corte (la ×)**, se lee hasta el fin de la medición —el mismo
 *     `finDeLaMedicion` que ya usa la frase del ajuste, así que en un mes de 31
 *     días dice 31 y no 30—.
 *   · La cola «Del 29 al 30 se paga normal y se ajusta en la siguiente» sigue
 *     SIENDO LA MISMA (`fraseCorte`) y pasa a un ⓘ al final de la línea.
 *
 * 🔴 NINGÚN NÚMERO SE MUEVE, Y EL CORTE QUE SE MANDA A GENERAR TAMPOCO: este
 * módulo redacta una línea, no decide un período.
 * ────────────────────────────────────────────────────────────────────────── */

import { finDeLaMedicion } from "./dia-31";
import { fraseCorte } from "./elegir-quincena";
import { esFecha } from "./pantalla-2026-09";

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** El rótulo, en un solo lugar: es lo que hace que se sepa que es el reloj. */
export const PREFIJO_CORTE = "Corte del reloj";

/** El día siguiente a `iso`, en el calendario. */
export function diaSiguiente(iso: string): string {
  if (!esFecha(iso)) return "";
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** «28 sep» · «28» cuando el mes ya se dijo. */
function dia(iso: string, conMes: boolean): string {
  const n = Number(iso.slice(8, 10));
  if (!conMes) return String(n);
  return `${n} ${MESES_CORTOS[Number(iso.slice(5, 7)) - 1] ?? ""}`.trim();
}

export interface LineaCorte {
  /** «Corte del reloj · lee del 14 al 28 sep». */
  texto: string;
  /** La cola, para el ⓘ. `null` cuando no hay nada que ajustar después. */
  nota: string | null;
  /** Desde qué día se está leyendo el reloj. Útil para los candados. */
  desdeQueLee: string;
  /** Hasta qué día se lee. */
  hastaQueLee: string;
}

/**
 * La línea del corte. `null` cuando el período no sirve — nunca una frase a
 * medias.
 *
 * @param corte             lo que hay en el campo. `""` = sin corte.
 * @param ultimoCorteCerrado el `corte` (o, sin él, el `hasta`) de la última
 *                           planilla CERRADA de esa empresa. `null` = no hay.
 */
export function lineaCorteDelReloj(opts: {
  desde: string;
  hasta: string;
  corte?: string | null;
  ultimoCorteCerrado?: string | null;
}): LineaCorte | null {
  const desde = String(opts.desde ?? "");
  const hasta = String(opts.hasta ?? "");
  if (!esFecha(desde) || !esFecha(hasta)) return null;

  const corte = esFecha(opts.corte ?? "") ? String(opts.corte) : "";
  const hastaQueLee = corte || finDeLaMedicion(hasta);

  // 🔴 El primer día que todavía no se leyó. Sin cierre anterior, el inicio de
  // la quincena: es lo que se puede sostener sin inventar nada.
  const previo = esFecha(opts.ultimoCorteCerrado ?? "") ? String(opts.ultimoCorteCerrado) : "";
  const desdeQueLee = previo ? diaSiguiente(previo) : desde;

  // Un cierre anterior más nuevo que el corte de hoy (una quincena vieja que se
  // está regenerando) no puede producir «del 29 al 28»: ahí solo se dice hasta.
  if (desdeQueLee > hastaQueLee) {
    return {
      texto: `${PREFIJO_CORTE} · lee hasta el ${dia(hastaQueLee, true)}`,
      nota: corte ? fraseCorte(corte, hasta) : null,
      desdeQueLee,
      hastaQueLee,
    };
  }

  const mismoMes = desdeQueLee.slice(0, 7) === hastaQueLee.slice(0, 7);
  const texto = desdeQueLee === hastaQueLee
    ? `${PREFIJO_CORTE} · lee el ${dia(hastaQueLee, true)}`
    : `${PREFIJO_CORTE} · lee del ${dia(desdeQueLee, !mismoMes)} al ${dia(hastaQueLee, true)}`;

  return { texto, nota: corte ? fraseCorte(corte, hasta) : null, desdeQueLee, hastaQueLee };
}
