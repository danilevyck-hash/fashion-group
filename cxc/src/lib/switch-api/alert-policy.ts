/**
 * Política de alertas Telegram para errores de sync Switch (anti-ruido).
 *
 * Switch es sesión única por empresa (un login concurrente mata el token del
 * otro → 401 transitorio) y además su red se cae a ratos (ECONNREFUSED /
 * CONNECT_TIMEOUT / 5xx, incidente 17-jul-2026: ~10 alertas de red que la
 * reconciliación de 10:00/14:00/18:00 recuperó sola a las 14:18). Alertar al
 * primer fallo transitorio es puro ruido.
 *
 * Regla (ampliada 17-jul-2026, antes solo cubría 401):
 *   - Error SILENCIABLE (401/token O red/timeout/5xx) → NO alerta inmediata.
 *     Se persiste en cron_email_errors (telegram:false) y el fallo ya quedó en
 *     switch_sync_log como siempre; la reconciliación lo reintenta y alerta
 *     ella misma si el par sigue caído tras recuperar.
 *   - Si la MISMA empresa falla silenciable en 2+ corridas CONSECUTIVAS del
 *     mismo sync (mirando switch_sync_log por empresa_key+sync_type) → alerta
 *     escalada indicando que es fallo repetido y desde cuándo.
 *   - LICENCIA NO ACTIVA y errores de negocio no clasificados siguen alertando
 *     de inmediato (requieren acción de Daniel).
 *
 * Los routes que usan esto: switch-sync (facturas/estadocuenta/costo),
 * sync-recibos, sync-utilidad y —desde jul-2026, vía sync-log.ts— también
 * switch-articulos (articulos), multifashion-sync (multifashion) y los
 * catálogos (catalogo_reebok / catalogo_joybees). Todos registran cada corrida
 * por empresa_key+sync_type en switch_sync_log; ese log es la fuente del streak.
 */

import { supabaseServer } from "@/lib/supabase-server";
import { sendTelegramAlert, shortError } from "@/lib/telegram";
import { logCronError } from "@/lib/cron-telemetry";

/**
 * ¿El mensaje corresponde a un 401/token de Switch (transitorio de sesión
 * única)? Calibrado contra switch_sync_log de producción (jul-2026):
 *   - token muerto a media paginación → "… → HTTP 401: TOKEN INVALIDO"
 *   - auth rechazada                  → "Auth fallo: HTTP 401 — …"
 * "LICENCIA NO SE ENCUENTRA ACTIVA" llega con HTTP 400 (no matchea), pero se
 * excluye explícito por si Switch algún día la devuelve como 401: esa alerta
 * SIEMPRE debe salir de inmediato.
 */
export function isSwitch401(message: string | null | undefined): boolean {
  if (!message) return false;
  if (/LICENCIA/i.test(message)) return false;
  return /HTTP 40[13]|TOKEN INVALIDO|TOKEN EXPIRADO/i.test(message);
}

/**
 * ¿Error transitorio de red/servidor de Switch? Calibrado contra los mensajes
 * que arma client.ts (rawCall) y switch_sync_log de producción (17-jul-2026):
 *   - "Error de red en /autenticacion: fetch failed (ECONNREFUSED)"
 *   - "Error de red en …: fetch failed (UND_ERR_CONNECT_TIMEOUT)"
 *   - "Timeout >30000ms en /apifactura"
 *   - "… → HTTP 502: Bad Gateway"
 * LICENCIA se excluye explícito: esa alerta SIEMPRE sale de inmediato.
 */
export function isSwitchTransitorio(message: string | null | undefined): boolean {
  if (!message) return false;
  if (/LICENCIA/i.test(message)) return false;
  return /Error de red en |Timeout >\d+ms|HTTP 5\d\d/i.test(message);
}

/** Silenciable = transitorio esperado (sesión única 401 o red/5xx) que la
 *  reconciliación casi siempre recupera sola → streak, no alerta inmediata. */
export function isSwitchSilenciable(message: string | null | undefined): boolean {
  return isSwitch401(message) || isSwitchTransitorio(message);
}

interface SyncLogStreakRow {
  status: string;
  started_at: string;
  error_message: string | null;
}

export interface EscalationSwitch {
  /** true si hay que mandar la alerta Telegram (2+ corridas consecutivas silenciables). */
  escalate: boolean;
  /** Corridas consecutivas silenciables (incluida la actual). 0 = no se pudo medir. */
  streak: number;
  /** started_at de la PRIMERA corrida del streak (desde cuándo falla). */
  sinceIso: string | null;
}

/**
 * Corridas consecutivas (desde la más reciente hacia atrás) que terminaron en
 * error SILENCIABLE (401 o red/timeout/5xx — un 401 seguido de un timeout del
 * mismo par sigue siendo el mismo Switch caído, no corta el streak). `rows`
 * viene ordenado descendente por started_at y sin 'running'. Pura para poder
 * testearla sin DB.
 */
export function computeStreakSilenciable(rows: SyncLogStreakRow[]): { streak: number; sinceIso: string | null } {
  let streak = 0;
  let sinceIso: string | null = null;
  for (const row of rows) {
    if (row.status !== "error" || !isSwitchSilenciable(row.error_message)) break;
    streak++;
    sinceIso = row.started_at;
  }
  return { streak, sinceIso };
}

