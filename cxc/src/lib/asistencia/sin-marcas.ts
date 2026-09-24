/* ─────────────────────────────────────────────────────────────────────────────
 * QUIEN NO MARCÓ EN EL PERÍODO APARECE IGUAL — el motor, PURO.
 *
 * Sin base, sin red, sin `new Date()`. Decide QUIÉNES son esos colaboradores;
 * sus días los arma el motor de siempre (`reporte.ts`) y el papel los lleva
 * como a cualquier otro.
 *
 * ── 🩸 EL DEFECTO, MEDIDO CONTRA PRODUCCIÓN EL 24-sep-2026 ──────────────────
 *
 * La lista de la pestaña Asistencia se armaba **solo con quien tiene marcas en
 * el período** (`reporte.ts`, `porPersona` se llena únicamente con
 * marcaciones). Sin una marca, la persona no existía para esa pantalla —
 * aunque su ficha estuviera activa y vigente— y **no había forma de
 * arreglarle las horas a mano**.
 *
 * Lo que eso escondía, medido sobre las 49 fichas:
 *   · 1–15 sep: **Yeisibeth Muñoz (306, Multifashion)**, activa, ingreso
 *     16-ene-2026, **cero marcas** en esa quincena (5 en toda su historia).
 *   · 16–30 sep: **María V. Bethancourth (49, Confecciones Boston)**, activa,
 *     sin la casilla «no marca el reloj» y sin una sola marca en la quincena
 *     en curso.
 *
 * ── 🔴 LA FILA GRIS SOLO INFORMA. NO INVENTA UN DESCUENTO ───────────────────
 *
 * Medido en `planilla.ts` (`armarPlanilla`): los códigos del cuadro salen de
 * las FICHAS de la empresa ∪ quien marcó, y a quien no tiene reporte se le
 * asigna `HORAS_CERO` — **cero ausencias, cero tardanzas, cero descuentos**.
 * Con la ficha completa y sin explicación, la línea sale además con
 * `FALTA.sinMarcaciones` («no marcó ni un día en esta quincena») y
 * **`dinero: null`**: va a «Tú decides», sin pago calculado. O sea que hoy la
 * planilla **no le cobra una sola ausencia** a quien no marcó nada, y eso
 * **no se toca**. La fila gris del Reporte lo DICE y no cuenta ni una
 * ausencia; contarlas aquí haría que la pantalla y el pago dijeran cosas
 * distintas del mismo período.
 *
 * 🔴 NINGÚN NÚMERO DE PLATA CAMBIA. La Planilla no pasa esta lista: su cuadro
 * es byte a byte el de siempre.
 * ────────────────────────────────────────────────────────────────────────── */

import { ASISTENCIA_SIN_MARCAS_VISIBLE } from "./pestanas-vivas";

export { ASISTENCIA_SIN_MARCAS_VISIBLE };

/** Lo mínimo que este módulo le pide a una ficha. */
export interface FichaParaLista {
  codigo: string;
  nombre: string | null;
}

/**
 * Los colaboradores que salen en la lista AUNQUE no tengan una sola marca.
 *
 * Quedan afuera, y cada motivo tiene su razón:
 *   · el que SÍ marcó (ya sale, y con sus números);
 *   · el que no estaba trabajando en el rango (`fecha_ingreso`/`fecha_salida`):
 *     es la MISMA regla que ya saca a los demás, y la pantalla la cuenta aparte;
 *   · el código escondido (`asistencia_codigos_ignorados`);
 *   · el que el buscador o la página de una persona no pidieron.
 *
 * 🔑 Falla ABIERTA: con el interruptor apagado devuelve vacío y la lista es la
 * de siempre.
 */
export function codigosSinMarcas(opts: {
  fichas: readonly FichaParaLista[];
  conMarcas: ReadonlySet<string>;
  fueraDeVigencia?: ReadonlySet<string>;
  ignorados?: ReadonlySet<string>;
  /** La página de UNA persona: solo ese código. */
  soloCodigo?: string | null;
  /** Lo escrito en el buscador, YA en minúsculas (como lo normaliza la ruta). */
  q?: string | null;
  activo?: boolean;
}): string[] {
  if (opts.activo === false || (opts.activo === undefined && !ASISTENCIA_SIN_MARCAS_VISIBLE)) return [];
  const solo = String(opts.soloCodigo ?? "").trim();
  const q = String(opts.q ?? "").trim().toLowerCase();
  const fuera = opts.fueraDeVigencia ?? new Set<string>();
  const ignorados = opts.ignorados ?? new Set<string>();

  const elegidas = opts.fichas
    .map((f) => ({ codigo: String(f.codigo ?? "").trim(), nombre: f.nombre ?? null }))
    .filter((f) => f.codigo !== "")
    .filter((f) => !opts.conMarcas.has(f.codigo))
    .filter((f) => !fuera.has(f.codigo))
    .filter((f) => !ignorados.has(f.codigo))
    .filter((f) => (solo ? f.codigo === solo : true))
    .filter((f) =>
      q
        ? f.codigo.toLowerCase().includes(q) || (f.nombre ?? "").toLowerCase().includes(q)
        : true,
    );

  // Por nombre, y el código como desempate: un orden estable no depende de
  // cómo la base devolvió las filas.
  return elegidas
    .sort((a, b) =>
      (a.nombre ?? a.codigo).localeCompare(b.nombre ?? b.codigo, "es") || a.codigo.localeCompare(b.codigo),
    )
    .map((f) => f.codigo);
}

// ─────────────────────────────────────────────────────────────────────────────
// LO QUE SE DICE. Corto, y sin prometer un descuento que no existe.
// ─────────────────────────────────────────────────────────────────────────────

/** El chip de la fila, al lado del nombre. */
export const TEXTO_SIN_MARCAS = "sin marcas en el período";

/**
 * La línea de adentro de la fila abierta. Dice las dos cosas que hay que
 * saber: que no marcó, y que **la planilla no le descuenta nada por eso**.
 */
export const NOTA_SIN_MARCAS =
  "No marcó ni un día en este período. La planilla no le descuenta ausencias por esto: la deja en " +
  "«Tú decides» y no le calcula el pago. Toca un día de abajo para agregarle las horas.";

/**
 * Lo que dice cada uno de sus días. 🔴 NUNCA «Ausencia sin justificar»: la
 * planilla no se la cobra, y un rojo acá diría lo contrario de lo que se paga.
 *
 * ⚠️ Su día NO dice si tenía vacaciones o una justificación: la fila existe
 * para verla y poder corregirla, y TODO su veredicto está suspendido. Lo que
 * explica el período sigue estando en la Planilla («Tú decides») y en
 * Justificaciones.
 */
export const TEXTO_DIA_SIN_MARCAS = "Sin marcas — no se cuenta como ausencia";

/** El aviso de arriba de la tabla. `0` = no se dibuja nada. */
export function avisoSinMarcas(cuantos: number): string | null {
  if (!Number.isFinite(cuantos) || cuantos <= 0) return null;
  return cuantos === 1
    ? "1 colaborador no marcó ni un día en este período y sale en gris."
    : `${cuantos} colaboradores no marcaron ni un día en este período y salen en gris.`;
}

/** ¿Esta persona del reporte es una de las que no marcó? */
export function esSinMarcas(p: { sinMarcas?: boolean } | null | undefined): boolean {
  return p?.sinMarcas === true;
}
