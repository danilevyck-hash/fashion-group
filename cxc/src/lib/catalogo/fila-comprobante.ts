// ─────────────────────────────────────────────────────────────────────────────
// 🔴 UNA SOLA PANTALLA DE COMPROBANTES, Y UN SOLO FEED (25-ago-2026)
//
// Daniel, textual: *"En pedidos de los catálogos. En administrar y pedidos
// debería ser la misma pestaña, no dos aparte."*
//
// Había DOS pantallas del MISMO dato, cada una con su endpoint:
//   · la del vendedor  — `/catalogo/<marca>/pedidos`      ← GET /orders
//   · la de administrar — `/catalogos/admin/<marca>?tab=pedidos` ← /pedidos-unificado
//
// 🩸 Y NO DECÍAN LO MISMO. Medido contra producción el 25-ago-2026, con cookies
// firmadas rol por rol y contra el build de producción:
//
//   · Reebok: la del vendedor listaba **27** y la de administrar **19**. Las 8
//     de más eran pedidos YA BORRADOS, y TRES seguían en Switch (PED-005,
//     PED-008, PED-009).
//   · Tommy: **5 pedidos con PLATA DISTINTA en cada pantalla**. TOM-024 $3.100
//     vs $3.324 · TOM-020 $10.408 vs $11.088 · TOM-018 · TOM-016 · TOM-001. El
//     DETALLE —la pantalla desde la que se manda a Switch— dice lo mismo que la
//     del vendedor en los 5. O sea que el que estaba mal era el ADMIN, y por
//     hasta $680 en un solo pedido: `/pedidos-unificado` no pasa las piezas por
//     bulto del ESTILO al calcular el total, y `/orders` sí.
//
// Por eso el feed que sobrevive es **`/orders`**: es el que cuadra con el
// detalle, y es el único que los TRES roles pueden pedir (admin, secretaria y
// vendedor). `/pedidos-unificado` es de admin+secretaria — mudarse a él habría
// obligado a abrirle un permiso al vendedor, que es justo lo que no se toca.
//
// Este módulo es la traducción de una fila de `/orders` a la fila que el panel
// pinta. Es PURO —no importa React ni Supabase— para que el mapeo se pueda
// medir campo por campo sin montar una pantalla.
// ─────────────────────────────────────────────────────────────────────────────

import type { DocumentoSwitch } from "./documento-switch";

/** La fila que el panel de Comprobantes pinta. Fuente única de su forma. */
export interface FilaComprobante {
  /** De dónde vino el pedido. Es el badge "Del link" / "Mío". */
  origen: "mio" | "link";
  /** El id con el que se abre/borra: uuid del interno, short_id del público. */
  id_natural: string;
  cliente: string;
  total: number;
  created_at: string;
  vendor: string | null;
  item_count: number;
  /** Tabla física: manda sobre el badge para enrutar el detalle y el borrado. */
  fuente: "orders" | "publicos";
  /** Cuándo confirmó el CLIENTE desde el link (el chulito del badge). */
  confirmado_cliente_at: string | null;
  /** `numero_interno` del envío ACTIVO en Switch. Null si nunca salió. */
  switch_numero: string | null;
  /** 🔴 ¿Tiene envío ACTIVO? Es lo que decide "está en Switch" — NO el número.
   *  Un envío activo sin número existe en el código (hoy 0 casos) y decir que
   *  no salió sería lo contrario de la verdad. */
  en_switch: boolean;
  /** El número de la casa: PED-017 · JBP-041 · TOM-026 · CKP-005. */
  numero_pedido: string | null;
  /** Qué se mandó: 'pedido' | 'cotizacion'. Null si no salió. */
  switch_documento: DocumentoSwitch | null;
  /** `status` de la tabla de orders. 🔴 Null en el pedido del link: no tiene fila ahí. */
  status: string | null;
}

/** Una fila cruda del GET /api/catalogo/<marca>/orders. */
export interface FilaDeOrders {
  id: string;
  order_number?: string | null;
  client_name?: string | null;
  vendor_name?: string | null;
  total?: number | null;
  item_count?: number | null;
  created_at: string;
  status?: string | null;
  fuente?: "orders" | "publicos";
  del_link?: boolean;
  switch_numero?: string | null;
  en_switch?: boolean;
  switch_documento?: DocumentoSwitch | string | null;
  confirmado_cliente_at?: string | null;
}

const DOCS: readonly string[] = ["pedido", "cotizacion"];

/**
 * Traduce una fila de `/orders` a la fila del panel.
 *
 * 🩸 `origen` sale de `del_link`, NO de la tabla física: un pedido del link que
 * alguien ya convirtió vive en `<marca>_orders` y tiene que SEGUIR mostrándose
 * como "Del link" — de ahí vino. La tabla física viaja aparte, en `fuente`, que
 * es la que decide a qué detalle se entra y qué ruta borra. Confundirlas es
 * exactamente el bug que el panel del admin ya pagó una vez.
 *
 * 🔴 `status` se copia TAL CUAL, incluido el null. Un null NO es un borrador:
 * el pedido del link todavía no tiene fila en la tabla de orders. Rellenarlo
 * con "borrador" mandaba las 6 filas del link al chip equivocado y el conteo
 * decía 12 donde hay 6.
 */
export function filaDeOrders(o: FilaDeOrders): FilaComprobante {
  const fuente: "orders" | "publicos" = o.fuente === "publicos" ? "publicos" : "orders";
  const doc = typeof o.switch_documento === "string" && DOCS.includes(o.switch_documento)
    ? (o.switch_documento as DocumentoSwitch)
    : null;
  return {
    origen: o.del_link === true || fuente === "publicos" ? "link" : "mio",
    id_natural: String(o.id),
    cliente: (o.client_name ?? "").trim() || "Sin nombre",
    total: Number(o.total) || 0,
    created_at: String(o.created_at),
    vendor: o.vendor_name ?? null,
    item_count: Number(o.item_count) || 0,
    fuente,
    confirmado_cliente_at: o.confirmado_cliente_at ?? null,
    switch_numero: o.switch_numero ?? null,
    en_switch: o.en_switch === true,
    numero_pedido: o.order_number ?? null,
    switch_documento: doc,
    status: o.status ?? null,
  };
}

/** Toda la lista, en el orden en que llegó (el feed ya viene por fecha desc). */
export function filasDeOrders(filas: FilaDeOrders[]): FilaComprobante[] {
  return filas.map(filaDeOrders);
}
