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

/** Fecha (YYYY-MM-DD) en hora Panamá de un timestamptz ISO (UTC-5 fijo).
 *  Para columnas timestamptz de Switch (ej. switch_facturas.fecha): un doc
 *  nocturno cae al día UTC siguiente — la fecha de negocio es la de Panamá. */
export function fechaPanamaDe(iso: string): string {
  return new Date(new Date(iso).getTime() - 5 * 3600_000).toISOString().slice(0, 10);
}

/**
 * Inicio de la ventana "success de HOY" para los colaterales de la
 * reconciliación (findMissingColaterales en switch-reconciliacion).
 *
 * - Default: inicio del día Panamá (00:00 -05:00 = 05:00 UTC) — correcto para
 *   crons que corren después de las 05:00 UTC.
 * - earlyUtcRun: crons programados entre 00:00 y 05:00 UTC (acs-resumen-diario
 *   01:00; `cleanup-packing-lists` 03:00 lo fue hasta el 10-sep-2026, cuando se
 *   retiró con su módulo) registran su heartbeat ANTES de la
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

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/**
 * 🔴 «hoy» · «ayer» · «19 sep» · «19 sep 2025» (29-sep-2026, 8a del audit
 * visual, aprobado por Daniel): una fecha ISO (YYYY-MM-DD) dicha como la dice
 * la gente, contra el «hoy» de PANAMÁ. El año solo sale si no es el de hoy.
 * Una fecha que no se entiende se devuelve tal cual: nunca se inventa otra.
 */
export function fechaCortaRelativa(ymd: string, hoy: string = hoyPanama()): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  if (ymd === hoy) return "hoy";
  const ayer = new Date(Date.parse(`${hoy}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  if (ymd === ayer) return "ayer";
  const dia = `${Number(m[3])} ${MESES_CORTOS[Number(m[2]) - 1]}`;
  return m[1] === hoy.slice(0, 4) ? dia : `${dia} ${m[1]}`;
}
