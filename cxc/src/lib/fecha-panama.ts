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
