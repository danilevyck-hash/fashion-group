// Núcleo del endpoint público de CONFIRMACIÓN de un pedido del link
// (POST /api/catalogo/{marca}/pedido-publico/[id]/confirmar).
//
// La confirmación del cliente AUTO-CONVIERTE el pedido a PED-### / JBP-### /
// TOM-### (decisión cerrada): llama la RPC atómica existente de conversión — el
// pedido entra directo al pipeline del admin. WhatsApp queda como aviso OPCIONAL.
//
// SIN MODAL DE STOCK (25-jul-2026): antes, si alguna línea tenía menos piezas
// de las pedidas, esto respondía 409 'stock_corto' y el cliente tenía que
// reenviar con aceptar_stock=true. Ese paso se ELIMINÓ: el pedido se confirma
// directo. Lo que NO se pierde es la cantidad real: se toma una FOTO del stock
// en el momento de confirmar (piezas disponibles por producto) y se guarda con
// el pedido, para mostrarla al cliente y a la secretaria. Es fiel al momento de
// la confirmación, no al stock de mañana.
//
// La lógica vive aquí con dependencias INYECTADAS (I/O afuera) para poder
// testearla con vitest sin mockear supabase: idempotencia, foto de stock y
// tolerancia a las migraciones pendientes (confirmado_cliente_at,
// stock_confirmacion).
//
// Contrato del resultado (el route lo traduce 1:1 a HTTP):
//   { status: 404 }                                 — no existe o está borrado
//   { status: 200, numero, ya_confirmado, stock }   — confirmado (idempotente)
//   { status: 500, error }                          — la conversión falló

import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── Aviso de stock (S2) ──────────────────────────────────────────────────────

import { resolverLineas } from "./lineas-pedido";

export interface PedidoItemStock {
  product_id: string;
  name?: string;
  sku?: string;
  quantity?: number; // en BULTOS
  category?: string;
  is_preorder?: boolean;
  /** Tommy: piezas por bulto del estilo. Vacío = el default de la marca. */
  bulto_pzas?: number | null;
}

export interface StockLineaCorta {
  product_id: string;
  name: string;
  sku: string;
  pedido_bultos: number;
  pedido_pzas: number;
  disponible_pzas: number;
  /** Piezas por bulto usadas al confirmar (Reebok 12/6, Joybees 12, Tommy 8 o 12). */
  bulto_pzas?: number;
}

/**
 * FOTO del stock en el momento de confirmar: para CADA línea (no solo las
 * cortas) cuánto se pidió y cuántas piezas hay disponibles.
 * - `disponibles`: piezas por product_id (Reebok: suma de inventory; Joybees y
 *   Tommy: la columna stock del catálogo). Producto ausente en el Map = 0.
 * - Pre-órdenes (is_preorder) se saltan: por definición no tienen stock aún.
 * - `bulto_pzas` viaja en la foto para poder formatear "1 bulto · 8 pzas" sin
 *   recalcular la categoría meses después.
 * Pura, sin I/O.
 */
export function computeStockLineas(
  items: PedidoItemStock[],
  disponibles: Map<string, number>,
  getBulto: (item: PedidoItemStock) => number,
): StockLineaCorta[] {
  const lineas: StockLineaCorta[] = [];
  for (const it of items) {
    if (it.is_preorder) continue;
    const bultos = Number(it.quantity) || 0;
    if (bultos <= 0 || !it.product_id) continue;
    // Las piezas salen del resolvedor único (lineas-pedido.ts): acá no se
    // multiplica. `getBulto` sigue existiendo porque cada marca resuelve el
    // tamaño distinto, pero el producto bultos × tamaño ocurre en un solo sitio.
    const [resuelta] = resolverLineas([{ ...it, bulto_pzas: undefined }], {
      bultoSize: () => getBulto(it),
    });
    const bulto = resuelta.bulto_pzas;
    lineas.push({
      product_id: it.product_id,
      name: it.name || "Producto",
      sku: it.sku || "",
      pedido_bultos: bultos,
      pedido_pzas: resuelta.piezas,
      disponible_pzas: Math.max(0, Number(disponibles.get(it.product_id)) || 0),
      bulto_pzas: bulto,
    });
  }
  return lineas;
}

