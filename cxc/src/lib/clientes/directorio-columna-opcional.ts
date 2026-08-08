// ─────────────────────────────────────────────────────────────────────────────
// Escribir en `directorio_clientes` MIENTRAS `cliente_codigo` todavía no existe.
//
// En este proyecto los DDL los corre Daniel A MANO, y varios se quedaron
// "PENDIENTES" semanas. La regla de la casa es que **cada pantalla funciona
// ANTES de que corra la migración, degradando limpio y diciendo qué falta**.
//
// Leer no es problema: el GET del directorio usa `select("*")`, así que una
// columna de más o de menos le da igual. **Escribir sí**: mandar una columna
// que la tabla no tiene hace que PostgREST rechace el INSERT/UPDATE entero con
// `PGRST204`, o sea que guardar un teléfono fallaría por una columna que ni
// siquiera se está usando.
//
// La salida es la misma que ya usan `catalogo/cols-opcionales` y el sync del
// catálogo: intentar con la columna y, **sólo si el error la NOMBRA**, volver a
// intentar sin ella. Reintentar ante cualquier error convertiría un problema
// real —permisos, RLS, red— en una escritura silenciosamente incompleta.
// ─────────────────────────────────────────────────────────────────────────────

/** La única columna que todavía puede no existir en `directorio_clientes`. */
export const COLUMNA_NUEVA = "cliente_codigo";

/** ¿Este error de PostgREST/Postgres es "esa columna no existe"? */
export function esColumnaFaltante(
  error: { code?: string; message?: string } | null | undefined,
  columna: string = COLUMNA_NUEVA,
): boolean {
  if (!error) return false;
  // PGRST204 = PostgREST no encontró la columna en su schema cache.
  // 42703 = undefined_column de Postgres.
  const codigoDice = error.code === "PGRST204" || error.code === "42703";
  return codigoDice && !!error.message && error.message.includes(columna);
}

export interface ResultadoEscritura<T extends object> {
  data: T | null;
  error: { code?: string; message?: string } | null;
  /** true si hubo que guardar SIN la columna nueva (la migración no corrió). */
  sinColumna: boolean;
}

/**
 * Corre `escribir(campos)`; si falla porque `cliente_codigo` no existe, lo
 * vuelve a correr sin esa clave y avisa con `sinColumna: true` para que la
 * pantalla pueda decirlo en vez de mentir que quedó vinculado.
 */
export async function guardarTolerandoColumnaNueva<T extends object>(
  campos: Record<string, unknown>,
  escribir: (campos: Record<string, unknown>) => PromiseLike<{ data: T | null; error: { code?: string; message?: string } | null }>,
  columna: string = COLUMNA_NUEVA,
): Promise<ResultadoEscritura<T>> {
  const primero = await escribir(campos);
  if (!esColumnaFaltante(primero.error, columna)) {
    return { data: primero.data, error: primero.error, sinColumna: false };
  }
  if (!(columna in campos)) {
    // No la mandamos: el error habla de otra cosa parecida. No se reintenta.
    return { data: primero.data, error: primero.error, sinColumna: false };
  }
  const { [columna]: _descartado, ...resto } = campos;
  const segundo = await escribir(resto);
  return { data: segundo.data, error: segundo.error, sinColumna: true };
}
