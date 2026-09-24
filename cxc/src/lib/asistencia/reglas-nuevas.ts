/* ─────────────────────────────────────────────────────────────────────────────
 * LAS TRES REGLAS DE HORAS DEL 24-sep-2026 — los interruptores y la gracia del
 * almuerzo. Módulo PURO: sin base, sin red, sin `new Date()`.
 *
 * Daniel, textual, ese día:
 *
 *   1. «Almuerzo de 60 que dura 65 no descuenta nada; si dura 66, se descuentan
 *      los 6, igual que la tardanza se cuenta desde la hora y no desde el
 *      minuto 11. En Multifashion 60 más 5, en las otras 30 más 5.» Y sobre si
 *      es una sola regla para las cuatro empresas: «sí».
 *   2. Entrada autorizada por día: «Hoy entraba a las __:__», con motivo. Ese
 *      día la extra se mide desde esa hora hasta la entrada del horario y pasa
 *      por Aprobaciones como cualquier extra. Vive en `entrada-autorizada.ts`.
 *   3. Aviso de entrada temprana «solo desde 30 minutos», configurable.
 *   4. Salida temprana: como hoy, desde el minuto uno. NO se tocó.
 *
 * ── 🔴 CÓMO CONTABA HOY, MEDIDO (informe del 24-sep-2026) ───────────────────
 *
 * El exceso de almuerzo se descontaba DESDE EL PRIMER MINUTO: `max(0, tomado −
 * programado)`. Sheynee Batista (304), 19-sep: 47,9 min de 60 → 0; Ángel Pizza
 * (305) entró 08:59 con horario de 10:00 los días 22 y 23 y esos 61 minutos
 * valían $0 (la extra solo se medía hacia el final del día).
 *
 * ── 🔴 LO QUE NO SE NEGOCIA ─────────────────────────────────────────────────
 *
 *   · Con el interruptor apagado, o sin las columnas nuevas en la base, el
 *     cálculo es EL DE HOY, byte a byte: gracia 0 y aviso apagado.
 *   · Ningún número de una quincena ya CERRADA cambia: la planilla guardada es
 *     el RESULTADO congelado, y nadie la vuelve a calcular. Hay candado.
 *   · La gracia es una PUERTA, no un descuento (como la tolerancia de tardanza
 *     y el mínimo de la extra): pasada, el exceso se cuenta ENTERO desde el
 *     minuto programado. 65 → 0 · 66 → 6, con almuerzo de 60.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * 🔴 EL INTERRUPTOR de la gracia del almuerzo. En `false` el exceso se cuenta
 * desde el minuto uno, como hasta el 24-sep-2026, mire lo que mire la base.
 */
export const GRACIA_ALMUERZO = true;

/**
 * 🔴 EL INTERRUPTOR de la entrada autorizada Y de su aviso. En `false` la
 * entrada temprana vale cero como siempre, no se dibuja ningún aviso y las
 * autorizaciones guardadas no entran a ninguna cuenta.
 */
export const ENTRADA_AUTORIZADA = true;

// ─────────────────────────────────────────────────────────────────────────────
// LAS DOS COLUMNAS NUEVAS DE `asistencia_reglas`
// ─────────────────────────────────────────────────────────────────────────────

export const COLUMNA_GRACIA_ALMUERZO = "gracia_almuerzo_min";
export const COLUMNA_AVISO_ENTRADA_TEMPRANA = "aviso_entrada_temprana_min";
export const COLUMNAS_REGLAS_NUEVAS = [
  COLUMNA_GRACIA_ALMUERZO,
  COLUMNA_AVISO_ENTRADA_TEMPRANA,
] as const;

export const MIGRACION_REGLAS_NUEVAS =
  "20261219120000_asistencia_gracia_almuerzo_entrada_autorizada.sql";

/**
 * Lo que valen las dos reglas cuando la fila de la base NO TRAE la columna
 * (la migración no corrió): el sistema de HOY. Gracia 0 y aviso apagado.
 *
 * 🔑 Es distinto del DEFAULT de la columna (5 y 30): ése es lo que Daniel
 * definió y lo que la base escribe sola al correr la migración. Éste es «no
 * hay columna, no hay regla nueva» — falla ABIERTA a lo de siempre.
 */
