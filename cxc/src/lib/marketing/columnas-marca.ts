// ============================================================================
// Marketing — reparto de un gasto entre Calvin, Tommy y "otras marcas".
//
// Módulo PURO (sin base, sin I/O): alimenta las columnas nuevas del Excel de
// gastos, tanto en la hoja Resumen como en la de detalle de cada cliente.
//
// REGLA DE LA CASA (fijada por Daniel): **ventas y gastos SIN ITBMS, saldos CON
// ITBMS.** Marketing es el archivo de GASTOS, así que la cifra que se reparte
// entre marcas es el SUBTOTAL (sin ITBMS), no el total.
//
// "otras" es un RESIDUO por construcción — `subtotal - ck - th` — y no la suma
// de las partes que no son CK/TH. Es a propósito: así `ck + th + otras` cuadra
// exactamente con el subtotal SIEMPRE, incluso cuando el gasto no trae reparto
// por marca (partes vacías → todo cae en "otras"), cuando las partes suman de
// menos (una entrega de muebles cuyo `total_por_marca` no cubre el total) o
// cuando aparece una marca nueva en el catálogo. Sumar las partes ajenas en vez
// de restar dejaría filas donde las tres columnas no dan el subtotal, que es
// justo el descuadre que un Excel de gastos no puede tener.
// ============================================================================

/** Código de Calvin Klein en `mk_marcas.codigo`. */
export const CODIGO_CALVIN = "CK";
/** Código de Tommy Hilfiger en `mk_marcas.codigo`. */
export const CODIGO_TOMMY = "TH";

/** Encabezados de las columnas nuevas (mismos textos en resumen y detalle). */
export const COL_CALVIN = "Calvin Klein";
export const COL_TOMMY = "Tommy Hilfiger";
export const COL_OTRAS = "Otras marcas";
export const COL_SUBTOTAL = "Subtotal (sin ITBMS)";

/** Una porción del gasto atribuida a una marca, identificada por su código. */
export interface ParteMarca {
  codigo: string;
  monto: number;
}

export interface SplitMarcas {
  /** Porción de Calvin Klein, sin ITBMS. */
  ck: number;
  /** Porción de Tommy Hilfiger, sin ITBMS. */
  th: number;
  /** Todo lo demás, sin ITBMS. Residuo: subtotal − ck − th. */
  otras: number;
}

function r2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

/**
 * Reparte `subtotal` (sin ITBMS) en Calvin / Tommy / otras.
 *
 * Invariante: `ck + th + otras === r2(subtotal)` siempre.
 */
export function splitMarcas(
  subtotal: number,
  partes: ReadonlyArray<ParteMarca> = [],
): SplitMarcas {
  const base = r2(subtotal);
  let ck = 0;
  let th = 0;
  for (const p of partes) {
    const monto = Number.isFinite(p.monto) ? p.monto : 0;
    if (p.codigo === CODIGO_CALVIN) ck += monto;
    else if (p.codigo === CODIGO_TOMMY) th += monto;
  }
  // Ninguna porción puede pasarse del subtotal ni ser negativa: un dato raro no
  // debe producir una columna absurda (ej. Tommy $9.000 sobre un gasto de $70).
  ck = Math.min(Math.max(r2(ck), 0), base);
  th = Math.min(Math.max(r2(th), 0), Math.max(r2(base - ck), 0));
  return { ck, th, otras: r2(base - ck - th) };
}

/** Suma varios splits (para totales de cliente y gran total). */
export function sumarSplits(splits: ReadonlyArray<SplitMarcas>): SplitMarcas {
  let ck = 0;
  let th = 0;
  let otras = 0;
  for (const s of splits) {
    ck += s.ck;
    th += s.th;
    otras += s.otras;
  }
  return { ck: r2(ck), th: r2(th), otras: r2(otras) };
}