/** Solo las líneas donde hay MENOS piezas de las pedidas. */
export function soloCortas(lineas: StockLineaCorta[]): StockLineaCorta[] {
  return lineas.filter((l) => l.disponible_pzas < l.pedido_pzas);
}

/**
 * Compatibilidad: las líneas cortas directo desde los items.
 * (= soloCortas(computeStockLineas(...)))
 */
export function computeLineasCortas(
  items: PedidoItemStock[],
  disponibles: Map<string, number>,
  getBulto: (item: PedidoItemStock) => number,
): StockLineaCorta[] {
  return soloCortas(computeStockLineas(items, disponibles, getBulto));
}

// ── Rate-limit de confirmaciones por IP (fail-open) ─────────────────────────
// Mismo patrón que reebok-pedido-rate-limit: cuenta confirmaciones registradas
// (confirmado_ip_hash + confirmado_cliente_at) en la ventana. Si la columna no
// existe aún (DDL pendiente) o el store falla → fail-open.

export const CONFIRM_MAX = 15; // confirmaciones por IP por ventana
export const CONFIRM_WINDOW_MIN = 10;

export function hashConfirmIp(ip: string): string {
  return createHash("sha256").update(`pedido-confirm:${ip}`).digest("hex").slice(0, 32);
}

export interface ConfirmRateLimitResult {
  allowed: boolean;
  /** Hash a registrar junto con confirmado_cliente_at. null = no registrar. */
  ipHash: string | null;
}

export async function checkConfirmRateLimit(
  db: SupabaseClient,
  table: string,
  ip: string,
): Promise<ConfirmRateLimitResult> {
  if (!ip || ip === "unknown") return { allowed: true, ipHash: null };
  const ipHash = hashConfirmIp(ip);
  try {
    const since = new Date(Date.now() - CONFIRM_WINDOW_MIN * 60 * 1000).toISOString();
    const { count, error } = await db
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("confirmado_ip_hash", ipHash)
      .gte("confirmado_cliente_at", since);
    if (error) return { allowed: true, ipHash: null }; // columna ausente / store caído
    if ((count ?? 0) >= CONFIRM_MAX) return { allowed: false, ipHash };
    return { allowed: true, ipHash };
  } catch {
    return { allowed: true, ipHash: null };
  }
}

// ── Confirmación (deps inyectadas) ──────────────────────────────────────────

export interface PedidoPublicoRow {
  short_id: string;
  items: PedidoItemStock[];
  cliente_nombre: string | null;
  convertida: boolean;
  ped_order_number: string | null;
  deleted: boolean;
}

export interface ConfirmarDeps {
  /** Fila pública por short_id. null = no existe. */
  getPedido(shortId: string): Promise<PedidoPublicoRow | null>;
  /**
   * Piezas disponibles por product_id. null = no se pudo leer el stock
   * (FAIL-OPEN: se confirma sin aviso — el aviso es cortesía, no un bloqueo).
   */
  getDisponibles(productIds: string[]): Promise<Map<string, number> | null>;
  /** Tamaño de bulto por categoría (Reebok 12/6, Joybees 12 fijo). */
  /**
   * Piezas por bulto de UNA línea. Recibe el item entero, no solo la categoría:
   * en Tommy el tamaño lo decide el estilo (8 o 12) y no la categoría — ver
   * `tommy-bulto.ts`.
   */
  getBulto(item: PedidoItemStock): number;
  /**
   * Registra confirmado_cliente_at (+ confirmado_ip_hash) y la FOTO del stock
   * del momento (stock_confirmacion). TOLERANTE: si alguna columna no existe
   * (migración pendiente) debe loguear y NO lanzar — la confirmación sigue vía
   * RPC igual.
   */
  marcarConfirmado(shortId: string, stock: StockLineaCorta[]): Promise<void>;
  /** RPC atómica de conversión existente. Idempotente. */
  convertir(pedido: PedidoPublicoRow): Promise<{ numero: string; yaConvertida: boolean }>;
  /**
   * Envío del pedido ya convertido al ERP Switch (motor enviarPedidoSwitch).
   * REGLAS:
   *   · NUNCA rompe la confirmación: el core lo llama dentro de try/catch. El
   *     pedido ya está guardado; si Switch está caído queda el "Reintentar"
   *     del admin (y la alerta a Telegram del propio motor).
   *   · Idempotente aguas abajo (índice parcial + 'ya_enviado'), por eso se
   *     llama TAMBIÉN cuando el pedido ya estaba convertido: así un reintento
   *     del cliente tras un timeout recupera un envío que nunca salió.
   */
  enviarSwitch(numero: string, pedido: PedidoPublicoRow): Promise<void>;
}

