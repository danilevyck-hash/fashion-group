// ─────────────────────────────────────────────────────────────────────────────
// LOS DOS NÚMEROS DE UN PEDIDO — el de la casa y el del ERP (24-ago-2026)
//
// La lista de "Administrar catálogo › Pedidos" mostraba cliente, total y fecha,
// y NINGÚN número. Para cruzar un pedido contra Switch había que abrirlos de a
// uno. Un pedido tiene DOS números y ninguno reemplaza al otro:
//
//   · el de la casa  — `order_number` (PED-017 · JBP-041 · TOM-026 · CKP-005),
//     lo pone el sistema al crearlo. Medido contra producción el 24-ago-2026:
//     42 de 42 pedidos internos vivos lo tienen (100%), o sea que está SIEMPRE.
//   · el de Switch   — `numero_interno` del envío ACTIVO (16-000000503). Medido:
//     38 de 42 (90,5%). Los otros 4 todavía no salieron.
//
// 🔴 UN PEDIDO QUE NO FUE A SWITCH NO DICE «—». Un guion en la columna de un
// número se lee como un cero, o como un dato que no cargó. Dice lo que es: «No
// se ha mandado a Switch». Lo mismo el pedido del LINK sin convertir, que NO
// tiene número de la casa porque se lo asigna la conversión: dice «Se numera al
// abrirlo», no un blanco.
//
// 🔴 EL NÚMERO DE SWITCH SOLO NO ALCANZA, Y ES LO QUE ESTE MÓDULO EXISTE PARA
// IMPEDIR. Desde el 24-ago-2026 un envío puede ser un PEDIDO o una COTIZACIÓN
// (ver `documento-switch.ts`), y **una cotización NO aparta mercancía**. Pintar
// «Switch: 16-000000503» a secas hace que las dos se vean iguales en la lista, y
// quien lo lea va a creer que la mercancía está apartada cuando no lo está. Por
// eso el texto SIEMPRE nombra cuál de las dos es. Medido el 24-ago-2026: los 38
// envíos activos de las 4 marcas son `documento='pedido'` — la primera
// cotización todavía no existe, y justamente por eso el rótulo tiene que estar
// puesto ANTES de que aparezca.
//
// Módulo PURO: no importa React ni Supabase. Lo usan la lista del admin y sus
// candados. Los textos viven acá y no sueltos en la pantalla — la marca es una
// sola pieza para Reebok · Joybees · Tommy · Calvin, y una copia que quede vieja
// es la que le miente a alguien sobre si tiene la mercancía apartada.
// ─────────────────────────────────────────────────────────────────────────────

import { etiquetaDocumento, normalizarDocumento, type DocumentoSwitch } from "./documento-switch";

/** Tabla física de la que salió la fila. `publicos` = pedido del link sin convertir. */
export type FuentePedido = "orders" | "publicos";

export interface NumerosDePedido {
  /** `order_number` del pedido interno. Null en un pedido del link sin convertir. */
  numeroPedido?: string | null;
  /** `numero_interno` del envío ACTIVO en Switch. Null si nunca salió. */
  switchNumero?: string | null;
  /** Qué se mandó. Null/ausente ⇒ se asume PEDIDO, igual que la columna `documento`. */
  switchDocumento?: DocumentoSwitch | string | null;
  /**
   * `status` de la tabla de orders: 'borrador' | 'confirmado'. Null/ausente en
   * el pedido del LINK sin convertir, que todavía no tiene fila en orders.
   * 🔴 NO es lo mismo que "no salió a Switch" — ver `esBorrador`.
   */
  status?: string | null;
  fuente?: FuentePedido;
}

/**
 * ⚠️ El `"?"` es HERENCIA de `pedidos-unificado`, que lo inventa cuando un envío
 * activo no trae ni `numero_interno` ni `pedido_switch_id`. Hoy eso NO pasa (0
 * casos en las 4 marcas), pero un signo de pregunta pintado donde va un número
 * es exactamente el vacío que parece un dato. Se trata como "está en Switch pero
 * sin número" y se dice con esas palabras.
 */
const SIN_NUMERO_REAL = (n: string | null | undefined): boolean => !n || n.trim() === "" || n.trim() === "?";

/** ¿Este pedido salió a Switch? Es tener envío activo, no tener número. */
export function estaEnSwitch(p: NumerosDePedido): boolean {
  return p.switchNumero !== null && p.switchNumero !== undefined;
}

/** El pedido tiene número propio (siempre, salvo el del link sin convertir). */
export function tieneNumeroPropio(p: NumerosDePedido): boolean {
  return !!(p.numeroPedido && p.numeroPedido.trim());
}

/** «Se numera al abrirlo» — el pedido del link recibe su PED-XXX al convertirse. */
export const TEXTO_SIN_NUMERO_DEL_LINK = "Se numera al abrirlo";

/** Un interno sin número: no debería existir, y si existe se dice, no se tapa. */
export const TEXTO_SIN_NUMERO = "Sin número";