export const VALOR_SIN_COLUMNA = Object.freeze({
  graciaAlmuerzoMin: 0,
  avisoEntradaTempranaMin: 0,
});

/** La fila que se escribe, sin las dos columnas nuevas: para reintentar el
 *  guardado cuando la base todavía no las tiene. */
export function sinColumnasNuevas(fila: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...fila };
  for (const c of COLUMNAS_REGLAS_NUEVAS) delete out[c];
  return out;
}

/** ¿Este error es «una de las dos columnas nuevas no existe»? Mira el NOMBRE. */
export function esColumnaReglaNuevaFaltante(err: unknown): boolean {
  if (!err) return false;
  const e = err as { code?: string | null; message?: string | null; details?: string | null };
  const texto = `${e.message ?? ""} ${e.details ?? ""}`;
  if (!COLUMNAS_REGLAS_NUEVAS.some((c) => texto.includes(c))) return false;
  const code = String(e.code ?? "");
  return (
    code === "42703" || code === "PGRST204" ||
    /does not exist|no existe|could not find|schema cache/i.test(texto)
  );
}

/** El aviso cuando las reglas se guardaron sin las dos nuevas. Sin jerga. */
export function avisoReglasNuevas(): string {
  return `Se guardaron las reglas de siempre. La gracia del almuerzo y el aviso de entrada temprana todavía no se pueden guardar: pídele a Daniel que corra el archivo ${MIGRACION_REGLAS_NUEVAS} en Supabase.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// LA GRACIA DEL ALMUERZO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * La gracia que aplica, en minutos. Con el interruptor apagado, 0: el cálculo
 * de siempre. Un valor raro (negativo, `NaN`, ausente) cae al respaldo, nunca
 * a `NaN` — con `NaN` toda comparación da `false` y nadie tendría gracia.
 */
export function graciaAlmuerzoEfectiva(
  graciaMin: number | undefined,
  respaldoMin: number,
  activo: boolean = GRACIA_ALMUERZO,
): number {
  if (!activo) return 0;
  return typeof graciaMin === "number" && Number.isFinite(graciaMin) && graciaMin >= 0
    ? graciaMin
    : respaldoMin;
}

/**
 * El exceso de almuerzo BRUTO, en minutos, con la gracia como PUERTA.
 *
 *   · dura hasta `programado + gracia` → 0
 *   · un segundo más → TODO el exceso desde `programado`, no desde la gracia
 *
 * Es la misma forma que la tardanza (`ent > entradaProg + tolerancia ? ent −
 * entradaProg : 0`). Con gracia 0 es exactamente `max(0, tomado − programado)`,
 * el cálculo de hasta el 24-sep-2026.
 *
 * Todo en SEGUNDOS, como mide el motor; sale en minutos con decimales.
 */
export function excesoAlmuerzoBrutoMin(
  tomadoSeg: number,
  programadoSeg: number,
  graciaMin: number,
): number {
  const graciaSeg = Math.max(0, graciaMin) * 60;
  return tomadoSeg > programadoSeg + graciaSeg ? (tomadoSeg - programadoSeg) / 60 : 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// LOS RÓTULOS DE CONFIGURACIÓN › REGLAS DEL CÁLCULO
// ─────────────────────────────────────────────────────────────────────────────

export const ROTULO_GRACIA_ALMUERZO = "Gracia del almuerzo";
export const AYUDA_GRACIA_ALMUERZO =
  "Minutos que puede pasarse el almuerzo sin descuento. Pasados, se descuenta todo desde el minuto programado (60 que dura 65 no descuenta; 66 descuenta 6).";
export const ROTULO_AVISO_ENTRADA_TEMPRANA = "Aviso de entrada temprana desde";
export const AYUDA_AVISO_ENTRADA_TEMPRANA =
  "Si alguien marca esta cantidad de minutos (o más) antes de su hora de entrada, el día avisa «llegó antes» para que decidas si tenía entrada autorizada. Solo avisa: no cuenta ni frena. 0 = sin aviso.";
