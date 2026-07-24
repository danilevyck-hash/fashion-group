/**
 * Resumen post-recuperación de caídas/mantenimientos de Switch Soft (jul-2026).
 *
 * Cuando Switch estuvo caído (auth devuelve HTML en vez de token, o errores de
 * red/timeout/5xx contra sus hosts) y TODO ya se auto-recuperó, se manda UN
 * solo mensaje informativo a Telegram con la ventana de la caída:
 *
 *   "ℹ️ Switch estuvo caído de 06:06 a 10:53 (hora Panamá) — 3 syncs
 *    afectados (Joystep), todo re-sincronizado, sin impacto."
 *
 * SOLO el resumen post-recuperación: este módulo NO agrega alertas nuevas
 * durante la caída (alert-policy.ts y la alerta de la reconciliación quedan
 * exactamente como están). Lo invoca switch-reconciliacion AL FINAL de una
 * pasada 100% exitosa (nada faltante, nada fallido, nada skipped).
 *
 * Evidencia (ventana de ~24h hacia atrás):
 *   - switch_sync_log: fallos por par (empresa_key, sync_type) con
 *     error_message de patrón-caída; recuperación = success POSTERIOR del
 *     mismo par en el propio log.
 *   - cron_email_errors: fallos de crons que NO escriben switch_sync_log
 *     (ej. sync-clientes-master, acs-fidelizacion); recuperación = heartbeat
 *     (cron_heartbeats.last_success_at) posterior al fallo. Los crons que SÍ
 *     loguean en switch_sync_log se excluyen aquí para no contarlos doble
 *     (sus filas de cron_email_errors son rastro duplicado del mismo fallo).
 *
 * DEDUP (sin DDL): cada envío se persiste como fila en cron_email_errors con
 * tipo='switch_outage_resumen' (telegram:false — el mensaje ya salió). Al
 * detectar, solo cuentan los fallos POSTERIORES al último resumen enviado
 * (watermark = created_at de esa fila) → una ventana ya reportada nunca se
 * re-reporta, y una caída nueva (posterior al resumen) sí genera el suyo.
 *
 * Si la caída sigue activa (algún afectado sin recuperación posterior) NO se
 * envía nada: las alertas existentes ya cubren ese caso.
 */

import { supabaseServer } from "@/lib/supabase-server";
import { sendTelegramAlert } from "@/lib/telegram";
import { logCronError } from "@/lib/cron-telemetry";
import { isSwitchTransitorio } from "@/lib/switch-api/alert-policy";
import { mapEmpresaName, ALL_EMPRESA_KEYS } from "@/lib/empresa-mapping";

/** tipo en cron_email_errors que marca "este resumen ya se envió" (dedup). */
export const OUTAGE_RESUMEN_TIPO = "switch_outage_resumen";

/** Ventana de búsqueda hacia atrás (los fallos más viejos ya no interesan:
 *  hay 3 pasadas de reconciliación al día, cualquier caída recuperada se
 *  reporta el mismo día). */
export const OUTAGE_LOOKBACK_HOURS = 24;

/**
 * ¿El error corresponde a una CAÍDA/mantenimiento de Switch? Patrones reales
 * (calibrados contra switch_sync_log/cron_email_errors de producción, 24-jul):
 *   - Switch responde una página HTML donde iba JSON — en el auth ("Auth
 *     respondió 200 pero sin token: <!DOCTYPE html>…", client.ts) o a media
 *     llamada ("update products sku=100202441: <!DOCTYPE html>…", caso real
 *     reebok-catalogo 24-jul). El "<!DOCTYPE html" embebido en el error es la
 *     firma del mantenimiento. OJO: este patrón NO es silenciable en
 *     alert-policy (su alerta inmediata existente queda intacta); aquí solo se
 *     usa para el resumen posterior.
 *   - Red/timeout/5xx (isSwitchTransitorio): "Error de red en …: fetch failed
 *     (ECONNREFUSED / UND_ERR_CONNECT_TIMEOUT)", "Timeout >30000ms…", HTTP 5xx.
 *
 * Un 401/token a secas NO cuenta: eso es la colisión de sesión única (dos
 * logins simultáneos), rutina esperada — no una caída de Switch, y meterlo
 * aquí generaría resúmenes "estuvo caído" falsos. Tampoco "Run previo atascado
 * en 'running'" (limpieza del lock, pasa también con deploys/timeouts propios).
 */
export function isSwitchCaida(message: string | null | undefined): boolean {
  if (!message) return false;
  if (/<!DOCTYPE html|Auth respondió 200 pero sin token/i.test(message)) return true;
  return isSwitchTransitorio(message);
}

