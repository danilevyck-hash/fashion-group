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

/**
 * Formatea una TASA (0.077) como porcentaje legible: "7.7%", "10%", "15%".
 * Sin decimales cuando el porcentaje es redondo, con los que hagan falta si no.
 *
 * 🔴 El rótulo del ITBMS iba escrito a mano como "7%" en 5 pantallas/papeles
 * mientras la cuenta usaba TASA_ITBMS = 0.077: en $1.000 el papel decía
 * "ITBMS (7%) $77.00". El proveedor sacaba 7% = $70 y reclamaba los $7 de
 * diferencia por cada $1.000. El MONTO está bien (decisión de negocio, con
 * test); lo que mentía era el rótulo. Por eso el rótulo se DERIVA de la misma
 * tasa que hace la cuenta y no puede volver a separarse de ella.
 */
export function pctLabel(rate: number): string {
  return `${(rate * 100).toFixed(2).replace(/\.?0+$/, "")}%`;
}

/** Etiqueta de la tasa de importación aplicada a esa empresa (ej. "10%", "15%"). */
export function impLabel(empresa: string | null | undefined): string {
  return pctLabel(reclamoTaxes(empresa, 0).impRate);
}

/** Etiqueta de la tasa de ITBMS aplicada a esa empresa (ej. "7.7%"). */
export function itbmsLabel(empresa: string | null | undefined): string {
  return pctLabel(reclamoTaxes(empresa, 0).itbmsRate);
}
