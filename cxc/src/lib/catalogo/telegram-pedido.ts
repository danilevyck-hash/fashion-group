// ─────────────────────────────────────────────────────────────────────────────
// Textos de los avisos de Telegram de un pedido de catálogo — LOS TRES EVENTOS,
// UN SOLO FORMATO.
//
// 🩸 POR QUÉ HAY UN ARMADOR ÚNICO (11-ago-2026). Daniel recibió el mismo pedido
// contado de dos formas distintas: la creación decía "🔵 Tommy Hilfiger — pedido
// DEL VENDEDOR / 8 referencias · 1128 piezas / $16,920 · TOM-005" y el envío a
// Switch decía "📦 Pedido Tommy Hilfiger TOM-002 enviado a Switch → … · Contado
// / REINALDO ESPINOSA" — sin referencias, sin bultos y sin monto. Textual:
// *"porq dos diferentes tipo de mensaje. y cada mensaje tiene que decir cuantas
// referencias, cuantos bultos, cliente y monto"*. El texto del envío vivía
// inline en switch-envio.ts, o sea que los formatos solo podían divergir.
// Ahora TODO aviso de pedido pasa por `cuerpoAvisoPedido` y lleva SIEMPRE:
//
//   <emoji> <Marca> · <TOM-002> — <etapa>
//   Cliente: <cliente> · Vendedor: <vendedor>
//   <N> referencias · <N> bultos · <N> piezas · $<monto>
//   [línea extra de la etapa, si aplica]
//
// Las CUATRO cosas obligatorias en todos: referencias · bultos · cliente ·
// monto. Las piezas van además porque son la unidad que factura Switch y el
// resto del sistema las muestra junto a los bultos (ver piezas.ts).
//
// EMOJIS: el de la etapa "pedido nuevo" es el de la MARCA (cfg.telegramEmoji:
// 🛒 Reebok, 🐝 Joybees, 🔵 Tommy) y el de "enviado a Switch" es 📦 — el mismo
// pedido se lee avanzando (🔵 TOM-005 → 📦 TOM-005).
//
// LOS DOS ORÍGENES DE CREACIÓN SIGUEN DISTINGUIÉNDOSE, porque para el negocio
// no son lo mismo:
//
//   1. DEL VENDEDOR (checkout con sesión, `POST /api/catalogo/[marca]/orders`):
//      Rey/Edwin lo arman con el cliente REAL y el vendedor REAL de Switch (el
//      del mapeo fg_user_switch_vendedor del usuario logueado). Es venta de una
//      persona y paga comisión.
//
//   2. DEL LINK público (el cliente lo arma solo y lo confirma desde
//      /pedido-<marca>/[short_id]): no hay sesión que aporte cliente ni
//      vendedor, así que entra al sistema como BORRADOR y sin cliente, y espera
//      a que una persona le ponga el cliente real y lo mande al ERP
//      (14-ago-2026; antes salía solo con el mostrador puesto).
//
// El origen no se adivina: cada camino tiene su builder y es el propio endpoint
// el que llama al suyo. En la DB queda el espejo del mismo dato —
// `<marca>_orders.origen_original` vale 'mio' para el camino 1 (default de la
// RPC de creación) y 'link' para el 2 (lo escribe la RPC de conversión).
//
// Quien lee estos avisos no es técnico: origen en mayúsculas para verlo de un
// vistazo, español simple, texto PLANO (el canal va sin parse_mode).
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

const plural = (n: number, singular: string, plur: string) =>
  `${n} ${n === 1 ? singular : plur}`;

/** Lo que Daniel pidió ver en TODO aviso: cuánto es y de qué tamaño. */
export interface ResumenAviso {
  /** Productos distintos. En el negocio se les dice "referencias". */
  referencias: number;
  /** Bultos TOTALES — la unidad en que el cliente pide (items.quantity). */
  bultos: number;
  /** Piezas TOTALES — la unidad que se despacha y que factura Switch. */
  piezas: number;
}

/**
 * "8 referencias · 94 bultos · 1128 piezas · $16,920". El monto va SIEMPRE;
 * las cifras de tamaño se OMITEN si no hay resumen, en vez de escribir
 * "0 referencias · 0 bultos": un cero inventado en un aviso de plata se lee
 * como un pedido vacío. Los números salen de `resumirPedido`
 * (lineas-pedido.ts), el único lugar del sistema que multiplica bultos por
 * piezas — acá no se calcula nada.
 */
