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
 *  días cubren el gap más largo entre corridas aun con jitter. El resumen
 *  semanal de fotos corre los lunes → 8 días cubren el ciclo con margen. */
export const CRON_STALE_HOURS_POR_CRON: Record<string, number> = {
  "grupo-resumen-mensual": 33 * 24,
  "catalogos-fotos-resumen": 8 * 24,
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
  "reebok-catalogo": 13, // slot temprano 12:10 + ~1h (no adelantarse a su run normal)
  "tommy-catalogo": 13, // slot temprano 12:40 (no adelantarse a su run normal)
  // catalogos-fotos-resumen: run normal lunes 13:30 UTC → hora mínima 14
  // (patrón cheques-alert, no adelantarse) y su recuperación solo aplica los
  // lunes (recoverOnlyIf en la reconciliación). Sigue en NUNCA_SILENCIAR:
  // semanal = demasiado esporádico para asumir "recuperación en camino hoy".
  "catalogos-fotos-resumen": 14,
};

/**
 * Crons con 2ª entrada del día en vercel.json (hora UTC fraccional, ej. 18.5 =
 * 18:30). No los recupera la reconciliación (pesados / sesión Switch propia):
 * su "recuperación que viene" es su propia 2ª corrida, que solo trabaja si la
 * 1ª no registró success hoy (guard no-op en el route).
 */
export const SECOND_ENTRY_HOUR_UTC: Record<string, number> = {
  backup: 18.5,
  "backup-switch": 19.25, // 2ª entrada 19:15 UTC (vercel.json)
  "acs-fidelizacion": 16.5,
};

/** Crons que JAMÁS se silencian por "recuperación en camino": la reconciliación
 *  es el propio recuperador (si está caída no hay red de seguridad) y los
 *  resúmenes mensual/semanal son demasiado esporádicos para asumir
 *  auto-recuperación (su recovery solo aplica el día 3-4 / los lunes). */
export const NUNCA_SILENCIAR = new Set([
  "switch-reconciliacion",
  "grupo-resumen-mensual",
  "catalogos-fotos-resumen",
]);

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
/**
 * Crons NUEVOS con vigilancia seed-tolerante (misma regla que los slots de
 * switch-sync): fila de heartbeat ausente = aún no sembrada (el cron la crea
 * solo en <24h tras el deploy) → NO es stale; solo alerta si la fila EXISTE y
 * está vieja. Evita el 503 falso el día del deploy. Cuando el cron ya lleve
 * días sembrado se puede promover a EXPECTED_CRONS (fail-closed) en
 * health-crons si se quiere la garantía dura.
 */
export const SEED_TOLERANT_CRONS = [
  "backup-switch", // backup de tablas switch_* (2 entradas: 06:45 / 19:15 UTC)
  // Catálogo Tommy (2 entradas: 12:40 / 17:40 UTC). Seed-tolerante mientras la
  // DDL 20260724150000 esté pendiente (sin ella el sync se omite limpio y no
  // siembra heartbeat). Promover a EXPECTED_CRONS (health-crons, fail-closed)
  // en el PR "encender", con la DDL corrida y días de siembra.
  "tommy-catalogo",
  // Resumen semanal de fotos faltantes (lunes 13:30 UTC). Seed-tolerante para
  // NO disparar un 503 falso antes de su primera corrida (puede tardar hasta
  // una semana en sembrar la fila). Umbral propio semanal de 8 días en
  // CRON_STALE_HOURS_POR_CRON. Promover a EXPECTED_CRONS con semanas de siembra.
  "catalogos-fotos-resumen",
];

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

// ─── Cronograma empresa→horas de los crons que tocan Switch ──────────────────
// Espejo de vercel.json (SOLO las entradas que abren sesión en el Switch de
// alguna empresa — sesión ÚNICA por empresa: un 2º login mata el token del 1º).
// Fuente única para el candado del sync manual (/api/admin/sync-now): si el
// próximo cron que toca una empresa está a <40 min, el manual se rechaza con
// 409 para no matarle la sesión. Al agregar/mover una entrada en vercel.json
// que toque Switch, actualizar AQUÍ también.

const CRON_EMPRESAS_B2B5 = [
  "vistana",
  "fashion_wear",
  "fashion_shoes",
  "active_shoes",
  "active_wear",
] as const;
const CRON_EMPRESAS_RECIBOS = [...CRON_EMPRESAS_B2B5, "american_classic"] as const;
const CRON_EMPRESAS_CXP = [...CRON_EMPRESAS_B2B5, "joystep", "american_classic"] as const;
const CRON_EMPRESAS_TODAS = [
  ...CRON_EMPRESAS_B2B5,
  "joystep",
  "confecciones_boston",
  "american_classic",
] as const;

export interface SwitchCronEntrada {
  /** Nombre legible del cron (para logs/mensajes). */
  cron: string;
  /** Hora UTC "hhmm" del schedule en vercel.json. */
  hhmmUtc: string;
  /** Empresas cuyo Switch toca esa entrada. */
  empresas: readonly string[];
}

