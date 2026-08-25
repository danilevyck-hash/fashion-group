// ─────────────────────────────────────────────────────────────────────────────
// Textos de los avisos de Telegram de un pedido de catálogo — LOS TRES EVENTOS,
// UN SOLO FORMATO, DOS LÍNEAS.
//
// 🩸 POR QUÉ HAY UN ARMADOR ÚNICO (11-ago-2026). Daniel recibió el mismo pedido
// contado de dos formas distintas: la creación decía una cosa y el envío a
// Switch otra, sin monto y sin tamaño, porque el texto del envío vivía inline
// en switch-envio.ts. Textual: *"porq dos diferentes tipo de mensaje"*. Desde
// entonces TODO aviso de pedido pasa por `cuerpoAvisoPedido` y ningún emisor
// arma el cuerpo por su cuenta. Eso no cambió y no puede cambiar.
//
// 🔴 25-ago-2026 — LO QUE CAMBIÓ ES EL LARGO. El aviso había llegado a cinco
// líneas: rótulos "Cliente:"/"Vendedor:", la etapa deletreada, el recuento de
// referencias y bultos, el "✓ verificado" y un renglón entero explicando que
// una cotización no aparta mercancía. Daniel, textual: ***"lo quiero más
// simple… solo quiero lo útil"***, y eligió el formato exacto:
//
//   📝 Cotización TOM-027 · A-Amani, S.A.
//   Tommy Hilfiger · $648 · 12 piezas · Switch 15-000000123
//
//   📦 Pedido TOM-028 · Hafez, S.A.
//   Tommy Hilfiger · $2,760 · 48 piezas · Switch 16-000002058
//
// LA REGLA, y es la que hay que respetar si mañana se agrega un evento:
//   línea 1 = QUÉ es + DE QUIÉN es.
//   línea 2 = marca + monto + piezas + N° de Switch.
// El monto va en la SEGUNDA a propósito — lo puso ahí él.
//
// 🔴 LO QUE SE FUE, Y NO VUELVE (cada cosa con su motivo, para que nadie la
// reponga "por completitud"):
//   · "No aparta mercancía — sigue disponible para los demás." → él ya lo sabe,
//     y la advertencia sigue viva DONDE SE DECIDE (`NOTA_COTIZACION`, pegada al
//     botón en documento-switch.ts). Un renglón en el aviso, después de mandar,
//     no evita nada.
//   · "✓ verificado" → es lo NORMAL. Solo se escribe la excepción: si no se
//     pudo verificar, el aviso dice "⚠️ sin verificar" pegado al número. Un
//     estado que sale en el 99% de los mensajes no informa; el 1% sí.
//   · "— COTIZACIÓN enviada a Switch" → lo dicen ya la primera palabra
//     ("Cotización"/"Pedido") y el número de Switch de abajo. Tres veces lo
//     mismo en dos líneas.
//   · Los rótulos "Cliente:" y "Vendedor:" → el nombre después del "·" ya se
//     lee como el cliente, y EL VENDEDOR SALIÓ DEL MENSAJE por decisión de
//     Daniel (sigue en el pedido, en el detalle y en la comisión — no se
//     perdió el dato, se sacó del aviso).
//   · "N referencias · N bultos" → quedan las PIEZAS, que es la unidad que
//     factura Switch.
//
// ⚠️ LOS AVISOS DE ERROR NO SON DE ESTE ARCHIVO Y NO SE PODAN. Cuando el envío
// falla o Switch no responde, el mensaje sale por `enviarSistema` desde
// switch-envio.ts y tiene que seguir diciendo qué pasó y qué hacer. Ahí el
// detalle es lo útil. La poda es solo del aviso de éxito.
//
// EMOJIS: la creación lleva el de la MARCA (cfg.telegramEmoji: 🛒 Reebok,
// 🐝 Joybees, 🔵 Tommy, ⚫ Calvin) y la salida a Switch lleva 📦 pedido / 📝
// cotización — así el mismo pedido se lee avanzando (🔵 TOM-005 → 📦 TOM-005) y
// las dos salidas se distinguen antes de leer una palabra. Pedido y cotización
// NO pueden compartir emoji: es lo primero que se ve en la lista.
//
// LOS DOS ORÍGENES DE CREACIÓN SIGUEN DISTINGUIÉNDOSE, porque para el negocio
// no son lo mismo:
//
//   1. DEL VENDEDOR (checkout con sesión, `POST /api/catalogo/[marca]/orders`):
//      Rey/Edwin lo arman con el cliente REAL de Switch. Ya está listo.
//   2. DEL LINK público (el cliente lo arma solo desde /pedido-<marca>/[id]):
//      entra como BORRADOR y espera a que una persona le ponga el cliente real
//      y lo mande al ERP. Ese aviso lleva una TERCERA línea que PIDE ese paso
//      — no es explicación, es la única cosa que hay entre el pedido y Switch,
//      y sin decirla el pedido se queda quieto y nadie se entera.
//
// El origen no se adivina: cada camino tiene su builder y es el propio endpoint
// el que llama al suyo. En la DB queda el espejo del mismo dato —
// `<marca>_orders.origen_original` vale 'mio' para el camino 1 y 'link' para
// el 2.
//
// Quien lee estos avisos no es técnico: español simple y texto PLANO. El canal
// va SIN parse_mode a propósito (ver telegram.ts): así el nombre de un cliente
// puede traer `&`, `<` o `_` sin que haya que escapar nada y sin que Telegram
// rechace el mensaje. Candado: telegram-pedido-origen.test.ts exige que no
// aparezcan `<>` ni marcado.
// ─────────────────────────────────────────────────────────────────────────────

