// Núcleo del endpoint público de CONFIRMACIÓN de un pedido del link
// (POST /api/catalogo/{marca}/pedido-publico/[id]/confirmar).
//
// La confirmación del cliente AUTO-CONVIERTE el pedido a PED-### / JBP-###
// (decisión cerrada): llama la RPC atómica existente de conversión — el pedido
// entra directo al pipeline del admin. WhatsApp queda como aviso OPCIONAL.
//
// La lógica vive aquí con dependencias INYECTADAS (I/O afuera) para poder
// testearla con vitest sin mockear supabase: idempotencia, aviso de stock (S2)
// y tolerancia a la migración pendiente (columna confirmado_cliente_at).
//
// Contrato del resultado (el route lo traduce 1:1 a HTTP):
//   { status: 404 }                         — no existe o está borrado
//   { status: 409, lineas: [...] }          — stock corto y el cliente aún no aceptó
//   { status: 200, numero, ya_confirmado }  — confirmado (o ya lo estaba: idempotente)
//   { status: 500, error }                  — la conversión falló

import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── Aviso de stock (S2) ──────────────────────────────────────────────────────

export interface PedidoItemStock {
  product_id: string;
  name?: string;
  sku?: string;
  quantity?: number; // en BULTOS
  category?: string;
  is_preorder?: boolean;
}

export interface StockLineaCorta {
  product_id: string;
  name: string;
  sku: string;
  pedido_bultos: number;
  pedido_pzas: number;
  disponible_pzas: number;
}

/**
 * Compara lo pedido (bultos × tamaño de bulto = piezas) contra lo disponible.
 * - `disponibles`: piezas por product_id (Reebok: suma de inventory; Joybees:
 *   joybees_products.stock). Producto ausente en el Map = 0 disponibles.
 * - Pre-órdenes (is_preorder) se saltan: por definición no tienen stock aún.
 * Pura, sin I/O.
 */
export function computeLineasCortas(
  items: PedidoItemStock[],
  disponibles: Map<string, number>,
  getBulto: (category?: string) => number,
): StockLineaCorta[] {
  const cortas: StockLineaCorta[] = [];
  for (const it of items) {
    if (it.is_preorder) continue;
    const bultos = Number(it.quantity) || 0;
    if (bultos <= 0 || !it.product_id) continue;
    const pzas = bultos * getBulto(it.category);
    const disp = Math.max(0, Number(disponibles.get(it.product_id)) || 0);
    if (disp < pzas) {
      cortas.push({
        product_id: it.product_id,
        name: it.name || "Producto",
        sku: it.sku || "",
        pedido_bultos: bultos,
        pedido_pzas: pzas,
        disponible_pzas: disp,
      });
    }
  }
  return cortas;
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
  getBulto(category?: string): number;
  /**
   * Registra confirmado_cliente_at (+ confirmado_ip_hash). TOLERANTE: si la
   * columna no existe (migración pendiente) debe loguear y NO lanzar — la
   * confirmación sigue vía RPC igual.
   */
  marcarConfirmado(shortId: string): Promise<void>;
  /** RPC atómica de conversión existente. Idempotente. */
  convertir(pedido: PedidoPublicoRow): Promise<{ numero: string; yaConvertida: boolean }>;
}

export type ConfirmarResult =
  | { status: 404 }
  | { status: 409; lineas: StockLineaCorta[] }
  | { status: 200; numero: string; ya_confirmado: boolean }
  | { status: 500; error: string };

export async function confirmarPedidoPublico(
  deps: ConfirmarDeps,
  shortId: string,
  aceptarStock: boolean,
): Promise<ConfirmarResult> {
  const pedido = await deps.getPedido(shortId);
  if (!pedido || pedido.deleted) return { status: 404 };

  // Idempotente: ya convertido → mismo número, sin tocar nada.
  if (pedido.convertida && pedido.ped_order_number) {
    return { status: 200, numero: pedido.ped_order_number, ya_confirmado: true };
  }

  // Aviso de stock (S2): solo si el cliente no aceptó ya el faltante.
  if (!aceptarStock) {
    const items = Array.isArray(pedido.items) ? pedido.items : [];
    const ids = [...new Set(items.filter((i) => !i.is_preorder && i.product_id).map((i) => i.product_id))];
    if (ids.length > 0) {
      const disponibles = await deps.getDisponibles(ids);
      if (disponibles) {
        const lineas = computeLineasCortas(items, disponibles, deps.getBulto);
        if (lineas.length > 0) return { status: 409, lineas };
      }
      // disponibles === null → fail-open: seguimos sin aviso.
    }
  }

  // Registrar la confirmación del cliente (tolerante a columna ausente).
  await deps.marcarConfirmado(shortId);

  // AUTO-CONVERSIÓN → PED-### / JBP-### (entra directo al pipeline).
  try {
    const { numero, yaConvertida } = await deps.convertir(pedido);
    return { status: 200, numero, ya_confirmado: yaConvertida };
  } catch (err) {
    console.error("[confirmar-pedido] conversión falló:", err);
    return { status: 500, error: "No se pudo confirmar el pedido. Intenta de nuevo." };
  }
}
