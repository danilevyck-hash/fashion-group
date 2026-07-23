/**
 * Telemetría compartida para crons: heartbeat de éxito + alerta de error.
 *
 * - recordCronHeartbeat(name): registra que el cron terminó OK hoy. El watchdog
 *   (dentro de switch-reconciliacion, 10/14/18 UTC) revisa estos heartbeats y
 *   alerta si alguno excede su umbral stale (cronStaleThresholdHours: 26h por
 *   defecto, propio para crons no diarios como grupo-resumen-mensual).
 * - logCronError(tipo, message, context?, opts?): persiste el error en
 *   cron_email_errors (igual que antes) Y dispara una alerta Telegram con el
 *   error truncado a 200 chars (shortError). Si el caller ya mandó su propia
 *   alerta Telegram con más detalle, pasar { telegram: false } para persistir
 *   sin duplicar el aviso. Tolerante a fallos: nunca lanza, así un fallo de
 *   logging no tumba al cron que lo llama.
 *
 * Requiere la tabla cron_heartbeats (ver migración
 * supabase/migrations/*_cron_heartbeats.sql) — aplicar manualmente.
 */

import { supabaseServer } from "@/lib/supabase-server";
import { sendTelegramAlert, shortError } from "@/lib/telegram";

// ─── Umbrales de "staleness" del watchdog (fuente ÚNICA para AMBOS watchdogs) ──
// Hay dos vigías de crons: health-crons (monitor externo, responde 200/503) y el
// watchdog Telegram dentro de switch-reconciliacion. Antes cada uno tenía su
// propia copia del umbral; el de switch-reconciliacion se quedó sin el mapa
// mensual y alertaba falsamente que grupo-resumen-mensual (mensual, día 3)
// estaba caído. Ambos importan estas constantes/helpers para no volver a divergir.

/** Umbral por defecto (horas) sin success antes de marcar un cron como stale.
 *  26h da margen sobre el ciclo diario (1×/día) sin tragarse un día entero. */
export const CRON_STALE_HOURS_DEFAULT = 26;

/** Umbrales propios por cron NO diario. El default de 26h marcaría un cron
 *  mensual como caído ~29 días/mes; grupo-resumen-mensual corre el día 3 → 33
 *  días cubren el gap más largo entre corridas aun con jitter. */
export const CRON_STALE_HOURS_POR_CRON: Record<string, number> = {
  "grupo-resumen-mensual": 33 * 24,
};

/** Horas de umbral stale para un cron (su override propio o el default). */
export function cronStaleThresholdHours(cronName: string): number {
  return CRON_STALE_HOURS_POR_CRON[cronName] ?? CRON_STALE_HOURS_DEFAULT;
}

/** ¿Un cron está stale? true si nunca registró success (fecha inválida/ausente)
 *  o si su último success es anterior al umbral (propio o default). Lógica ÚNICA
 *  usada por health-crons y por el watchdog de switch-reconciliacion. */
export function cronIsStale(
  cronName: string,
  lastSuccessAt: string | null | undefined,
  now: number = Date.now(),
): boolean {
  const t = lastSuccessAt ? new Date(lastSuccessAt).getTime() : NaN;
  if (!Number.isFinite(t)) return true;
  return t < now - cronStaleThresholdHours(cronName) * 3600 * 1000;
}

// ─── Metadata de recuperación (fuente ÚNICA para AMBOS watchdogs) ─────────────
// Un cron stale NO amerita alerta si su recuperación AÚN viene hoy: la
// reconciliación (para los colaterales) o su propia 2ª entrada del día en
// vercel.json (backup / acs-fidelizacion). Antes esta metadata vivía duplicada
// (recoverAfterHourUtc inline en COLATERAL_CRONS de switch-reconciliacion y
// nada en health-crons, que alertaba 503 aunque la recuperación estuviera a
// horas de distancia). Ahora ambos leen de aquí.

/** Horas UTC de las pasadas de switch-reconciliacion (espejo de vercel.json). */
export const RECONCILIACION_PASS_HOURS = [10, 14, 18];

/**
 * Crons cuya recuperación es una pasada de reconciliación, con su hora UTC
 * mínima de recuperación (0 = recuperable en cualquier pasada). Debe reflejar
 * COLATERAL_CRONS de switch-reconciliacion (que lee de aquí, no al revés) más
 * "switch-sync", cuyos pares faltantes la reconciliación también recupera
 * (detección por switch_sync_log, no por heartbeat).
 *
 * Hora mínima > 0 = crons que corren TARDE y/o disparan una alerta única:
 * recuperarlos antes de su hora normal duplicaría la alerta (ver comentarios
 * por-colateral en switch-reconciliacion).
 */