/**
 * Crons cuyos fallos ya quedan en switch_sync_log por (empresa, sync_type) —
 * sus filas de cron_email_errors son rastro DUPLICADO del mismo fallo y se
 * excluyen de la evidencia colateral para no contar doble. Espejo del listado
 * en el header de alert-policy.ts.
 */
const CRONS_CUBIERTOS_POR_SYNC_LOG = new Set([
  "switch-sync",
  "sync-recibos",
  "sync-utilidad",
  "switch-articulos",
  "multifashion-sync",
  "reebok-catalogo",
  "joybees-catalogo",
]);

/**
 * Normaliza el `tipo` de cron_email_errors al nombre de cron_heartbeats: los
 * routes loguean con sufijo "_failed" y guiones bajos (ej.
 * "sync_clientes_master_failed" → "sync-clientes-master"); alert-policy loguea
 * el cronName tal cual ("switch-sync").
 */
export function normalizarTipoCron(tipo: string): string {
  return tipo.replace(/_failed$/, "").replace(/_/g, "-");
}

/**
 * Extrae los pares (empresa_key, sync_type) mencionados en un mensaje de
 * cron_email_errors. alert-policy escribe "… — joystep/facturas: <error>" (y
 * "3 sync(s) fallaron — a/b: …; c/d: …"), así que el par afectado se puede
 * leer del propio mensaje. Importa porque una corrida puede morir SIN
 * finalizar su fila de switch_sync_log (caso real reebok-catalogo 24-jul: la
 * fila quedó 'running' y la cerró el lock como "Run previo atascado", que no
 * es patrón-caída) — el rastro con el error real queda solo aquí. Solo acepta
 * empresa keys canónicas → cero falsos positivos con URLs u otros "/".
 */
export function extraerParesDeMensaje(message: string): Array<{ empresa_key: string; sync_type: string }> {
  const re = new RegExp(`(${ALL_EMPRESA_KEYS.join("|")})/([a-z_]+)`, "g");
  const pares = new Map<string, { empresa_key: string; sync_type: string }>();
  for (const m of message.matchAll(re)) {
    pares.set(`${m[1]}|${m[2]}`, { empresa_key: m[1], sync_type: m[2] });
  }
  return [...pares.values()];
}

// ─── Detección pura (testeable sin DB) ───────────────────────────────────────

export interface OutageSyncLogRow {
  empresa_key: string;
  sync_type: string;
  status: string;
  started_at: string;
  error_message: string | null;
}

export interface OutageCronErrorRow {
  tipo: string;
  error_message: string | null;
  created_at: string;
}

export interface OutageHeartbeatRow {
  cron_name: string;
  last_success_at: string | null;
}

export interface VentanaCaida {
  /** started_at del PRIMER fallo con patrón-caída. */
  desdeIso: string;
  /** Momento de la ÚLTIMA recuperación (success posterior / heartbeat). */
  hastaIso: string;
  /** Pares (empresa|sync_type) + colaterales afectados. */
  syncsAfectados: number;
  /** Nombres legibles: empresas afectadas + crons colaterales. */
  empresas: string[];
}

export type ResultadoCaida =
  | { estado: "sin_caida" }
  /** Hay fallos con patrón-caída SIN recuperación posterior → no reportar
   *  (las alertas existentes cubren la caída activa). */
  | { estado: "caida_activa"; pendientes: string[] }
  | { estado: "recuperada"; ventana: VentanaCaida };

const pairKey = (r: { empresa_key: string; sync_type: string }) =>
  `${r.empresa_key}|${r.sync_type}`;

/**
 * Detecta la ventana de caída-Switch ya recuperada en la evidencia dada.
 * `watermarkIso` = created_at del último resumen enviado: fallos anteriores o
 * iguales a esa marca ya fueron reportados y se ignoran (dedup).
 */
