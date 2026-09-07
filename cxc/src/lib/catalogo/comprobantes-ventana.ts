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

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EL PEDIDO DEL LINK QUE NADIE CONFIRMÓ SE VA A LOS 30 DÍAS (6-sep-2026)
//
// Medido contra producción el 7-sep-2026: **6 pedidos del link llevan meses sin
// confirmar** — $31.620,00 en total, entre 48 y 62 días:
//
//   reebok  js6qng2r · Daniel jesus Angulo range ·    $420,00 · 56 d
//   reebok  tpo0pa62 · Daniel jesus Angulo range ·  $5.892,00 · 56 d
//   reebok  1ba137bb · Daniel                     ·    $960,00 · 61 d
//   reebok  jvhc98nq · Daniel                     ·  $9.984,00 · 62 d
//   reebok  4gexexij · Daniel                     · $11.100,00 · 62 d
//   joybees w0k578p0 · CITY MALL PASO CANOAS      ·  $3.264,00 · 48 d
//
// Cinco son pruebas de Daniel; el de Joybees es real. A los 30 días sin
// confirmar salen de la lista y quedan detrás de «Ver más», **sin texto
// explicativo** — es el MISMO mecanismo de los 90 días, no otro: la misma
// función parte la lista y el mismo botón la trae de vuelta.
//
// 🔴 NO SE BORRA NADA. Es la misma decisión de arriba: un pedido guarda lo que
// Switch no tiene.
//
// ⚠️ El que el cliente SÍ confirmó se queda con los 90 días de siempre: ése es
// trabajo esperando, no un carrito abandonado.
// ─────────────────────────────────────────────────────────────────────────────

/** Cuántos días aguanta en la lista un pedido del link que nadie confirmó. */
export const DIAS_VENTANA_LINK_SIN_CONFIRMAR = 30;

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** Lo mínimo que la ventana necesita saber de una fila. */
export interface FilaConFecha {
  created_at: string;
  /** Tabla física. `publicos` = pedido del link que todavía nadie convirtió. */
  fuente?: "orders" | "publicos";
  /** Cuándo lo confirmó el CLIENTE desde el link. Null = quedó a medias. */
  confirmado_cliente_at?: string | null;
}

/**
 * Cuántos días le tocan a ESTA fila: 30 si es un pedido del link que nadie
 * confirmó ni convirtió, 90 para todo lo demás.
 *
 * Es una función y no un `if` adentro del recorrido para que se pueda medir
 * sola, fila por fila, sin armar una lista.
 */
export function diasDeVentana(f: FilaConFecha): number {
  const abandonadoDelLink = f.fuente === "publicos" && !f.confirmado_cliente_at;
  return abandonadoDelLink ? DIAS_VENTANA_LINK_SIN_CONFIRMAR : DIAS_VENTANA_COMPROBANTES;
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
  dias: number | ((f: T) => number) = diasDeVentana,
): { recientes: T[]; viejos: T[] } {
  const diasDe = typeof dias === "number" ? () => dias : dias;
  const recientes: T[] = [];
  const viejos: T[] = [];
  for (const f of filas) {
    const t = new Date(f.created_at).getTime();
    const corte = ahora.getTime() - diasDe(f) * MS_POR_DIA;
    if (Number.isNaN(t) || t >= corte) recientes.push(f);
    else viejos.push(f);
  }
  return { recientes, viejos };
}
