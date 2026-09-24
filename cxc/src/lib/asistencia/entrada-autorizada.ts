/* ─────────────────────────────────────────────────────────────────────────────
 * LA ENTRADA AUTORIZADA POR DÍA, Y EL AVISO DE ENTRADA TEMPRANA — el motor,
 * PURO. Sin base, sin red, sin `new Date()`.
 *
 * ── QUÉ DECIDIÓ DANIEL (24-sep-2026) ────────────────────────────────────────
 *
 * Hasta hoy llegar antes de la hora valía CERO, siempre y para todos: la hora
 * extra se medía solo hacia el final del día. Medido: Ángel Pizza (305,
 * Multifashion, horario 10:00) entró 08:59 los días 22 y 23 de septiembre; los
 * 61 minutos de adelanto valían $0 y los 29 de salida temprana sí se le
 * descontaban.
 *
 * Nuevo: en «Arreglar el día» se puede marcar **«Hoy entraba a las __:__»**,
 * con motivo obligatorio. Ese día la hora extra de la ENTRADA se mide desde
 * esa hora autorizada hasta la hora de entrada del horario:
 *
 *     horario 10:00 · autorizada 06:00 · marcó 05:58 → 4 h de extra, medidas
 *     desde las 06:00, no desde las 05:58.
 *     horario 10:00 · autorizada 06:00 · marcó 06:30 → 3 h 30: desde que marcó.
 *
 * Va a Aprobaciones como cualquier extra (mismo Sí/No, mismo servidor) y se
 * paga al recargo que le toque por la hora del día (6–10 a.m. es tarifa de día,
 * 1,25; el corte de la tarde de las reglas se respeta igual). 🔴 NO cambia nada
 * para quien no tiene entrada autorizada.
 *
 * Y el aviso: si la primera marca cae N minutos (o más) antes de su entrada y
 * el día no tiene entrada autorizada, la fila dice «llegó N min antes ·
 * ¿entrada autorizada?» y lleva a esa acción. Solo desde 30 minutos («solo
 * desde 30 minutos»), configurable. Es un AVISO: no cuenta, no frena el
 * cierre, no entra a «Antes de cerrar».
 *
 * ── 🔴 LO QUE NO SE NEGOCIA ─────────────────────────────────────────────────
 *
 *   · La marcación del reloj NUNCA se edita ni se borra. La autorización va en
 *     su propia tabla (`asistencia_entradas_autorizadas`), con motivo y firma,
 *     y deshacer = anular. Queda rastro de quién y por qué.
 *   · La extra de entrada pasa por la MISMA puerta del mínimo (`extraMinimoMin`)
 *     que la de salida: «como cualquier extra».
 *   · La tardanza NO cambia: se sigue midiendo contra la entrada del horario.
 *   · Con `ENTRADA_AUTORIZADA` en `false`, o sin la tabla, nada de esto existe.
 * ────────────────────────────────────────────────────────────────────────── */

import { ENTRADA_AUTORIZADA } from "./reglas-nuevas";

export { ENTRADA_AUTORIZADA };

// 🔑 SIN importar `correcciones.ts`: ese módulo importa un VALOR de `reporte.ts`
// y `reporte.ts` importa de aquí. Un import normal armaría un ciclo en tiempo
// de ejecución; las dos ayudas de abajo son la misma regla, escritas una vez
// más a propósito (llave `codigo|fecha` y hora "HH:MM[:SS]" → "HH:MM:SS").

/** La llave del índice por día: código + día de Panamá. La MISMA forma que
 *  `llaveDia` de `correcciones.ts`. */
export function llaveEntrada(codigo: string, fecha: string): string {
  return `${codigo}|${fecha}`;
}

