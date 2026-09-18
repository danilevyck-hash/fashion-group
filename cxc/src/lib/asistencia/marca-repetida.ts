/* ─────────────────────────────────────────────────────────────────────────────
 * LA MARCA REPETIDA SE OLVIDA SOLA (18-sep-2026). Módulo PURO: sin base, sin
 * red, sin `new Date()`.
 *
 * ── Qué decidió Daniel ──────────────────────────────────────────────────────
 *
 *     «quiero que el sistema agarre la primera marcación y olvide la próxima si
 *      es en x cantidad de tiempo (esa x la quiero definir contigo)»
 *
 * y, después de ver la medición: **«1 minuto»**.
 *
 * O sea: dentro del MISMO día, una marca que llega a **60 segundos o menos** de
 * la última que sí cuenta NO CUENTA. Se conserva la PRIMERA. Automático, sin
 * que nadie toque nada.
 *
 * ── 🩸 Por qué importa ─────────────────────────────────────────────────────
 *
 * El motor mide el almuerzo entre la 2.ª y la 3.ª marca del día. Cuando el
 * dedo toca dos veces al entrar, la 2.ª marca deja de ser la salida a almorzar:
 *
 *     Ramón Miranda (21) · 3-ago-2026
 *        07:58:36   entrada
 *        07:58:37   ← repetida, 1 s después
 *        13:55:43   ← el almuerzo real empieza aquí…
 *        14:22:04   …y termina aquí: 26 min
 *        17:10:43
 *
 * Para el Reporte ese día almorzó 5 h 57 min: 327 minutos de «exceso de
 * almuerzo» en la pantalla y en el Excel que se descarga, y el día en ámbar
 * frenando el cierre de la quincena.
 *
 * ⚠️ El exceso de almuerzo NO entra al dinero de la planilla (solo a
 * `tiempoNoTrabajadoMin`, el número que se MIRA en el Reporte): lo que esta
 * regla mueve es lo que se muestra, lo que se descarga y el freno del cierre.
 * En un domingo o feriado trabajado sí toca `trabajadoMin`, que se paga al 1,5.
 *
 * ── 🔴 Cómo está construido ─────────────────────────────────────────────────
 *
 *   · `asistencia_marcaciones` es APPEND-ONLY. Aquí no se borra ni se edita una
 *     fila: la marca repetida se descarta AL LEER, en el motor (`reporte.ts`),
 *     igual que las correcciones. La fila sigue en la base.
 *   · Se aplica sobre las marcas que YA QUEDARON después de las correcciones:
 *     una marca que alguien quitó a mano ya no está, y la regla actúa sobre el
 *     resto. Una hora corregida a mano entra con su hora corregida.
 *   · Se compara contra la última marca QUE CUENTA, no contra la anterior a
 *     secas. Así una repetida no «estira» la ventana: la regla nunca puede
 *     descartar una marca real que esté a más de 60 s de la última buena.
 *   · 🔴 SE VE. El día lleva cada marca olvidada con su porqué («repetida, 1 s
 *     después de 07:58:36 — no cuenta»), tachada en pantalla y escrita en la
 *     columna «Todas las marcas» del Excel. Nada de magia silenciosa.
 *   · No cruza de un día a otro: el motor agrupa por día de Panamá antes de
 *     preguntar aquí, así que 23:59:59 y 00:00:00 del día siguiente son dos días.
 *
 * ── Lo medido contra producción (18-sep-2026, desde el 1-jun) ──────────────
 *
 * Ver `scripts/_medir-marca-repetida.ts` (solo lectura) y el postmortem.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * 🔴 EL NÚMERO, EN UN SOLO LUGAR. Una marca a esta distancia o menos de la
 * última que cuenta se olvida. 60 = «1 minuto», elegido por Daniel el
 * 18-sep-2026 después de ver la medición.
 */
export const SEGUNDOS_MARCA_REPETIDA = 60;

/** Una marca que se olvidó, en segundos desde medianoche. */
export interface MarcaOlvidada {
  /** El segundo del día de la marca que NO cuenta. */
  seg: number;
  /** El segundo del día de la marca que SÍ cuenta, la que la hizo repetida. */
  despuesDeSeg: number;
  /** Cuántos segundos después llegó. 0 = el mismo segundo. */
  segundosDespues: number;
}

/**
 * Parte las marcas de UN día en las que cuentan y las que se olvidan.
 *
 * `segundos` tiene que venir ORDENADO de menor a mayor (el motor ya lo
 * ordena). No se muta: se devuelven dos listas nuevas.
 *
 * 🔑 La comparación es contra la ÚLTIMA QUE CUENTA: 08:00:00 · 08:00:50 ·
 * 08:01:40 deja 08:00:00 y 08:01:40 (la tercera está a 100 s de la primera,
 * que es la que cuenta), no solo la primera. Y 60 s EXACTOS se olvidan; 61 no.
 */
