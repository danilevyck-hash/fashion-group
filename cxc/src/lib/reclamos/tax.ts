// Cálculo fiscal de Reclamos — fuente única, condicionada por empresa.
//
// Regla general (todas las empresas salvo Active Shoes): importación 10% +
// ITBMS 7% sobre (subtotal + importación). Total = subtotal × 1.177.
//
// 🔑 POR QUÉ EL ITBMS NO VA SOBRE EL SUBTOTAL PELADO
// El ITBMS de Panamá es 7% y se cobra sobre el valor con la importación
// adentro. Durante mucho tiempo esto se escribió al revés: 7.7% sobre el
// subtotal. Es exactamente la misma plata — 1,10 × 0,07 = 0,077 — pero el
// papel que recibe el proveedor terminaba diciendo «ITBMS 7.7%», una tasa que
// no existe en Panamá. Ahora la cuenta se hace en su forma verdadera y por eso
// el rótulo sale solo diciendo «7%», sin escribirlo a mano en ningún lado.
//
// 🩸 MEDIDO ANTES DE CAMBIARLO (1-sep-2026, solo lectura contra producción,
//    `npx tsx scripts/_verif-itbms-7-sobre-la-base.ts`):
// los 47 reclamos vivos, 46 con ITBMS, 142 renglones, 42 subtotales distintos.
// El ITBMS y el total dan EL MISMO CENTAVO con las dos fórmulas: cero filas
// cambian, y los 5 snapshots congelados siguen cuadrando. Barriendo los 20
// millones de subtotales de $0.01 a $200,000.00, 1.407 (0,007%) mueven UN
// centavo, siempre hacia arriba y siempre en un empate exacto de medio centavo
// (ej. $105 → $8.085: la forma vieja cae en $8.08, la nueva en $8.09). En un
// empate el redondeo comercial va hacia arriba, así que donde difieren la
// forma nueva es la correcta.
//
// Active Shoes: SIN ITBMS y con importación del 15%. total = subtotal × 1.15.
// Además oculta el N° de pedido (no aplica para esa empresa). 🔴 Esa empresa no
// se toca: no lleva ITBMS y su importación es 15%, no 10%.

/** Tasa de importación general (resto de empresas) — 10%. */
export const TASA_IMPORTACION = 0.10;
/** ITBMS general (resto de empresas) — 7% sobre (subtotal + importación). */
export const TASA_ITBMS = 0.07;
/**
 * Factor total general: el subtotal más la importación, y sobre eso el ITBMS.
 * (1 + 0,10) × (1 + 0,07) = 1,177 — el mismo total de siempre.
 */
export const FACTOR_TOTAL = (1 + TASA_IMPORTACION) * (1 + TASA_ITBMS);

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
  /** Tasa de ITBMS aplicada (0.07 general, 0 Active Shoes). */
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
  // El ITBMS se cobra sobre el subtotal CON la importación adentro. No se
  // muestra esa base como renglón aparte (decisión de Daniel): el papel sigue
  // teniendo tres líneas — subtotal, importación, ITBMS — y el total.
  const itbms = (sub + importacion) * TASA_ITBMS;
  return { importacion, itbms, total: sub + importacion + itbms, impRate: TASA_IMPORTACION, itbmsRate: TASA_ITBMS, hasItbms: true };
}

/**
 * Formatea una TASA (0.07) como porcentaje legible: "7%", "10%", "15%".
 * Sin decimales cuando el porcentaje es redondo, con los que hagan falta si no.
 *
 * 🔴 El rótulo del ITBMS iba escrito a mano en 5 pantallas/papeles mientras la
 * cuenta usaba otra tasa: el papel decía «ITBMS (7%) $77.00» sobre $1.000. El
 * proveedor sacaba 7% = $70 y reclamaba los $7 de diferencia por cada $1.000.
 * Por eso el rótulo se DERIVA de la misma tasa que hace la cuenta y NO PUEDE
 * volver a separarse de ella. Hoy la tasa es 0,07 y el rótulo dice «7%» — pero
 * lo dice porque lo calculó desde TASA_ITBMS, no porque alguien lo escribió.
 * Escribir «7%» a mano al lado de la constante es volver a plantar el mismo
 * bug: si mañana cambia la tasa, el papel vuelve a mentir.
 */
export function pctLabel(rate: number): string {
  return `${(rate * 100).toFixed(2).replace(/\.?0+$/, "")}%`;
}

/** Etiqueta de la tasa de importación aplicada a esa empresa (ej. "10%", "15%"). */
export function impLabel(empresa: string | null | undefined): string {
  return pctLabel(reclamoTaxes(empresa, 0).impRate);
}

/** Etiqueta de la tasa de ITBMS aplicada a esa empresa (ej. "7%"). */
export function itbmsLabel(empresa: string | null | undefined): string {
  return pctLabel(reclamoTaxes(empresa, 0).itbmsRate);
}
