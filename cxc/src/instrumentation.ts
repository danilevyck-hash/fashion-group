/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 AQUÍ ARRANCA SENTRY DEL LADO DEL SERVIDOR — Y SIN ESTE ARCHIVO NO ARRANCABA
 *
 * Qué hace: Next.js llama a `register()` una vez por cada arranque en frío del
 * servidor. Aquí adentro se carga la configuración de Sentry que corresponda al
 * motor que esté corriendo (`NEXT_RUNTIME`): `nodejs` para las rutas de API y
 * las pantallas del servidor, `edge` para el middleware.
 *
 * Por qué existe (14-sep-2026): desde la versión 8 del SDK, `@sentry/nextjs`
 * inicializa el servidor SOLO desde este archivo. Se comprobó leyendo el SDK
 * instalado (10.48.0): la única inyección automática que hace en el build es la
 * del NAVEGADOR (`addSentryToClientEntryProperty`). Para el servidor y el edge
 * no hay ninguna — el único camino es éste.
 *
 * 🩸 Qué pasaba sin él: `sentry.server.config.ts` y `sentry.edge.config.ts`
 * existían desde siempre y NADIE los importaba, así que `Sentry.init` nunca
 * corría fuera del navegador. En la práctica:
 *
 *   · Los errores de las rutas de API y de las pantallas del servidor NO
 *     llegaban a Sentry. El tablero mostraba menos errores de los que había.
 *   · Las tres llamadas de `src/middleware.ts` —`captureException` y los dos
 *     `captureMessage` de la validación de sesión, incluido el fail-closed de
 *     «Supabase env ausente»— eran gestos vacíos: sin `init`, el SDK las
 *     descarta sin avisar.
 *
 * El propio SDK lo venía gritando en CADA build, y el aviso se leía como un
 * consejo de estilo en vez de como lo que era:
 *   «It appears you've configured a `sentry.server.config.ts` file… To ensure
 *    correct functionality of the SDK, `Sentry.init` must be called inside of
 *    an instrumentation file.»
 *
 * ⚠️ Los dos archivos de configuración NO se mudaron aquí adentro a propósito,
 * aunque el aviso del SDK diga que se pueden borrar: `peso-muerto-js.test.ts`
 * los nombra por su ruta para exigir que nadie meta `replayIntegration` por el
 * costado. Se quedan donde están y este archivo les da, por fin, un lector.
 *
 * ⚠️ NO lleva `onRequestError` / `Sentry.captureRequestError`: ese enganche
 * pide Next.js 15 y aquí corre 14.2.3. El propio SDK solo lo reclama cuando la
 * versión mayor es 15 o más. Ponerlo hoy sería código que no engancha con nada.
 *
 * ⚠️ El `import` va DENTRO del `if`, nunca arriba del archivo: `register()` se
 * ejecuta en los dos motores, y el paquete de Node no carga en el edge.
 * ────────────────────────────────────────────────────────────────────────── */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}
