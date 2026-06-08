// ============================================================================
// Marketing — helpers de cálculo de costo total con importación zona libre
// ============================================================================
// Cuando una compra es en zona libre, se suma 15% de importación al subtotal.
// ITBMS no aplica en zona libre (mutuamente excluyentes).
//
// El reparto por marca en mk_factura_marcas se calcula sobre el costo total
// (con el 15% incluido si aplica), NO sobre el subtotal.
// ============================================================================

export const PORCENTAJE_IMPORTACION_ZONA_LIBRE = 15;

const FACTOR_IMPORTACION = 1 + PORCENTAJE_IMPORTACION_ZONA_LIBRE / 100;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Costo total de una factura cuando puede o no aplicar zona libre.
 *   tieneImportacion = true  → subtotal × 1.15
 *   tieneImportacion = false → subtotal
 *
 * Nota: este helper NO suma ITBMS. Cuando tiene_importacion = false, el
 * total final de la factura sigue siendo subtotal + itbms (ver mutations).
 * Cuando tiene_importacion = true, ITBMS se fuerza a 0 en el form porque
 * zona libre es tax-free.
 */
export function calcularCostoTotal(
  subtotal: number,
  tieneImportacion: boolean,
): number {
  const sub = Number.isFinite(subtotal) ? subtotal : 0;
  if (tieneImportacion) return round2(sub * FACTOR_IMPORTACION);
  return round2(sub);
}

/**
 * Monto del cargo por importación (15%) cuando aplica. Útil para mostrar
 * el desglose en UI sin recalcular a mano.
 */
export function calcularImportacion(
  subtotal: number,
  tieneImportacion: boolean,
): number {
  if (!tieneImportacion) return 0;
  const sub = Number.isFinite(subtotal) ? subtotal : 0;
  return round2(sub * (PORCENTAJE_IMPORTACION_ZONA_LIBRE / 100));
}

export const PORCENTAJE_ITBMS = 7;

/**
 * ITBMS de una factura. Fuente única para single y bulk (antes cada uno hacía
 * `round2(subtotal * 0.07)` por su lado). Zona libre fuerza ITBMS = 0.
 * `itbmsPct` es el porcentaje REAL (0 | 7) — viene del itbms_pct detectado por
 * la IA o del toggle del usuario.
 */
export function calcularItbms(
  subtotal: number,
  itbmsPct: number,
  tieneImportacion: boolean,
): number {
  if (tieneImportacion) return 0;
  const sub = Number.isFinite(subtotal) ? subtotal : 0;
  return itbmsPct === PORCENTAJE_ITBMS
    ? round2(sub * (PORCENTAJE_ITBMS / 100))
    : 0;
}

/**
 * Total final de una factura:
 *   zona libre  → subtotal × 1.15 (sin ITBMS)
 *   normal      → subtotal + ITBMS
 */
export function calcularTotalFactura(
  subtotal: number,
  itbmsPct: number,
  tieneImportacion: boolean,
): number {
  if (tieneImportacion) return calcularCostoTotal(subtotal, true);
  const sub = Number.isFinite(subtotal) ? subtotal : 0;
  return round2(sub + calcularItbms(sub, itbmsPct, false));
}