import { fmtPrecio } from "@/lib/catalogo/precio";
import {
  type DocumentoSwitch,
  esCotizacion,
  etiquetaDocumento,
} from "@/lib/catalogo/documento-switch";

/** Monto en el formato de los catálogos: $1,234 / $37.50 (sin `.00`). */
export function money(n: number): string {
  return fmtPrecio(Number(n));
}

const nombreODefecto = (v: string | null | undefined, fallback: string) => {
  const s = (v ?? "").trim();
  return s.length > 0 ? s : fallback;
};

/** "12 piezas" / "1 pieza". */
const enPiezas = (n: number) => `${n} ${n === 1 ? "pieza" : "piezas"}`;

interface CuerpoAviso {
  /** 📦 / 📝 / el de la marca, según la etapa. */
  emoji: string;
  /** "Pedido" o "Cotización" — la primera palabra, la que dice QUÉ es. */
  queEs: string;
  /** El número de la casa: TOM-027. No cambia salga como pedido o cotización. */
  numero: string;
  /** Nombre de la marca (cfg.label), en la segunda línea. */
  label: string;
  cliente?: string | null;
  total: number;
  /**
   * Piezas TOTALES — la unidad que despacha y factura Switch. Ausente = se
   * OMITE, en vez de escribir "0 piezas": un cero inventado en un aviso de
   * plata se lee como un pedido vacío. Sale de `resumirPedido`
   * (lineas-pedido.ts), el único lugar que multiplica bultos por piezas; acá
   * no se calcula nada.
   */
  piezas?: number;
  /** Cola de la segunda línea, p.ej. "Switch 16-000002058 ⚠️ sin verificar". */
  switchSegmento?: string;
  /** Línea(s) extra. Solo el pedido del link tiene una, y pide una acción. */
  extras?: string[];
}

/**
 * EL armador. Ningún emisor arma el cuerpo por su cuenta: si un evento nuevo
 * necesita avisar de un pedido, agrega un wrapper acá — así los formatos no
 * pueden volver a divergir. Candado: telegram-pedido-origen.test.ts.
 */
function cuerpoAvisoPedido(a: CuerpoAviso): string {
  const segunda = [a.label, money(a.total)];
  if (typeof a.piezas === "number" && a.piezas > 0) segunda.push(enPiezas(a.piezas));
  if (a.switchSegmento) segunda.push(a.switchSegmento);

  return [
    `${a.emoji} ${a.queEs} ${a.numero} · ${nombreODefecto(a.cliente, "Sin nombre")}`,
    segunda.join(" · "),
    ...(a.extras ?? []),
  ].join("\n");
}