export function olvidarRepetidas(
  segundos: readonly number[],
  umbralSeg: number = SEGUNDOS_MARCA_REPETIDA,
): { buenas: number[]; olvidadas: MarcaOlvidada[] } {
  const buenas: number[] = [];
  const olvidadas: MarcaOlvidada[] = [];
  let ultimaQueCuenta: number | null = null;
  for (const seg of segundos) {
    if (ultimaQueCuenta !== null) {
      const d = seg - ultimaQueCuenta;
      // 🔑 Negativo no puede pasar (vienen ordenadas); si pasara, la marca
      // cuenta: un orden raro es otro problema y no éste.
      if (d >= 0 && d <= umbralSeg) {
        olvidadas.push({ seg, despuesDeSeg: ultimaQueCuenta, segundosDespues: d });
        continue;
      }
    }
    buenas.push(seg);
    ultimaQueCuenta = seg;
  }
  return { buenas, olvidadas };
}

/**
 * Una marca repetida tal como se VE en el reporte: con horas, no segundos.
 * Es lo que viaja en `DiaReporte.repetidas`.
 */
export interface MarcaRepetidaVisible {
  /** "HH:MM:SS" de la marca que NO cuenta. */
  hora: string;
  /** "HH:MM:SS" de la marca que SÍ cuenta, la anterior. */
  despuesDe: string;
  segundosDespues: number;
  /** El `id` de la fila en `asistencia_marcaciones`, si vino del reloj. La fila
   *  sigue ahí: lo único que cambió es que el motor no la mira. */
  id: string | null;
}

/** «1 s» · «45 s» · «60 s». Siempre en segundos: el tope es un minuto. */
export function segundosTexto(segundos: number): string {
  return `${Math.max(0, Math.trunc(segundos))} s`;
}

/**
 * El porqué, en una frase: «repetida, 1 s después de 07:58:36 — no cuenta».
 * La MISMA para la pantalla, el título y el Excel: un número que cambia sin
 * explicación es peor que el error.
 */
export function explicacionRepetida(r: Pick<MarcaRepetidaVisible, "despuesDe" | "segundosDespues">): string {
  return `repetida, ${segundosTexto(r.segundosDespues)} después de ${r.despuesDe} — no cuenta`;
}

/** «Marca repetida 07:58:37 — repetida, 1 s después de 07:58:36 — no cuenta». Para el Excel. */
export function textoMarcaRepetida(r: MarcaRepetidaVisible): string {
  return `REPETIDA ${r.hora} (${explicacionRepetida(r)})`;
}

/**
 * TODAS las marcas del día en una celda, las que cuentan y las repetidas, en
 * orden de hora: «07:58:36 · 07:58:37 (repetida, no cuenta) · 13:55:43 · …».
 *
 * 🔴 Es la columna «Todas las marcas» del Excel (18-sep-2026): el archivo es
 * el que se descarga y sobrevive a la conversación, y no puede esconder una
 * marca que la pantalla tacha.
 */
export function textoTodasLasMarcasConRepetidas(
  marcas: readonly string[],
  repetidas: readonly Pick<MarcaRepetidaVisible, "hora">[],
): string {
  const todas = [
    ...marcas.map((h) => ({ hora: h, texto: h })),
    ...repetidas.map((r) => ({ hora: r.hora, texto: `${r.hora} (repetida, no cuenta)` })),
  ];
  // Orden ESTABLE por hora: dos marcas del mismo segundo quedan la que cuenta
  // primero, porque entró primero a la lista.
  return todas
    .map((x, i) => ({ ...x, i }))
    .sort((a, b) => a.hora.localeCompare(b.hora) || a.i - b.i)
    .map((x) => x.texto)
    .join(" · ");
}

/**
 * Cuántas marcas repetidas se olvidaron en todos los días de una lista.
 * ⚠️ Tolera un día SIN el campo (falla abierta): cuenta 0.
 */
export function contarRepetidas(dias: readonly { repetidas?: readonly unknown[] | null }[]): number {
  return dias.reduce((a, d) => a + (d.repetidas?.length ?? 0), 0);
}

/**
 * El aviso de arriba de la tabla: «3 marcaciones repetidas del reloj se
 * olvidaron solas (a 60 s o menos de la anterior) — se ven tachadas en su día».
 * `null` = no hay nada que avisar.
 */
export function avisoRepetidas(cuantas: number): string | null {
  const n = Math.max(0, Math.trunc(cuantas));
  if (n === 0) return null;
  const quien = n === 1 ? "1 marcación repetida del reloj se olvidó sola" : `${n} marcaciones repetidas del reloj se olvidaron solas`;
  return `${quien} (a ${SEGUNDOS_MARCA_REPETIDA} s o menos de la anterior) — se ven tachadas en su día y no cuentan para nada.`;
}