/** 🔴 La frase que reemplaza al guion. Dice lo que pasa, no un vacío. */
export const TEXTO_NO_ENVIADO = "No se ha mandado a Switch";

/** El número de la casa, o la razón por la que no hay. */
export function textoNumeroPedido(p: NumerosDePedido): string {
  if (tieneNumeroPropio(p)) return p.numeroPedido!.trim();
  return p.fuente === "publicos" ? TEXTO_SIN_NUMERO_DEL_LINK : TEXTO_SIN_NUMERO;
}

/**
 * El número del ERP, SIEMPRE nombrando si fue pedido o cotización:
 *   «Pedido en Switch: 16-000000503» · «Cotización en Switch: 16-000000503»
 *   «Pedido en Switch, sin número»   · «No se ha mandado a Switch»
 */
export function textoEnSwitch(p: NumerosDePedido): string {
  if (!estaEnSwitch(p)) return TEXTO_NO_ENVIADO;
  const etiqueta = etiquetaDocumento(normalizarDocumento(p.switchDocumento));
  if (SIN_NUMERO_REAL(p.switchNumero)) return `${etiqueta} en Switch, sin número`;
  return `${etiqueta} en Switch: ${p.switchNumero!.trim()}`;
}

/**
 * Lo que el buscador tiene que encontrar en una fila. Daniel busca con el número
 * que tiene a mano — el de la casa o el que le dice el ERP —, así que los dos
 * entran junto al cliente.
 */
