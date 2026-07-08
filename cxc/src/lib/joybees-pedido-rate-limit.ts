// Rate-limit anti-spam del POST público de pedidos Joybees (pedido-publico).
// Espejo de reebok-pedido-rate-limit: cuenta los pedidos YA GUARDADOS en
// joybees_pedidos_publicos por ip_hash en los últimos 10 min. Máximo PEDIDOS_MAX
// por IP por ventana.
//
// Requiere la columna ip_hash (migración
// supabase/migrations/20260708130000_joybees_pedidos_publicos_fase2.sql). Mientras
// no exista, la query de conteo devuelve error → fail-open y el INSERT no incluye
// ip_hash: el deploy es seguro antes del DDL, el rate-limit queda inerte.
//
// Se guarda un HASH truncado de la IP (sha256, 32 hex chars), nunca la IP en
// claro. Es una capa anti-spam, NO seguridad: ante cualquier error del store el
// pedido pasa (fail-open).

import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export const PEDIDOS_MAX = 5;          // pedidos por IP por ventana
export const PEDIDOS_WINDOW_MIN = 10;  // ventana en minutos

export function hashPedidoIp(ip: string): string {
  return createHash("sha256").update(`joybees-pedido:${ip}`).digest("hex").slice(0, 32);
}

export interface PedidoRateLimitResult {
  allowed: boolean;
  /** Hash a incluir en el INSERT. null = no guardar (IP desconocida, o la
   *  columna ip_hash no existe aún / el conteo falló → fail-open). */
  ipHash: string | null;
}

export async function checkPedidoRateLimit(
  db: SupabaseClient,
  ip: string,
): Promise<PedidoRateLimitResult> {
  if (!ip || ip === "unknown") return { allowed: true, ipHash: null };
  const ipHash = hashPedidoIp(ip);
  try {
    const since = new Date(Date.now() - PEDIDOS_WINDOW_MIN * 60 * 1000).toISOString();
    const { count, error } = await db
      .from("joybees_pedidos_publicos")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .gte("created_at", since);
    // Error = columna ausente (DDL pendiente) o store caído → fail-open y NO
    // incluir ip_hash en el insert (rompería el INSERT si la columna no existe).
    if (error) return { allowed: true, ipHash: null };
    if ((count ?? 0) >= PEDIDOS_MAX) return { allowed: false, ipHash };
    return { allowed: true, ipHash };
  } catch {
    return { allowed: true, ipHash: null }; // fail-open
  }
}
