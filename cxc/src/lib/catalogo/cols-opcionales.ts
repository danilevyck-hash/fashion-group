// ─────────────────────────────────────────────────────────────────────────────
// Leer una columna que TODAVÍA PUEDE NO EXISTIR.
//
// 🩸 En este proyecto los DDL los corre Daniel a mano, y varios se quedaron
// "PENDIENTES" semanas (hay media docena anotados así en CLAUDE.md). Una lista
// de columnas explícita —que es la regla del round-trip del admin— convierte
// eso en una pantalla ROTA: PostgREST rechaza el select entero y el catálogo
// no carga ni una fila, no es que falte un dato.
//
// La salida es la que ya usan `sync-catalogo` (con `nombre_manual`) y el route
// de products (con `oculto_manual`): pedir con la columna y, si el error la
// nombra, releer sin ella. Acá está escrito UNA vez en vez de copiado en cada
// llamador, porque cada copia es una que se puede olvidar.
//
// ⚠️ Solo se reintenta cuando el mensaje NOMBRA la columna. Reintentar ante
// cualquier error convertiría un problema real —permisos, red, RLS— en una
// lectura silenciosamente incompleta, que es peor que fallar.
// ─────────────────────────────────────────────────────────────────────────────

/** Saca una columna de una lista tipo `"id,sku,bulto_pzas,price"`. */
export function sinColumna(cols: string, columna: string): string {
  return cols
    .split(",")
    .map((c) => c.trim())
    .filter((c) => c !== columna && c.length > 0)
    .join(",");
}

/** ¿Este error es "esa columna no existe"? */
export function errorDeColumnaFaltante(mensaje: string | null | undefined, columna: string): boolean {
  return !!mensaje && mensaje.includes(columna);
}

/**
 * Corre `leer(cols)`; si falla nombrando `columna`, lo vuelve a correr sin ella.
 *
 * `leer` puede tirar (los helpers paginados lo hacen) o devolver un error de
 * PostgREST — se contemplan las dos formas porque en el repo conviven ambas.
 */
export async function leerConColumnaOpcional<T>(
  cols: string,
  columna: string,
  leer: (cols: string) => Promise<T>,
): Promise<T> {
  try {
    return await leer(cols);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!errorDeColumnaFaltante(msg, columna)) throw e;
    return await leer(sinColumna(cols, columna));
  }
}
