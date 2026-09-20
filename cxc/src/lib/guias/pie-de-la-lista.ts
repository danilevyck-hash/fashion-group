// ─────────────────────────────────────────────────────────────────────────────
// EL PIE DE LA LISTA DE GUÍAS — CUÁNTAS SE VEN, DE CUÁNTAS (19-sep-2026).
//
// 🩸 Decía «236 GUÍAS» al pie de una pantalla donde se estaban viendo 47: la
// lista abre con el último mes y el resto espera detrás de «Ver guías más
// viejas», así que el número del pie no era el de lo que había delante. Daniel
// aprobó que diga **«47 guías de 236»**.
//
// 🔴 Con todo a la vista vuelve a ser UN número («236 guías»): el «de N» solo
// aparece cuando de verdad hay algo escondido, para no gastar palabras cuando
// no hay nada que aclarar.
//
// ⚠️ El total de BULTOS del pie no lo toca esta función y no cambió: sigue
// contando todas las filtradas, como hasta hoy.
//
// Módulo PURO: dos números entran, un texto sale.
// ─────────────────────────────────────────────────────────────────────────────

const plural = (n: number): string => `${n} ${n === 1 ? "guía" : "guías"}`;

/**
 * `mostradas` = las que están dibujadas en la pantalla ahora mismo.
 * `total` = todas las guías vivas, antes de cualquier filtro o ventana.
 */
export function textoPieDeLista(mostradas: number, total: number): string {
  if (mostradas >= total) return plural(total);
  return `${plural(mostradas)} de ${total}`;
}
