/**
 * Política de alertas Telegram para errores de sync Switch (anti-ruido 401).
 *
 * Switch es sesión única por empresa: un login concurrente mata el token del
 * otro → "HTTP 401: TOKEN INVALIDO" transitorio que el siguiente run (o la
 * reconciliación de 10:00/14:00/18:00) casi siempre recupera solo. Alertar al
 * primer 401 es puro ruido.
 *
 * Regla (jul-2026):
 *   - Error 401/token → NO alerta inmediata. Se persiste en cron_email_errors
 *     (telegram:false) y el fallo ya quedó en switch_sync_log como siempre.
 *   - Si la MISMA empresa falla con 401 en 2+ corridas CONSECUTIVAS del mismo
 *     sync (mirando switch_sync_log por empresa_key+sync_type) → alerta
 *     escalada indicando que es fallo repetido y desde cuándo.
 *   - Cualquier error NO-401 (LICENCIA NO ACTIVA, 5xx, timeout, red) sigue
 *     alertando de inmediato como hasta ahora.
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

interface SyncLogStreakRow {
  status: string;
  started_at: string;
  error_message: string | null;
}

export interface Escalation401 {
  /** true si hay que mandar la alerta Telegram (2+ corridas consecutivas 401). */
  escalate: boolean;
  /** Corridas consecutivas con 401 (incluida la actual). 0 = no se pudo medir. */
  streak: number;
  /** started_at de la PRIMERA corrida del streak (desde cuándo falla). */
  sinceIso: string | null;
}

/**
 * Corridas consecutivas (desde la más reciente hacia atrás) que terminaron en
 * error 401. `rows` viene ordenado descendente por started_at y sin 'running'.
 * Pura para poder testearla sin DB.
 */
export function computeStreak401(rows: SyncLogStreakRow[]): { streak: number; sinceIso: string | null } {
  let streak = 0;
  let sinceIso: string | null = null;
  for (const row of rows) {
    if (row.status !== "error" || !isSwitch401(row.error_message)) break;
    streak++;
    sinceIso = row.started_at;
  }
  return { streak, sinceIso };
}

/**
 * ¿La corrida que ACABA de fallar con 401 es la 2da (o más) consecutiva para
 * (empresa, sync_type)? Cuando esto corre, el sync ya finalizó su fila de
 * switch_sync_log como 'error' (los syncs finalizan el log antes de rethrow),
 * así que la corrida actual es la primera fila del resultado.
 *
 * Fail-open a alertar en DOS casos, ambos con streak=0 (sin medir):
 *   - la consulta al log falla.
 *   - la consulta OK pero la corrida actual NO aparece registrada (p.ej. el
 *     CHECK de sync_type aún no admite el tipo nuevo y el INSERT degradó, ver
 *     sync-log.ts) → sin historia confiable. Sin esto, un cron cuyo logging no
 *     funcione tendría sus 401 silenciados PARA SIEMPRE.
 * Mejor un aviso de más que un 401 persistente en silencio.
 */
export async function evaluateSwitch401Escalation(
  empresaKey: string,
  syncType: string,
): Promise<Escalation401> {
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
    const { streak, sinceIso } = computeStreak401(data as SyncLogStreakRow[]);
    // streak=0 = la corrida actual (que acaba de fallar con 401) no aparece en
    // el log → historia no confiable → fail-open a alertar.
    return { escalate: streak >= 2 || streak === 0, streak, sinceIso };
  } catch (err) {
    console.error(`[alert-policy] evaluateSwitch401Escalation threw: ${err instanceof Error ? err.message : String(err)}`);
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
 *   - NO-401 → una alerta Telegram inmediata (comportamiento de siempre).
 *   - 401    → silencio en la 1ra corrida; alerta escalada si la misma
 *              empresa+sync acumula 2+ corridas consecutivas con 401.
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
  const inmediatos = errores.filter((e) => !isSwitch401(e.error));
  const token401 = errores.filter((e) => isSwitch401(e.error));

  if (inmediatos.length > 0) {
    const detalle = inmediatos.map((e) => `${e.empresaKey}/${e.syncType}: ${e.error}`).join("; ");
    await logCronError(cronName, `${inmediatos.length} sync(s) fallaron — ${detalle}${nota}`);
  }

  for (const e of token401) {
    const esc = await evaluateSwitch401Escalation(e.empresaKey, e.syncType);
    if (esc.escalate) {
      const desde = esc.streak >= 2 && esc.sinceIso
        ? `${esc.streak} corridas consecutivas con 401, falla desde ${fmtPanama(esc.sinceIso)} (Panamá)`
        : "no pude medir el historial en switch_sync_log (corrida sin registrar o consulta fallida) — alerto por seguridad";
      await sendTelegramAlert(
        `🚨 Switch 401 REPETIDO — ${cronName} · ${e.empresaKey}/${e.syncType}\n` +
          `${desde}.\nÚltimo error: ${shortError(e.error)}${nota}`,
      );
      await logCronError(
        cronName,
        `401 repetido (${esc.streak || "?"} corridas) — ${e.empresaKey}/${e.syncType}: ${e.error}`,
        null,
        { telegram: false },
      );
    } else {
      // 1er 401 consecutivo: transitorio esperado de la sesión única. Queda en
      // switch_sync_log + cron_email_errors; la reconciliación lo reintenta y
      // alertará ella misma si el par sigue sin success tras recuperar.
      await logCronError(
        cronName,
        `401 transitorio (1ra corrida, sin alerta) — ${e.empresaKey}/${e.syncType}: ${e.error}`,
        null,
        { telegram: false },
      );
    }
  }
}
