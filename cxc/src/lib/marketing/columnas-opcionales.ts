// ============================================================================
// Marketing — LAS COLUMNAS DEL REDISEÑO FALLAN ABIERTAS. Módulo PURO.
//
// Las migraciones `20261216120000_marketing_gasto_tienda_se_reporta.sql` y
// `20261216120100_marketing_periodo_cierre_y_zips.sql` agregan columnas
// (`se_reporta`, `tienda_codigo`, `nota`, `nombre_al_cerrar`, `nota_credito`,
// `zips_bajados`). Las ESCRIBE el repo y las APLICA Daniel cuando diga que sí,
// así que hay una ventana —de días o de semanas— en la que el código nuevo
// corre contra la base de hoy.
//
// 🔴 EN ESA VENTANA EL MÓDULO SE PORTA COMO HOY. Nada se rompe ni se apaga:
//   · Una LECTURA que pide una columna que no existe recibe PGRST204 / 42703.
//     Se relee SIN esas columnas y se completan con su valor de hoy
//     (`se_reporta = true`, `tienda_codigo = null`, `nota = null`, …).
//   · Una ESCRITURA que manda esas columnas recibe el mismo error. Se reescribe
//     sin ellas: el gasto se guarda como hoy y lo nuevo se pierde SIN ROMPER el
//     guardado — y se dice en el log, para que no quede en silencio.
//
// Es el mismo patrón que `hayColumnasPeriodo` en `impulsadoras.ts`, en un solo
// lugar para que las cuatro piezas del rediseño no lo reescriban cuatro veces.
//
// ⚠️ Cuando las migraciones ESTÉN aplicadas y verificadas, esta tolerancia se
// retira (ver `marketing-ddl-sin-tolerancia.test.ts`, 3-sep-2026): un error
// de columna pasa a ser un error de verdad.
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

/**
 * Corre la consulta CON las columnas nuevas; si la base dice que no existen,
 * corre la de respaldo SIN ellas. Cualquier otro error se devuelve tal cual:
 * esto no esconde permisos ni timeouts.
 *
 * `avisar` recibe el mensaje cuando se cae al respaldo — para que la ventana
 * sin migración deje rastro en el log y no en el silencio.
 */
export async function conRespaldoSinColumnas<T>(
  conColumnas: () => PromiseLike<ResultadoPg<T>>,
  sinColumnas: () => PromiseLike<ResultadoPg<T>>,
  avisar?: (mensaje: string) => void,
): Promise<{ resultado: ResultadoPg<T>; conLasColumnas: boolean }> {
  const primero = await conColumnas();
  if (!primero.error || !esColumnaAusente(primero.error)) {
    return { resultado: primero, conLasColumnas: true };
  }
  avisar?.(
    `[marketing/rediseño] falta una columna del rediseño (${primero.error.message ?? primero.error.code}); ` +
      "se sigue como antes de la migración.",
  );
  const segundo = await sinColumnas();
  return { resultado: segundo, conLasColumnas: false };
}

/** Quita de un payload de escritura las columnas del rediseño, para el reintento. */
export function sinColumnasDelRediseno<T extends Record<string, unknown>>(payload: T): Partial<T> {
  const copia: Record<string, unknown> = { ...payload };
  for (const col of [...Object.keys(COLUMNAS_DEL_GASTO), ...Object.keys(COLUMNAS_DEL_PERIODO)]) {
    delete copia[col];
  }
  return copia as Partial<T>;
}