/** "6:00" · "06:00" · "06:00:00" → "06:00:00". `null` si no es una hora. */
export function normalizarHoraEntrada(hora: unknown): string | null {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(hora ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  const s = m[3] === undefined ? 0 : Number(m[3]);
  if (h > 23 || mi > 59 || s > 59) return null;
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${p2(h)}:${p2(mi)}:${p2(s)}`;
}

export const TABLA_ENTRADAS_AUTORIZADAS = "asistencia_entradas_autorizadas";
export const MIGRACION_ENTRADA_AUTORIZADA =
  "20261219120000_asistencia_gracia_almuerzo_entrada_autorizada.sql";

/** El mensaje que ve la gente cuando falta correr el SQL. Sin jerga de base. */
export function avisoMigracionEntradaAutorizada(): string {
  return `Todavía no se puede guardar una entrada autorizada. Pídele a Daniel que corra el archivo ${MIGRACION_ENTRADA_AUTORIZADA} en Supabase.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// LOS DATOS
// ─────────────────────────────────────────────────────────────────────────────

/** Una entrada autorizada VIVA (las anuladas no llegan hasta aquí). */
export interface EntradaAutorizada {
  id: string;
  empleadoCodigo: string;
  /** YYYY-MM-DD, día-calendario de Panamá. */
  fecha: string;
  /** "HH:MM:SS". Desde qué hora entraba ese día. */
  hora: string;
  motivo: string;
  creadaPor: string;
  /** ISO. */
  creadaEn: string;
}

/** Cómo viaja dentro del día del reporte, para poder decirla y deshacerla. */
export interface EntradaAutorizadaVisible {
  id: string;
  /** "HH:MM:SS". La hora autorizada. */
  hora: string;
  /** "HH:MM:SS". Desde dónde se MIDIÓ la extra (la autorizada, o la marca si
   *  marcó después). Vacío cuando no generó extra. */
  desde: string | null;
  /** "HH:MM:SS". Hasta dónde: la entrada del horario de ese día. */
  hasta: string;
  motivo: string;
  creadaPor: string;
  creadaEn: string;
}

/** `codigo|fecha` → la entrada autorizada viva de ese día. */
export function indexarEntradasAutorizadas(
  lista: readonly EntradaAutorizada[],
): Map<string, EntradaAutorizada> {
  const out = new Map<string, EntradaAutorizada>();
  for (const e of lista) out.set(llaveEntrada(e.empleadoCodigo, e.fecha), e);
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// LA CUENTA
// ─────────────────────────────────────────────────────────────────────────────

/** Segundos desde medianoche de "HH:MM" o "HH:MM:SS". */
export function horaASeg(hhmm: string): number {
  const [h, m, s] = String(hhmm ?? "").split(":").map(Number);
  return (h || 0) * 3600 + (m || 0) * 60 + (s || 0);
}

export interface ExtraDeEntrada {
  /** Minutos de extra de la entrada, con decimales. 0 = nada. */
  min: number;
  /** Desde qué segundo del día se midió (la autorizada, o la marca si marcó después). */
  desdeSeg: number;
  /** Hasta qué segundo: la entrada del horario. */
  hastaSeg: number;
}

/**
 * La hora extra de la ENTRADA de un día.
 *
 *   · sin autorización, o con el interruptor apagado → 0 (lo de siempre);
 *   · autorizada a las 06:00, horario 10:00, marcó 05:58 → 240 min: se mide
 *     desde las 06:00, NO desde las 05:58;
 *   · marcó 06:30 → 210 min: desde que marcó;
 *   · marcó a las 10:00 o después → 0 (y la tardanza sigue su camino aparte);
 *   · autorizada a una hora que NO es anterior a la entrada → 0: no hay nada
 *     que medir hacia atrás.
 *
 * 🔴 PASA POR LA MISMA PUERTA DEL MÍNIMO que la extra de salida
 * (`extraMinimoSeg`): «como cualquier extra». Bajo el mínimo, 0; pasado, TODO.
 */
export function extraDeEntrada(opts: {
  /** La primera marca del día, en segundos. */
  entSeg: number;
  /** La entrada del horario de ese día, en segundos. */
  entradaProgSeg: number;
  /** La hora autorizada, en segundos. `null` = no hay. */
  autorizadaSeg: number | null;
  /** El mínimo para contar hora extra, en segundos. */
  extraMinimoSeg: number;
  activo?: boolean;
}): ExtraDeEntrada {
  const cero = { min: 0, desdeSeg: opts.entradaProgSeg, hastaSeg: opts.entradaProgSeg };
  const activo = opts.activo ?? ENTRADA_AUTORIZADA;
  if (!activo || opts.autorizadaSeg === null || !Number.isFinite(opts.autorizadaSeg)) return cero;
  if (opts.autorizadaSeg >= opts.entradaProgSeg) return cero;
  const desdeSeg = Math.max(opts.entSeg, opts.autorizadaSeg);
  const brutoSeg = Math.max(0, opts.entradaProgSeg - desdeSeg);
  if (brutoSeg <= 0 || brutoSeg < opts.extraMinimoSeg) return cero;
  return { min: brutoSeg / 60, desdeSeg, hastaSeg: opts.entradaProgSeg };
}

/**
 * ¿Cuántos minutos antes de su hora llegó, para el AVISO? `null` = no se avisa.
 *
 * Se avisa SOLO si:
 *   · la primera marca cae `umbralMin` minutos O MÁS antes de la entrada
 *     («solo desde 30 minutos»: 29 no, 30 sí — el `>=` es la regla);
 *   · el umbral es mayor que 0 (0 = aviso apagado);
 *   · el día NO tiene ya una entrada autorizada (ahí ya se decidió);
 *   · el interruptor está prendido.
 *
 * Es un aviso y nada más: no cuenta, no entra a `revisar` ni al cierre.
 */
export function avisoEntradaTemprana(opts: {
  entSeg: number;
  entradaProgSeg: number;
  umbralMin: number;
  tieneAutorizacion: boolean;
  activo?: boolean;
}): number | null {
  const activo = opts.activo ?? ENTRADA_AUTORIZADA;
  if (!activo || opts.tieneAutorizacion) return null;
  const umbral = Number.isFinite(opts.umbralMin) ? opts.umbralMin : 0;
  if (umbral <= 0) return null;
  const antesMin = (opts.entradaProgSeg - opts.entSeg) / 60;
  return antesMin >= umbral ? antesMin : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// LO QUE SE TECLEA EN «ARREGLAR EL DÍA»
// ─────────────────────────────────────────────────────────────────────────────

/** El rótulo del campo, corto y sin jerga. */
export const ROTULO_ENTRADA_AUTORIZADA = "Hoy entraba a las";
/** Lo que dice el botón que quita la autorización viva. */
export const QUITAR_ENTRADA_AUTORIZADA = "Quitar";
/** Lo que se lee bajo el día cuando hay una. */
export function textoEntradaAutorizada(e: Pick<EntradaAutorizadaVisible, "hora" | "creadaPor" | "motivo">): string {
  return `Entrada autorizada a las ${e.hora.slice(0, 5)} · ${e.creadaPor}: ${e.motivo}`;
}

/** El chip del aviso: «llegó 61 min antes · ¿entrada autorizada?». */
export function textoAvisoEntradaTemprana(antesMin: number): string {
  return `llegó ${Math.floor(antesMin)} min antes · ¿entrada autorizada?`;
}
export const TITULO_AVISO_ENTRADA_TEMPRANA =
  "Marcó bastante antes de su hora de entrada. Si ese día entraba más temprano con permiso, ábrelo con «Arreglar el día» y escribe desde qué hora: esas horas pasan a hora extra para aprobar. Si no, no pasa nada: llegar antes no cuenta.";

/** Lo que la persona dejó en el campo. */
export interface EscritoEntradaAutorizada {
  /** Lo que dice el selector de hora. "" = vacío. */
  hora: string;
  /** Marcó «Quitar» sobre una autorización que existe. */
  quitar?: boolean;
}

/** Un cambio de la entrada autorizada, listo para el servidor. */
export type CambioEntradaAutorizada =
  | { tipo: "poner"; hora: string; reemplaza: string | null }
  | { tipo: "quitar"; reemplaza: string };

/**
 * Qué se va a escribir sobre la entrada autorizada del día. `null` = nada.
 *
 * 🔴 LO QUE NO CAMBIÓ NO PRODUCE NADA: el campo vacío sin autorización previa,
 * o la misma hora que ya vale, no escriben. «Quitar» solo vale sobre una que
 * existe. Una hora ilegible se devuelve como `invalida` y frena el guardado.
 */
export function cambioEntradaAutorizada(
  actual: Pick<EntradaAutorizadaVisible, "id" | "hora"> | null | undefined,
  escrito: EscritoEntradaAutorizada | null | undefined,
): { cambio: CambioEntradaAutorizada | null; invalida: boolean } {
  if (!escrito) return { cambio: null, invalida: false };
  if (escrito.quitar) {
    return actual ? { cambio: { tipo: "quitar", reemplaza: actual.id }, invalida: false } : { cambio: null, invalida: false };
  }
  const crudo = String(escrito.hora ?? "").trim();
  if (crudo === "") return { cambio: null, invalida: false };
  const hora = normalizarHoraEntrada(crudo);
  if (!hora) return { cambio: null, invalida: true };
  if (actual && normalizarHoraEntrada(actual.hora) === hora) return { cambio: null, invalida: false };
  return { cambio: { tipo: "poner", hora, reemplaza: actual?.id ?? null }, invalida: false };
}

/** «entrada autorizada a las 06:00» / «entrada autorizada quitada», para el resumen. */
export function resumenCambioEntrada(c: CambioEntradaAutorizada | null): string | null {
  if (!c) return null;
  return c.tipo === "poner" ? `entrada autorizada a las ${c.hora.slice(0, 5)}` : "entrada autorizada quitada";
}
