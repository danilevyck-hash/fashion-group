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
