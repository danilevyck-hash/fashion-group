// Recovery una-sola-vez para errores de chunk tras un deploy (PWA simplificada).
//
// Escenario: la pestaña ejecuta el build viejo y pide un chunk/módulo de un
// buildId que Vercel ya purgó → 404 / "Loading chunk X failed". La cura es
// cargar el build nuevo: si hay un SW en waiting se activa (SKIP_WAITING →
// controllerchange → reload en SWUpdater); si no, reload directo.
//
// Guard anti-loop en sessionStorage: UNA recuperación por minuto. Si el error
// se repite dentro de la ventana, attemptChunkRecovery devuelve false y el
// error boundary normal se muestra (botón "Recargar" manual).

const RECOVERY_KEY = "fg_chunk_recovery";
const RECOVERY_WINDOW_MS = 60_000;

const CHUNK_ERROR_RE =
  /ChunkLoadError|Loading chunk [^\s]+ failed|failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;

/** true si el mensaje corresponde a un chunk/módulo dinámico que no cargó. */
export function isChunkError(message: string | null | undefined): boolean {
  return !!message && CHUNK_ERROR_RE.test(message);
}

/**
 * Intenta UNA recuperación automática. Devuelve true si la inició (la página
 * va a recargar), false si el guard la bloqueó (segunda vez en <1 min) — en
 * ese caso el caller debe mostrar el error visible.
 */
export function attemptChunkRecovery(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const last = Number(sessionStorage.getItem(RECOVERY_KEY) || 0);
    if (Date.now() - last < RECOVERY_WINDOW_MS) return false;
    sessionStorage.setItem(RECOVERY_KEY, String(Date.now()));
  } catch {
    // Sin sessionStorage no hay guard anti-loop → no auto-recuperar (el error
    // boundary manual es más seguro que un posible ciclo de reloads).
    return false;
  }

  // Si hay un SW nuevo en waiting, activarlo trae el build fresco; el reload
  // lo dispara SWUpdater al ver controllerchange. Si no, reload directo.
  void (async () => {
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg?.waiting) {
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
        return;
      }
    } catch {
      /* sin SW — caer al reload */
    }
    window.location.reload();
  })();
  return true;
}
