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

// ─── El guard del costo DIARIO se MUDÓ a monto-guard.ts (30-jul-2026) ────────
//
// Vivía acá y cubría UNA tabla (`switch_costo_diario`) y UNA columna (el costo,
// dejando pasar la venta del mismo día sin mirarla). Al extender el guard a las
// otras 6 tablas de plata, la regla —umbral relativo, anti-envenenamiento,
// anti-loop del aviso— pasó a ser UNA sola, compartida:
//
//     src/lib/switch-api/monto-guard.ts     ← la matemática (módulo puro)
//     src/lib/switch-api/monto-guard-io.ts  ← la calibración y el aviso
//
// No quedó copia acá a propósito: dos implementaciones de la misma regla es una
// que se corrige y otra que sigue mintiendo. El candado
// `src/__tests__/lib/monto-guard-candado.test.ts` pone el build en rojo si
// alguien la vuelve a escribir a mano en cualquier archivo.
//
// Lo que SÍ se queda acá es `esCostoSospechoso`, que es OTRA cosa y sigue viva:
// mira el costo UNITARIO de un artículo (un costo mal cargado en Switch, no una
// cifra imposible), guarda la fila con costo $0 en vez de rechazarla, y avisa
// por 📊 NEGOCIO. Los dos guards corren juntos en sync-articulos.
