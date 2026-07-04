// Rate-limit anti-spam del POST público de pedidos Reebok (pedido-publico).
// Mismo espíritu que src/lib/login-rate-limit.ts (store en Supabase por IP,
// FAIL-OPEN) pero más simple: en vez de tabla+RPC dedicadas, cuenta los pedidos
// YA GUARDADOS en reebok_pedidos_publicos por ip_hash en los últimos 10 min.
// Máximo PEDIDOS_MAX pedidos por IP por ventana.
//
// Requiere la columna ip_hash (migración
// supabase/migrations/20260704130000_reebok_pedidos_publicos_ip_hash.sql,
// PENDIENTE de correr manualmente). Mientras la columna no exista, la query de
// conteo devuelve error → fail-open y el INSERT no incluye ip_hash — el deploy
// es seguro antes del DDL, el rate-limit simplemente queda inerte.
//
// Se guarda un HASH truncado de la IP (sha256, 32 hex chars), nunca la IP en
// claro. Es una capa anti-spam, NO seguridad: ante cualquier error del store el
// pedido pasa.

import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export const PEDIDOS_MAX = 5;          // pedidos por IP por ventana
export const PEDIDOS_WINDOW_MIN = 10;  // ventana en minutos

export function hashPedidoIp(ip: string): string {
  return createHash("sha256").update(`reebok-pedido:${ip}`).digest("hex").slice(0, 32);
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
      .from("reebok_pedidos_publicos")
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
