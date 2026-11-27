// ─────────────────────────────────────────────────────────────────────────────
// Deslizar hacia abajo para actualizar (26-nov-2026). Daniel: «así como en el
// iPhone, si echas para abajo, refrescar la pantalla y actualizar con Switch».
//
// 🔴 El gesto NO tiene camino propio: ejecuta la MISMA función que el toque de
// «Actualizar» (`SyncNowButton` o la acción propia de `LineaDeFrescura`), con
// sus permisos, su pausa de Switch, sus avisos y su línea de frescura. Si la
// pantalla no tiene «Actualizar», recarga sus datos (lo que antes hacía
// `PullToRefresh`). Solo con el dedo: el mouse no dispara nada.
//
// `false` = lo de antes: cada `PullToRefresh` con su propio gesto, sin Switch.
// Candado `deslizar-para-actualizar.test.tsx`.
// ─────────────────────────────────────────────────────────────────────────────

export const DESLIZAR_ACTUALIZA_CON_SWITCH = true;

export interface AccionDelGesto {
  /** «actualizar» = el botón Actualizar (gana); «recarga» = solo los datos. */
  tipo: "actualizar" | "recarga";
  /** El elemento de la acción: solo cuenta si se ve (pestaña o forma oculta no). */
  el: () => Element | null;
  /** Corriendo o deshabilitado: el gesto no hace nada. */
  ocupado: () => boolean;
  ejecutar: () => void | Promise<void>;
}

const acciones = new Set<AccionDelGesto>();

export function registrarAccionDelGesto(a: AccionDelGesto): () => void {
  acciones.add(a);
  return () => {
    acciones.delete(a);
  };
}

function seVe(el: Element | null): el is Element {
  return !!el && el.isConnected && el.getClientRects().length > 0;
}

/** Lo que hace el gesto en esta pantalla: el primer «Actualizar» visible (en el
 *  orden de la página); si no hay, la primera recarga visible; si no, nada. */
export function accionDelGesto(): AccionDelGesto | null {
  const visibles = Array.from(acciones).filter((a) => seVe(a.el()));
  const enOrden = (lista: AccionDelGesto[]) =>
    lista.sort((x, y) =>
      (x.el() as Element).compareDocumentPosition(y.el() as Element) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
    )[0] ?? null;
  return enOrden(visibles.filter((a) => a.tipo === "actualizar")) ?? enOrden(visibles.filter((a) => a.tipo === "recarga"));
}

/** Umbral y resistencia, como en iOS: el dedo recorre más de lo que baja el ↻. */
export const UMBRAL_PX = 70;
export const TOPE_PX = 120;
export function distanciaConResistencia(dy: number): number {
  if (dy <= 0) return 0;
  // Lineal hasta el umbral, después cada vez más duro (nunca pasa el tope).
  const suave = dy * 0.5;
  if (suave <= UMBRAL_PX) return suave;
  const extra = suave - UMBRAL_PX;
  return Math.min(TOPE_PX, UMBRAL_PX + extra / (1 + extra / 60));
}
