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
//   3. Lo que de verdad pasó en esos días entra en la quincena SIGUIENTE,
//      CONCEPTO POR CONCEPTO, dentro de las columnas de siempre.
//
// ── 🔴 CADA COSA EN SU COLUMNA — NUNCA UNA LÍNEA NETA (11-sep-2026) ─────────
//
// Hasta el 11-sep-2026 el ajuste era UN número («Ajuste quincena anterior»):
// la suma firmada de los siete conceptos. La contadora (Yulissa), textual:
//
//   *«no puedes netear las horas extras con las horas de tardanza o de
//   ausencia porque valen diferente… debe poner lo que llegó en tardanza en
//   tardanza y lo que llegó como extra en extra porque los valores de la rata
//   por hora son diferentes porque una tiene recargo»*.
//
// Daniel: *«el ajuste separado como lo hace ella»* → *«sí»*. Medido en sus
// Excel: ella NO tiene columna de ajuste; las horas de los días después del
// corte entran en la quincena siguiente dentro de las columnas normales.
//
// Así que el ajuste se REPARTE (`repartirAjuste`) y se SUMA dentro de la
// columna que corresponde (`aplicarAjusteEnLinea`): la extra diurna del 14–15
// va a «Horas extra 1.25», la nocturna a «1.50», la tardanza a «Tardanzas», la
// ausencia a «Ausencias». Cada monto ya viene VALUADO por el motor con SU rata
// (`dineroDeLosDiasSinMedir`); acá no se recalcula ni un centavo.
//
// 🔴 EL NETO NO CAMBIA: el neto de la línea es el mismo `netoPagar − ajuste`
// de antes (`netoConAjuste`, una sola cuenta). Lo que cambia es DÓNDE se ve.
// Y `ajusteDeDiasSinMedir` se conserva, DERIVADA del reparto, para que el
// número viejo siga siendo comprobable: Σ signo × reparto = el ajuste viejo.
//
// ── 🔴 LA SALIDA TEMPRANA TAMBIÉN ENTRA (11-sep-2026) ─────────────────────────
//
// Daniel: *«la salida temprana incluirla»*. «Salida temprana» nació el 10-sep,
// después del corte, y quedó fuera de los conceptos del reloj: medido el
// 11-sep, Eloyn (29) salió temprano el 29–31 ago por $11,83 y ese descuento no
// entraba a ninguna columna. Son OCHO conceptos, y la salida temprana va con
// signo + (se descuenta después), como la tardanza.
//
// ── 🔴 LOS SEGUROS SE CALCULAN SOBRE LO QUE ENTRA POR EL AJUSTE (11-sep-2026) ─
//
// Daniel: *«los seguros, va»*. Yulissa calcula el seguro social (9,75 %) y el
// educativo (1,25 %) sobre TODO lo ganado en la quincena, extras incluidas; en
// su Excel el ajuste de extras de los días después del corte entra a esa base.
// Hasta ese día el ajuste movía el bruto y dejaba los seguros como estaban —
// decisión pendiente, no olvido—. Ahora `aplicarAjusteEnLinea` recalcula los
// dos seguros sobre el bruto CON el ajuste (positivo o negativo: las tardanzas
// del ajuste también bajan la base, igual que las tardanzas normales), con la
// MISMA fórmula del motor (`centavos(base × pct ÷ 100)`), respetando
// `paga_seguros` (apagado = nada) y `seguros_base_quincena` (con base propia
// el seguro no depende del bruto: no cambia). Sin `reglas` a mano no se toca
// nada — es lo que deja a los candados viejos diciendo lo mismo.
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
 * 🔴 LOS OCHO CONCEPTOS QUE SALEN DEL RELOJ, y los únicos que se ajustan.
 *
 * Los que RESTAN del sueldo van con signo `+` (se le descuenta después) y los
 * que SUMAN van con `−` (se le devuelve después). Está escrito así, con la
 * lista a la vista, para que agregar un concepto nuevo al motor obligue a
 * decidir de qué lado cae en vez de quedarse afuera en silencio.
 *
 * 🩸 Eran SIETE hasta el 11-sep-2026: «Salida temprana» nació el 10-sep y se
 * quedó afuera. Daniel: *«la salida temprana incluirla»*.
 */