export function detectarVentanaCaida(input: {
  syncLog: OutageSyncLogRow[];
  cronErrors: OutageCronErrorRow[];
  heartbeats: OutageHeartbeatRow[];
  watermarkIso: string | null;
}): ResultadoCaida {
  const { syncLog, cronErrors, heartbeats, watermarkIso } = input;
  const despuesDelWatermark = (iso: string) => !watermarkIso || iso > watermarkIso;

  // 1. Fallos con patrón-caída en switch_sync_log, agrupados por par.
  // Por entrada se guarda el primer y último fallo: el último decide qué
  // success cuenta como recuperación; el primero (solo de las entradas que
  // SOBREVIVEN los filtros) abre la ventana del mensaje.
  interface RangoFallo {
    primero: string;
    ultimo: string;
  }
  const anotar = (map: Map<string, RangoFallo>, k: string, iso: string) => {
    const prev = map.get(k);
    if (!prev) map.set(k, { primero: iso, ultimo: iso });
    else {
      if (iso < prev.primero) prev.primero = iso;
      if (iso > prev.ultimo) prev.ultimo = iso;
    }
  };

  const fallosPorPar = new Map<string, RangoFallo>();
  for (const r of syncLog) {
    if (r.status !== "error" || !isSwitchCaida(r.error_message)) continue;
    if (!despuesDelWatermark(r.started_at)) continue;
    anotar(fallosPorPar, pairKey(r), r.started_at);
  }

  // 2. Fallos con patrón-caída en cron_email_errors. Si el mensaje menciona
  //    pares empresa/sync (formato de alert-policy) → evidencia POR PAR (se
  //    fusiona con la del sync log, mismo key → no cuenta doble, y cubre
  //    corridas que murieron sin finalizar su fila del log). Si no menciona
  //    pares: los crons que SÍ loguean switch_sync_log se saltan (rastro
  //    duplicado) y el resto cuenta como colateral (recuperación por heartbeat).
  const fallosPorColateral = new Map<string, RangoFallo>();
  for (const r of cronErrors) {
    if (r.tipo === OUTAGE_RESUMEN_TIPO) continue;
    if (!isSwitchCaida(r.error_message)) continue;
    if (!despuesDelWatermark(r.created_at)) continue;
    const pares = extraerParesDeMensaje(r.error_message ?? "");
    if (pares.length > 0) {
      for (const p of pares) anotar(fallosPorPar, pairKey(p), r.created_at);
      continue;
    }
    const cron = normalizarTipoCron(r.tipo);
    if (CRONS_CUBIERTOS_POR_SYNC_LOG.has(cron)) continue; // rastro duplicado del sync log
    // Un tipo que NI SIQUIERA tiene fila en cron_heartbeats no es un cron
    // conocido (ej. otro error con HTML embebido) → se descarta en vez de
    // bloquear el resumen 24h esperando una recuperación que no existe.
    if (!heartbeats.some((h) => h.cron_name === cron)) continue;
    anotar(fallosPorColateral, cron, r.created_at);
  }

  if (fallosPorPar.size === 0 && fallosPorColateral.size === 0) {
    return { estado: "sin_caida" };
  }

  // 3. Recuperación por par: success del MISMO par POSTERIOR a su último fallo.
  const pendientes: string[] = [];
  let ultimaRecuperacionIso: string | null = null;
  for (const [k, rango] of fallosPorPar) {
    let recuperadoEn: string | null = null;
    for (const r of syncLog) {
      if (r.status !== "success" || pairKey(r) !== k) continue;
      if (r.started_at <= rango.ultimo) continue;
      if (!recuperadoEn || r.started_at < recuperadoEn) recuperadoEn = r.started_at;
    }
    if (!recuperadoEn) {
      pendientes.push(k.replace("|", "/"));
      continue;
    }
    if (!ultimaRecuperacionIso || recuperadoEn > ultimaRecuperacionIso) {
      ultimaRecuperacionIso = recuperadoEn;
    }
  }

  // 4. Recuperación colateral: heartbeat POSTERIOR a su último fallo.
  for (const [cron, rango] of fallosPorColateral) {
    const hb = heartbeats.find((h) => h.cron_name === cron);
    if (!hb?.last_success_at || hb.last_success_at <= rango.ultimo) {
      pendientes.push(cron);
      continue;
    }
    if (!ultimaRecuperacionIso || hb.last_success_at > ultimaRecuperacionIso) {
      ultimaRecuperacionIso = hb.last_success_at;
    }
  }

  // Algo sigue caído → silencio (la alerta de la reconciliación ya lo cubre).
  if (pendientes.length > 0) return { estado: "caida_activa", pendientes };

  // Todo recuperado → armar la ventana con la evidencia sobreviviente.
  let primerFalloIso: string | null = null;
  for (const { primero } of [...fallosPorPar.values(), ...fallosPorColateral.values()]) {
    if (!primerFalloIso || primero < primerFalloIso) primerFalloIso = primero;
  }
  const empresasKeys = [...new Set([...fallosPorPar.keys()].map((k) => k.split("|")[0]))];
  const empresas = [
    ...empresasKeys.map((k) => mapEmpresaName(k)),
    ...[...fallosPorColateral.keys()],
  ].sort((a, b) => a.localeCompare(b, "es"));

  return {
    estado: "recuperada",
    ventana: {
      // primerFalloIso y ultimaRecuperacionIso siempre existen aquí: hubo ≥1
      // fallo (si no, retornamos sin_caida) y 0 pendientes (todos con recovery).
      desdeIso: primerFalloIso!,
      hastaIso: ultimaRecuperacionIso!,
      syncsAfectados: fallosPorPar.size + fallosPorColateral.size,
      empresas,
    },
  };
}

// ─── Mensaje ─────────────────────────────────────────────────────────────────

