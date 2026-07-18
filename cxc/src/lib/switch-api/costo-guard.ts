// ─── Guard-rail de costos del sync de artículos (18-jul-2026) ────────────────
// Un decimal perdido al capturar el costo de un artículo en Switch (Boston,
// art. 0806: costo unitario 2,365,410 en vez de 2.36541 × 1,000 und) metió
// $2,365M de costo en un día y reventó el margen de Vista General (-567,838%).
// sync-articulos valida cada fila con esto antes del upsert: si el costo es
// absurdo, la fila se guarda con costo_total = 0 (venta/cantidad intactas) y
// se alerta a Telegram para corregirlo en Switch y relanzar el sync del día.
//
// Módulo puro (sin imports) para poder testearlo sin arrastrar supabase-server.

const COSTO_TOTAL_MAX = 500_000; // por artículo × día × tipo
const COSTO_UNITARIO_MAX = 5_000; // costo_total / cantidad_total

export function esCostoSospechoso(costoTotal: number, cantidadTotal: number): boolean {
  if (costoTotal > COSTO_TOTAL_MAX) return true;
  if (cantidadTotal > 0 && costoTotal / cantidadTotal > COSTO_UNITARIO_MAX) return true;
  return false;
}