/**
 * ¿La corrida que ACABA de fallar con error silenciable es la 2da (o más)
 * consecutiva para (empresa, sync_type)? Cuando esto corre, el sync ya finalizó
 * su fila de switch_sync_log como 'error' (los syncs finalizan el log antes de
 * rethrow), así que la corrida actual es la primera fila del resultado.
 *
 * Fail-open a alertar en DOS casos, ambos con streak=0 (sin medir):
 *   - la consulta al log falla.
 *   - la consulta OK pero la corrida actual NO aparece registrada (p.ej. el
 *     CHECK de sync_type aún no admite el tipo nuevo y el INSERT degradó, ver
 *     sync-log.ts) → sin historia confiable. Sin esto, un cron cuyo logging no
 *     funcione tendría sus fallos silenciados PARA SIEMPRE.
 * Mejor un aviso de más que un fallo persistente en silencio.
 */
export async function evaluateSwitchEscalation(
  empresaKey: string,
  syncType: string,
): Promise<EscalationSwitch> {
  try {
    const { data, error } = await supabaseServer
      .from("switch_sync_log")
      .select("status, started_at, error_message")
      .eq("empresa_key", empresaKey)
      .eq("sync_type", syncType)
      .neq("status", "running")
      .order("started_at", { ascending: false })
      .limit(10);
    if (error || !data) {
      console.error(`[alert-policy] no pude leer switch_sync_log (${empresaKey}/${syncType}): ${error?.message ?? "vacío"}`);
      return { escalate: true, streak: 0, sinceIso: null };
    }
    const { streak, sinceIso } = computeStreakSilenciable(data as SyncLogStreakRow[]);
    // streak=0 = la corrida actual (que acaba de fallar) no aparece en el log
    // → historia no confiable → fail-open a alertar.
    return { escalate: streak >= 2 || streak === 0, streak, sinceIso };
  } catch (err) {
    console.error(`[alert-policy] evaluateSwitchEscalation threw: ${err instanceof Error ? err.message : String(err)}`);
    return { escalate: true, streak: 0, sinceIso: null };
  }
}

/** "9 jul 2026, 02:50" en hora Panamá, para el "desde cuándo" de la alerta. */
function fmtPanama(iso: string): string {
  return new Intl.DateTimeFormat("es-PA", {
    timeZone: "America/Panama",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export interface CronSwitchError {
  empresaKey: string;
  /** sync_type de switch_sync_log (facturas|estadocuenta|costo|recibos|utilidad|
   *  articulos|multifashion|catalogo_reebok|catalogo_joybees). */
  syncType: string;
  error: string;
}

/**
 * Punto único de alerta para los crons de sync Switch. Separa los errores en:
 *   - NO silenciables (LICENCIA, negocio) → alerta Telegram inmediata.
 *   - Silenciables (401/red/timeout/5xx) → silencio en la 1ra corrida; alerta
 *     escalada si la misma empresa+sync acumula 2+ corridas consecutivas.
 * Todo se persiste en cron_email_errors (vía logCronError). Nunca lanza.
 * `opts.nota`: contexto extra que se anexa a los mensajes de Telegram (ej. los
 * catálogos agregan "Su catálogo NO se modificó (fail-safe)").
 */
export async function alertSwitchCronErrors(
  cronName: string,
  errores: CronSwitchError[],
  opts?: { nota?: string },
): Promise<void> {
  const nota = opts?.nota ? `\n${opts.nota}` : "";
  const inmediatos = errores.filter((e) => !isSwitchSilenciable(e.error));
  const silenciables = errores.filter((e) => isSwitchSilenciable(e.error));

  if (inmediatos.length > 0) {
    const detalle = inmediatos.map((e) => `${e.empresaKey}/${e.syncType}: ${e.error}`).join("; ");
    await logCronError(cronName, `${inmediatos.length} sync(s) fallaron — ${detalle}${nota}`);
  }

  for (const e of silenciables) {
    const esc = await evaluateSwitchEscalation(e.empresaKey, e.syncType);
    if (esc.escalate) {
      const desde = esc.streak >= 2 && esc.sinceIso
        ? `${esc.streak} corridas consecutivas fallando (401/red), falla desde ${fmtPanama(esc.sinceIso)} (Panamá)`
        : "no pude medir el historial en switch_sync_log (corrida sin registrar o consulta fallida) — alerto por seguridad";
      await sendTelegramAlert(
        `🚨 Switch fallo REPETIDO — ${cronName} · ${e.empresaKey}/${e.syncType}\n` +
          `${desde}.\nÚltimo error: ${shortError(e.error)}${nota}`,
      );
      await logCronError(
        cronName,
        `fallo repetido (${esc.streak || "?"} corridas) — ${e.empresaKey}/${e.syncType}: ${e.error}`,
        null,
        { telegram: false },
      );
    } else {
      // 1er fallo consecutivo: transitorio esperado (sesión única o red de
      // Switch). Queda en switch_sync_log + cron_email_errors; la reconciliación
      // lo reintenta y alertará ella misma si el par sigue sin success.
      await logCronError(
        cronName,
        `fallo transitorio (1ra corrida, sin alerta) — ${e.empresaKey}/${e.syncType}: ${e.error}`,
        null,
        { telegram: false },
      );
    }
  }
}
