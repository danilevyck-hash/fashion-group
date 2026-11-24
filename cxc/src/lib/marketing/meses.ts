// ============================================================================
// Marketing — helpers de meses (client-safe, sin imports de servidor)
// ============================================================================
// Se usan tanto en la lib de impulsadoras (server) como en la UI (client).

import { hoyPanama } from "@/lib/fecha-panama";

export const MESES_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** "YYYY-MM-01" del mes de una fecha dada (UTC). */
export function primerDiaMes(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

/** Mes actual de PANAMÁ (día 1, "YYYY-MM-01"); el reloj UTC se adelanta 5 h. */
export function mesActualISO(now: Date = new Date()): string {
  return `${hoyPanama(now).slice(0, 7)}-01`;
}

/** Mes anterior de PANAMÁ (día 1, "YYYY-MM-01"). */
export function mesAnteriorISO(now: Date = new Date()): string {
  const [y, m] = hoyPanama(now).slice(0, 7).split("-").map(Number);
  return primerDiaMes(new Date(Date.UTC(y, m - 2, 1)));
}

/** Etiqueta legible de un mes: "Junio 2026" desde "YYYY-MM-01" (o "YYYY-MM"). */
export function etiquetaMes(mesISO: string): string {
  const [y, m] = mesISO.slice(0, 7).split("-");
  const idx = Number(m) - 1;
  const nombre = MESES_ES[idx] ?? m;
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${y}`;
}
