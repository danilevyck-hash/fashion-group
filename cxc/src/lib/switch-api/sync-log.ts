/**
 * Helpers DEGRADABLES para registrar corridas en switch_sync_log (mismo formato
 * que switch-sync: empresa_key + sync_type + status running→success/error).
 *
 * Usados por los syncs que se sumaron al log en jul-2026 para la política
 * anti-ruido 401 (alert-policy.ts): articulos, multifashion, catalogo_reebok,
 * catalogo_joybees. Los syncs originales (facturas/estadocuenta/costo en
 * sync-empresa.ts, recibos, utilidad) conservan sus helpers propios.
 *
 * DEGRADABLE (patrón de syncCostoDiario): si el INSERT falla —p.ej. el CHECK de
 * sync_type aún no incluye el tipo nuevo (migración manual pendiente)— NO se
 * aborta el sync: se pierde solo la observabilidad de esa corrida (console.error)
 * y logId queda null. La política 401 es fail-open ante historia ilegible, así
 * que sin log el 401 alerta inmediato (comportamiento previo, sin regresión).
 */

import { supabaseServer } from "@/lib/supabase-server";

export type SwitchSyncTriggeredBy = "cron" | "manual" | "backfill";

// Los `sync_type` que la base admite viven en un módulo PURO (sin Supabase):
// el candado que los compara contra el SQL no puede necesitar credenciales para
// correr. Se re-exportan acá porque este es el archivo que los usa.
export { SYNC_LOG_TYPES, type SyncLogType } from "./sync-log-tipos";
import type { SyncLogType } from "./sync-log-tipos";

// ─── Lock de corrida en curso (índice único parcial) ─────────────────────────
// DDL 20260723150000_switch_sync_running_lock.sql (manual): índice único
// parcial sobre (empresa_key, sync_type) WHERE status='running'. Con el índice
// aplicado, el INSERT de la fila 'running' se vuelve MUTEX: dos corridas
// simultáneas del mismo (empresa, tipo) → la 2ª falla con 23505. Mientras la
// DDL no corra, el insert nunca conflictúa y todo queda como antes (tolerante).

// ─── El candado EXPIRA (27-jul-2026) ─────────────────────────────────────────
//
// 🩸 Por qué: una fila 'running' solo se cierra si el proceso que la abrió llega
// vivo a `finishSwitchSyncLog`. Cuando Vercel MATA la función al agotar su
// `maxDuration`, el proceso deja de existir en ese instante: no hay `finally`,
// `catch` ni `process.on('exit')` que alcance a escribir nada. La fila queda
// abierta para siempre y el índice único parcial la convierte en un candado
// puesto. NO es un bug de manejo de errores — es la consecuencia de un kill.
//
// Medido en producción el 27-jul-2026: las 3 corridas de `catalogo_tommy` que
// quedaron colgadas ese día eran `triggered_by='manual'`, o sea el botón
// "Actualizar ahora" (`/api/admin/sync-now`), que corría con `maxDuration=300`
// contra un trabajo que mide **427-485 s** (p50 485 s en 30 días). Muerte
// GARANTIZADA, no una carrera: 300 s de presupuesto para 8 min de trabajo. Las
// corridas del cron `tommy-catalogo` (maxDuration=800) del mismo día salieron
// success. Ese techo ya se corrigió a 800 s; esto es la red debajo.
//
// La consecuencia se arregla en DOS pasos, y los dos hacen falta:
//   1. el candado EXPIRA por tiempo (esta constante) — nadie que llegue después
//      queda bloqueado por un run que ya no existe;
//   2. la expiración NO depende de que vuelva a correr el MISMO par
//      (`barrerRunningAtascados`, barrido global) — `catalogo_tommy` corre 2×/día,
//      así que un atasco a las 18:52 bloqueaba hasta las 12:40 del día siguiente.

/** Techo de vida de una función en Vercel Pro + Fluid Compute. Pasado esto el
 *  proceso YA NO EXISTE: una fila 'running' más vieja es de un run muerto. */
export const FUNCTION_MAX_DURATION_S = 800;

/** Margen sobre el techo antes de declarar muerta una fila 'running'. Generoso a
 *  propósito: liberar el candado de una corrida VIVA es peor que esperar de más
 *  (Switch admite UN solo token válido por USUARIO —PDF del API, p. 6— y cada
 *  empresa entra con un único usuario de API, así que dos syncs simultáneos de
 *  la misma empresa se tumban el token entre sí, code 0006). */
const STALE_MARGIN_S = 1000;

