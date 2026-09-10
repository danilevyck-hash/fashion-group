// ─────────────────────────────────────────────────────────────────────────────
// EL CORTE — se paga del 1 al 15, pero la quincena se cierra el 13.
//
// Módulo PURO: sin base, sin red, sin `new Date()`.
//
// ── 🔴 LO QUE DANIEL DEFINIÓ, TEXTUAL ───────────────────────────────────────
//
// *«hay que cerrarla un dia por ejemplo 13 o 28 porque hay que tener los pagos
// listos para el 15-30/31, asi que se calcula los dias de la quincena restante
// sin horas extra como un dia normal y se le paga, y si esos 2/3 dias llego
// tarde, ausencia o tuvo horas extra, se recalcula en la proxima quincena»*.
//
// O sea, tres cosas y en este orden:
//
//   1. El reloj se lee hasta el CORTE (13 o 28).
//   2. Los días que quedan se pagan COMO UN DÍA NORMAL: sin horas extra, sin
//      tardanza y sin ausencia. El sueldo quincenal NO se toca — sigue siendo
//      `salario ÷ 2`, porque esos días se pagan enteros.
//   3. Lo que de verdad pasó en esos días entra en la quincena SIGUIENTE, en un
//      renglón propio: «AJUSTE QUINCENA ANTERIOR».
//
// ── 🔴 EL SUELDO NO SE PRORRATEA. NUNCA ─────────────────────────────────────
//
// Es la trampa de todo esto y por eso está escrita acá arriba. La tentación es
// cerrar el cuadro con el rango 1–13, y eso haría que `factorBase` valga 13/15
// y que **todo el mundo cobre un 13 % menos**. El período que se cierra sigue
// siendo la quincena ENTERA; lo único que se recorta es hasta dónde se mira el
// reloj. Por eso el corte es un campo aparte y no un `hasta` más chico.
//
// ── 🔑 QUÉ SE AJUSTA, Y QUÉ NO ──────────────────────────────────────────────
//
// Solo lo que sale del RELOJ: horas extra, excedente, domingo, feriado,
// ausencia y tardanza. El sueldo quincenal, los seguros, el ISR, el préstamo y
// los descuentos escritos a mano NO se ajustan: no dependen de si la persona
// llegó tarde el día 14.
// ─────────────────────────────────────────────────────────────────────────────

import type { DineroLinea, Quincena } from "./planilla";
import { centavos, ultimoDiaDelMes } from "./planilla";

/**
 * El día del mes en que se corta cada quincena. Daniel: *«por ejemplo 13 o 28»*.
 *
 * ⚠️ «por ejemplo» — son los que él nombró, y por eso el corte se puede mover
 * desde la pantalla. Esto es solo lo que viene PROPUESTO.
 */
export const CORTE_SUGERIDO: Readonly<Record<1 | 2, number>> = { 1: 13, 2: 28 };

/**
 * 🔴 SIN CORTE, TODO SE COMPORTA COMO HOY. `null` = se leyó la quincena entera.
 * Es el valor de siempre y el que deja el módulo exactamente donde estaba.
 */
export const SIN_CORTE = null;

const p2 = (n: number) => String(n).padStart(2, "0");

/**
 * La fecha de corte que se propone para una quincena. `null` si el día sugerido
 * no cae dentro de ella (un febrero corto con corte en 28 corta el último día,
 * que es lo mismo que no cortar, y entonces no se propone nada).
 */
export function corteSugerido(q: Quincena): string | null {
  const dia = CORTE_SUGERIDO[q.n];
  const fin = q.n === 1 ? 15 : ultimoDiaDelMes(q.anio, q.mes);
  const ini = q.n === 1 ? 1 : 16;
  if (dia < ini || dia >= fin) return null;
  return `${q.anio}-${p2(q.mes)}-${p2(dia)}`;
}

/** ¿La fecha de corte sirve para este rango? Tiene que caer adentro y no ser el final. */
export function corteValido(desde: string, hasta: string, corte: string | null): boolean {
  if (corte === null) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(corte)) return false;
  return corte >= desde && corte < hasta;
}

/**
 * Los días que quedaron SIN MEDIR: del día siguiente al corte hasta el final.
 * Vacío cuando no hay corte.
 *
 * 🔑 Es el rango que la quincena SIGUIENTE vuelve a mirar para armar el ajuste.
 */
