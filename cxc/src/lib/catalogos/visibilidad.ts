// ─────────────────────────────────────────────────────────────────────────────
// Regla ÚNICA de visibilidad de producto en los catálogos Reebok/Joybees.
// La usan el motor de sync (sync-catalogo.ts) y el toggle manual del admin
// (PATCH /api/catalogo/reebok|joybees/products) para que NUNCA diverjan:
//
//   1. `oculto_manual` = true  → SIEMPRE oculto (gana sobre todo lo demás).
//      Es el toggle "Ocultar del catálogo" del admin — sobrevive al sync
//      porque el motor evalúa esta misma función en cada corrida.
//   2. keep_visible / badge "proximamente" → visible aunque existencia = 0.
//   3. Si no, visible solo con existencia (saldo físico) >= 1.
//
// Módulo puro (sin imports) — testeable sin supabase.
// ─────────────────────────────────────────────────────────────────────────────

export interface VisibilidadInput {
  /** Saldo físico (existencia) en Switch. */
  existencia: number;
  /** products.keep_visible — fuerza visible aunque no haya existencia. */
  keepVisible?: boolean | null;
  /** products.badge — "proximamente" fuerza visible (regla histórica del sync). */
  badge?: string | null;
  /** products.oculto_manual — toggle del admin; true = oculto SIEMPRE. */
  ocultoManual?: boolean | null;
}

export function esVisibleEnCatalogo(v: VisibilidadInput): boolean {
  if (v.ocultoManual === true) return false;
  if (v.keepVisible === true || v.badge === "proximamente") return true;
  return v.existencia >= 1;
}