/** Ventana tras la cual una fila 'running' se considera huérfana. Se DERIVA del
 *  techo real de la función (800 s = 13 min 20 s) + margen → 30 min, o sea más
 *  del doble de la vida máxima posible de un run. Cualquier fila más vieja es
 *  demostrablemente de un proceso que ya no está corriendo. */
export const RUNNING_STALE_MIN = Math.ceil((FUNCTION_MAX_DURATION_S + STALE_MARGIN_S) / 60);

/** Mensaje con el que se cierra una fila atascada. El prefijo se conserva
 *  IDÉNTICO al histórico (17 filas en producción lo llevan) y se le suma la
 *  marca `#atascado` — misma convención que `#recuperado` / `#visto` en
 *  `cron_heartbeats`: un sufijo estable que las capas de arriba pueden
 *  reconocer sin parsear prosa. */
export const MSG_RUN_ATASCADO =
  "Run previo atascado en 'running' (probable timeout); cerrado por el siguiente run. #atascado";

/**
 * ¿Esta fila de `switch_sync_log` es un run que se cerró por ATASCO y no un
 * fallo de verdad? Un proceso que Vercel mató no dice NADA sobre Switch: no es
 * evidencia de que esté caído ni de que esté sano.
 *
 * Reconoce las tres redacciones que existen en producción: la marca nueva
 * `#atascado`, el texto histórico del cierre por el run siguiente, y el de la
 * migración del lock (`20260723150000`, "Run atascado en running; cerrado por la
 * migracion del lock"). Sin esto, los 17 registros ya escritos seguirían
 * mintiéndole al streak de la política anti-ruido.
 */
export function esRunAtascado(errorMessage: string | null | undefined): boolean {
  if (!errorMessage) return false;
  return /#atascado|Run (previo )?atascado en '?running'?/i.test(errorMessage);
}

/** ¿El error es el conflicto del índice único de 'running' (23505)? Acepta el
 *  objeto de error de PostgREST, un Error ya envuelto o un string. */
export function isRunningLockConflict(err: unknown): boolean {
  const msg =
    typeof err === "string"
      ? err
      : err instanceof Error
        ? err.message
        : err && typeof err === "object"
          ? `${(err as { code?: string }).code ?? ""} ${(err as { message?: string }).message ?? ""}`
          : "";
  return /23505|duplicate key|switch_sync_log_running_lock/i.test(msg);
}

/** Corte de "esta fila es de un run muerto", en ISO. */
export function cutoffAtascado(ahora: Date = new Date()): string {
  return new Date(ahora.getTime() - RUNNING_STALE_MIN * 60 * 1000).toISOString();
}

/**
 * Cierra las filas 'running' huérfanas (> RUNNING_STALE_MIN) de un (empresa,
 * tipo). CRÍTICO con el índice único: sin esta limpieza, una corrida que murió
 * sin finalizar bloquearía TODOS los inserts futuros de ese par.
 *
 * Se llama ANTES de cada insert de fila running, y la corrida que limpia SIGUE
 * CON SU TRABAJO: limpiar es un paso previo, no un desenlace. Nunca lanza — un
 * fallo acá no puede tumbar un sync.
 */