export const CONCEPTOS_DEL_RELOJ = [
  { campo: "ausencias", signo: +1 },
  { campo: "tardanzas", signo: +1 },
  { campo: "salidaTemprana", signo: +1 },
  { campo: "extraDiurno", signo: -1 },
  { campo: "extraNocturno", signo: -1 },
  { campo: "excedente", signo: -1 },
  { campo: "domingos", signo: -1 },
  { campo: "feriados", signo: -1 },
] as const satisfies readonly { campo: keyof DineroLinea; signo: 1 | -1 }[];

/** Un concepto del reloj: los ocho campos de `CONCEPTOS_DEL_RELOJ`. */
export type CampoDelReloj = (typeof CONCEPTOS_DEL_RELOJ)[number]["campo"];

/**
 * El ajuste REPARTIDO: cuánto le entra a cada columna de la quincena que se
 * paga. Solo los conceptos con monto; un concepto en cero no aparece.
 *
 * 🔑 El valor es el monto de la COLUMNA, tal como lo valuó el motor para los
 * días sin medir (positivo). El SIGNO con que pega en el neto lo lleva
 * `CONCEPTOS_DEL_RELOJ` (+ descuenta, − devuelve), no el número.
 */
export type RepartoAjuste = Partial<Record<CampoDelReloj, number>>;

/** Los días que la quincena anterior pagó sin medir (después del corte). */
export interface DiasDelAjuste { desde: string; hasta: string }

/**
 * 🔴 EL AJUSTE, CONCEPTO POR CONCEPTO (11-sep-2026).
 *
 * `dineroDeLosDiasSinMedir` es lo que el motor calculó para ESE rango corto y
 * NADA MÁS — nunca la quincena entera. Se le pasa la línea tal cual sale del
 * mismo `armarPlanilla` de siempre; acá no se recalcula ni un centavo, solo se
 * eligen los ocho campos.
 *
 * 🔴 El SUELDO de esos días no entra: ya se pagó entero y no se vuelve a pagar.
 */
export function repartirAjuste(
  dineroDeLosDiasSinMedir: DineroLinea | null | undefined,
): RepartoAjuste {
  const d = dineroDeLosDiasSinMedir;
  const out: RepartoAjuste = {};
  if (!d) return out;
  for (const { campo } of CONCEPTOS_DEL_RELOJ) {
    const v = centavos(Number(d[campo] ?? 0));
    if (Number.isFinite(v) && v !== 0) out[campo] = v;
  }
  return out;
}

/**
 * Lo que el reparto le hace al NETO: Σ signo × monto. Es el «ajuste» de antes.
 * Positivo = se le descuenta (llegó tarde, faltó). Negativo = se le devuelve.
 */
export function efectoEnElNeto(reparto: RepartoAjuste): number {
  let total = 0;
  for (const { campo, signo } of CONCEPTOS_DEL_RELOJ) {
    const v = Number(reparto[campo] ?? 0);
    if (Number.isFinite(v)) total += signo * v;
  }
  return centavos(total);
}

/**
 * El ajuste como UN número, derivado del reparto. Se conserva para que el
 * cierre (`ajuste_anterior`) y los candados viejos sigan valiendo: la suma de
 * lo repartido ES el ajuste de siempre, al centavo.
 *
 * Cero = esos días fueron normales, que es el caso corriente.
 */
export function ajusteDeDiasSinMedir(
  dineroDeLosDiasSinMedir: DineroLinea | null | undefined,
): number {
  return efectoEnElNeto(repartirAjuste(dineroDeLosDiasSinMedir));
}

/**
 * 🔴 EL AJUSTE ENTRA EN LAS COLUMNAS DE SIEMPRE, cada cosa en la suya.
 *
 * Devuelve la línea con `dinero` NUEVO: cada concepto del reloj suma lo suyo,
 * el bruto baja (o sube) por el efecto neto, y `netoPagar` es el MISMO
 * `netoConAjuste(netoPagar, ajuste)` de antes — una sola cuenta. Los seguros,
 * el ISR, el préstamo y lo escrito a mano no se tocan.
 *
 * Los tres desgloses de la ausencia (`ausenciaPorTardanza`,
 * `ausenciaDeDiaCompleto`, `vacacionesYaPagadas`) también suman lo suyo: son
 * SUBCONJUNTOS de `ausencias` y tienen que seguir siéndolo.
 *
 * `ajusteAnterior` queda con el número viejo (para el cierre) y
 * `ajusteDetalle` dice de qué días y cuánto por columna (para la nota).
 * Sin nada que repartir, la línea vuelve TAL CUAL.
 */
