// Rango de la quincena vigente en hora-Panamá (UTC-5, sin DST).
// Fuente única server-side, alineada con getQuincenaRange del cliente:
//   día 1-15  → [1, 15]
//   día 16-fin → [16, último día del mes]
// Devuelve fechas YYYY-MM-DD listas para la RPC / queries.

export interface QuincenaRange {
  start: string;
  end: string;
  fecha: string; // hoy (Panamá)
}

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m0: number, d: number) => `${y}-${pad(m0 + 1)}-${pad(d)}`;

export function getQuincenaRangePanama(now: Date = new Date()): QuincenaRange {
  // Date desplazado -5h → sus campos UTC representan la fecha local de Panamá.
  const p = new Date(now.getTime() - 5 * 3600 * 1000);
  const y = p.getUTCFullYear();
  const m = p.getUTCMonth();
  const d = p.getUTCDate();
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const start = d <= 15 ? ymd(y, m, 1) : ymd(y, m, 16);
  const end = d <= 15 ? ymd(y, m, 15) : ymd(y, m, lastDay);
  return { start, end, fecha: ymd(y, m, d) };
}

// ─────────────────────────────────────────────────────────────────────────────
// La fecha de pago la elige CONTABILIDAD, no el reloj (3-sep-2026).
//
// 🩸 Medido en producción: el botón «Aplicar quincena (N)» existía desde junio
// y NUNCA se usó (cero filas `prestamo_aplicar_quincena` en activity_logs).
// Motivo: escribía la fecha de HOY, y contabilidad registra 1–4 días después
// del pago (las 6 quincenas jun–ago: 15-jun→18-jun, 30-jun→1-jul, 15-jul→16-jul,
// 30-jul→3-ago, 15-ago→17-ago, 30-ago→1-sep), así que el movimiento caía en la
// quincena equivocada. Por eso lo hacía a mano: 6 pasos × 13 personas, 15 min.
//
// Estas funciones son PURAS y trabajan con fechas YYYY-MM-DD: la quincena se
// deriva de la fecha ELEGIDA, nunca de `new Date()`.
// ─────────────────────────────────────────────────────────────────────────────

/** ¿Es una fecha real del calendario en formato YYYY-MM-DD? («2026-02-30» no lo es.) */
export function esFechaISO(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** La quincena que CONTIENE una fecha dada: [1, 15] o [16, último día real del mes]. */
export function quincenaDeFecha(fecha: string): { start: string; end: string } {
  const [y, m, d] = fecha.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= 15
    ? { start: ymd(y, m - 1, 1), end: ymd(y, m - 1, 15) }
    : { start: ymd(y, m - 1, 16), end: ymd(y, m - 1, lastDay) };
}

/** Hoy en Panamá (UTC−5 fijo), como YYYY-MM-DD. */
export function hoyPanamaYmd(now: Date = new Date()): string {
  const p = new Date(now.getTime() - 5 * 3600 * 1000);
  return ymd(p.getUTCFullYear(), p.getUTCMonth(), p.getUTCDate());
}

const MESES_LARGO = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export interface AtajoFechaPago {
  fecha: string; // YYYY-MM-DD
  label: string; // «15 de septiembre» · «31 de agosto» · «31 de diciembre de 2025»
}

/**
 * Los DOS días de pago más recientes que ya pasaron (o son hoy): siempre salen
 * un 15 y un fin de mes REAL (31, 30, 28 o 29 según el mes), el más reciente
 * primero. Contabilidad registra después del pago, así que el atajo que
 * necesita es el pago que acaba de pasar — el 1-sep, eso es «31 de agosto»,
 * no «30 de septiembre».
 */
export function atajosFechaPago(hoy: string): AtajoFechaPago[] {
  const [y, m] = hoy.split("-").map(Number);
  const meses: Array<[number, number]> = [[y, m], m === 1 ? [y - 1, 12] : [y, m - 1]];
  const candidatos: string[] = [];
  for (const [yy, mm] of meses) {
    const lastDay = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
    candidatos.push(ymd(yy, mm - 1, 15), ymd(yy, mm - 1, lastDay));
  }
  return candidatos
    .filter((f) => f <= hoy)
    .sort()
    .reverse()
    .slice(0, 2)
    .map((f) => {
      const [fy, fm, fd] = f.split("-").map(Number);
      const anio = fy === y ? "" : ` de ${fy}`;
      return { fecha: f, label: `${fd} de ${MESES_LARGO[fm - 1]}${anio}` };
    });
}

// ── El resumen del diálogo: a quién se aplica y a quién NO ─────────────────
//
// 🔴 Aplicar dos veces no cobra dos veces. La regla autoritativa vive en la
// RPC `prestamos_aplicar_quincena` (dedup server-side por la quincena de la
// fecha elegida); esto es la MISMA regla del lado de la pantalla, para
// DECIRLO antes de aplicar: «3 ya tienen el descuento de esta quincena; se
// aplicará a 10».
//
// 🔑 La ventana del dedup es ASIMÉTRICA: [inicio, fin + 3 días], igual que la
// RPC desde `20260917120000`. Sin tolerancia al inicio — el pago del 15 queda
// a un día de la quincena 16–fin y con ±3 bloquearía el lote entero —; con
// tolerancia al final, porque el botón rápido individual escribe la fecha de
// HOY y un registro 1–3 días después del cierre sigue siendo de esa quincena.
// Ante la ambigüedad se OMITE (y se dice), nunca se cobra dos veces.

/** Tolerancia al FINAL de la quincena, la misma de la RPC. */
export const QUINCENA_TOLERANCIA_DIAS = 3;

export interface PersonaQuincena {
  nombre: string;
  deduccion: number;
  saldo: number;
  /** Fechas (YYYY-MM-DD) de sus Pagos/Abonos extra APROBADOS y no borrados. */
  fechasPagos: string[];
}

export interface ResumenAplicarQuincena {
  /** A quiénes se les aplicaría, con el monto (capeado al saldo en la última cuota). */
  elegibles: { nombre: string; monto: number }[];
  /** Ya tienen un pago dentro de la quincena de la fecha elegida (±3 días): NO se les vuelve a aplicar. */
  yaTienen: string[];
  /** Saldo en 0: no hay nada que descontar. */
  sinSaldo: string[];
  total: number;
}

/** Suma días a una fecha YYYY-MM-DD (puro, sin zona horaria). */
function sumarDias(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + dias));
  return ymd(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
}

export function resumenAplicarQuincena(
  personas: readonly PersonaQuincena[],
  fechaPago: string,
): ResumenAplicarQuincena {
  const q = quincenaDeFecha(fechaPago);
  const tolStart = q.start;
  const tolEnd = sumarDias(q.end, QUINCENA_TOLERANCIA_DIAS);
  const elegibles: { nombre: string; monto: number }[] = [];
  const yaTienen: string[] = [];
  const sinSaldo: string[] = [];
  let total = 0;
  for (const p of personas) {
    if (p.saldo <= 0) { sinSaldo.push(p.nombre); continue; }
    if (p.fechasPagos.some((f) => f >= tolStart && f <= tolEnd)) { yaTienen.push(p.nombre); continue; }
    const monto = Math.min(p.deduccion, p.saldo);
    elegibles.push({ nombre: p.nombre, monto });
    total += monto;
  }
  return { elegibles, yaTienen, sinSaldo, total };
}