export async function clearStaleRunning(empresaKey: string, syncType: string): Promise<void> {
  try {
    const { error } = await supabaseServer
      .from("switch_sync_log")
      .update({
        status: "error",
        finished_at: new Date().toISOString(),
        error_message: MSG_RUN_ATASCADO,
      })
      .eq("empresa_key", empresaKey)
      .eq("sync_type", syncType)
      .eq("status", "running")
      .lt("started_at", cutoffAtascado());
    if (error) {
      console.error(`[sync-log ${empresaKey}/${syncType}] clearStaleRunning falló: ${error.message}`);
    }
  } catch (err) {
    console.error(
      `[sync-log ${empresaKey}/${syncType}] clearStaleRunning threw: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * BARRIDO GLOBAL: cierra TODAS las filas 'running' vencidas, de cualquier
 * (empresa, sync_type). Devuelve cuántas cerró (null si no se pudo medir).
 *
 * 🩸 Por qué hace falta además del `clearStaleRunning` por par: ese solo corre
 * cuando vuelve a correr EL MISMO par. `catalogo_tommy` corre 2 veces al día
 * (12:40 y 17:40 UTC), así que la fila que quedó atascada el 27-jul a las 18:52
 * iba a seguir puesta —y el par bloqueado para "Actualizar ahora"— hasta las
 * 12:40 del día siguiente: **17 h 48 min de candado por un proceso que ya no
 * existía**. Con el barrido, el candado se suelta en la siguiente pasada de
 * cualquier cron que lo llame, sin importar de qué par sea.
 *
 * Lo llaman `switch-reconciliacion` (10/14/18 UTC, el conserje del sistema de
 * crons) y `cleanup-sessions` (02:30 UTC, junto a la poda del log). En los dos
 * es un paso NO FATAL.
 *
 * NO afloja la protección: el corte es el mismo `RUNNING_STALE_MIN` que ya usan
 * el pre-check de "Actualizar ahora" y la guarda de re-ejecución de slots, o sea
 * más del doble del `maxDuration` de la función. Una corrida VIVA nunca entra en
 * el barrido.
 */
export async function barrerRunningAtascados(): Promise<number | null> {
  try {
    const { data, error } = await supabaseServer
      .from("switch_sync_log")
      .update({
        status: "error",
        finished_at: new Date().toISOString(),
        error_message: MSG_RUN_ATASCADO,
      })
      .eq("status", "running")
      .lt("started_at", cutoffAtascado())
      .select("id");
    if (error) {
      console.error(`[sync-log] barrerRunningAtascados falló: ${error.message}`);
      return null;
    }
    return data?.length ?? 0;
  } catch (err) {
    console.error(
      `[sync-log] barrerRunningAtascados threw: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

export async function createSwitchSyncLog(opts: {
  empresaKey: string;
  /** Tipado contra `SYNC_LOG_TYPES` a propósito: un `string` suelto es lo que
   *  dejó pasar `catalogo_tommy` y `articulo_marca` sin su DDL. */
  syncType: SyncLogType;
  triggeredBy?: SwitchSyncTriggeredBy;
  rangeFrom?: string | null;
  rangeTo?: string | null;
}): Promise<string | null> {
  try {
    // Auto-sana huérfanos antes del insert: con el índice único de 'running'
    // una fila atascada bloquearía este insert para siempre.
    await clearStaleRunning(opts.empresaKey, opts.syncType);
    const { data, error } = await supabaseServer
      .from("switch_sync_log")
      .insert({
        empresa_key: opts.empresaKey,
        sync_type: opts.syncType,
        status: "running",
        range_from: opts.rangeFrom ?? null,
        range_to: opts.rangeTo ?? null,
        triggered_by: opts.triggeredBy ?? "cron",
        records_inserted: 0,
        records_updated: 0,
        records_skipped: 0,
      })
      .select("id")
      .single();
    if (error || !data) {
      // Conflicto del lock = hay OTRA corrida fresca del mismo (empresa, tipo)
      // en curso. Acá SÍ se lanza (mutex): el caller aborta limpio en vez de
      // correr en paralelo y chocar la sesión única de Switch.
      if (error && isRunningLockConflict(error)) {
        throw new Error(
          `Ya hay una corrida de ${opts.syncType} en curso para ${opts.empresaKey} (lock switch_sync_log_running_lock)`,
        );
      }
      console.error(
        `[sync-log ${opts.empresaKey}/${opts.syncType}] no pude crear switch_sync_log (¿CHECK de sync_type pendiente?): ${error?.message ?? "vacío"}`,
      );
      return null;
    }
    return (data as { id: string }).id;
  } catch (err) {
    if (isRunningLockConflict(err)) throw err; // mutex: no degradar el conflicto
    console.error(
      `[sync-log ${opts.empresaKey}/${opts.syncType}] createSwitchSyncLog threw: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

export async function finishSwitchSyncLog(
  logId: string | null,
  status: "success" | "error",
  fields?: {
    inserted?: number;
    updated?: number;
    skipped?: number;
    errorMessage?: string;
    /** Descartes del guard de montos. De acá sale el anti-loop de su aviso. */
    skipDetails?: unknown[];
  },
): Promise<void> {
  if (!logId) return;
  try {
    const { error } = await supabaseServer
      .from("switch_sync_log")
      .update({
        status,
        finished_at: new Date().toISOString(),
        records_inserted: fields?.inserted ?? 0,
        records_updated: fields?.updated ?? 0,
        records_skipped: fields?.skipped ?? 0,
        error_message: fields?.errorMessage ? fields.errorMessage.slice(0, 2000) : null,
        ...(fields?.skipDetails && fields.skipDetails.length > 0
          ? { skip_details: fields.skipDetails }
          : {}),
      })
      .eq("id", logId);
    if (error) console.error(`[sync-log] no pude finalizar switch_sync_log ${logId}: ${error.message}`);
  } catch (err) {
    console.error(`[sync-log] finishSwitchSyncLog threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}