export function diasSinMedir(
  desde: string,
  hasta: string,
  corte: string | null,
): { desde: string; hasta: string } | null {
  if (!corte || !corteValido(desde, hasta, corte)) return null;
  const d = new Date(`${corte}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  const siguiente = d.toISOString().slice(0, 10);
  if (siguiente > hasta) return null;
  return { desde: siguiente, hasta };
}

/**
 * 🔴 LOS SIETE CONCEPTOS QUE SALEN DEL RELOJ, y los únicos que se ajustan.
 *
 * Los que RESTAN del sueldo van con signo `+` (se le descuenta después) y los
 * que SUMAN van con `−` (se le devuelve después). Está escrito así, con la
 * lista a la vista, para que agregar un concepto nuevo al motor obligue a
 * decidir de qué lado cae en vez de quedarse afuera en silencio.
 */
export const CONCEPTOS_DEL_RELOJ = [
  { campo: "ausencias", signo: +1 },
  { campo: "tardanzas", signo: +1 },
  { campo: "extraDiurno", signo: -1 },
  { campo: "extraNocturno", signo: -1 },
  { campo: "excedente", signo: -1 },
  { campo: "domingos", signo: -1 },
  { campo: "feriados", signo: -1 },
] as const satisfies readonly { campo: keyof DineroLinea; signo: 1 | -1 }[];

/**
 * El ajuste de los días que se pagaron sin medir.
 *
 * `dineroDeLosDiasSinMedir` es lo que el motor calculó para ESE rango corto y
 * NADA MÁS — nunca la quincena entera. Se le pasa la línea tal cual sale del
 * mismo `armarPlanilla` de siempre; acá no se recalcula ni un centavo, solo se
 * eligen siete campos y se les pone signo.
 *
 * Positivo = se le DESCUENTA en la quincena siguiente (llegó tarde, faltó).
 * Negativo = se le DEVUELVE (hizo horas extra que no se le pagaron).
 * Cero      = esos días fueron normales, que es el caso corriente.
 *
 * 🔴 El SUELDO de esos días no entra: ya se pagó entero y no se vuelve a pagar.
 */
export function ajusteDeDiasSinMedir(
  dineroDeLosDiasSinMedir: DineroLinea | null | undefined,
): number {
  const d = dineroDeLosDiasSinMedir;
  if (!d) return 0;
  let total = 0;
  for (const { campo, signo } of CONCEPTOS_DEL_RELOJ) {
    const v = Number(d[campo] ?? 0);
    if (Number.isFinite(v)) total += signo * v;
  }
  return centavos(total);
}

/**
 * Lo que la pantalla y el papel dicen del ajuste. `null` cuando es cero: un
 * renglón que dice «te ajustamos $0.00» es ruido.
 *
 * ⚠️ El RENGLÓN del comprobante se dibuja igual, en 0.00 — eso es la regla del
 * papel («si alguien no lo lleva se pone 0»). Esto es el aviso de la PANTALLA,
 * que es otra cosa.
 */
export function netoConAjuste(netoPagar: number, ajuste: number | null | undefined): number {
  // 🔴 UNA SOLA CUENTA. El motor NO conoce el ajuste: el neto real es su
  // `netoPagar` menos el ajuste, y esta función es el único lugar que lo hace,
  // para que el papel, la pantalla y el cierre no puedan decir números
  // distintos. Positivo = descuenta (baja el neto); negativo = devuelve.
  return centavos(Number(netoPagar || 0) - Number(ajuste || 0));
}

export function textoAjuste(monto: number): string | null {
  const m = centavos(monto);
  if (m === 0) return null;
  const abs = Math.abs(m).toFixed(2);
  return m > 0
    ? `Se le descuentan $${abs} por los días que la quincena pasada pagó sin medir`
    : `Se le devuelven $${abs} por los días que la quincena pasada pagó sin medir`;
}

/**
 * El aviso que explica el corte en la pantalla del cuadro. `null` sin corte.
 */
export function textoCorte(
  hasta: string,
  corte: string | null,
  cuantosDias: number,
): string | null {
  if (!corte || cuantosDias <= 0) return null;
  const dias = cuantosDias === 1 ? "1 día" : `${cuantosDias} días`;
  return `El reloj se leyó hasta el ${corte}. Los ${dias} que faltan hasta el ${hasta} se pagan como días normales, y lo que de verdad pasó en ellos se corrige en la quincena siguiente.`;
}
