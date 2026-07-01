// Cálculo fiscal de Reclamos — fuente única, condicionada por empresa.
//
// Regla general (todas las empresas salvo Active Shoes): importación 10% + ITBMS
// 7.7%, total = subtotal × 1.177 (comportamiento histórico, sin cambios).
//
// Active Shoes: SIN ITBMS y con importación del 15%. total = subtotal × 1.15.
// Además oculta el N° de pedido (no aplica para esa empresa).

/** Tasa de importación general (resto de empresas) — 10%. */
export const TASA_IMPORTACION = 0.10;
/** ITBMS general (resto de empresas) — 7.7% sobre el subtotal. */
export const TASA_ITBMS = 0.077;
/** Factor total general: 1 + importación + ITBMS. */
export const FACTOR_TOTAL = 1 + TASA_IMPORTACION + TASA_ITBMS;

/** Importación de Active Shoes — 15% sobre el subtotal (sin ITBMS). */
export const TASA_IMPORTACION_ACTIVE_SHOES = 0.15;

/** true si la empresa es Active Shoes (acepta etiqueta "Active Shoes" o key "active_shoes"). */
export function esActiveShoes(empresa: string | null | undefined): boolean {
  return String(empresa ?? "").normalize("NFKC").trim().toLowerCase().replace(/[_\s]+/g, " ") === "active shoes";
}

/** true si esta empresa oculta el N° de pedido (solo Active Shoes). */
export function ocultaPedido(empresa: string | null | undefined): boolean {
  return esActiveShoes(empresa);
}

export interface ReclamoTaxes {
  importacion: number;
  itbms: number;
  total: number;
  /** Tasa de importación aplicada (0.10 general, 0.15 Active Shoes). */
  impRate: number;
  /** Tasa de ITBMS aplicada (0.077 general, 0 Active Shoes). */
  itbmsRate: number;
  /** false para Active Shoes (no lleva ITBMS). */
  hasItbms: boolean;
}

/** Impuestos de un reclamo/subtotal según la empresa. */
export function reclamoTaxes(empresa: string | null | undefined, subtotal: number): ReclamoTaxes {
  const sub = Number(subtotal) || 0;
  if (esActiveShoes(empresa)) {
    const importacion = sub * TASA_IMPORTACION_ACTIVE_SHOES;
    return { importacion, itbms: 0, total: sub + importacion, impRate: TASA_IMPORTACION_ACTIVE_SHOES, itbmsRate: 0, hasItbms: false };
  }
  const importacion = sub * TASA_IMPORTACION;
  const itbms = sub * TASA_ITBMS;
  return { importacion, itbms, total: sub + importacion + itbms, impRate: TASA_IMPORTACION, itbmsRate: TASA_ITBMS, hasItbms: true };
}

/** Etiqueta corta de la tasa de importación (ej. "10%", "15%"). */
export function impLabel(empresa: string | null | undefined): string {
  return `${Math.round((esActiveShoes(empresa) ? TASA_IMPORTACION_ACTIVE_SHOES : TASA_IMPORTACION) * 100)}%`;
}