export const COLATERAL_RECOVER_AFTER_HOUR_UTC: Record<string, number> = {
  "switch-sync": 0,
  "sync-clientes-master": 0,
  "sync-utilidad": 0,
  "sync-recibos": 0,
  "switch-articulos": 0,
  "multifashion-sync": 0,
  "sync-proveedores": 0,
  "refresh-clientes-views": 0,
  "cleanup-packing-lists": 0,
  "acs-resumen-diario": 0,
  "integrity-check": 13, // su cron corre 12:00 UTC
  "cheques-alert": 14, // su cron corre 13:00 UTC
  // grupo-resumen-mensual: su run normal es el día 3 a las 13:00 UTC y su
  // recuperación solo aplica los días 3-4 (recoverOnlyIf en la reconciliación).
  // Sigue en NUNCA_SILENCIAR: los watchdogs jamás lo silencian por "recuperación
  // en camino" (demasiado esporádico para asumirla).
  "grupo-resumen-mensual": 14,
  "joybees-catalogo": 12, // su cron corre 11:00 UTC
  "reebok-catalogo": 8, // slot temprano 06:45 + 1h
};

/**
 * Crons con 2ª entrada del día en vercel.json (hora UTC fraccional, ej. 18.5 =
 * 18:30). No los recupera la reconciliación (pesados / sesión Switch propia):
 * su "recuperación que viene" es su propia 2ª corrida, que solo trabaja si la
 * 1ª no registró success hoy (guard no-op en el route).
 */
export const SECOND_ENTRY_HOUR_UTC: Record<string, number> = {
  backup: 18.5,
  "acs-fidelizacion": 16.5,
};

/** Crons que JAMÁS se silencian por "recuperación en camino": la reconciliación
 *  es el propio recuperador (si está caída no hay red de seguridad) y el
 *  resumen mensual es demasiado esporádico para asumir auto-recuperación. */
export const NUNCA_SILENCIAR = new Set(["switch-reconciliacion", "grupo-resumen-mensual"]);

/**
 * ¿La recuperación de este cron AÚN viene hoy? (nowHourUtc puede ser
 * fraccional: 14.5 = 14:30 UTC.)
 *   - 2ª entrada propia: viene si aún no es la hora de esa entrada.
 *   - Colateral: viene si queda una pasada de reconciliación POSTERIOR a ahora
 *     entre las elegibles (hora >= su recoverAfterHourUtc). Estricto (>): la
 *     pasada en curso no cuenta como "por venir" — si su recuperación falla, la
 *     propia reconciliación alerta con mensaje preciso (failedColaterales).
 */
export function recoveryStillComingToday(cronName: string, nowHourUtc: number): boolean {
  if (NUNCA_SILENCIAR.has(cronName)) return false;
  const secondEntry = SECOND_ENTRY_HOUR_UTC[cronName];
  if (secondEntry !== undefined) return nowHourUtc < secondEntry;
  const after = COLATERAL_RECOVER_AFTER_HOUR_UTC[cronName];
  if (after === undefined) return false; // sin recuperación conocida → alertar normal
  const eligible = RECONCILIACION_PASS_HOURS.filter((p) => p >= after);
  if (eligible.length === 0) return false;
  return Math.max(...eligible) > nowHourUtc;
}

/** Tope duro de silenciamiento: pasado esto, stale alerta SIEMPRE aunque la
 *  metadata prometa recuperación (protege contra recuperaciones que fallan día
 *  tras día o metadata desactualizada). */
export const PENDING_RECOVERY_MAX_HOURS = 30;

// ─── Heartbeats por-slot de switch-sync ──────────────────────────────────────
// El heartbeat base "switch-sync" lo refresca CUALQUIERA de las ~13 entradas
// diarias del path → una entrada intradía perdida (ej. estadocuenta de las
// 21:10) era invisible para health-crons. Cada entrada de vercel.json lleva
// ahora `&slot=<tipo>-<hhmm>` (hhmm = hora UTC de SU schedule, ej.
// estadocuenta-2110) y el route registra, ADEMÁS del heartbeat base, uno
// granular "switch-sync:<slot>". Esta lista es espejo de vercel.json — al
// agregar/mover una entrada de switch-sync, actualizar aquí.
//
// Regla de vigilancia en health-crons (distinta del fail-closed de los 18
// nombres base): si la fila del slot NO existe todavía → NO es stale (el cron
// la siembra solo en <24h tras el deploy; sin esto, el primer día daría un 503
// falso con los 13 slots "ausentes"). Solo alerta si la fila EXISTE y está
// vieja (umbral 26h).
export const SWITCH_SYNC_SLOT_HEARTBEATS = [
  "switch-sync:all-0530",
  "switch-sync:all-0535",
  "switch-sync:all-0540",
  "switch-sync:all-0630",
  "switch-sync:facturas-1500",
  "switch-sync:estadocuenta-1600",
  "switch-sync:estadocuenta-1605",
  "switch-sync:estadocuenta-1610",
  "switch-sync:estadocuenta-2110",
  "switch-sync:estadocuenta-2115",
  "switch-sync:estadocuenta-2120",
  "switch-sync:facturas-2315",
  "switch-sync:facturas-0015",
];

