// ─────────────────────────────────────────────────────────────────────────────
// Fecha de negocio en hora Panamá (UTC-5, sin horario de verano).
//
// REGLA: todo corte de "hoy" en crons/reportes usa esta fecha, NUNCA la fecha
// UTC — entre 00:00 y 05:00 UTC el día UTC ya es "mañana" pero en Panamá sigue
// siendo el día de negocio anterior (ej: cron de 01:45 UTC = 20:45 Panamá).
// ─────────────────────────────────────────────────────────────────────────────

/** Fecha de hoy (YYYY-MM-DD) en hora Panamá. */
export function hoyPanama(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Panama" }).format(now);
}

/**
 * Inicio de la ventana "success de HOY" para los colaterales de la
 * reconciliación (findMissingColaterales en switch-reconciliacion).
 *
 * - Default: inicio del día Panamá (00:00 -05:00 = 05:00 UTC) — correcto para
 *   crons que corren después de las 05:00 UTC.
 * - earlyUtcRun: crons programados entre 00:00 y 05:00 UTC (acs-resumen-diario
 *   01:00, cleanup-packing-lists 03:00) registran su heartbeat ANTES de la
 *   medianoche Panamá. Compararlos contra el inicio del día Panamá los declara
 *   "sin correr" TODOS los días aunque sí corrieron (incidente 17-jul-2026:
 *   "(recuperado)" duplicado del resumen ACS). Para ellos la ventana es el
 *   inicio del día UTC (00:00Z), que sí contiene su corrida normal y sigue
 *   detectando la pérdida real (el heartbeat de ayer queda fuera).
 */
export function colateralDayStartIso(earlyUtcRun: boolean, now: Date = new Date()): string {
  if (earlyUtcRun) return `${now.toISOString().slice(0, 10)}T00:00:00.000Z`;
  return new Date(`${hoyPanama(now)}T00:00:00-05:00`).toISOString();
}