function fmtHoraPanama(iso: string): string {
  return new Intl.DateTimeFormat("es-PA", {
    timeZone: "America/Panama",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function fmtFechaCortaPanama(iso: string): string {
  return new Intl.DateTimeFormat("es-PA", {
    timeZone: "America/Panama",
    day: "numeric",
    month: "short",
  }).format(new Date(iso));
}

function fechaPanamaYmd(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Panama" }).format(new Date(iso));
}

/** Español simple, hora Panamá. Si la ventana cruza medianoche Panamá, cada
 *  hora lleva su fecha ("23 jul 20:15") para que no se lea al revés. */
export function buildMensajeCaida(v: VentanaCaida): string {
  const mismaFecha = fechaPanamaYmd(v.desdeIso) === fechaPanamaYmd(v.hastaIso);
  const desde = mismaFecha
    ? fmtHoraPanama(v.desdeIso)
    : `${fmtFechaCortaPanama(v.desdeIso)} ${fmtHoraPanama(v.desdeIso)}`;
  const hasta = mismaFecha
    ? fmtHoraPanama(v.hastaIso)
    : `${fmtFechaCortaPanama(v.hastaIso)} ${fmtHoraPanama(v.hastaIso)}`;
  const n = v.syncsAfectados;
  const syncsTxt = n === 1 ? "1 sync afectado" : `${n} syncs afectados`;
  return (
    `ℹ️ Switch estuvo caído de ${desde} a ${hasta} (hora Panamá) — ` +
    `${syncsTxt} (${v.empresas.join(", ")}), todo re-sincronizado, sin impacto.`
  );
}

// ─── Orquestador (lo llama switch-reconciliacion tras una pasada 100% verde) ──

export interface ResumenCaidaResultado {
  resumen: "enviado" | "sin_caida" | "caida_activa" | "error";
  mensaje?: string;
}

/**
 * Consulta la evidencia de las últimas 24h y, si hubo una caída de Switch YA
 * recuperada y aún no reportada, envía EL resumen a Telegram y persiste la
 * marca de dedup. Best-effort: nunca lanza (un fallo aquí no debe tumbar la
 * reconciliación); si Telegram no acepta el mensaje NO se persiste la marca →
 * la siguiente pasada reintenta.
 */
export async function enviarResumenCaidaSiAplica(): Promise<ResumenCaidaResultado> {
  try {
    const sinceIso = new Date(Date.now() - OUTAGE_LOOKBACK_HOURS * 3600 * 1000).toISOString();

    // Watermark de dedup: created_at del último resumen ya enviado.
    const { data: wmRows, error: wmErr } = await supabaseServer
      .from("cron_email_errors")
      .select("created_at")
      .eq("tipo", OUTAGE_RESUMEN_TIPO)
      .order("created_at", { ascending: false })
      .limit(1);
    if (wmErr) throw new Error(`watermark: ${wmErr.message}`);
    const watermarkIso = wmRows?.[0]?.created_at ?? null;

    const { data: syncLog, error: slErr } = await supabaseServer
      .from("switch_sync_log")
      .select("empresa_key,sync_type,status,started_at,error_message")
      .gte("started_at", sinceIso)
      .order("started_at", { ascending: true });
    if (slErr) throw new Error(`switch_sync_log: ${slErr.message}`);

    const { data: cronErrors, error: ceErr } = await supabaseServer
      .from("cron_email_errors")
      .select("tipo,error_message,created_at")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: true });
    if (ceErr) throw new Error(`cron_email_errors: ${ceErr.message}`);

    const { data: heartbeats, error: hbErr } = await supabaseServer
      .from("cron_heartbeats")
      .select("cron_name,last_success_at");
    if (hbErr) throw new Error(`cron_heartbeats: ${hbErr.message}`);

    const r = detectarVentanaCaida({
      syncLog: (syncLog ?? []) as OutageSyncLogRow[],
      cronErrors: (cronErrors ?? []) as OutageCronErrorRow[],
      heartbeats: (heartbeats ?? []) as OutageHeartbeatRow[],
      watermarkIso,
    });
    if (r.estado !== "recuperada") return { resumen: r.estado };

    const mensaje = buildMensajeCaida(r.ventana);
    const sent = await sendTelegramAlert(mensaje);
    if (!sent) {
      // Sin marca de dedup: la próxima pasada verde vuelve a intentar.
      return { resumen: "error", mensaje };
    }
    // Marca de dedup (telegram:false — el mensaje ya salió arriba). El texto
    // incluye la ventana → auditable desde la propia tabla.
    await logCronError(OUTAGE_RESUMEN_TIPO, mensaje, null, { telegram: false });
    return { resumen: "enviado", mensaje };
  } catch (err) {
    console.error(
      `[outage-resumen] fallo evaluando/enviando el resumen: ${err instanceof Error ? err.message : String(err)}`,
    );
    return { resumen: "error" };
  }
}
