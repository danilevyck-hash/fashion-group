// Display label del transportista de una guía. La fuente de verdad pasó de la
// columna libre `transportista` TEXT a (modo_entrega, transportista_id) en
// Sprint 1 + 2. Esta función resuelve la cadena a mostrar contemplando 3
// escenarios:
//   - modo_entrega='entrega_directa'      → "Entrega directa"
//   - modo_entrega='transportista' + JOIN → transportistas.nombre canónico
//   - fallback edge-case                  → TEXT vieja (no debería pasar tras
//                                            backfill, pero protege filas
//                                            que por alguna razón no migraron)

export interface TransportistaSource {
  modo_entrega?: string | null;
  transportista_id?: string | null;
  transportistas?:
    | { nombre: string | null }
    | { nombre: string | null }[]
    | null;
  transportista?: string | null;
}

export function transportistaLabel(row: TransportistaSource): string {
  if (row.modo_entrega === "entrega_directa") return "Entrega directa";
  const joined = Array.isArray(row.transportistas)
    ? row.transportistas[0]
    : row.transportistas;
  if (joined?.nombre) return joined.nombre;
  return row.transportista || "";
}
