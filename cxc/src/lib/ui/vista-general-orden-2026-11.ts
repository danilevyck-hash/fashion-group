// ─────────────────────────────────────────────────────────────────────────────
// VISTA GENERAL › EL ORDEN DE LAS TARJETAS (28-nov-2026, Daniel: «Si»).
//   Ventas → Utilidad → Por cobrar → Por pagar → Inventario → Vendido por tipo
//   → Pedidos por despachar. Si Pedidos tiene el punto ámbar (un pedido con más
//   de `DIAS_PEDIDO_ATRASADO` días), sube ARRIBA de Ventas.
//   «Disponibilidad — No disponible por ahora» deja de dibujarse.
// `false` = el orden de antes, con Disponibilidad.
// ─────────────────────────────────────────────────────────────────────────────
export const VG_ORDEN_TARJETAS_2026_11 = true;

/** El orden de las tarjetas; `null` = esa tarjeta no va (la empresa no lo maneja). */
export const ORDEN_TARJETAS = ["ventas", "utilidad", "cxc", "cxp", "inventario", "tipo", "pedidos"] as const;
export type TarjetaVG = (typeof ORDEN_TARJETAS)[number];

export function ordenTarjetas<T>(t: Record<TarjetaVG, T | null>): T[] {
  return ORDEN_TARJETAS.map((k) => t[k]).filter((x): x is T => x != null);
}