function lineaCifras(r: ResumenAviso | undefined, total: number): string {
  const monto = money(total);
  if (!r || (r.referencias <= 0 && r.bultos <= 0 && r.piezas <= 0)) return monto;
  return [
    plural(r.referencias, "referencia", "referencias"),
    plural(r.bultos, "bulto", "bultos"),
    plural(r.piezas, "pieza", "piezas"),
    monto,
  ].join(" · ");
}

interface CuerpoAviso {
  emoji: string;
  label: string;
  numero: string;
  etapa: string;
  cliente?: string | null;
  /**
   * `undefined` = la línea no nombra vendedor (pedido del link: no hay uno
   * real que nombrar). `null`/vacío = se esperaba y falta → "sin nombre".
   */
  vendedor?: string | null;
  total: number;
  resumen?: ResumenAviso;
  /** Línea(s) extra de la etapa (p.ej. "→ Switch 16-… ✓ verificado"). */
  extras?: string[];
}

/**
 * EL armador. Ningún emisor arma el cuerpo por su cuenta: si un evento nuevo
 * necesita avisar de un pedido, agrega un wrapper acá — así los formatos no
 * pueden volver a divergir. Candado: telegram-pedido-origen.test.ts.
 */
function cuerpoAvisoPedido(a: CuerpoAviso): string {
  const quien = [`Cliente: ${nombreODefecto(a.cliente, "Sin nombre")}`];
  if (a.vendedor !== undefined) {
    quien.push(`Vendedor: ${nombreODefecto(a.vendedor, "sin nombre")}`);
  }
  return [
    `${a.emoji} ${a.label} · ${a.numero} — ${a.etapa}`,
    quien.join(" · "),
    lineaCifras(a.resumen, a.total),
    ...(a.extras ?? []),
  ].join("\n");
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
  return cuerpoAvisoPedido({
    emoji: a.emoji,
    label: a.label,
    numero: a.numero,
    etapa: "pedido DEL VENDEDOR",
    cliente: a.cliente,
    vendedor: a.vendedor ?? null,
    total: a.total,
    resumen: a.resumen,
  });
}

export interface AvisoPedidoLink {
  /** Emoji de la marca (cfg.telegramEmoji). */
  emoji: string;
  label: string;
  cliente?: string | null;
  total: number;
  numero: string;
  resumen?: ResumenAviso;
}

/**
 * Pedido que el CLIENTE armó y confirmó solo desde el link público. No se
 * nombra vendedor (no hay uno real).
 *
 * 🔴 LA LÍNEA EXTRA CAMBIÓ EL 14-ago-2026 Y ES LA PARTE QUE MÁS IMPORTA. Decía
 * *"Entra a Switch como Contado y sin vendedor — no paga comisión"*, que era
 * cierto mientras el pedido del link salía SOLO al ERP. Desde que espera a una
 * persona (ver `pedido-publico/[id]/confirmar/route.ts`), el aviso tiene que
 * PEDIR ese paso: es lo único que hay entre el pedido y el ERP, y sin decirlo
 * un pedido podría quedarse quieto sin que nadie se entere.
 */
export function avisoPedidoDelLink(a: AvisoPedidoLink): string {
  return cuerpoAvisoPedido({
    emoji: a.emoji,
    label: a.label,
    numero: a.numero,
    etapa: "pedido DEL LINK, lo confirmó el cliente",
    cliente: a.cliente,
    total: a.total,
    resumen: a.resumen,
    extras: [
      "Falta ponerle el cliente y mandarlo a Switch — está en Borradores.",
    ],
  });
}

export interface AvisoPedidoEnviado {
  /** Nombre de la marca (cfg.label / marcaLabel). */
  label: string;
  numero: string;
  cliente?: string | null;
  vendedor?: string | null;
  total: number;
  resumen?: ResumenAviso;
  /** Secuencial que devolvió Switch (numeroInterno), p.ej. 16-000002012. */
  numeroSwitch: string;
  verificado: boolean;
}

/**
 * El pedido SALIÓ al ERP (motor switch-envio.ts, cualquiera de sus tres
 * llamadores). Mismo cuerpo que la creación + la línea del secuencial de
 * Switch con el resultado de la verificación post-escritura.
 */
export function avisoPedidoEnviado(a: AvisoPedidoEnviado): string {
  return cuerpoAvisoPedido({
    emoji: "📦",
    label: a.label,
    numero: a.numero,
    etapa: "enviado a Switch",
    cliente: a.cliente,
    vendedor: a.vendedor ?? null,
    total: a.total,
    resumen: a.resumen,
    extras: [`→ Switch ${a.numeroSwitch} ${a.verificado ? "✓ verificado" : "⚠️ sin verificar"}`],
  });
}
