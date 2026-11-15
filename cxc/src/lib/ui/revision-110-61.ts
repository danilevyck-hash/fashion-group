// ─────────────────────────────────────────────────────────────────────────────
// Revisión 110 · 61 (14-nov-2026, aprobado por Daniel) — los bultos se anotan
// en el pedido y llegan solos a la etiqueta.
//
//   · Despachos › Pedidos: en Preparado (y en Recibido mientras no se facture)
//     «N bultos» se toca para cambiarlo, o «+ Bultos» si no tiene. Cambia SOLO
//     el número: estado, firma y hora quedan igual; el rastro (quién y cuándo)
//     va a `activity_logs`. Bodega y admin, y lo decide el SERVIDOR.
//   · Etiquetas: la nota gris dice «del pedido N.º 16-000002387». Si un pedido
//     se partiera en dos facturas, el campo queda vacío y la nota da el total.
//
// `false` = lo de antes. La lectura paginada de las unidades NO va detrás de
// este interruptor: es la corrección de un defecto (db-max-rows), no pantalla.
// ─────────────────────────────────────────────────────────────────────────────

import { validarCantidadBultos } from "@/lib/guias/pedidos-flujo-simple";

export const BULTOS_EN_EL_PEDIDO = true;

/** Quién cambia el número de bultos de un pedido ya preparado. */
export const ROLES_CAMBIAR_BULTOS = ["admin", "bodega"] as const;

export type VeredictoBultos = { ok: true; bultos: number } | { ok: false; status: 400 | 403 | 409; error: string };

/**
 * La regla entera, pura, para que la pantalla y el servidor digan lo mismo:
 * rol → número → estado. Recibido solo mientras el pedido no tenga factura.
 */
export function puedeCambiarBultos(
  rol: string,
  estado: string | null | undefined,
  facturado: boolean,
  bultos: unknown,
): VeredictoBultos {
  if (!(ROLES_CAMBIAR_BULTOS as readonly string[]).includes(rol)) {
    return { ok: false, status: 403, error: "Solo bodega cambia los bultos" };
  }
  const v = validarCantidadBultos(bultos);
  if (!v.ok) return { ok: false, status: 400, error: v.error ?? "Escribe cuántos bultos son, de 1 a 9999" };
  if (estado !== "preparado" && estado !== "recibido") {
    return { ok: false, status: 409, error: "Los bultos se cambian en un pedido Preparado o Recibido" };
  }
  if (estado === "recibido" && facturado) {
    return { ok: false, status: 409, error: "El pedido ya está facturado: los bultos no se cambian" };
  }
  return { ok: true, bultos: v.valor! };
}

/** Lo ÚNICO que se escribe: el número. Ni estado, ni firma, ni hora. */
export function columnasSoloBultos(bultos: number): { bultos: number } {
  return { bultos };
}

/** El N.° del pedido como lo escribe Switch en la factura: 2387 → «16-000002387». */
export function referenciaDePedido(id: number): string {
  return `16-${String(id).padStart(9, "0")}`;
}

/**
 * La nota gris de Etiquetas. Un pedido en UNA factura: «del pedido N.º …» y el
 * número va puesto. En varias (0 casos el 14-nov-2026): el campo vacío y la
 * nota da el total, para no contar los bultos dos veces.
 */
export function notaBultosDelPedido(
  referencia: string,
  bultos: number,
  facturasDelPedido: number,
): { nota: string; ponerEnElCampo: boolean } {
  if (facturasDelPedido > 1) {
    const b = bultos === 1 ? "bulto" : "bultos";
    return { nota: `El pedido N.º ${referencia} lleva ${bultos} ${b} en total, en ${facturasDelPedido} facturas`, ponerEnElCampo: false };
  }
  return { nota: `del pedido N.º ${referencia}`, ponerEnElCampo: true };
}