export interface AvisoPedidoVendedor {
  /** Emoji de la marca (cfg.telegramEmoji). */
  emoji: string;
  /** Nombre de la marca (cfg.label). */
  label: string;
  cliente?: string | null;
  total: number;
  numero: string;
  /** Ausente en pedidos viejos o si no se pudo resolver: se omite la cifra. */
  piezas?: number;
}

/**
 * Pedido que metió un VENDEDOR desde el checkout con sesión. Todavía no salió
 * a Switch, así que la segunda línea no lleva número de Switch — esa ausencia
 * ES la etapa, y no hace falta deletrearla.
 */
export function avisoPedidoDeVendedor(a: AvisoPedidoVendedor): string {
  return cuerpoAvisoPedido({
    emoji: a.emoji,
    queEs: "Pedido",
    numero: a.numero,
    label: a.label,
    cliente: a.cliente,
    total: a.total,
    piezas: a.piezas,
  });
}

export interface AvisoPedidoLink {
  /** Emoji de la marca (cfg.telegramEmoji). */
  emoji: string;
  label: string;
  cliente?: string | null;
  total: number;
  numero: string;
  piezas?: number;
}

/**
 * Pedido que el CLIENTE armó y confirmó solo desde el link público.
 *
 * 🔴 LA TERCERA LÍNEA NO ES DECORACIÓN Y NO SE PODA. Desde el 14-ago-2026 el
 * pedido del link espera a una persona (ver
 * `pedido-publico/[id]/confirmar/route.ts`): es lo único que hay entre el
 * pedido y el ERP, y sin decirlo un pedido podría quedarse quieto sin que nadie
 * se entere. Es una ACCIÓN pendiente, no una explicación de algo que el lector
 * ya sabe — que es lo que se podó del resto del aviso.
 */
export function avisoPedidoDelLink(a: AvisoPedidoLink): string {
  return cuerpoAvisoPedido({
    emoji: a.emoji,
    queEs: "Pedido",
    numero: a.numero,
    label: a.label,
    cliente: a.cliente,
    total: a.total,
    piezas: a.piezas,
    extras: ["Falta ponerle el cliente y mandarlo a Switch — está en Borradores."],
  });
}

export interface AvisoPedidoEnviado {
  /** Nombre de la marca (cfg.label / marcaLabel). */
  label: string;
  numero: string;
  cliente?: string | null;
  total: number;
  piezas?: number;
  /** Secuencial que devolvió Switch (numeroInterno), p.ej. 16-000002012. */
  numeroSwitch: string;
  verificado: boolean;
  /**
   * PEDIDO o COTIZACIÓN (24-ago-2026). Ausente = pedido, que es lo único que
   * este aviso podía contar antes de que existiera la elección.
   */
  documento?: DocumentoSwitch;
}

/**
 * El pedido SALIÓ al ERP (motor switch-envio.ts, cualquiera de sus tres
 * llamadores). Mismo cuerpo que la creación + el secuencial de Switch.
 *
 * La verificación SOLO se escribe cuando falla: "✓ verificado" salía en casi
 * todos los mensajes y por eso no informaba nada. "⚠️ sin verificar" sí.
 */
export function avisoPedidoEnviado(a: AvisoPedidoEnviado): string {
  const documento = a.documento ?? "pedido";
  const cotizacion = esCotizacion(documento);
  return cuerpoAvisoPedido({
    // 📝 vs 📦: en una lista de avisos el emoji es lo primero que se ve, y las
    // dos salidas tienen que distinguirse antes de leer una palabra.
    emoji: cotizacion ? "📝" : "📦",
    queEs: etiquetaDocumento(documento),
    numero: a.numero,
    label: a.label,
    cliente: a.cliente,
    total: a.total,
    piezas: a.piezas,
    switchSegmento: `Switch ${a.numeroSwitch}${a.verificado ? "" : " ⚠️ sin verificar"}`,
  });
}
