// El número rojo del ícono de la app (27-nov-2026, `MANTENER_PRESIONADO_2026_11`).
// Solo bodega: lo decide `GET /api/guias/pedidos/globito` (a otro rol le
// contesta `null`). Sin soporte en el aparato no pasa nada; con 0 se borra.

export const RUTA_GLOBITO = "/api/guias/pedidos/globito";

type ConGlobito = { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };

/** Pone el número (o lo borra con 0). `null` = este rol no lleva número: no se toca. */
export function ponerGlobito(n: number | null | undefined, nav: ConGlobito | undefined = typeof navigator === "undefined" ? undefined : (navigator as ConGlobito)): void {
  if (n == null || !nav) return;
  try {
    const p = n > 0 ? nav.setAppBadge?.(n) : nav.clearAppBadge?.();
    p?.catch?.(() => undefined);
  } catch {
    /* el aparato no lo soporta */
  }
}

/** Pregunta al servidor y pone el número. Falla en silencio. */
export async function actualizarGlobito(): Promise<void> {
  try {
    const r = await fetch(RUTA_GLOBITO, { cache: "no-store" });
    if (!r.ok) return;
    const d = (await r.json()) as { pendientes?: number | null };
    ponerGlobito(d.pendientes ?? null);
  } catch {
    /* sin red: se queda el número de antes */
  }
}
