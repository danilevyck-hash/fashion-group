// Llamar a la versión NUEVA de una RPC y caer a la anterior si todavía no está.
//
// Las migraciones de este repo las corre Daniel a mano en el SQL Editor, así que
// entre el deploy del código y la corrida del SQL hay una ventana donde la
// función nueva NO existe. Sin esto, esa ventana deja la proyección de cierre
// en blanco en /ventas.
//
// La regla tiene una excepción importante, la misma que ya usa el fallback de
// ventas_dashboard_prev_same_period_v2: si la nueva falló por algo TRANSITORIO
// (statement timeout, corte de red), la anterior es la MISMA consulta pero más
// lenta — reintentarla solo duplica la espera del usuario. En ese caso se
// devuelve el error de la nueva y el retry de más arriba hace su trabajo.

import { isTransientDbError, type SupabaseLikeError, type SupabaseLikeResult } from "@/lib/supabase-retry";

export interface RpcVersionOptions {
  /** Para el log cuando se usa la versión vieja. */
  label?: string;
  logger?: (msg: string) => void;
}

/**
 * Devuelve el resultado de `nueva`. Si `nueva` falla por algo que NO es
 * transitorio (típicamente: la migración todavía no corrió y PostgREST responde
 * PGRST202 "función no encontrada"), reintenta con `anterior`.
 */
export async function rpcConFallbackDeVersion<T>(
  nueva: () => PromiseLike<SupabaseLikeResult<T>>,
  anterior: () => PromiseLike<SupabaseLikeResult<T>>,
  opts: RpcVersionOptions = {},
): Promise<SupabaseLikeResult<T>> {
  const res = await nueva();
  if (!res.error) return res;
  if (isTransientDbError(res.error)) return res;

  const logger = opts.logger ?? console.warn;
  logger(`[rpc-version] ${opts.label ?? "rpc"}: ${res.error.message} — usando la versión anterior`);
  return anterior();
}

/**
 * ¿El error dice que la función no existe? Es la firma exacta de "la migración
 * todavía no corrió" (PostgREST PGRST202 / Postgres 42883).
 */
export function esFuncionInexistente(error: SupabaseLikeError | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "PGRST202" || error.code === "42883") return true;
  const msg = (error.message ?? "").toLowerCase();
  return msg.includes("could not find the function") || msg.includes("does not exist");
}