export function textoBuscablePedido(p: NumerosDePedido & { cliente?: string | null }): string {
  return [p.cliente ?? "", p.numeroPedido ?? "", p.switchNumero ?? ""].join(" ").toLowerCase();
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EL CONTENEDOR SE LLAMA «COMPROBANTES» — Y ADENTRO SE FILTRA POR TIPO
// (25-ago-2026)
//
// El panel se llamaba «Pedidos» cuando adentro SOLO había pedidos. Desde el
// #579 un envío puede salir como PEDIDO o como COTIZACIÓN, así que adentro hay
// dos cosas y el rótulo viejo nombraba una sola. Daniel, textual: *"debería de
// llamarse comprobantes, ya que dentro podrás ver las cotizaciones enviadas y
// los pedidos enviados"*.
//
// 🔑 EL NOMBRE NO ES UNA OCURRENCIA: es el de Switch. Su propio panel llama
// «Reportes de comprobantes» a esa pantalla y los separa en 8 tipos —Facturas/
// Notas · Transacción · Tiquete · Ventas · Pedidos · Cotización · Abonos ·
// Cotización Email— (ver `docs/switch-panel.md`). Usamos la palabra del ERP
// contra el que cuadramos, no una nuestra.
//
// ⚠️ LO QUE **NO** CAMBIA: la `key` de la pestaña sigue siendo `pedidos`
// (`?tab=pedidos`). Un marcador guardado tiene que seguir llegando. Es la misma
// decisión que Cheques→«Recordatorios» y Asistencia→«Asistencia y Planilla»:
// se cambia el LABEL, nunca la llave. Y los pedidos internos SIGUEN llamándose
// pedidos cuando son pedidos — lo que cambió de nombre es el contenedor.
//
// 🔴 «BORRADORES» NO ES «SIN MANDAR»: SON DOS PREGUNTAS DISTINTAS (25-ago-2026)
//
// Daniel, textual: *"entonces haz un tap de borrador, para q esté organizado.
// No quiero opción de todos."* Quedan TRES chips —Pedidos · Cotizaciones ·
// Borradores— y el panel abre en **Pedidos**, que es lo que más se mira.
//
// El balde viejo («Sin mandar») preguntaba *"¿salió a Switch?"*. El nuevo
// pregunta *"¿está terminado?"* — `status = 'borrador'`, que es lo que la
// tabla de orders dice y lo que el checkout cambia a `'confirmado'`. NO son la
// misma pregunta, y hay al menos un caso REAL de producción donde se separan:
//
//   reebok PED-018 · Hafez, S.A. · $2.520 · status='borrador' Y EN SWITCH
//
// o sea un pedido que salió al ERP y cuyo `status` nunca se cerró (el update
// del checkout tiene reintento, ver `api/catalogo/checkout`). Con el criterio
// viejo caía en «Pedidos»; con el nuevo cae en «Borradores», que es lo que
// Daniel pidió ver. Medido el 25-ago-2026, los borradores VIVOS son 6:
// reebok 2 · tommy 3 · joybees 0 · calvin 1.
//
// ═══ 🔴 LOS TRES CHIPS PARTICIONAN: NINGUNA FILA VIVA SE QUEDA SIN CHIP ═══
//
// Esto NO es un detalle: es lo que permite que «Todos» se vaya. Con cuatro
// chips, uno de ellos «Todos», una fila que no encajara en ninguno seguía
// siendo alcanzable. Sin «Todos», una fila sin chip es una fila INVISIBLE —
// y en producción hay 8 filas vivas que ningún criterio estricto atrapa
// (los 6 pedidos del LINK sin convertir, más 2 confirmados que nunca salieron
// a Switch). Por eso **«Pedidos» es el balde de resto**, y por eso el candado
// exige que la suma de los tres dé SIEMPRE el total.
//
// El orden de decisión es borrador → cotización → pedido:
//   · `borrador`   — `status = 'borrador'`. Gana sobre todo lo demás: no está
//                    terminado, da igual dónde esté.
//   · `cotizacion` — terminado y en Switch como COTIZACIÓN (no aparta merca).
//   · `pedido`     — todo lo demás, incluido el pedido del link sin convertir
//                    (que en la base se llama, literalmente, `pedidos_publicos`).
//
// ⚠️ Y la fila SIGUE diciendo la verdad línea por línea: `textoEnSwitch` no se
// tocó, así que un pedido del chip «Pedidos» que no salió sigue leyéndose
// «No se ha mandado a Switch». El chip organiza; la fila informa.
//
// ⚠️ LO QUE **NO** CAMBIA: la `key` de la pestaña sigue siendo `pedidos`
// (`?tab=pedidos`), el filtro por ORIGEN (Todos · Del link · Míos) sigue igual
// y se CRUZA con éste, y los pedidos internos siguen llamándose pedidos.
// ─────────────────────────────────────────────────────────────────────────────

/** El nombre visible del contenedor. La `key` de la pestaña NO es esto. */
export const PANEL_COMPROBANTES = "Comprobantes";

/** 🔴 La llave de la pestaña, congelada: `/catalogos/admin/<marca>?tab=pedidos`. */
export const TAB_COMPROBANTES_KEY = "pedidos";

/** Los vacíos del contenedor (no dicen «pedidos»: adentro hay dos cosas). */
export const VACIO_SIN_COMPROBANTES = "No hay comprobantes aún";
export const VACIO_NINGUNO_COINCIDE = "Ningún comprobante coincide";

/** El `status` que la tabla de orders le pone a un pedido recién creado. */
export const STATUS_BORRADOR = "borrador";

/**
 * 🔴 ¿Está sin terminar? Es el `status` de la tabla, NUNCA "no salió a Switch".
 * Tolerante a espacios y mayúsculas porque el dato viene de una columna de
 * texto libre; ausente (el pedido del link, que aún no tiene fila en orders)
 * NO es borrador.
 */
export function esBorrador(p: NumerosDePedido): boolean {
  return String(p.status ?? "").trim().toLowerCase() === STATUS_BORRADOR;
}

/** Qué es cada fila. Los tres son EXCLUYENTES y cubren todo (ver cabecera). */
export type TipoComprobante = "pedido" | "cotizacion" | "borrador";

/** El tipo de UNA fila. Orden de decisión: borrador → cotización → pedido. */
export function tipoComprobante(p: NumerosDePedido): TipoComprobante {
  if (esBorrador(p)) return "borrador";
  if (estaEnSwitch(p) && normalizarDocumento(p.switchDocumento) === "cotizacion") return "cotizacion";
  return "pedido";
}

/** No hay «todos»: Daniel lo pidió fuera. El filtro SIEMPRE está puesto. */
export type FiltroComprobante = TipoComprobante;

/** 🔴 El panel abre acá: es lo que más se mira. */
export const FILTRO_COMPROBANTE_DEFAULT: FiltroComprobante = "pedido";

/**
 * Los tres filtros, en el orden en que se leen. «Cotizaciones» es el que Daniel
 * pidió poder ver de un vistazo: lo que se cotizó y todavía no se vendió.
 * «Borradores» es lo que todavía no se terminó de armar.
 */
export const FILTROS_COMPROBANTE: readonly { clave: FiltroComprobante; label: string }[] = [
  { clave: "pedido", label: "Pedidos" },
  { clave: "cotizacion", label: "Cotizaciones" },
  { clave: "borrador", label: "Borradores" },
];

export function pasaFiltroComprobante(p: NumerosDePedido, filtro: FiltroComprobante): boolean {
  return tipoComprobante(p) === filtro;
}

/**
 * Los conteos de los tres filtros, en UNA pasada sobre las filas que ya están
 * en memoria. Cero consultas nuevas: `documento` viaja en la fila desde el #593
 * y `status` desde el #607; la base está en compute Micro.
 *
 * 🩸 LAS FILAS QUE ENTRAN ACÁ SON LAS QUE LA PANTALLA YA TIENE, y ésas salen de
 * la vista unificada, que filtra `deleted = false`. Contar contra la tabla de
 * orders daría 110 en vez de 43: es el error que ya se cometió una vez con este
 * mismo dato. El conteo del chip y las filas de la tabla son la MISMA lista.
 */
export function contarComprobantes(filas: NumerosDePedido[]): Record<FiltroComprobante, number> {
  const out: Record<FiltroComprobante, number> = {
    pedido: 0,
    cotizacion: 0,
    borrador: 0,
  };
  for (const f of filas) out[tipoComprobante(f)] += 1;
  return out;
}
