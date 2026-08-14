// ─────────────────────────────────────────────────────────────────────────────
// ¿EL PEDIDO TIENE UN CLIENTE QUE ALGUIEN ELIGIÓ A PROPÓSITO?
//
// 🩸 EL AGUJERO, MEDIDO CONTRA PRODUCCIÓN (14-ago-2026).
// `CheckoutClient` arrancaba con `Contado` PUESTO y el botón "Enviar a Switch"
// no exigía tocar nada: se armaba el pedido, se apretaba, y salía a nombre de
// Contado sin que nadie lo notara. Medido sobre las 4 marcas:
// **18 de 33 pedidos vivos (55%) sin cliente real, 15 ya confirmados y en
// Switch por $53.124**, ocho de ellos de $1.000 o más (TOM-002 $16.920 ·
// TOM-017 $16.722 · TOM-003 $7.254 · PED-017 $2.760 · PED-006 $2.100 ·
// CKP-005 $1.704 · TOM-001 $1.584 · PED-015 $1.560). **Ninguno era venta de
// mostrador**, y va contra la regla dura: el cliente SIEMPRE amarrado a
// `clientes_master`/Switch, nunca por descarte.
//
// Lo aprobado por Daniel, textual: *"Que arranque vacío y el botón apagado
// hasta elegir cliente."*
//
// 🔴 CONTADO NO DESAPARECE. Sigue siendo una opción, y una opción legítima —
// la venta de mostrador existe. Lo único que cambia es que hay que TOCARLA.
//
// ⚠️ LA EXCEPCIÓN REAL: EL LINK PÚBLICO. En un pedido que entra por el link
// compartible no hay sesión que aporte cliente: la persona escribe su nombre a
// mano y el sistema le asigna el cliente de mostrador de la empresa
// (`publico-switch-actor`, código TCKCTA). Eso NO es un olvido, es la regla del
// sistema — medido: PED-022 vive con `client_name = "Nathalie"` y
// `cliente_switch_id = 1`. Ahí el texto libre se queda y el envío no se traba.
//
// Este módulo es PURO y es la ÚNICA definición de la regla: la usan el checkout
// del catálogo y el detalle del pedido. Dos copias del mismo `if` se separan
// solas, y el modo de fallo de que se separen es un pedido saliendo a Switch a
// nombre de nadie.
// ─────────────────────────────────────────────────────────────────────────────

/** Lo mínimo que hay que saber de un pedido para contestar las dos preguntas. */
export interface PedidoParaCliente {
  /** `<marca>_orders.cliente_switch_id` — null = nadie eligió. */
  cliente_switch_id?: number | null;
  /** 'mio' | 'link' (solo Reebok lo trae en el select base). */
  origen_original?: string | null;
  /** Traza al pedido del link. Lo devuelve el GET en las 4 marcas. */
  origen_short_id?: string | null;
}

/**
 * ¿Vino por el link público? Se pregunta por LOS DOS campos a propósito:
 * `origen_original` solo viaja en el select base de Reebok, mientras que
 * `origen_short_id` lo devuelve el GET de las 4 marcas (lo necesita la foto de
 * stock). Mirar uno solo dejaría a 3 marcas leyendo un pedido del link como si
 * fuera interno — y cerrándole el campo de nombre que la persona escribió.
 */
export function esPedidoDelLink(p: PedidoParaCliente | null | undefined): boolean {
  if (!p) return false;
  if (p.origen_original === "link") return true;
  return typeof p.origen_short_id === "string" && p.origen_short_id.trim().length > 0;
}

/**
 * ¿Hay un cliente elegido a propósito?
 *
 * · Pedido del LINK → **sí**, siempre: su cliente de mostrador lo pone el
 *   sistema por regla, no por descarte, y el nombre a mano queda en
 *   `client_name`. Bloquearlo dejaría los pedidos del link sin poder salir.
 * · Pedido INTERNO → solo si tiene `cliente_switch_id`. `null` significa
 *   exactamente "nadie lo eligió": desde este cambio, tocar
 *   "Contado (venta de mostrador)" guarda el id REAL del cliente de mostrador
 *   de la empresa, así que ya no hay forma de que una elección deliberada se
 *   vea igual que un olvido.
 */
export function tieneClienteElegido(p: PedidoParaCliente | null | undefined): boolean {
  if (!p) return false;
  if (esPedidoDelLink(p)) return true;
  const id = p.cliente_switch_id;
  return typeof id === "number" && Number.isInteger(id) && id > 0;
}

/** Estado del checkout del catálogo, para saber qué le falta. */
export interface EstadoCheckout {
  /** `undefined` = todavía no eligió. Es el punto de partida. */
  clienteElegido: boolean;
  /** `undefined` mientras carga; `null` = no hay ninguno puesto. */
  vendedorElegido: boolean;
  hayItems: boolean;
  preordersEnCarrito: number;
}

/**
 * Qué falta para poder mandar el pedido a Switch, en el orden en que se lee la
 * pantalla. Lista vacía = se puede.
 *
 * Es el mismo patrón que `faltaParaDespachar` de Guías: el botón se apaga Y
 * dice qué falta. Un botón que se puede tocar y contesta con un toast obliga a
 * tocarlo una vez por cada cosa que falta.
 */
export function faltaParaEnviar(e: EstadoCheckout): string[] {
  const falta: string[] = [];
  if (!e.hayItems) falta.push("agregar productos");
  if (!e.clienteElegido) falta.push("elegir el cliente");
  if (!e.vendedorElegido) falta.push("elegir el vendedor");
  if (e.preordersEnCarrito > 0) falta.push("quitar los productos en preventa");
  return falta;
}

/** "Falta: elegir el cliente y elegir el vendedor". Sin faltantes, "". */
export function textoFaltaEnviar(faltantes: readonly string[]): string {
  if (faltantes.length === 0) return "";
  if (faltantes.length === 1) return `Falta: ${faltantes[0]}`;
  const previos = faltantes.slice(0, -1).join(", ");
  return `Falta: ${previos} y ${faltantes[faltantes.length - 1]}`;
}

/**
 * Lo que se muestra donde va el cliente cuando todavía no se eligió ninguno.
 * NO dice "Contado": decirlo sería volver a poner el default silencioso, esta
 * vez de mentira.
 */
export const SIN_CLIENTE_ELEGIDO = "Elige el cliente";

/**
 * Etiqueta VISIBLE de la venta de mostrador. Dice "venta de mostrador" con
 * todas las letras porque "Contado" a secas es lo que se leía como un valor
 * técnico de relleno y se aceptaba sin mirar.
 *
 * ⚠️ Es la etiqueta de PANTALLA. El nombre que se guarda en el pedido sigue
 * saliendo del directorio de Switch (o del literal histórico "Contado" en el
 * checkout) — cambiar lo que se ESCRIBE es otra cosa y no se tocó.
 */
export const LABEL_CONTADO = "Contado (venta de mostrador)";
