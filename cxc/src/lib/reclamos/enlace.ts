// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EL ENLACE QUE ABRE UN RECLAMO — UNO SOLO, Y LLEVA A DONDE DICE.
//
// 🩸 Vista General › «Reclamos sin pagar (+30 días)» enlazaba a `/reclamos?id=X`
// (medido el 6-sep-2026, `docs/mapas/rutas.md` › B-3). Reclamos solo abre el
// detalle cuando la dirección trae `view=detail`: tocar el reclamo te dejaba en
// el SELECTOR DE EMPRESAS, sin error y sin el reclamo. Es la misma familia de
// defectos que la búsqueda global cerró el 11-sep-2026 («cada resultado lleva a
// donde dice»), y este era el que faltaba.
//
// 🔑 Los TRES niveles de Reclamos viven en la dirección (`empresa` · `view` ·
// `id`) y el SSR trae el detalle, así que un enlace completo abre el reclamo
// aunque sea la primera pantalla de la sesión. La empresa se manda cuando se
// sabe: con ella el «Atrás» cae en la lista de ESA empresa y no en el selector.
//
// ⚠️ La empresa que llega de Vista General puede ser el guion (`—`) cuando la
// fila no la tiene: eso NO es una empresa y no se manda. Nada se adivina.
// ─────────────────────────────────────────────────────────────────────────────

/** Lo que el sistema escribe cuando un dato falta; nunca es una empresa. */
const SIN_DATO = "—";

/** La dirección que abre el detalle de un reclamo. */
export function enlaceDetalleReclamo(id: string, empresa?: string | null): string {
  const params = new URLSearchParams();
  const emp = (empresa ?? "").trim();
  if (emp && emp !== SIN_DATO) params.set("empresa", emp);
  params.set("view", "detail");
  params.set("id", id);
  return `/reclamos?${params.toString()}`;
}
