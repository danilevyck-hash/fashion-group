// ─────────────────────────────────────────────────────────────────────────────
// EL INTERRUPTOR DE LA PLANILLA UNIDA.
//
// 🔴 ARRANCA APAGADO, Y ESO ES EL PUNTO. En `false`, el módulo se comporta
// EXACTAMENTE como el día antes de este cambio: no hay pestaña Préstamos, no
// hay botón de comprobante, el cierre no escribe ningún pago y reabrir no
// revierte nada. El día que esto pase al sistema de verdad, nada cambia hasta
// que Daniel lo prenda.
//
// Es el mismo patrón de `GUIAS_ATAJOS_NUEVOS`: UNA constante, leída desde un
// solo lugar, para que apagarlo sea un cambio de una línea y no una cacería.
//
// ⚠️ En el ambiente de PRUEBAS se prende con `NEXT_PUBLIC_PLANILLA_UNIDA=1`.
// Sin la variable, apagado.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ¿Está prendida la planilla unida?
 *
 * 🔑 Se lee de `process.env` y no de una constante `true` porque tiene que valer
 * lo mismo en el servidor y en el navegador: el cierre (servidor) y la pestaña
 * (navegador) no pueden estar uno prendido y el otro apagado, o se cerrarían
 * quincenas escribiendo pagos que la pantalla no anunció.
 */
export function planillaUnidaPrendida(): boolean {
  const v = String(process.env.NEXT_PUBLIC_PLANILLA_UNIDA ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "si" || v === "sí";
}

/** Lo mismo, ya resuelto, para donde leerlo una vez alcanza. */
export const PLANILLA_UNIDA = planillaUnidaPrendida();
