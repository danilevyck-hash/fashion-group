// ─────────────────────────────────────────────────────────────────────────────
// ELEGIR LA QUINCENA CON DOS BOTONES (10-sep-2026). Módulo PURO.
//
// Daniel aprobó el mockup: la Planilla se elige con «1 – 15 sep» y «16 – 30 sep»
// —el mes en curso de Panamá y el último día REAL del mes— más «Otro rango ⌄»
// que despliega el calendario de siempre. El campo «Cortar el reloj el» se ve
// desde el inicio, con el corte sugerido puesto (13 o 28) y una frase corta que
// dice qué pasa con los días de después.
//
// 🔴 LO QUE SE GUARDA Y LO QUE SE CALCULA NO CAMBIA: los botones solo ponen el
// mismo `desde`/`hasta`/`corte` que ponía el calendario; el pedido al servidor
// es el MISMO para el mismo rango (hay candado). Sin `new Date()`: el «hoy»
// entra por parámetro y sale de `hoyPanama()`.
// ─────────────────────────────────────────────────────────────────────────────
import { quincena, type Quincena } from "./planilla";
import { corteSugerido } from "./corte-quincena";

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Las dos quincenas del mes en curso de `hoy` (YYYY-MM-DD, día de Panamá). */
export function quincenasDelMes(hoy: string): [Quincena, Quincena] {
  const [a, m] = hoy.split("-").map(Number);
  return [quincena(a, m, 1), quincena(a, m, 2)];
}

/** «1 – 15 sep» · «16 – 30 sep» (el último día es el REAL del mes: 28, 30 o 31). */
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
  if (corte >= hasta) return null;
  const d = new Date(`${corte}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  const siguiente = Number(d.toISOString().slice(8, 10));
  const fin = Number(hasta.slice(8, 10));
  const dias = siguiente === fin ? `El ${fin}` : `Del ${siguiente} al ${fin}`;
  return `${dias} se paga normal y se ajusta en la siguiente.`;
}

/** ¿Este rango es exactamente esta quincena? Decide qué botón se pinta prendido. */
export function esLaQuincena(q: Quincena, desde: string, hasta: string): boolean {
  return q.desde === desde && q.hasta === hasta;
}
