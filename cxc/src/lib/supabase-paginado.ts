/**
 * Lectura COMPLETA de PostgREST — el antídoto contra el truncado silencioso.
 *
 * ⚠️ EL PROBLEMA: PostgREST corta TODA respuesta en `db-max-rows` = 1000 filas
 * en este proyecto, y lo hace SIN error y SIN ninguna señal en el payload. Pedir
 * `.range(0, 99999)` o `.limit(5000)` devuelve 1.000 filas y el código de arriba
 * cree que ésa es la tabla entera. Cuando el resultado se suma o se agrega, el
 * número que ve Daniel queda mal y nadie se entera.
 *
 * Historial (26-jul-2026): apareció en el sync de recibos (#315 y el fix del
 * mapa de impuestos), y el barrido posterior lo encontró en la frescura de CXC
 * (switch_estadocuenta, 1.511 filas), en "Otros clientes" de /ventas
 * (clientes_empresa_12m_vw, 1.563), en el selector del checkout de catálogos
 * (switch_clientes, 1.710) y en el inventario del catálogo público.
 *
 * LAS DOS DEFENSAS, juntas y obligatorias:
 *   1. PAGINAR con un ORDEN ESTABLE. Sin `.order()` por una columna única,
 *      PostgREST puede repetir o saltear filas entre páginas — paginar sin
 *      ordenar no arregla nada, sólo cambia la forma del error.
 *   2. VERIFICAR contra un `count: "exact"` y FALLAR RUIDOSAMENTE si no cuadra.
 *      Seguir con datos a medias es exactamente el bug que estamos matando.
 *
 * Uso:
 *   const filas = await leerTodoPaginado<Fila>("switch_estadocuenta (frescura)",
 *     (pedirCount, desde, hasta) =>
 *       supabaseServer
 *         .from("switch_estadocuenta")
 *         .select("empresa_key, synced_at", pedirCount ? { count: "exact" } : {})
 *         .order("id", { ascending: true })   // ← orden ESTABLE, no el de negocio
 *         .range(desde, hasta));
 *
 * El orden que se le pasa es el de la PAGINACIÓN, no el de presentación: tiene
 * que ser único y estable. Si necesitás otro orden para mostrar, ordená en
 * memoria después — son filas que ya tenés todas.
 */

/** Lo que devuelve un `.range()` de supabase-js, en lo mínimo que nos importa. */
export interface RespuestaPaginada {
  data: unknown[] | null;
  error: { message: string } | null;
  count?: number | null;
}

/** Ejecuta UNA página. `pedirCount` sólo es true en la primera. */
export type EjecutarPagina = (
  pedirCount: boolean,
  desde: number,
  hasta: number,
) => PromiseLike<RespuestaPaginada>;

/** Tamaño de página. Igual al `db-max-rows` del proyecto: pedir más no sirve. */
export const PAGINA_POSTGREST = 1000;

/** Cota dura de páginas para que un servidor que devuelva páginas llenas para
 *  siempre no deje el bucle girando (1M filas). Si se alcanza, el chequeo del
 *  COUNT lo denuncia igual. */
const MAX_PAGINAS = 1000;

export async function leerTodoPaginado<T>(
  etiqueta: string,
  ejecutar: EjecutarPagina,
  pagina: number = PAGINA_POSTGREST,
): Promise<T[]> {
  const filas: T[] = [];
  let esperadas: number | null = null;

  for (let p = 0; p < MAX_PAGINAS; p += 1) {
    const desde = p * pagina;
    const { data, error, count } = await ejecutar(p === 0, desde, desde + pagina - 1);
    if (error) throw new Error(`${etiqueta}: ${error.message}`);
    if (p === 0) esperadas = count ?? null;
    const lote = (data ?? []) as T[];
    filas.push(...lote);
    // Se corta por página incompleta o al alcanzar el COUNT.
    if (lote.length < pagina) break;
    if (esperadas != null && filas.length >= esperadas) break;
  }

  if (esperadas == null) {
    throw new Error(
      `${etiqueta}: la lectura no devolvió COUNT exacto — sin él no puedo garantizar que estén todas las filas`,
    );
  }
  if (filas.length !== esperadas) {
    throw new Error(
      `${etiqueta}: lectura incompleta — ${filas.length} filas leídas vs ${esperadas} contadas (¿falta un .order() estable?)`,
    );
  }
  return filas;
}
