// ─────────────────────────────────────────────────────────────────────────────
// LAS RPC DE «RETAIL CONTRA RETAIL», CON RESPALDO (23-sep-2026).
//
// Con `RETAIL_AL_FRENTE` prendido se pide la versión NUEVA (la que lee solo
// `_multifashion_sf_vw`) y, si no existe todavía —la migración
// `20261217140000` la aplica Daniel—, se cae a la de siempre. Es el MISMO
// patrón que ya usan bonos (v4 → v3) y vendedoras (v5 → v4 → v3), por la
// puerta de la casa (`rpcConFallbackDeVersion`: un timeout NO dispara el
// respaldo, porque la vieja hace más trabajo y sería otro timeout).
//
// Con el interruptor apagado se pide directamente la vieja: la pantalla
// vuelve a ser la de antes sin tocar la base.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseServer } from "@/lib/supabase-server";
import { rpcConFallbackDeVersion } from "@/lib/ventas/rpc-version";
import { RETAIL_AL_FRENTE } from "./retail-al-frente";

/** Las parejas (nueva, vieja). Una sola lista: el candado la lee. */
export const RPC_RETAIL = {
  overviewSerie: ["multifashion_overview_serie_v2", "multifashion_overview_serie_v1"],
  proyeccionCierre: ["multifashion_proyeccion_cierre_v2", "multifashion_proyeccion_cierre_v1"],
  detalleMensual: ["multifashion_detalle_mensual_v3", "multifashion_detalle_mensual_v2"],
  bonos: ["multifashion_bonos_v5", "multifashion_bonos_v4"],
  retailRecurrentes: ["multifashion_retail_recurrentes_v3", "multifashion_retail_recurrentes_v2"],
} as const;

export type RpcRetail = keyof typeof RPC_RETAIL;

/** Qué RPC se pide primero para cada pareja, según el interruptor. */
export function nombreRpc(cual: RpcRetail, alFrente: boolean = RETAIL_AL_FRENTE): string {
  const [nueva, vieja] = RPC_RETAIL[cual];
  return alFrente ? nueva : vieja;
}

type Respuesta = Awaited<ReturnType<typeof supabaseServer.rpc>>;

/**
 * Pide la nueva y cae a la vieja si la nueva no existe todavía. Con el
 * interruptor apagado va derecho a la vieja.
 */
export async function rpcRetail(cual: RpcRetail, args: Record<string, unknown>): Promise<Respuesta> {
  const [nueva, vieja] = RPC_RETAIL[cual];
  if (!RETAIL_AL_FRENTE) return supabaseServer.rpc(vieja, args);
  return rpcConFallbackDeVersion(
    () => supabaseServer.rpc(nueva, args),
    () => supabaseServer.rpc(vieja, args),
    { label: nueva },
  ) as Promise<Respuesta>;
}
