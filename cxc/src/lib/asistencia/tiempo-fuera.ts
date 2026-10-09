/* ─────────────────────────────────────────────────────────────────────────────
 * EL TIEMPO FUERA DURANTE LA JORNADA (9-oct-2026). Módulo PURO.
 *
 * Daniel: *«¿cómo no se descuenta si alguien salió?»* — tiene que descontarse.
 *
 * 🩸 Hasta hoy, quien salía de 14:00 a 16:00 y volvía NO perdía nada:
 *   · con 6 marcas el almuerzo se medía solo entre la 2.ª y la 3.ª y el
 *     segundo hueco no existía (le contaba 510 min trabajados en vez de 390);
 *   · con 4 marcas era «almuerzo de 120 min» y el exceso iba solo al Reporte:
 *     la planilla nunca leyó el exceso de almuerzo (desde el 6-ago-2026).
 *
 * ── LA REGLA (con el interruptor prendido) ──────────────────────────────────
 *
 *   1. Se suman TODOS los huecos entre una salida y su regreso del día.
 *   2. Se resta el almuerzo permitido de su horario (30 o 60). Con la MISMA
 *      gracia del almuerzo que ya existía (`gracia_almuerzo_min`, hoy 5): una
 *      PUERTA, no un descuento — pasada, cuenta todo desde el minuto
 *      programado (`excesoAlmuerzoBrutoMin`).
 *   3. Lo que sobra se descuenta minuto por minuto, al valor del minuto de la
 *      tardanza. 🔴 Desde el 9-oct-2026 va en SU columna, «Tiempo no laborado»
 *      (Daniel: que la contable no lo confunda con alguien que se fue
 *      temprano). Misma rata; columna propia en la planilla, el Excel, el PDF,
 *      el comprobante, el cierre y el corte.
 *   4. Una «Constancia» que cubre el hueco lo perdona (la intersección, como
 *      siempre). Un «Permiso personal» NO perdona nada: solo informa.
 *   5. 🔴 SOLO CON 4 MARCAS (9-oct-2026, Daniel: *«cada persona debería de
 *      poder marcar 4 veces nada más»*). El teléfono no deja marcar la 5.ª
 *      (`cuatro-marcas.ts`, rechazado en el servidor). El reloj físico no se
 *      puede frenar: un día con 5 o más marcas sigue «a revisar» y este
 *      descuento NO se aplica hasta que alguien lo arregle. Con 1, 2 o 3
 *      marcas, lo de siempre.
 *
 * 🔴 APAGADO = LA PLANILLA DE HOY, centavo por centavo (candado
 * `asistencia-tiempo-fuera.test.ts`). Las planillas cerradas no se recalculan
 * nunca: son el resultado congelado.
 * ────────────────────────────────────────────────────────────────────────── */

/** 🔴 EL INTERRUPTOR. Lo prende Daniel después de ver la simulación. */
export const DESCUENTA_TIEMPO_FUERA = false;

/** ¿Este día se mide con la regla nueva? Solo con 4 marcas: un solo hueco, el almuerzo. */
export function marcasMedibles(n: number): boolean {
  return n === 4;
}

/** Los huecos [salió, volvió] del día, en segundos: (2.ª,3.ª), (4.ª,5.ª). */
export function huecosDelDia(marcas: readonly number[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 1; i + 1 < marcas.length; i += 2) out.push([marcas[i], marcas[i + 1]]);
  return out;
}