export type ConfirmarResult =
  | { status: 404 }
  | { status: 200; numero: string; ya_confirmado: boolean; stock: StockLineaCorta[] }
  | { status: 500; error: string };

/**
 * Confirma el pedido del link. Sin paso intermedio: NO hay 409 de stock corto
 * ni `aceptar_stock` — el pedido entra directo y la cantidad real disponible
 * queda registrada con él (ver cabecera).
 */
export async function confirmarPedidoPublico(
  deps: ConfirmarDeps,
  shortId: string,
): Promise<ConfirmarResult> {
  const pedido = await deps.getPedido(shortId);
  if (!pedido || pedido.deleted) return { status: 404 };

  // Idempotente: ya convertido → mismo número, sin tocar nada (la foto de
  // stock ya quedó guardada en la confirmación original: no se re-escribe con
  // el stock de hoy). El envío a Switch SÍ se reintenta: es idempotente y así
  // se recupera solo un envío que se perdió por timeout o por Switch caído.
  if (pedido.convertida && pedido.ped_order_number) {
    await enviarSinRomper(deps, pedido.ped_order_number, pedido);
    return { status: 200, numero: pedido.ped_order_number, ya_confirmado: true, stock: [] };
  }

  // FOTO del stock ANTES de convertir. FAIL-OPEN: si no se puede leer, se
  // confirma igual sin foto (nunca bloquea al cliente).
  const items = Array.isArray(pedido.items) ? pedido.items : [];
  let stock: StockLineaCorta[] = [];
  const ids = [...new Set(items.filter((i) => !i.is_preorder && i.product_id).map((i) => i.product_id))];
  if (ids.length > 0) {
    const disponibles = await deps.getDisponibles(ids);
    if (disponibles) stock = computeStockLineas(items, disponibles, deps.getBulto);
  }

  // Registrar la confirmación del cliente + la foto (tolerante a columnas
  // ausentes).
  await deps.marcarConfirmado(shortId, stock);

  // AUTO-CONVERSIÓN → PED-### / JBP-### / TOM-### (entra directo al pipeline).
  let numero: string;
  let yaConvertida: boolean;
  try {
    ({ numero, yaConvertida } = await deps.convertir(pedido));
  } catch (err) {
    console.error("[confirmar-pedido] conversión falló:", err);
    return { status: 500, error: "No se pudo confirmar el pedido. Intenta de nuevo." };
  }

  // Y de ahí DERECHO al ERP. Un fallo aquí no le quita el pedido al cliente.
  await enviarSinRomper(deps, numero, pedido);

  return { status: 200, numero, ya_confirmado: yaConvertida, stock };
}

/** El envío al ERP jamás puede tumbar la confirmación del cliente. */
async function enviarSinRomper(
  deps: ConfirmarDeps,
  numero: string,
  pedido: PedidoPublicoRow,
): Promise<void> {
  try {
    await deps.enviarSwitch(numero, pedido);
  } catch (err) {
    console.error("[confirmar-pedido] envío a Switch falló (el pedido queda guardado):", err);
  }
}
