/* ─────────────────────────────────────────────────────────────────────────────
 * LOS ATAJOS DEL PERÍODO DEL REPORTE (16-sep-2026). Módulo PURO: sin base, sin
 * red y sin `new Date()` — el «hoy» entra por parámetro y sale de `hoyPanama()`.
 *
 * Daniel, textual: *«arregla la manera de seleccionar en el calendario que se
 * ve raro, tiene que ser normal, facil»*.
 *
 * 🩸 EL PROBLEMA. Para mirar UN día en el Reporte había que abrir el calendario
 * y tocar DOS veces: es un selector de RANGO, así que el primer toque solo pone
 * el ancla y hasta el segundo la pantalla no cambia. Para lo que se hace todos
 * los días —«¿qué pasó hoy?», «¿qué pasó ayer?», «la quincena»— son cuatro
 * gestos y un calendario abierto.
 *
 * ── 🔴 NO ES UN TERCER SELECTOR ──────────────────────────────────────────────
 *
 * Las quincenas salen de `quincenasElegibles` (`elegir-quincena.ts`), la MISMA
 * función con la que la Planilla dibuja sus cuatro botones, y los rótulos de
 * `rotuloQuincena`. Si mañana cambia cómo se arma una quincena, cambia en un
 * solo lugar. El calendario NO se va: queda para todo lo que no es un atajo.
 *
 * ── ⚠️ ESTO NO CONTRADICE «UN PRESET QUE MIENTE ES PEOR QUE NO TENERLO» ──────
 *
 * `RangoFechas` cuenta por qué se retiraron sus cuatro atajos viejos: estaban
 * calculados a mano como «del 1 al 15» y «del 16 a fin de mes», y el corte de
 * quincena de Daniel es VARIABLE. Lo que cambió desde entonces (15-sep-2026):
 * **la quincena es fija** —1–15 y 16 al último día que paga— y lo que se mueve
 * es el CORTE DEL RELOJ, que es otra cosa y vive en la Planilla. Daniel, ese
 * día: *«si la quincena es fija, que no haya opción de rango, solo las
 * opciones»*. Estos atajos salen de esa misma función, así que no pueden
 * mentir: dicen la quincena que la Planilla paga.
 *
 * 🔴 «Esta quincena» NO SE RECORTA EN HOY. Es la quincena entera, igual que en
 * la Planilla. Los días que todavía no pasaron el motor ya los deja fuera del
 * juicio (`enCurso`, regla 6) y la pantalla lo dice en una línea; recortarla
 * sería un quinto rango que no es ninguna quincena.
 * ────────────────────────────────────────────────────────────────────────── */

import { quincenasElegibles, rotuloQuincena } from "./elegir-quincena";

/** Un botón del período. `desde`/`hasta` son exactamente lo que se le pide al servidor. */
export interface AtajoPeriodo {
  /** Estable, para el `key` de React y para los candados. */
  clave: string;
  rotulo: string;
  desde: string;
  hasta: string;
}

/** El día anterior a `iso`, en aritmética pura (sin zonas horarias). */
function ayerDe(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Los cuatro atajos, en el orden en que se usan: lo de hoy primero, el período
 * de pago después.
 *
 * 🔑 «Esta quincena» es la que CONTIENE a hoy y «Quincena pasada» la anterior,
 * las dos sacadas de `quincenasElegibles` (que trae las dos del mes anterior y
 * las dos del mes en curso, en orden de calendario). Así el 1 de enero la
 * quincena pasada es la segunda de diciembre, sin un caso especial acá.
 */
export function atajosDePeriodo(hoy: string): AtajoPeriodo[] {
  const ayer = ayerDe(hoy);
  const qs = quincenasElegibles(hoy);
  const i = qs.findIndex((q) => q.desde <= hoy && hoy <= q.hasta);
  // ⚠️ Un «hoy» que no cae en ninguna quincena existe de verdad: el 31 de un
  // mes de 31 días no se paga (`ultimoDiaQueSePaga`), así que ese día la
  // segunda quincena del mes es la última de la lista. Sin este respaldo los
  // dos botones desaparecerían justo el 31.
  const actual = i >= 0 ? i : qs.length - 1;
  const anterior = Math.max(0, actual - 1);
  return [
    { clave: "hoy", rotulo: "Hoy", desde: hoy, hasta: hoy },
    { clave: "ayer", rotulo: "Ayer", desde: ayer, hasta: ayer },
    { clave: "quincena", rotulo: `Esta quincena · ${rotuloQuincena(qs[actual])}`, desde: qs[actual].desde, hasta: qs[actual].hasta },
    { clave: "quincena-pasada", rotulo: `Quincena pasada · ${rotuloQuincena(qs[anterior])}`, desde: qs[anterior].desde, hasta: qs[anterior].hasta },
  ];
}

/**
 * Qué atajo está prendido con el rango que se está mirando, o `null` cuando el
 * rango no es ninguno de los cuatro (lo eligieron en el calendario).
 *
 * 🔴 IGUALDAD EXACTA de las dos fechas, nunca «parecido»: un botón prendido es
 * una afirmación sobre qué período se está mirando.
 */
export function atajoActivo(
  atajos: readonly AtajoPeriodo[],
  desde: string,
  hasta: string,
): string | null {
  return atajos.find((a) => a.desde === desde && a.hasta === hasta)?.clave ?? null;
}
