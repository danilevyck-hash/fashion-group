/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 RETENCIÓN DE PACKING LISTS — UNA sola definición, para el cron Y la pantalla
 *
 * 5-sep-2026. La pantalla de Packing Lists decía, bajo «Historial»:
 *
 *     «Los PLs se eliminan automáticamente después de 7 días.»
 *
 * y era **falso en las dos mitades**:
 *
 *   1. Un packing list ACTIVO no se borra nunca. El cron solo mira los que ya
 *      tienen `deleted_at` — o sea, los que alguien borró a mano.
 *   2. No son 7 días: son **90**, contados desde ese borrado a mano.
 *
 * El daño de un texto así no es cosmético: le dice al usuario que su trabajo
 * se evapora en una semana, y lo empuja a rehacer o a re-subir PLs que están
 * perfectamente vivos.
 *
 * Pasó porque el número vivía en `cleanup-packing-lists.ts` (`RETENCION_DIAS`)
 * y la frase estaba tecleada aparte en el JSX. Dos copias, ningún candado: la
 * pantalla se quedó con el valor de un diseño viejo y nadie se enteró.
 *
 * Este módulo es **puro** (sin base de datos, sin `supabaseServer`) justamente
 * para que lo puedan importar los dos lados: el cron del servidor y el
 * componente de cliente. El candado exige que ninguno se escriba el número
 * por su cuenta.
 *
 * Candado: `src/__tests__/lib/packing-lists-retencion.test.ts`
 * ────────────────────────────────────────────────────────────────────────── */

/** Días que se guarda un packing list DESPUÉS de que alguien lo borra a mano. */
export const RETENCION_PACKING_LISTS_DIAS = 90;

/**
 * La frase que se muestra bajo el Historial. Dice las DOS cosas, porque
 * omitir la primera es lo que hacía sonar a amenaza a la segunda:
 *   · el activo no se borra nunca,
 *   · el borrado se guarda N días por si hay que recuperarlo.
 */
export function textoRetencionPackingLists(
  dias: number = RETENCION_PACKING_LISTS_DIAS,
): string {
  return `Un PL activo no se borra nunca. Los que borras se guardan ${dias} días por si hay que recuperarlos, y después se eliminan solos.`;
}
