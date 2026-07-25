// Fetch con reintento automático para lecturas de solo-lectura (GET).
//
// POR QUÉ EXISTE
// Las consultas pesadas del módulo Ventas (ventas_dashboard_summary,
// ventas_proyeccion_cierre_v6, multifashion_mensual_v7…) corren contra Postgres
// con la caché de buffers FRÍA la primera vez que se piden en un rato. Medido
// contra producción el 25-jul-2026: la PRIMERA corrida tarda ~9-11s y Postgres la
// mata con "canceling statement due to statement timeout"; las corridas siguientes,
// ya con la caché caliente, tardan 0.5-2.2s y salen bien.
//
// Es decir: el fallo es TRANSITORIO y se cura solo al segundo intento. Antes,
// ese primer fallo llegaba tal cual a la pantalla ("No se pudieron cargar los
// datos de resumen") y el usuario tenía que recargar a mano. Con este helper el
// reintento lo hace la app y el usuario no ve nada.
//
// QUÉ SE REINTENTA Y QUÉ NO
//   - 5xx, 408, 429 y fallos de red (fetch rechaza) → SÍ. Son transitorios.
//   - 4xx (401/403/404/400) → NO. Reintentar una sesión vencida o un permiso
//     denegado solo multiplica ruido; el error es definitivo y debe verse ya.
//     (Misma regla que la política anti-ruido de alertas 401 del repo.)
//   - AbortError → NO. El caller canceló a propósito.

/** Error HTTP con el status, para que el caller distinga 401 de 500. */
export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message?: string) {
    super(message ?? `HTTP ${status}`);
    this.name = "HttpError";
    this.status = status;
  }
}

/** Un status es reintentable si el servidor puede responder distinto al repetir. */
export function isRetryableStatus(status: number): boolean {
  return status >= 500 || status === 408 || status === 429;
}

export interface FetchRetryOptions {
  /** Intentos TOTALES (no reintentos extra). Default 3. */
  attempts?: number;
  /** Espera base entre intentos en ms. Backoff lineal: 0, base, base×2. Default 400. */
  baseDelayMs?: number;
  signal?: AbortSignal;
  /** Inyectable para tests. Default: el fetch global. */
  fetchImpl?: typeof fetch;
  /** Inyectable para tests. Default: setTimeout. */
  sleepImpl?: (ms: number) => Promise<void>;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isAbort(err: unknown): boolean {
  return (err as { name?: string } | null)?.name === "AbortError";
}

/**
 * GET + JSON con reintento automático ante fallos transitorios.
 * Lanza el último error si se agotan los intentos.
 */
export async function fetchJsonWithRetry<T>(
  url: string,
  options: FetchRetryOptions = {},
): Promise<T> {
  const {
    attempts = 3,
    baseDelayMs = 400,
    signal,
    fetchImpl = fetch,
    sleepImpl = defaultSleep,
  } = options;

  let lastError: unknown = new Error("sin intentos");

  for (let i = 0; i < attempts; i++) {
    // Backoff corto ANTES de cada reintento (el primer intento sale de una).
    if (i > 0) await sleepImpl(baseDelayMs * i);

    try {
      const res = await fetchImpl(url, { cache: "no-store", signal });
      if (res.ok) return (await res.json()) as T;

      const err = new HttpError(res.status);
      // 4xx definitivo: cortar de inmediato, no gastar reintentos.
      if (!isRetryableStatus(res.status)) throw err;
      lastError = err;
    } catch (err) {
      if (isAbort(err)) throw err;
      if (err instanceof HttpError && !isRetryableStatus(err.status)) throw err;
      lastError = err;
    }
  }

  throw lastError;
}

/** Mensaje corto y humano a partir de lo que haya fallado. */
export function describeFetchError(err: unknown): string {
  if (err instanceof HttpError) return `HTTP ${err.status}`;
  if (err instanceof Error) return err.message;
  return "error inesperado";
}
