// ─────────────────────────────────────────────────────────────────────────────
// LA VENTANA DE LA LISTA DE COMPROBANTES — los últimos 90 días, y el resto
// detrás de «Ver más».
//
// Daniel preguntó si convenía borrar los pedidos viejos: *«si un pedido se
// mandó a switch, ya está safe, no?»*. La respuesta fue NO, y por dos razones
// medidas (ver `docs/postmortems/catalogos-pedidos.md`):
//
//   1. El pedido guarda lo que Switch NO tiene: quién lo armó, el comentario,
//      si salió como pedido o como cotización, y el PDF que se le mandó al
//      cliente. Switch guarda el documento, no cómo se llegó a él.
//   2. Son POCOS. En todo 2026: 23 Reebok · 38 Tommy · 21 Calvin · 41 Joybees.
//      No hay un problema de volumen que resolver borrando.
//
// Lo que sí pesa es la LISTA: una pantalla que arranca con el año entero pide
// buscar antes de ver. Así que no se borra nada — se muestra menos, y lo demás
// queda a un toque.
//
// 🔴 EL CORTE ES POR FECHA, NO POR CANTIDAD. «Los últimos 90 días» es una
// pregunta que la persona puede contestar sin contar («¿esto es de este
// trimestre?»); «los últimos 20» no lo es, y además cambia de significado según
// cuánto se vendió.
//
// Módulo PURO: recibe el ahora por parámetro. Nada de `new Date()` adentro —
// un candado con fecha fija no podría medirlo.
// ─────────────────────────────────────────────────────────────────────────────

/** Cuántos días muestra la lista antes del «Ver más». */
export const DIAS_VENTANA_COMPROBANTES = 90;

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** Lo mínimo que la ventana necesita saber de una fila. */
export interface FilaConFecha {
  created_at: string;
}

/**
 * Parte la lista en lo que se muestra y lo que espera detrás de «Ver más».
 *
 * Una fecha que no se puede leer cae en `recientes`: esconder un comprobante
 * por un dato roto sería peor que mostrarlo de más.
 */
export function partirPorVentana<T extends FilaConFecha>(
  filas: readonly T[],
  ahora: Date,
  dias: number = DIAS_VENTANA_COMPROBANTES,
): { recientes: T[]; viejos: T[] } {
  const corte = ahora.getTime() - dias * MS_POR_DIA;
  const recientes: T[] = [];
  const viejos: T[] = [];
  for (const f of filas) {
    const t = new Date(f.created_at).getTime();
    if (Number.isNaN(t) || t >= corte) recientes.push(f);
    else viejos.push(f);
  }
  return { recientes, viejos };
}
