// ============================================================================
// Marketing — helpers de meses (client-safe, sin imports de servidor)
// ============================================================================
// Se usan tanto en la lib de impulsadoras (server) como en la UI (client).

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

/** Mes actual (día 1, "YYYY-MM-01"). */
export function mesActualISO(): string {
  return primerDiaMes(new Date());
}

/** Mes anterior (día 1, "YYYY-MM-01"). */
export function mesAnteriorISO(): string {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - 1, 1);
  return primerDiaMes(d);
}

/** Etiqueta legible de un mes: "Junio 2026" desde "YYYY-MM-01" (o "YYYY-MM"). */
export function etiquetaMes(mesISO: string): string {
  const [y, m] = mesISO.slice(0, 7).split("-");
  const idx = Number(m) - 1;
  const nombre = MESES_ES[idx] ?? m;
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${y}`;
}
