// Helpers de parseo de fecha para uploads CXC.
//
// Pipeline:
//   1. parseFechaFlexible(raw) — intenta múltiples formatos del CSV
//   2. parseFechaFromNFiscal(nFiscal) — fallback decodificando YYYYMMDD embebido
//   3. parseFechaFromCSVOrNFiscal(raw, nFiscal) — combina ambos
//
// Casos legítimos sin fecha (NULL no es error):
//   - comprobante = "Saldo Anterior"
//   - comprobante = "Nota de Crédito" cuando Switch no manda fecha
//
// Causa raíz del bug original: Switch emite mezclas de DD-MM-YYYY y
// DD/MM/YYYY en el mismo archivo (a veces hasta en la misma fila).

const MIN_YEAR = 2020;
const MAX_YEAR = 2030;

function isValidYMD(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  if (y < MIN_YEAR || y > MAX_YEAR) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Parsea una fecha del CSV de Switch en múltiples formatos comunes:
 *   - DD-MM-YYYY / D-M-YYYY
 *   - DD/MM/YYYY / D/M/YYYY
 *   - YYYY-MM-DD (ISO)
 *   - YYYY/MM/DD
 *
 * Devuelve null si:
 *   - input vacío / null / undefined
 *   - no matchea ningún formato
 *   - los componentes no forman una fecha calendárica válida
 *   - el año cae fuera de [MIN_YEAR, MAX_YEAR]
 */
export function parseFechaFlexible(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // YYYY-MM-DD o YYYY/MM/DD
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) {
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    const d = parseInt(m[3], 10);
    if (isValidYMD(y, mo, d)) return `${y}-${pad2(mo)}-${pad2(d)}`;
    return null;
  }

  // DD-MM-YYYY, D-M-YYYY, DD/MM/YYYY, D/M/YYYY
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) {
    const d = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    const y = parseInt(m[3], 10);
    if (isValidYMD(y, mo, d)) return `${y}-${pad2(mo)}-${pad2(d)}`;
    return null;
  }

  return null;
}

/**
 * Decodifica una fecha embebida en el n_fiscal de Switch.
 *
 * El formato fiscal de Panamá embebe la fecha de emisión como YYYYMMDD.
 * Ejemplo: "FE0120000148166...0012025120200000021360..." → 2025-12-02
 *
 * Estrategia: busca todas las subcadenas de 8 dígitos que formen una
 * fecha calendárica válida con año en [MIN_YEAR, MAX_YEAR]. Toma la
 * primera (Switch encodea la fecha de emisión temprano en la cadena).
 *
 * Devuelve null si el n_fiscal es vacío o no contiene un patrón
 * decodificable (común en recibos con prefijo no-fiscal tipo
 * "TFHKC50002891-...").
 */
export function parseFechaFromNFiscal(nFiscal: string | null | undefined): string | null {
  if (!nFiscal) return null;
  const s = String(nFiscal);
  const re = /(\d{4})(\d{2})(\d{2})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    const d = parseInt(m[3], 10);
    if (isValidYMD(y, mo, d)) {
      return `${y}-${pad2(mo)}-${pad2(d)}`;
    }
    // Avanzar 1 char para permitir patrones solapados
    re.lastIndex = m.index + 1;
  }
  return null;
}

/**
 * Pipeline completo: intenta el CSV primero, falla al n_fiscal como
 * último recurso. Es el helper que debe usar el endpoint de upload.
 */
export function parseFechaFromCSVOrNFiscal(
  rawFecha: string | null | undefined,
  nFiscal: string | null | undefined,
): string | null {
  const fromCsv = parseFechaFlexible(rawFecha);
  if (fromCsv) return fromCsv;
  return parseFechaFromNFiscal(nFiscal);
}

/**
 * ¿Es legítimo que esta fila no tenga fecha?
 *
 * - "Saldo Anterior": registro de apertura, sin fecha de emisión.
 * - "Nota de Crédito": Switch a veces no emite fecha; aceptamos NULL.
 */
export function isLegitFechaNull(comprobante: string | null | undefined): boolean {
  const c = (comprobante ?? "").trim().toLowerCase();
  return c === "saldo anterior" || c === "nota de crédito" || c === "nota de credito";
}

/**
 * ¿Es legítimo que esta fila no tenga fecha_vencimiento?
 *
 * - NCs, Recibos y Saldo Anterior no aplican fecha de vencimiento.
 */
export function isLegitFechaVencimientoNull(comprobante: string | null | undefined): boolean {
  const c = (comprobante ?? "").trim().toLowerCase();
  return (
    c === "saldo anterior" ||
    c === "nota de crédito" ||
    c === "nota de credito" ||
    c === "recibo"
  );
}
