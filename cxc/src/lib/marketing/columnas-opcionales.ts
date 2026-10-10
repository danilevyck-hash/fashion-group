// ============================================================================
// Marketing — LAS COLUMNAS DEL REDISEÑO. Módulo PURO.
//
// Las columnas `se_reporta`, `tienda_codigo`, `nota`, `pct_a_la_marca`
// (gastos), `nombre_al_cerrar`, `nota_credito`, `zips_bajados` (períodos) y
// `mk_adjuntos.periodo_id` YA EXISTEN en producción (verificado el 9-oct-2026).
// La tolerancia que releía o reescribía SIN ellas se retiró ese día: un error
// de lectura o de escritura falla con su error, no se guarda a medias.
//
// Lo que queda acá son los valores por omisión con que se COMPLETA una fila
// leída (`completarGasto`, `completarPeriodo`, `completarProveedores`) y
// `esColumnaAusente`, que hoy solo usa la limpieza de anulados por
// `mk_entregas_muebles.anulado_en` — esa columna todavía NO existe.
// ============================================================================

import { SE_REPORTA_POR_DEFECTO } from "./gasto";

/** Lo que vale cada columna nueva mientras no exista. */
export const COLUMNAS_DEL_GASTO = {
  se_reporta: SE_REPORTA_POR_DEFECTO,
  tienda_codigo: null as string | null,
  nota: null as string | null,
} as const;

export const COLUMNAS_DEL_PERIODO = {
  nombre_al_cerrar: null as string | null,
  nota_credito: null as string | null,
  zips_bajados: [] as ReadonlyArray<unknown>,
} as const;

/**
 * 🔴 La columna de PROVEEDORES (6-oct-2026, migración
 * `20270101120000_mkt_proveedores.sql`, escrita y SIN aplicar). Mientras no
 * exista, el módulo se porta como el 5-oct-2026: una factura sin marca no se
 * puede guardar y a ninguna se le cobra la mitad — o sea, la función nueva no
 * aparece, pero NADA se rompe.
 */
export const COLUMNAS_DE_PROVEEDORES = {
  pct_a_la_marca: null as number | null,
} as const;

/**
 * Completa una fila con el valor de hoy. Sin la migración, toda factura se lee
 * entera de su marca, que es exactamente lo que hay.
 */
export function completarProveedores<T extends Record<string, unknown>>(
  fila: T,
): T & { pct_a_la_marca: number | null } {
  // 🩸 `Number(null)` es **0**, no NaN: convertir primero volvía un NULL
  // guardado en «cero por ciento» —«A cargo de la empresa»— y el gasto se
  // caía del ZIP y del reporte de su marca. El null se mira ANTES de convertir.
  const crudo = fila.pct_a_la_marca;
  const n = crudo === null || crudo === undefined ? NaN : Number(crudo);
  return {
    ...fila,
    pct_a_la_marca: Number.isFinite(n) ? n : null,
  };
}

/** Un error como lo devuelve PostgREST/Supabase. */
export interface ErrorPg {
  code?: string | null;
  message?: string | null;
}

/**
 * ¿Es «esa columna no existe»? PGRST204 lo dice PostgREST (schema cache) y
 * 42703 Postgres. Por el texto solo si nombra la columna: un timeout o un
 * permiso NO son «falta la migración».
 */
export function esColumnaAusente(err: ErrorPg | null | undefined): boolean {
  if (!err) return false;
  const code = String(err.code ?? "");
  if (code === "PGRST204" || code === "42703") return true;
  const msg = String(err.message ?? "");
  return /could not find the '[a-z_]+' column|column [a-z_."]+ does not exist/i.test(msg);
}

/**
 * Completa una fila leída con los valores de hoy para lo que no vino. NUNCA
 * pisa lo que sí vino: un `se_reporta = false` guardado se respeta.
 */
export function completarGasto<T extends Record<string, unknown>>(
  fila: T,
): T & { se_reporta: boolean; tienda_codigo: string | null; nota: string | null } {
  return {
    ...fila,
    se_reporta: fila.se_reporta === false ? false : COLUMNAS_DEL_GASTO.se_reporta,
    tienda_codigo:
      typeof fila.tienda_codigo === "string" && fila.tienda_codigo.trim().length > 0
        ? fila.tienda_codigo
        : COLUMNAS_DEL_GASTO.tienda_codigo,
    nota: typeof fila.nota === "string" && fila.nota.trim().length > 0 ? fila.nota : COLUMNAS_DEL_GASTO.nota,
  };
}

export function completarPeriodo<T extends Record<string, unknown>>(
  fila: T,
): T & { nombre_al_cerrar: string | null; nota_credito: string | null; zips_bajados: unknown[] } {
  return {
    ...fila,
    nombre_al_cerrar:
      typeof fila.nombre_al_cerrar === "string" ? fila.nombre_al_cerrar : COLUMNAS_DEL_PERIODO.nombre_al_cerrar,
    nota_credito: typeof fila.nota_credito === "string" ? fila.nota_credito : COLUMNAS_DEL_PERIODO.nota_credito,
    zips_bajados: Array.isArray(fila.zips_bajados) ? fila.zips_bajados : [...COLUMNAS_DEL_PERIODO.zips_bajados],
  };
}

/** Un resultado como lo devuelve Supabase. */
export interface ResultadoPg<T> {
  data: T | null;
  error: ErrorPg | null;
}
