// Display label del transportista de una guía. La fuente de verdad es
// (modo_entrega, transportista_id). Sprint 3 (2026-05-26) eliminó el
// fallback a la columna `transportista` TEXT: las 94 filas históricas
// fueron backfilleadas en Sprint 1, las escrituras nuevas usan FK desde
// Sprint 2, y nada en código lee ya esa columna.

export interface TransportistaSource {
  modo_entrega?: string | null;
  transportista_id?: string | null;
  transportistas?:
    | { nombre: string | null }
    | { nombre: string | null }[]
    | null;
}

export function transportistaLabel(row: TransportistaSource): string {
  if (row.modo_entrega === "entrega_directa") return "Entrega directa";
  const joined = Array.isArray(row.transportistas)
    ? row.transportistas[0]
    : row.transportistas;
  return joined?.nombre || "";
}
