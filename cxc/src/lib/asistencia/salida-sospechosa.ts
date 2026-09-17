/* ─────────────────────────────────────────────────────────────────────────────
 * DOS MARCAS Y LA SEGUNDA A MEDIODÍA (16-sep-2026). Módulo PURO.
 *
 * ── 🔴 ACÁ NO SE DECIDE UN CENTAVO ───────────────────────────────────────────
 *
 * Igual que `marcas-impares.ts`: el motor sigue leyendo la última marca del día
 * como la salida y la salida temprana se sigue descontando exactamente como
 * siempre. Lo único que este archivo hace es marcar el día **para revisarlo**.
 * Tampoco toca `revisar` ni `diasARevisar` —esos entran a la planilla guardada
 * (`dias_a_revisar`)— : viaja en su propio campo.
 *
 * ── 🩸 EL CASO, MEDIDO CONTRA PRODUCCIÓN ─────────────────────────────────────
 *
 * Andrea Pérez (16), 1-sep-2026: marcó **08:04:03 y 12:07:32**, y nada más. El
 * motor leyó las 12:07 como su salida y le contó **292 minutos de salida
 * temprana**. `marcas-impares` no lo atrapa —y no tiene por qué: DOS es par— y
 * así el día pasaba entero sin que nadie avisara.
 *
 * ⚠️ NO ES «dos marcas». Sus días 7 y 9 de septiembre también tienen dos marcas
 * y están perfectos: la segunda cae 17:11 y 17:00, o sea a su hora de salida.
 * Lo sospechoso no es el número de marcas, es **dónde cae la última**.
 *
 * ── 🔑 DE DÓNDE SALE EL UMBRAL: 120 MINUTOS ──────────────────────────────────
 *
 * Medido el 16-sep-2026 sobre los días hábiles ya cerrados con EXACTAMENTE dos
 * marcas: **24 días** del 1 al 15 de septiembre y **21** del 16 al 31 de agosto.
 * Repartidos por cuánto antes de su hora de salida cae la última marca, el dato
 * es casi binario:
 *
 *   0 min (se fueron a su hora o después) ....... 19 y 17 días
 *   58,1 min (Ángel Pizza, 11-sep) .............. 1 día   ← el ÚNICO intermedio
 *   179,7 · 188,0 · 188,7 · 199,1 · 217,2 ·
 *   237,1 · 292,5 · 295,4 min ................... 8 días
 *
 * **Entre 58 y 180 minutos no hay NADA**, en 45 días de dos quincenas. El
 * umbral se pone en **120 minutos** —dos horas— porque cae en el medio de ese
 * hueco: ningún día normal lo cruza y los ocho raros lo cruzan todos. Dos horas
 * además es más que cualquier almuerzo (30 min) y que cualquier salida a un
 * trámite; nadie «se va temprano» dos horas sin que alguien lo sepa.
 *
 * 🔴 SE MIRA LA SALIDA TEMPRANA QUE SE ESTÁ DESCONTANDO, no la bruta. Un día
 * cubierto por un permiso de horas YA está explicado —Andrea el 1-sep tiene su
 * Constancia de 12:00 a 17:00— y no hay nada que ir a arreglar: el aviso
 * desaparece solo cuando alguien carga el permiso o agrega la marca que falta,
 * que es exactamente lo que se quiere que pase.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Dos horas. Ver arriba de dónde sale.
 *
 * ⚠️ Es el ÚNICO número de esta regla y vive acá, no en un `.tsx`.
 */
export const SALIDA_SOSPECHOSA_MIN = 120;

/**
 * Lo mínimo que la regla le pide a un día. Acotado a propósito: se prueba con
 * objetos de cinco líneas y no arrastra el `DiaReporte` entero.
 */
export interface DiaParaSospecha {
  /** Cuántas marcas tiene el día. */
  marcas: readonly unknown[];
  /** Los minutos de salida temprana que SE ESTÁN DESCONTANDO (ya sin lo perdonado). */
  salidaTempranaMin: number;
  habil: boolean;
  enCurso: boolean;
  fueraDeVigencia: boolean;
  vacacion: unknown | null;
}

/**
 * ¿Este día parece que le falta la marca de salida?
 *
 * 🔴 LAS CINCO CONDICIONES, Y CADA UNA TIENE SU MOTIVO:
 *   · **exactamente 2 marcas** — con 4 el día está completo, y con un número
 *     impar ya avisa `marcas-impares.ts`. Con 2 no se puede PROBAR que falte
 *     una, y por eso esto es un aviso y no un cálculo;
 *   · **más de dos horas** antes de su salida — ver el umbral;
 *   · **día hábil** — un sábado con dos marcas no le debe nada a nadie;
 *   · **día terminado** — a las 10 de la mañana todo el mundo tiene 2 marcas y
 *     le falta media jornada. Juzgarlo sería el error de la regla 6 otra vez;
 *   · **día que le tocaba y no es vacación** — ahí el motor ya puso todo en
 *     cero y no hay nada que revisar.
 */
export function salidaSospechosa(d: DiaParaSospecha): boolean {
  if (d.marcas.length !== 2) return false;
  if (!d.habil || d.enCurso || d.fueraDeVigencia || d.vacacion) return false;
  return d.salidaTempranaMin > SALIDA_SOSPECHOSA_MIN;
}

/** El chip del día. Dice qué pasa y qué hacer, sin jerga. */
export const TEXTO_SALIDA_SOSPECHOSA = "Revisar salida";

/** El título del chip: por qué está ahí. */
export function tituloSalidaSospechosa(salidaTempranaMin: number): string {
  const horas = Math.floor(salidaTempranaMin / 60);
  return (
    `Solo hay 2 marcas y la última cae ${horas} ${horas === 1 ? "hora" : "horas"} `
    + "antes de su hora de salida. Puede faltarle la marca de salida: agrégala con "
    + "«Agregar hora», o justifica el día si de verdad se fue temprano. "
    + "Mientras tanto se le descuentan esos minutos."
  );
}
