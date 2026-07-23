/**
 * Refresh on-demand de las vistas materializadas de Ventas (DB-only, sin
 * Switch): lo ejecuta el módulo `refresh-vistas` de /api/admin/sync-now como
 * PASO FINAL de la secuencia 1-clic de Ventas, para que el rollup mensual y el
 * vw de clientes queden al día con las facturas recién sincronizadas (sin esto
 * el botón "Actualizar ahora" de Ventas era deshonesto: el tab Clientes y los
 * meses cerrados seguían leyendo la foto vieja hasta el cron de las 07:35).
 *
 * Mismo patrón resiliente que el cron refresh-clientes-views (reintento único
 * tras espera CORTA si el error es transitorio — acá hay un usuario esperando,
 * no 45s como el cron). CONCURRENTLY en las RPCs: no bloquea lecturas, y dos
 * corridas simultáneas no rompen (la 2ª espera el lock de la 1ª) — por eso el
 * módulo no necesita fila 'running' propia; el doble-clic lo frena el cooldown.
 *
 * Al terminar OK registra el heartbeat "sync-now-refresh-vistas" (fila propia
 * en cron_heartbeats, IGNORADA por health-crons/watchdog — no enmascara al cron
 * real): es la base del cooldown de 10 min del módulo, junto con el heartbeat
 * del cron refresh-clientes-views (si el cron acaba de refrescar, tampoco tiene
 * sentido re-refrescar).
 *
 * NO toca switch_estadocuenta_aging_mv: esa la refresca in-process el módulo
 * estadocuenta (y el cron de las 07:35 la sigue cubriendo).
 */

import { supabaseServer } from "@/lib/supabase-server";
import { recordCronHeartbeat } from "@/lib/cron-telemetry";

/** cron_name del heartbeat manual (cooldown). También se mira el del cron. */
export const REFRESH_VISTAS_HEARTBEAT = "sync-now-refresh-vistas";
export const REFRESH_VISTAS_CRON_HEARTBEAT = "refresh-clientes-views";

// Rollup primero (alimenta Resumen), luego el vw de clientes (tab Clientes).
const RPCS = ["refresh_ventas_rollup_mensual_mv", "refresh_clientes_empresa_12m_vw"] as const;

const RETRY_WAIT_MS = 10_000;

/** ¿Error transitorio que amerita reintento? (statement timeout / red). */
function esTransitorio(msg: string): boolean {
  return /statement timeout|canceling statement|timed? ?out|57014|fetch failed|ECONNRESET|ETIMEDOUT|socket hang up/i.test(
    msg,
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Corre las 2 RPCs en orden, con UN reintento corto por RPC si el fallo es
 *  transitorio. Éxito = ambas refrescadas (y se registra el heartbeat). */
export async function runRefreshVistas(): Promise<{ ok: true } | { ok: false; error: string }> {
  for (const rpc of RPCS) {
    let { error } = await supabaseServer.rpc(rpc);
    if (error && esTransitorio(error.message)) {
      console.warn(`[refresh-vistas] ${rpc} transitorio ("${error.message}") — reintento en ${RETRY_WAIT_MS / 1000}s`);
      await sleep(RETRY_WAIT_MS);
      ({ error } = await supabaseServer.rpc(rpc));
    }
    if (error) return { ok: false, error: `${rpc}: ${error.message}` };
  }
  await recordCronHeartbeat(REFRESH_VISTAS_HEARTBEAT);
  return { ok: true };
}