/** Los porcentajes con los que se recalculan los seguros sobre el bruto con ajuste. */
export interface PorcentajesSeguros {
  seguroSocialPct: number;
  seguroEducativoPct: number;
}

/** Cuánto se movieron los seguros por el ajuste (positivo = más seguro, baja el neto). */
export interface AjusteSeguros {
  seguroSocial: number;
  seguroEducativo: number;
}

export function aplicarAjusteEnLinea<
  L extends { dinero: DineroLinea | null; pagaSeguros?: boolean },
>(
  linea: L,
  dineroDeLosDiasSinMedir: DineroLinea | null | undefined,
  dias: DiasDelAjuste,
  /**
   * 🔴 Con los porcentajes, los seguros se recalculan sobre el bruto CON el
   * ajuste (11-sep-2026, Daniel: *«los seguros, va»*). Sin ellos no se tocan.
   */
  seguros: PorcentajesSeguros | null = null,
): L & { ajusteAnterior?: number; ajusteDetalle?: AjusteDetalle } {
  const d = linea.dinero;
  const reparto = repartirAjuste(dineroDeLosDiasSinMedir);
  if (!d || Object.keys(reparto).length === 0) return linea;
  const ajuste = efectoEnElNeto(reparto);
  const dinero: DineroLinea = { ...d };
  for (const { campo } of CONCEPTOS_DEL_RELOJ) {
    const v = reparto[campo];
    if (v) dinero[campo] = centavos(d[campo] + v);
  }
  const s = dineroDeLosDiasSinMedir!;
  dinero.ausenciaPorTardanza = centavos(d.ausenciaPorTardanza + Number(s.ausenciaPorTardanza ?? 0));
  dinero.ausenciaDeDiaCompleto = centavos(d.ausenciaDeDiaCompleto + Number(s.ausenciaDeDiaCompleto ?? 0));
  dinero.vacacionesYaPagadas = centavos(d.vacacionesYaPagadas + Number(s.vacacionesYaPagadas ?? 0));
  dinero.totalBruto = centavos(d.totalBruto - ajuste);
  dinero.netoPagar = netoConAjuste(d.netoPagar, ajuste);

  // ── 🔴 LOS SEGUROS, SOBRE EL BRUTO CON EL AJUSTE ──────────────────────────
  //
  // Solo si se pasaron los porcentajes, la persona paga seguros y NO tiene base
  // propia (`d.baseSeguros` es lo que de verdad se multiplicó: con base propia
  // el seguro no sale del bruto y no cambia). Es la MISMA fórmula del motor
  // —`centavos(base × pct ÷ 100)`— aplicada al bruto nuevo, y la diferencia va
  // al total de deducciones y al neto. Negativo cuando el ajuste bajó el bruto
  // (más tardanza que extras): el seguro baja, igual que con una tardanza normal.
  let ajusteSeguros: AjusteSeguros | undefined;
  if (seguros && linea.pagaSeguros !== false && d.baseSeguros === null && (d.seguroSocial > 0 || d.seguroEducativo > 0)) {
    const nuevoSS = centavos(dinero.totalBruto * (Number(seguros.seguroSocialPct) / 100));
    const nuevoSE = centavos(dinero.totalBruto * (Number(seguros.seguroEducativoPct) / 100));
    const dSS = centavos(nuevoSS - d.seguroSocial);
    const dSE = centavos(nuevoSE - d.seguroEducativo);
    if (dSS !== 0 || dSE !== 0) {
      dinero.seguroSocial = nuevoSS;
      dinero.seguroEducativo = nuevoSE;
      dinero.totalDeducciones = centavos(d.totalDeducciones + dSS + dSE);
      dinero.netoPagar = centavos(dinero.netoPagar - dSS - dSE);
      ajusteSeguros = { seguroSocial: dSS, seguroEducativo: dSE };
    }
  }

  return {
    ...linea,
    dinero,
    ajusteAnterior: ajuste,
    ajusteDetalle: { desde: dias.desde, hasta: dias.hasta, reparto, ...(ajusteSeguros ? { seguros: ajusteSeguros } : {}) },
  };
}

