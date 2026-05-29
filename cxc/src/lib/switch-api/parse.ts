/**
 * Helpers de parseo de la API Switch, compartidos entre syncs.
 *
 * parseAmount maneja el separador de miles (coma) en formato US — sin esto se
 * descartaban facturas >= $1,000 (bug del Día 3, ver sync.ts). El sync de
 * Multifashion (sync.ts) mantiene su propia copia ya corregida; este módulo es
 * la versión canónica para los syncs nuevos (multi-empresa).
 */

/** Switch devuelve "YYYY-MM-DD HH:mm:ss" sin TZ; tratamos como hora Panamá (UTC-5, sin DST). */
export function parseSwitchFecha(s: string): string | null {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}-05:00`;
}

/** Estado de cuenta usa "DD-MM-YYYY". Devuelve "YYYY-MM-DD" o null. */
export function parseFechaDMY(s: string | null | undefined): string | null {
  if (s == null) return null;
  const m = String(s).trim().match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/**
 * Switch formatea montos en formato US: coma = miles, punto = decimal.
 * Ej: "2,112.0000" = 2112.0. Inconsistente entre campos (total a veces sin
 * coma, subTotal con coma cuando >= 1000). Number("2,112.0000") es NaN, así
 * que hay que sacar la coma antes de parsear. NO asumir formato europeo.
 */
export function parseAmount(s: string | number | null | undefined): number | null {
  if (s == null) return null;
  if (typeof s === "number") return Number.isFinite(s) ? s : null;
  const cleaned = String(s).trim().replace(/,/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
