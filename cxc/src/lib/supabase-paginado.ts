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
 * que ser único y estable. Cuando el orden de presentación importa, NO lo
 * cambies por uno "más paginable": conservá el de negocio y agregale una
 * columna única como DESEMPATE (`.order("ultima_compra", …).order("id")`).
 * Re-ordenar en memoria después también sirve, pero cambia la collation y con
 * ella el orden que ve el usuario.
 *
 * NOTA — `sync-recibos.ts` tiene DOS lectores (`leerMesGuardado` y
 * `loadImpuestoMap`) con este mismo bucle escrito a mano, y se dejaron así a
 * propósito: son los originales de los que salió este helper, están cubiertos
 * por sus propios candados (`recibos-lectura-mes.test.ts` y
 * `recibos-impuesto-map-paginado.test.ts`) que asertan sus mensajes de error
 * exactos, y viven en el camino del sync que acaba de cambiar en #315. Migrarlos
 * es deuda menor y sin urgencia; cualquier lector NUEVO usa este helper.
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

/**
 * `simultaneas` (7-oct-2026): con el COUNT de la primera página ya se sabe
 * cuántas faltan, y se pueden pedir de a N a la vez en vez de una tras otra.
 * Por defecto 1 = el bucle de siempre; se prende caso por caso (hoy solo el
 * directorio de clientes, 6 páginas) para no multiplicar la carga de un cron
 * sobre una tabla grande — la base es Micro.
 */
/** Lecturas COMPLETAS extra si el COUNT no cuadra (ver `leerTodoPaginado`). */
export const REINTENTOS_SI_NO_CUADRA = 2;

class LecturaNoCuadra extends Error {}

/**
 * 🩸 Nov-2026: una marca del reloj que entra ENTRE el COUNT y la última página
 * dejaba una fila de más (13.449 leídas vs 13.448 contadas) y Justificaciones u
 * Horarios no cargaban. Si el COUNT no cuadra, la lectura ENTERA se repite
 * (COUNT nuevo + todas las páginas): la carrera dura milisegundos y la segunda
 * vuelta cuadra. Nunca se devuelve una lectura que no cuadre: si tras los
 * reintentos sigue sin cuadrar, el error de siempre.
 */
export async function leerTodoPaginado<T>(
  etiqueta: string,
  ejecutar: EjecutarPagina,
  pagina: number = PAGINA_POSTGREST,
  simultaneas: number = 1,
): Promise<T[]> {
  for (let intento = 0; ; intento += 1) {
    try {
      return await leerUnaVez<T>(etiqueta, ejecutar, pagina, simultaneas);
    } catch (e) {
      if (!(e instanceof LecturaNoCuadra) || intento >= REINTENTOS_SI_NO_CUADRA) throw e;
    }
  }
}

async function leerUnaVez<T>(
  etiqueta: string,
  ejecutar: EjecutarPagina,
  pagina: number,
  simultaneas: number,
): Promise<T[]> {
  const filas: T[] = [];
  let esperadas: number | null = null;

  for (let p = 0; p < MAX_PAGINAS; p += 1) {
    if (p === 1 && simultaneas > 1 && esperadas != null) {
      // Las páginas que faltan, de a `simultaneas`, EN ORDEN.
      const total = Math.min(Math.ceil(esperadas / pagina), MAX_PAGINAS);
      for (let ini = 1; ini < total; ini += simultaneas) {
        const tanda = [];
        for (let q = ini; q < Math.min(ini + simultaneas, total); q += 1) {
          tanda.push(ejecutar(false, q * pagina, q * pagina + pagina - 1));
        }
        for (const { data, error } of await Promise.all(tanda)) {
          if (error) throw new Error(`${etiqueta}: ${error.message}`);
          filas.push(...((data ?? []) as T[]));
        }
      }
      break;
    }
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
    throw new LecturaNoCuadra(
      `${etiqueta}: lectura incompleta — ${filas.length} filas leídas vs ${esperadas} contadas (¿falta un .order() estable?)`,
    );
  }
  return filas;
}

/**
 * 🩸 Nov-2026: un `.in("id", lista)` con ~640 UUID arma una URL que la base
 * rechaza (Bad Request), y varias lecturas lo tomaban como «no hay nada».
 * Tommy ya va en 516 productos. Tamaño de cada tanda.
 */
export const TANDA_IN = 200;

/**
 * Corre la MISMA consulta `.in()` en tandas de `TANDA_IN` y junta las filas.
 * Devuelve la forma de supabase (`{ data, error }`) para que cada lector
 * conserve su manejo de errores; ante el PRIMER error se corta y se devuelve
 * ese error con `data: null` — nunca filas a medias.
 * Ojo: cada tanda sigue sujeta al tope de 1.000 filas; úsalo cuando cada valor
 * trae pocas filas (por id, o por pedido).
 */
export async function inEnTandas<T, E = { message: string }>(
  valores: readonly string[],
  consulta: (tanda: string[]) => PromiseLike<{ data: unknown | null; error: E | null }>,
  tamano: number = TANDA_IN,
): Promise<{ data: T[] | null; error: E | null }> {
  const unicos = [...new Set(valores)];
  const filas: T[] = [];
  for (let i = 0; i < unicos.length; i += tamano) {
    const { data, error } = await consulta(unicos.slice(i, i + tamano));
    if (error) return { data: null, error };
    filas.push(...((data ?? []) as T[]));
  }
  return { data: filas, error: null };
}
