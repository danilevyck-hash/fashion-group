// ─────────────────────────────────────────────────────────────────────────────
// PLANTILLA SWITCH — LOS TRES DETALLES DE PANTALLA (23-sep-2026)
//
// Un solo interruptor para los tres arreglos que Daniel aprobó:
//   1. La caja de soltar el archivo dice qué reconoció ANTES de procesar, y lo
//      que no reconoce NO se procesa (hoy cae a Calvin/Tommy en silencio).
//   2. Los avisos salen COMPLETOS, con plural de verdad y un botón para bajarlos.
//   3. El Historial marca la descarga repetida y la última de la serie.
//
// 🔴 NINGUNO TOCA EL EXCEL DE LAS 25 COLUMNAS. No hay una fórmula, una tasa, un
// divisor ni un precio distinto: son tres cosas que se DICEN en pantalla.
//
// 🔴 EN `false` LA PANTALLA ES LA DE ANTES, caída silenciosa incluida: Daniel
// prueba en producción con su secretaria y tiene que poder volver sin desplegar
// código nuevo.
// ─────────────────────────────────────────────────────────────────────────────

/** Prendido. `false` = la pantalla de antes, exactamente. */
export const TRES_DETALLES = true;
