// ─────────────────────────────────────────────────────────────────────────────
// La lectura del resumen mensual por empresa (`ventas_dashboard_summary_v2`),
// compartida por Ventas › Resumen, Vista General y /api/ventas/v2.
//
// 🩸 POR QUÉ HAY UNA `_v2` (3-sep-2026): el costo del mes en curso salía de
// `switch_articulo_diario`, que NO trae notas de débito. Active Wear agosto
// 2026 mostró costo −$44.483,03 (una NC de $74.166 restada y su ND de $73.752
// nunca sumada). La `_v2` suma las ND desde `switch_factura_utilidad`, la única
// fuente con costo por documento. Migración `20260915120000`.
//
// Mientras la DDL no corra, se cae a la `_v1` (`rpcConFallbackDeVersion`), que
// es la misma consulta sin las ND: el deploy no exige orden.
//
// ⚠️ `grupo-resumen-mensual.ts` sigue en la `_v1` a propósito: solo lee
// `total_subtotal` (ventas), y las ventas son idénticas en las dos.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseServer } from "@/lib/supabase-server";
import { withDbRetry } from "@/lib/supabase-retry";
import { rpcConFallbackDeVersion } from "@/lib/ventas/rpc-version";
import type { SupabaseLikeResult } from "@/lib/supabase-retry";

export const RPC_DASHBOARD_SUMMARY = "ventas_dashboard_summary_v2";
export const RPC_DASHBOARD_SUMMARY_ANTERIOR = "ventas_dashboard_summary";

/** Fila de la RPC: por empresa × mes. Los montos llegan como string (numeric). */
export interface DashboardSummaryFila {
  empresa: string;
  mes: number;
  total_subtotal: number | string | null;
  total_costo: number | string | null;
  total_utilidad: number | string | null;
  total_facturado: number | string | null;
  filas: number | string | null;
}

/**
 * La lectura, con reintento de caché fría y la cadena de versiones
 * (`_v2` → `_v1`).
 */
export function leerDashboardSummary(anio: number): Promise<SupabaseLikeResult<DashboardSummaryFila[]>> {
  const llamar = (fn: string) =>
    withDbRetry(
      () => supabaseServer.rpc(fn, { p_anio: anio }) as PromiseLike<SupabaseLikeResult<DashboardSummaryFila[]>>,
      { label: fn },
    );
  return rpcConFallbackDeVersion<DashboardSummaryFila[]>(
    () => llamar(RPC_DASHBOARD_SUMMARY),
    () => llamar(RPC_DASHBOARD_SUMMARY_ANTERIOR),
    { label: RPC_DASHBOARD_SUMMARY },
  );
}
