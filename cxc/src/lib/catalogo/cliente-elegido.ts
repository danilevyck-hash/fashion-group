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
// 🔴 EL PEDIDO DEL LINK YA NO ES UNA EXCEPCIÓN (14-ago-2026, 2ª vuelta).
//
// Hasta hoy este módulo dejaba pasar SIEMPRE un pedido venido del link público,
// con el argumento de que ahí el mostrador es la regla del sistema y no un
// olvido. Daniel pidió lo contrario, textual: *"cuando alguien interno le llega
// el pedido por WhatsApp, pueda entrar al sistema interno, escoger, editar
// precio, agregar o quitar y ponerle el nombre del cliente **para así mandarlo
// a Switch**"*. O sea: el pedido del link también espera a que una persona le
// ponga el cliente REAL, y esa persona es quien lo manda.
//
// Medido en producción el 14-ago-2026 (`scripts/_diag-pedidos-link.ts`, solo
// lectura): de los pedidos del link, **PED-022 "Nathalie" es el único que llegó
// a Switch — automáticamente, a nombre del MOSTRADOR (cliente_switch_id=1
// "Contado") y en el mismo instante en que el cliente confirmó**. Y como salió
// a Switch, el candado de edición (`switch-lock`) lo dejó de solo lectura: lo
// que Daniel quiere hacer con él —cambiar precio, agregar líneas, ponerle el
// cliente— ya no se puede. Por eso el auto-envío de la confirmación pública se
// apagó (ver `pedido-publico/[id]/confirmar/route.ts`).
//
// ⚠️ LO QUE NO CAMBIÓ: `esPedidoDelLink` sigue existiendo y sigue decidiendo lo
// suyo — que el NOMBRE que escribió la persona a mano se conserva y se muestra
// tal cual, sin que el picker se lo pise (ver `asignarClienteSwitch` en
// PedidoDetalleClient). Ese nombre es lo único que dice quién pidió.
//
// ⚠️ Y "Contado (venta de mostrador)" SIGUE SIENDO ELEGIBLE. Lo que se prohíbe
// no es el mostrador: es que sea el default silencioso.
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
 * ¿Hay un cliente elegido a propósito? La MISMA pregunta para los dos orígenes:
 * solo si el pedido tiene `cliente_switch_id`.
 *
 * `null` significa exactamente "nadie lo eligió". Tocar
 * "Contado (venta de mostrador)" guarda el id REAL del cliente de mostrador de
 * la empresa, así que una elección deliberada NO se puede ver igual que un
 * olvido — y por eso el link tampoco necesita una excepción: si de verdad es
 * venta de mostrador, alguien toca el mostrador y listo.
 *
 * 🔴 NO se pregunta por el origen a propósito. Mientras el link pasaba siempre,
 * la única forma de que un pedido saliera con el mostrador puesto por el
 * sistema era la que ya está medida: PED-022 en Switch sin que nadie lo
 * decidiera (ver la cabecera).
 */
export function tieneClienteElegido(p: PedidoParaCliente | null | undefined): boolean {
  if (!p) return false;
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
