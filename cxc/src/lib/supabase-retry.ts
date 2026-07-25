// Reintento de consultas pesadas a Supabase ante fallos TRANSITORIOS.
//
// MEDICIÓN (producción, 25-jul-2026) — ventas_dashboard_summary(2026), 8 corridas:
//   #1  9134ms  FAIL: canceling statement due to statement timeout
//   #2  2258ms  ok
//   #3  1330ms  ok
//   #4..#8  533-563ms  ok
//
// Con la caché de buffers de Postgres FRÍA la consulta se pasa del
// statement_timeout y Postgres la cancela (SQLSTATE 57014). Con la caché
// caliente tarda medio segundo. El mismo patrón se ve en
// ventas_proyeccion_cierre_v6 y multifashion_mensual_v7.
//
// O sea: el fallo se cura solo al repetir. Reintentarlo acá —lo más cerca
// posible de la DB— arregla de una vez el SSR de /ventas, el SSR de
// /multifashion, /api/ventas/resumen y /api/multifashion/overview. El reintento
// del cliente (src/lib/fetch-retry.ts) queda como segunda línea de defensa para
// lo que falle entre el browser y Vercel.
//
// SOLO se reintenta lo transitorio. Un error de SQL, un permiso o una función
// inexistente fallan igual la primera vez que la tercera: reintentarlos solo
// gasta segundos del presupuesto de la función.

export interface SupabaseLikeError {
  message?: string;
  code?: string;
}

export interface SupabaseLikeResult<T> {
  data: T | null;
  error: SupabaseLikeError | null;
}

// 57014 = query_canceled (statement timeout). El resto son cortes de red entre
// la función serverless y Supabase.
const PATRONES_TRANSITORIOS = [
  "statement timeout",
  "canceling statement",
  "query_canceled",
  "fetch failed",
  "socket hang up",
  "econnreset",
  "etimedout",
  "network",
  "503",
  "504",
];

export function isTransientDbError(error: SupabaseLikeError | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "57014") return true;
  const msg = (error.message ?? "").toLowerCase();
  return PATRONES_TRANSITORIOS.some((p) => msg.includes(p));
}

export interface RetryDbOptions {
  /** Intentos TOTALES. Default 3. */
  attempts?: number;
  /** Espera base en ms. Backoff lineal: 0, base, base×2. Default 300. */
  baseDelayMs?: number;
  /** Inyectable para tests. */
  sleepImpl?: (ms: number) => Promise<void>;
  /** Etiqueta para el log del reintento. */
  label?: string;
  /** Inyectable para tests. */
  logger?: (msg: string) => void;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Corre una consulta de Supabase reintentando SOLO ante fallos transitorios.
 * Devuelve el último resultado (con su error) si se agotan los intentos, así el
 * caller conserva su manejo de error actual sin cambios.
 *
 * `run` tiene que crear la consulta de cero en cada intento: los builders de
 * supabase-js son thenables de un solo uso, no se pueden re-await.
 */
export async function withDbRetry<T>(
  run: () => PromiseLike<SupabaseLikeResult<T>>,
  options: RetryDbOptions = {},
): Promise<SupabaseLikeResult<T>> {
  const {
    attempts = 3,
    baseDelayMs = 300,
    sleepImpl = defaultSleep,
    label = "db",
    logger = (m: string) => console.warn(m),
  } = options;

  let last: SupabaseLikeResult<T> = { data: null, error: { message: "sin intentos" } };

  for (let i = 0; i < attempts; i++) {
    if (i > 0) await sleepImpl(baseDelayMs * i);
    try {
      last = await run();
    } catch (err) {
      // supabase-js normalmente no lanza, pero un corte de red sí puede.
      last = { data: null, error: { message: err instanceof Error ? err.message : String(err) } };
    }
    if (!last.error) return last;
    if (!isTransientDbError(last.error)) return last;
    if (i < attempts - 1) {
      logger(`[db-retry] ${label}: ${last.error.message} — reintento ${i + 2}/${attempts}`);
    }
  }

  return last;
}