/** Lo que viaja en la línea para poder DECIR de dónde salió cada monto. */
export interface AjusteDetalle extends DiasDelAjuste {
  reparto: RepartoAjuste;
  /** Cuánto movió el ajuste a los seguros (11-sep-2026). Sin esto, no los movió. */
  seguros?: AjusteSeguros;
}

/** El nombre de cada columna, el MISMO de la planilla, el Excel y el PDF. */
export const ROTULO_DEL_RELOJ: Readonly<Record<CampoDelReloj, string>> = {
  extraDiurno: "Horas extra 1.25",
  extraNocturno: "Horas extra 1.50",
  excedente: "Excedente",
  domingos: "Domingos",
  feriados: "Feriados",
  ausencias: "Ausencias",
  tardanzas: "Tardanzas",
  salidaTemprana: "Salida temprana",
};

/** El orden en que se nombran las columnas: el del cuadro de la contable. */
export const ORDEN_DEL_RELOJ: readonly CampoDelReloj[] = [
  "extraDiurno", "ausencias", "tardanzas", "salidaTemprana", "extraNocturno", "excedente", "domingos", "feriados",
];

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** «14–15 sep» · «14 sep» · «29 ago–2 sep». Fechas YYYY-MM-DD. */
export function etiquetaDiasSinMedir(desde: string, hasta: string): string {
  const [, m1, d1] = desde.split("-").map(Number);
  const [, m2, d2] = hasta.split("-").map(Number);
  const mes = (m: number) => MESES_CORTOS[m - 1] ?? "";
  if (desde === hasta) return `${d1} ${mes(m1)}`;
  if (m1 === m2) return `${d1}–${d2} ${mes(m1)}`;
  return `${d1} ${mes(m1)}–${d2} ${mes(m2)}`;
}

function nombrar(cols: readonly string[]): string {
  if (cols.length <= 1) return cols[0] ?? "";
  return `${cols.slice(0, -1).join(", ")} y ${cols[cols.length - 1]}`;
}

/** Las columnas que traen ajuste, en el orden del cuadro. */
export function columnasConAjuste(reparto: RepartoAjuste): CampoDelReloj[] {
  return ORDEN_DEL_RELOJ.filter((c) => !!reparto[c]);
}

/**
 * La nota de UNA celda: «Incluye $5.00 de los días 14–15 sep, que la quincena
 * anterior pagó sin medir.» `null` si esa columna no trae ajuste.
 */
export function notaCeldaAjuste(
  campo: CampoDelReloj,
  detalle: AjusteDetalle | null | undefined,
): string | null {
  const v = detalle?.reparto[campo];
  if (!detalle || !v) return null;
  return `Incluye $${Math.abs(v).toFixed(2)} de los días ${etiquetaDiasSinMedir(detalle.desde, detalle.hasta)}, que la quincena anterior pagó sin medir.`;
}

/**
 * La nota al pie del cuadro, el Excel, el PDF y el comprobante: «Horas extra
 * 1.25 y Tardanzas incluyen los días 14–15 sep, que la quincena anterior pagó
 * sin medir.» Se arma con la UNIÓN de las columnas que traen ajuste en las
 * líneas que se le pasan. `null` sin ajuste.
 */
export function notaAjuste(
  lineas: readonly { ajusteDetalle?: AjusteDetalle | null }[],
): string | null {
  const con = lineas.filter((l) => !!l.ajusteDetalle);
  if (!con.length) return null;
  const union: RepartoAjuste = {};
  for (const l of con) for (const c of columnasConAjuste(l.ajusteDetalle!.reparto)) union[c] = 1;
  const cols = columnasConAjuste(union).map((c) => ROTULO_DEL_RELOJ[c]);
  if (!cols.length) return null;
  const { desde, hasta } = con[0].ajusteDetalle!;
  const verbo = cols.length === 1 ? "incluye" : "incluyen";
  const quienes = con.length === 1 ? "" : ` (${con.length} colaboradores)`;
  return `${nombrar(cols)} ${verbo} los días ${etiquetaDiasSinMedir(desde, hasta)}, que la quincena anterior pagó sin medir${quienes}.`;
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