/** Espejo de vercel.json — entradas que tocan Switch, con sus empresas. */
export const SWITCH_CRON_ENTRADAS: SwitchCronEntrada[] = [
  { cron: "multifashion-sync", hhmmUtc: "0500", empresas: ["american_classic"] },
  { cron: "switch-sync all", hhmmUtc: "0530", empresas: ["vistana", "active_wear"] },
  { cron: "switch-sync all", hhmmUtc: "0535", empresas: ["fashion_shoes", "fashion_wear"] },
  { cron: "switch-sync all", hhmmUtc: "0540", empresas: ["active_shoes", "joystep"] },
  { cron: "switch-sync all", hhmmUtc: "0630", empresas: ["american_classic", "confecciones_boston"] },
  { cron: "sync-utilidad", hhmmUtc: "0700", empresas: CRON_EMPRESAS_B2B5 },
  { cron: "sync-recibos", hhmmUtc: "0750", empresas: CRON_EMPRESAS_RECIBOS },
  { cron: "switch-articulos", hhmmUtc: "0840", empresas: CRON_EMPRESAS_TODAS },
  { cron: "sync-proveedores", hhmmUtc: "0930", empresas: CRON_EMPRESAS_CXP },
  // La reconciliación puede recuperar pares faltantes de CUALQUIER empresa.
  { cron: "switch-reconciliacion", hhmmUtc: "1000", empresas: CRON_EMPRESAS_TODAS },
  { cron: "joybees-catalogo", hhmmUtc: "1100", empresas: ["joystep"] },
  { cron: "acs-fidelizacion", hhmmUtc: "1130", empresas: ["american_classic"] },
  { cron: "reebok-catalogo", hhmmUtc: "1210", empresas: ["active_shoes"] },
  { cron: "tommy-catalogo", hhmmUtc: "1240", empresas: ["fashion_shoes"] },
  { cron: "switch-reconciliacion", hhmmUtc: "1400", empresas: CRON_EMPRESAS_TODAS },
  { cron: "switch-sync facturas", hhmmUtc: "1500", empresas: ["american_classic"] },
  { cron: "switch-sync estadocuenta", hhmmUtc: "1600", empresas: ["active_shoes", "joystep"] },
  { cron: "switch-sync estadocuenta", hhmmUtc: "1605", empresas: ["fashion_shoes", "fashion_wear"] },
  { cron: "switch-sync estadocuenta", hhmmUtc: "1610", empresas: ["vistana", "active_wear"] },
  { cron: "acs-fidelizacion", hhmmUtc: "1630", empresas: ["american_classic"] },
  { cron: "reebok-catalogo", hhmmUtc: "1700", empresas: ["active_shoes"] },
  { cron: "joybees-catalogo", hhmmUtc: "1705", empresas: ["joystep"] },
  { cron: "tommy-catalogo", hhmmUtc: "1740", empresas: ["fashion_shoes"] },
  { cron: "switch-reconciliacion", hhmmUtc: "1800", empresas: CRON_EMPRESAS_TODAS },
  { cron: "sync-recibos", hhmmUtc: "2010", empresas: CRON_EMPRESAS_RECIBOS },
  { cron: "switch-sync estadocuenta", hhmmUtc: "2110", empresas: ["vistana", "active_wear"] },
  { cron: "switch-sync estadocuenta", hhmmUtc: "2115", empresas: ["fashion_shoes", "fashion_wear"] },
  { cron: "switch-sync estadocuenta", hhmmUtc: "2120", empresas: ["active_shoes", "joystep"] },
  { cron: "sync-recibos", hhmmUtc: "2220", empresas: CRON_EMPRESAS_RECIBOS },
  { cron: "switch-sync facturas", hhmmUtc: "2315", empresas: ["american_classic"] },
  { cron: "switch-sync facturas", hhmmUtc: "0015", empresas: ["american_classic"] },
];

export interface ProximoCron {
  cron: string;
  hhmmUtc: string;
  /** Hora local Panamá "H:MM" (UTC-5 fijo, sin DST) para mensajes al usuario. */
  horaPanama: string;
  /** Minutos (redondeo arriba) desde `ahora` hasta esa corrida. */
  enMinutos: number;
}

function hhmmToUtcDate(hhmm: string, ahora: Date): Date {
  const h = Number(hhmm.slice(0, 2));
  const m = Number(hhmm.slice(2, 4));
  const d = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate(), h, m, 0, 0));
  if (d.getTime() <= ahora.getTime()) d.setUTCDate(d.getUTCDate() + 1); // ya pasó hoy → mañana
  return d;
}

function hhmmUtcAPanama(hhmm: string): string {
  const h = (Number(hhmm.slice(0, 2)) - 5 + 24) % 24;
  return `${h}:${hhmm.slice(2, 4)}`;
}

/**
 * Próxima corrida de cron que toca el Switch de `empresaKey` (la más cercana
 * en el futuro, mirando hoy y mañana en UTC). null si ninguna entrada del
 * cronograma toca esa empresa (no debería pasar con las keys canónicas).
 */
export function proximoCronParaEmpresa(empresaKey: string, ahora: Date = new Date()): ProximoCron | null {
  let best: { entrada: SwitchCronEntrada; date: Date } | null = null;
  for (const entrada of SWITCH_CRON_ENTRADAS) {
    if (!entrada.empresas.includes(empresaKey)) continue;
    const date = hhmmToUtcDate(entrada.hhmmUtc, ahora);
    if (!best || date.getTime() < best.date.getTime()) best = { entrada, date };
  }
  if (!best) return null;
  return {
    cron: best.entrada.cron,
    hhmmUtc: best.entrada.hhmmUtc,
    horaPanama: hhmmUtcAPanama(best.entrada.hhmmUtc),
    enMinutos: Math.ceil((best.date.getTime() - ahora.getTime()) / 60_000),
  };
}

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
