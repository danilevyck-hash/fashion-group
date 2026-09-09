// Los dos ladrillos más chicos del módulo: qué es una celda del Excel y cómo se
// normaliza para comparar. Viven aparte para que las reglas puras (talla.ts)
// puedan usarlas sin depender de `logic.ts`, que es el archivo grande.
//
// ⚠️ `logic.ts` los RE-EXPORTA: todo el sistema los sigue importando desde ahí y
// no cambió una sola línea de los llamadores.

/** Una celda cruda del Excel del proveedor. */
export type Cell = string | number | boolean | null | undefined;

/** Normalización para COMPARAR: recorta y sube a mayúsculas. La usan la
 *  detección de columnas y las reglas de talla. */
export const norm = (s: Cell): string =>
  (s === null || s === undefined) ? "" : String(s).trim().toUpperCase();
