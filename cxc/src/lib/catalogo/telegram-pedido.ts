// ─────────────────────────────────────────────────────────────────────────────
// Textos de los avisos de Telegram cuando entra un pedido de catálogo.
//
// POR QUÉ EXISTE ESTE ARCHIVO
// Un pedido puede entrar por DOS caminos que NO son lo mismo para el negocio, y
// hasta ahora el aviso no los distinguía:
//
//   1. DEL VENDEDOR (checkout con sesión, `POST /api/catalogo/[marca]/orders`):
//      Rey/Edwin lo arman con el cliente REAL y el vendedor REAL de Switch (el
//      del mapeo fg_user_switch_vendedor del usuario logueado). Es venta de una
//      persona y paga comisión.
//
//   2. DEL LINK público (el cliente lo arma solo y lo confirma desde
//      /pedido-<marca>/[short_id]): no hay sesión que aporte cliente ni
//      vendedor, así que entra a Switch con el cliente de mostrador/CONTADO y
//      el vendedor "DEFAULT" de la empresa — la casa, no una persona (ver
//      publico-switch-actor.ts). NO genera comisión para nadie.
//
// Quien lee estos avisos en Telegram no es técnico: el mensaje arranca con el
// origen en mayúsculas para que se distinga de un vistazo, y el resto son datos
// en español simple. Texto PLANO (sendTelegramAlert va sin parse_mode).
//
// El origen no se adivina: cada camino tiene su builder y es el propio endpoint
// el que llama al suyo. En la DB queda el espejo del mismo dato —
// `<marca>_orders.origen_original` vale 'mio' para el camino 1 (default de la
// RPC de creación) y 'link' para el 2 (lo escribe la RPC de conversión).
// Verificado en producción el 26-jul-2026: reebok_orders 19 'mio' / 2 'link',
// joybees_orders 3 / 2, tommy_orders 0 / 1, y los 'link' son exactamente los
// que traen origen_short_id y vendor_name NULL.
// ─────────────────────────────────────────────────────────────────────────────

import { fmtPrecio } from "@/lib/catalogo/precio";

/** Monto en el formato de los catálogos: $1,234 / $37.50 (sin `.00`). */
export function money(n: number): string {
  return fmtPrecio(Number(n));
}

const nombreODefecto = (v: string | null | undefined, fallback: string) => {
  const s = (v ?? "").trim();
  return s.length > 0 ? s : fallback;
};

/** Lo que Daniel pidió ver de un vistazo: cuánto es y de qué tamaño. */
export interface ResumenAviso {
  /** Productos distintos. En el negocio se les dice "referencias". */
  referencias: number;
  /** Piezas TOTALES — no bultos. Es lo que se despacha y lo que factura Switch. */
  piezas: number;
}

/**
 * "3 referencias · 36 piezas". Pedido de Daniel (6-ago-2026): *"quiero que me
 * diga a quien se le vendio, cuantas referencias, piezas totales y monto
 * total"*. El cliente y el monto ya estaban; faltaban estas dos.
 *
 * Se OMITE si no hay resumen, en vez de escribir "0 referencias · 0 piezas":
 * un cero inventado en un aviso de plata se lee como un pedido vacío. Los
 * números salen de `resumirPedido` (lineas-pedido.ts), el único lugar del
 * sistema que multiplica bultos por piezas.
 */
function lineaTamano(r?: ResumenAviso): string[] {
  if (!r || (r.referencias <= 0 && r.piezas <= 0)) return [];
  const ref = `${r.referencias} referencia${r.referencias === 1 ? "" : "s"}`;
  const pzs = `${r.piezas} pieza${r.piezas === 1 ? "" : "s"}`;
  return [`${ref} · ${pzs}`];
}

export interface AvisoPedidoVendedor {
  /** Emoji de la marca (cfg.telegramEmoji). */
  emoji: string;
  /** Nombre de la marca (cfg.label). */
  label: string;
  /** Vendedor que lo armó (vendor_name del pedido; puede venir vacío). */
  vendedor?: string | null;
  cliente?: string | null;
  total: number;
  numero: string;
  /** Ausente en pedidos viejos o si no se pudo resolver: la línea se omite. */
  resumen?: ResumenAviso;
}

/**
 * Pedido que metió un VENDEDOR desde el checkout con sesión. Lleva cliente y
 * vendedor reales, así que el vendedor se nombra: es de quien es la venta.
 */
export function avisoPedidoDeVendedor(a: AvisoPedidoVendedor): string {
  const vendedor = nombreODefecto(a.vendedor, "sin nombre");
  const cliente = nombreODefecto(a.cliente, "Sin nombre");
  return [
    `${a.emoji} ${a.label} — pedido DEL VENDEDOR`,
    `Vendedor: ${vendedor} · Cliente: ${cliente}`,
    ...lineaTamano(a.resumen),
    `${money(a.total)} · ${a.numero}`,
  ].join("\n");
}

export interface AvisoPedidoLink {
  label: string;
  cliente?: string | null;
  total: number;
  numero: string;
  resumen?: ResumenAviso;
}

/**
 * Pedido que el CLIENTE armó y confirmó solo desde el link público. Se dice
 * explícitamente cómo entra a Switch (contado, sin vendedor real) porque es la
 * diferencia que le importa a quien lee: nadie cobra comisión por este.
 */
export function avisoPedidoDelLink(a: AvisoPedidoLink): string {
  const cliente = nombreODefecto(a.cliente, "Sin nombre");
  return [
    `✅ ${a.label} — pedido DEL LINK, lo confirmó el cliente`,
    `Cliente: ${cliente}`,
    ...lineaTamano(a.resumen),
    `${money(a.total)} · ${a.numero}`,
    `Entra a Switch como Contado y sin vendedor — no paga comisión.`,
  ].join("\n");
}
