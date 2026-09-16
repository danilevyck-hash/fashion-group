// ─────────────────────────────────────────────────────────────────────────────
// ELEGIR LA QUINCENA CON BOTONES (10-sep-2026). Módulo PURO.
//
// Daniel aprobó el mockup: la Planilla se elige con «1 – 15 sep» y «16 – 30 sep»
// —el mes en curso de Panamá y el último día REAL del mes—. El campo «Cortar el
// reloj el» se ve desde el inicio, con el corte sugerido puesto (13 o 28) y una
// frase corta que dice qué pasa con los días de después.
//
// ── 🔴 LA QUINCENA ES FIJA: EL RANGO LIBRE SE FUE DE LA PANTALLA (15-sep-2026)
//
// Daniel, textual: *«si la quincena es fija, que no haya opción de rango, solo
// las opciones»*.
//
// 🩸 POR QUÉ. El calendario («Otro rango ⌄») es de donde salen los enredos: un
// rango que no es una quincena prorratea el sueldo por `factorBase`, APAGA los
// montos escritos a mano (ISR, préstamo, terceros, mercancía, otros servicios)
// y deja guardadas cabeceras que no son quincenas — y por eso el ajuste de la
// quincena anterior NUNCA se dispara (`medirAjusteAnterior` exige que la
// anterior esté cerrada COMO quincena y con su corte). Medido en producción el
// 15-sep-2026, lo guardado eran rangos así: `2026-08-29 → 2026-09-10` en
// Vistana, `2026-08-15 → 2026-08-31` y `→ 2026-08-25` en Boston. Ninguna es una
// quincena.
//
// 🔴 SON CUATRO BOTONES, NO DOS: las dos quincenas del mes en curso y las dos
// del mes ANTERIOR (`quincenasElegibles`). Sin las del mes anterior, estando ya
// en octubre no habría forma de abrir ni cerrar la quincena 1–15 de septiembre,
// y ese es el trabajo real de la contadora — cierra la quincena después de que
// termina, no durante.
//
// 🔴 ⚠️ LA RUTA SIGUE ACEPTANDO `desde`/`hasta` LIBRES, y tiene que seguir
// aceptándolos: `medirAjusteAnterior` (`api/asistencia/planilla/route.ts`)
// vuelve a llamar a la MISMA ruta con el rango corto de los días que quedaron
// sin medir, para valuarlos sin duplicar el motor. Lo que se quita es la OPCIÓN
// DE LA PANTALLA. Si se cierra la ruta, se muere el ajuste de la quincena
// anterior.
//
// 🔴 LO QUE SE GUARDA Y LO QUE SE CALCULA NO CAMBIA: los botones ponen el mismo
// `desde`/`hasta`/`corte` de siempre; el pedido al servidor es el MISMO para el
// mismo rango (hay candado). Sin `new Date()`: el «hoy» entra por parámetro y
// sale de `hoyPanama()`.
// ─────────────────────────────────────────────────────────────────────────────
import { quincena, type Quincena } from "./planilla";
import { corteSugerido } from "./corte-quincena";
import { finDeLaMedicion } from "./dia-31";

export { textoDelDia31 } from "./dia-31";

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Las dos quincenas del mes en curso de `hoy` (YYYY-MM-DD, día de Panamá). */
export function quincenasDelMes(hoy: string): [Quincena, Quincena] {
  const [a, m] = hoy.split("-").map(Number);
  return [quincena(a, m, 1), quincena(a, m, 2)];
}

/**
 * 🔴 LAS CUATRO QUINCENAS QUE SE PUEDEN ELEGIR (15-sep-2026): las dos del mes
 * ANTERIOR y las dos del mes en curso, en orden de calendario.
 *
 * 🔑 El mes anterior no es un lujo: la contadora cierra una quincena DESPUÉS de
 * que termina, y con «Otro rango» retirado, sin estos dos botones la quincena
 * 1–15 de septiembre sería inalcanzable desde octubre. Enero cae en diciembre
 * del año anterior, que es lo que hace que el 1 de enero no deje a nadie sin
 * poder cerrar diciembre.
 */
export function quincenasElegibles(hoy: string): Quincena[] {
  const [a, m] = hoy.split("-").map(Number);
  const anteriorMes = m === 1 ? 12 : m - 1;
  const anteriorAnio = m === 1 ? a - 1 : a;
  return [
    quincena(anteriorAnio, anteriorMes, 1),
    quincena(anteriorAnio, anteriorMes, 2),
    quincena(a, m, 1),
    quincena(a, m, 2),
  ];
}

/**
 * «1 – 15 sep» · «16 – 30 sep».
 *
 * 🔴 EL BOTÓN DE LA SEGUNDA QUINCENA NUNCA DICE 31 (15-sep-2026). Daniel: *«Que el 31 no se
 * pague nunca»*. El último día es el que PAGA sueldo: 28, 29 o 30, nunca 31
 * (`ultimoDiaQueSePaga`, que es de donde `quincena()` saca el rango). El 31
 * igual se mide — ver `dia-31.ts` y `textoDelDia31`.
 */
export function rotuloQuincena(q: Quincena): string {
  const d1 = Number(q.desde.slice(8, 10));
  const d2 = Number(q.hasta.slice(8, 10));
  return `${d1} – ${d2} ${MESES_CORTOS[q.mes - 1]}`;
}

/** El corte que se PROPONE al elegir una quincena (13 o 28). "" si no hay. */
export function corteInicial(q: Quincena): string {
  return corteSugerido(q) ?? "";
}

/** «13 sep» — cómo se lee la fecha del corte en el campo. */
export function fechaCortaCorte(f: string): string {
  const m = Number(f.slice(5, 7));
  return `${Number(f.slice(8, 10))} ${MESES_CORTOS[m - 1] ?? ""}`.trim();
}

/**
 * «Del 14 al 15 se paga normal y se ajusta en la siguiente.» — la frase corta
 * del campo. `null` cuando no hay corte, o cuando no queda ningún día después.
 */
export function fraseCorte(corte: string, hasta: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(corte) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) return null;
  // 🔑 Hasta donde se MIDE: en agosto la quincena paga hasta el 30 y el reloj
  // llega al 31, así que con corte el 28 la frase dice «Del 29 al 31», que es
  // lo que de verdad se ajusta en la quincena siguiente (15-sep-2026).
  const hastaMedido = finDeLaMedicion(hasta);
  if (corte >= hastaMedido) return null;
  const d = new Date(`${corte}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  const siguiente = Number(d.toISOString().slice(8, 10));
  const fin = Number(hastaMedido.slice(8, 10));
  const dias = siguiente === fin ? `El ${fin}` : `Del ${siguiente} al ${fin}`;
  return `${dias} se paga normal y se ajusta en la siguiente.`;
}

/** ¿Este rango es exactamente esta quincena? Decide qué botón se pinta prendido. */
export function esLaQuincena(q: Quincena, desde: string, hasta: string): boolean {
  return q.desde === desde && q.hasta === hasta;
}
