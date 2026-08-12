// MODO "AGREGANDO A ESTE PEDIDO" — el catálogo de la marca, con la barra que
// dice a qué pedido se está agregando y con cada "Agregar" escribiendo en ESE
// pedido (PATCH /orders/[id]/item) en vez de en el carrito.
//
// Daniel, 12-ago-2026, con la captura del buscador que había: *"¿POR QUÉ AL
// AGREGAR ME SALE ASÍ? en vez de mandarme al catálogo? es lo más natural, ¿no?"*.
// Tenía razón: para agregar productos se usa el catálogo —fotos grandes,
// filtros de género y categoría, precio, stock—, no una lista apretada de 60
// renglones con miniaturas.
//
// El modo viaja en la URL (`?agregarA=<id>`) y no en un estado de React: así
// sobrevive un refresh, se puede compartir y sale limpio (se va el parámetro,
// vuelve el catálogo de siempre). Módulo PURO: acá no se toca la red.

/** Parámetro de query que enciende el modo. */
export const PARAM_AGREGAR_A = "agregarA";

/**
 * Roles que pueden agregarle líneas a un pedido = los MISMOS que acepta
 * `PATCH /api/catalogo/[marca]/orders/[id]/item`. Si acá hubiera uno de más, la
 * pantalla ofrecería un botón que el server rechaza con 403; uno de menos y
 * alguien que sí puede editar el pedido no podría agregar desde el catálogo.
 * Candado estático en `catalogo-modo-pedido.test.ts`.
 */
export const ROLES_QUE_AGREGAN = ["admin", "secretaria", "vendedor"] as const;

export function puedeAgregarAlPedido(role: string | null | undefined): boolean {
  return !!role && (ROLES_QUE_AGREGAN as readonly string[]).includes(role);
}

/**
 * Lee el id del pedido del query. Dato NO confiable: se recorta y se acota el
 * largo (los ids son uuid o short ids, nunca un texto largo).
 */
export function idAgregarA(params: { get(key: string): string | null } | null | undefined): string | null {
  const raw = params?.get(PARAM_AGREGAR_A);
  if (!raw) return null;
  const id = raw.trim();
  if (!id || id.length > 64) return null;
  return id;
}

/** Catálogo de la marca en modo "agregando a este pedido". */
export function hrefCatalogoAgregando(catalogoHref: string, orderId: string): string {
  return `${catalogoHref}?${PARAM_AGREGAR_A}=${encodeURIComponent(orderId)}`;
}

/** Detalle del pedido (a donde vuelve "Listo, volver al pedido"). */
export function hrefPedidoDetalle(marca: string, orderId: string): string {
  return `/catalogo/${marca}/pedido/${orderId}`;
}

/**
 * Query del catálogo CONSERVANDO el modo. El grid reescribe la URL cada vez que
 * cambia un filtro; sin esto, tocar "Mujer" apagaba el modo y el "Agregar"
 * siguiente se iba al carrito — un pedido que se pierde sin que nadie se entere.
 */
export function querySinPerderModo(params: URLSearchParams, agregarA: string | null): string {
  if (agregarA) params.set(PARAM_AGREGAR_A, agregarA);
  return params.toString();
}

/** product_id → bultos que YA tiene el pedido. */
export function mapaEnPedido(
  items: { product_id: string; quantity?: number | null }[] | null | undefined,
): Map<string, number> {
  const m = new Map<string, number>();
  for (const i of items || []) {
    if (!i?.product_id) continue;
    m.set(i.product_id, Number(i.quantity) || 0);
  }
  return m;
}

/**
 * Texto de la barra: "TOM-010 · Aidy Shop No.2". Un pedido sin nombre de
 * cliente todavía dice a cuál se está agregando (el número), en vez de dejar un
 * separador colgando.
 */
export function tituloPedido(
  pedido: { order_number?: string | null; client_name?: string | null } | null | undefined,
): string {
  const numero = (pedido?.order_number || "").trim();
  const cliente = (pedido?.client_name || "").trim();
  if (numero && cliente) return `${numero} · ${cliente}`;
  return numero || cliente || "este pedido";
}

/** ¿El pedido está bloqueado por un envío ACTIVO a Switch? */
export function envioBloquea(estado: string | null | undefined): boolean {
  return estado === "enviado" || estado === "verificado";
}
