// ─────────────────────────────────────────────────────────────────────────────
// «SOLO PENDIENTES» SE VE Y SE PUEDE QUITAR (11-sep-2026).  Módulo PURO.
//
// 🩸 El rediseño del 5/6-sep se llevó el botón «Ver pendientes / Ver todas»,
// pero dejó vivos el estado, el filtro y el enlace: desde ⌘K → «guías
// pendientes» (⚡ «Ir a guías pendientes», `/guias?pendientes=1`) la lista
// quedaba en **1 de 229** sin un chip que lo dijera ni un botón que lo
// apagara, y recargar lo volvía a aplicar. La única salida era escribir
// `/guias` a mano.
//
// 🔴 EL FILTRO NO SE RETIRÓ: el enlace de la búsqueda global sigue siendo útil.
// Lo que faltaba era la puerta de vuelta — la regla de la casa: nada filtra la
// pantalla sin decirlo y sin poder apagarse.
//
// ⚠️ Al apagarlo se LIMPIA la dirección (`replace`, mismo nivel — no ensucia el
// Atrás): si el `?pendientes=1` se quedara, recargar volvería a filtrar y el
// chip volvería solo.
// ─────────────────────────────────────────────────────────────────────────────

/** El parámetro que enciende el filtro desde la búsqueda global. */
export const PARAM_PENDIENTES = "pendientes";

/** Lo que dice el chip mientras el filtro está puesto. */
export const CHIP_SOLO_PENDIENTES = "Solo pendientes";

/** ¿La dirección pide la lista filtrada? (`?pendientes=1`) */
export function pideSoloPendientes(query: string): boolean {
  return new URLSearchParams(query).get(PARAM_PENDIENTES) === "1";
}

/**
 * La dirección sin el filtro: `/guias?pendientes=1&q=x` → `/guias?q=x`, y
 * `/guias?pendientes=1` → `/guias` (sin el `?` pelado colgando).
 *
 * El resto de los parámetros NO se toca: la pestaña de Configuración
 * (`?vista=config`) y cualquier cosa que llegue por link siguen su camino.
 */
export function urlSinPendientes(pathname: string, query: string): string {
  const params = new URLSearchParams(query);
  params.delete(PARAM_PENDIENTES);
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