/**
 * ¿Un cron stale califica como "pendingRecovery" (recuperación en camino) en
 * vez de contar como caído? Requiere: (a) recuperación conocida que AÚN viene
 * hoy, y (b) stale hace MENOS de PENDING_RECOVERY_MAX_HOURS. Un cron sin
 * heartbeat jamás (fecha ausente/ inválida = fail-closed → caído). Compartida:
 * health-crons (no cuenta para el 503) y watchdog Telegram de la reconciliación
 * (no manda alerta fantasma).
 */
export function staleEsPendingRecovery(
  cronName: string,
  lastSuccessAt: string | null | undefined,
  now: number = Date.now(),
): boolean {
  const t = lastSuccessAt ? new Date(lastSuccessAt).getTime() : NaN;
  if (!Number.isFinite(t)) return false;
  if (now - t >= PENDING_RECOVERY_MAX_HOURS * 3600 * 1000) return false;
  const d = new Date(now);
  const nowHourUtc = d.getUTCHours() + d.getUTCMinutes() / 60;
  return recoveryStillComingToday(cronName, nowHourUtc);
}

/**
 * ¿El cron ya registró un success HOY (día UTC)? Guard de las 2ª entradas del
 * día (backup 18:30, acs-fidelizacion 16:30): si la 1ª corrida ya fue exitosa,
 * la 2ª responde no-op sin trabajar. Fail-open: si la lectura falla, devuelve
 * false → el cron trabaja (mejor un run de más que un día sin backup). No lanza.
 */
export async function cronSuccessHoyUtc(cronName: string): Promise<boolean> {
  try {
    const { data, error } = await supabaseServer
      .from("cron_heartbeats")
      .select("last_success_at")
      .eq("cron_name", cronName)
      .maybeSingle();
    if (error || !data?.last_success_at) return false;
    return data.last_success_at >= `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;
  } catch {
    return false;
  }
}

/** Marca al cron como exitoso ahora (upsert por cron_name). No lanza. */
export async function recordCronHeartbeat(cronName: string): Promise<void> {
  try {
    const { error } = await supabaseServer
      .from("cron_heartbeats")
      .upsert(
        { cron_name: cronName, last_success_at: new Date().toISOString() },
        { onConflict: "cron_name" },
      );
    if (error) {
      console.error(`[cron-telemetry] heartbeat ${cronName} falló: ${error.message}`);
    }
  } catch (err) {
    console.error(
      `[cron-telemetry] heartbeat ${cronName} threw: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Registra un error de cron en cron_email_errors y dispara alerta Telegram.
 * No lanza. `context` es opcional (se guarda en cheque_context por compat con
 * el esquema existente de la tabla). `opts.telegram` (default true) permite
 * persistir sin mandar Telegram cuando el caller ya envió una alerta propia
 * más específica (evita el doble aviso).
 */
export async function logCronError(
  tipo: string,
  message: string,
  context?: string | null,
  opts?: { telegram?: boolean },
): Promise<void> {
  // 1. Persistir en cron_email_errors (best-effort).
  try {
    const { error } = await supabaseServer.from("cron_email_errors").insert({
      tipo,
      cheque_context: context ?? null,
      error_message: message,
    });
    if (error) {
      console.error(`[cron-telemetry] insert cron_email_errors falló: ${error.message}`);
    }
  } catch (err) {
    console.error(
      `[cron-telemetry] insert cron_email_errors threw: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // 2. Alerta Telegram con el error truncado (best-effort; sendTelegramAlert no
  // lanza). Se omite si el caller ya mandó su propia alerta específica.
  if (opts?.telegram !== false) {
    await sendTelegramAlert(`🚨 Cron error — ${tipo}\n${shortError(message)}`);
  }
}
