// ─────────────────────────────────────────────────────────────────────────────
// GET /api/health-crons  — Meta-watchdog externo (P3)
//
// Expone el estado de cron_heartbeats para que un monitor externo gratuito
// (cron-job.org / UptimeRobot / healthchecks.io) lo polee cada hora y avise si
// algún cron NO corrió. Esta es la red que detecta "el cron se perdió" AUNQUE la
// propia reconciliación interna se caiga (si Vercel deja de invocar crons, el
// watchdog interno tampoco corre → solo un observador EXTERNO lo nota).
//
// EL CÓDIGO HTTP DICE "¿LA VIGILANCIA FUNCIONA?", NO "¿HAY HALLAZGOS?"
// (29-jul-2026). Antes bastaba UN cron stale para devolver 503, y eso apagó el
// vigía: `switch-sync:all-0630` dejó de registrar heartbeat el 27-jul, el
// endpoint quedó en 503 permanente y cron-job.org deshabilitó el monitor
// automáticamente tras 26 fallos seguidos. Un cron roto le costó al sistema la
// vigilancia externa de los otros ~50 — y el watchdog Telegram YA venía
// reportando ese cron los días 27, 28 y 29. Ahora:
//   - 200 → la vigilancia funciona. Incluye el caso "hay crons atrasados": los
//     hallazgos van SIEMPRE en el cuerpo (`stale[]`, `staleCount`) y los reporta
//     por Telegram el watchdog interno, que para eso está.
//   - 503 → la vigilancia NO puede responder por sí sola: el watchdog interno
//     está caído (switch-reconciliacion stale), hay una caída MASIVA
//     (≥ UMBRAL_CAIDA_MASIVA crons stale = "Vercel dejó de invocar crons"), o no
//     se pudo leer cron_heartbeats. El veredicto es una función pura,
//     `veredictoVigiaExterno` en cron-telemetry.ts.
// `ok` conserva su viejo significado (cero hallazgos); `vigilanciaOk` es el
// semáforo. Un 503 de este endpoint vuelve a ser raro y significativo, que es la
// única forma de que un servicio de monitoreo no lo termine apagando.
//
// VIGILANCIA MUTUA — el que vigila también es vigilado. Cada llamada autenticada
// registra el heartbeat `vigia-externo`. Si cron-job.org deja de llamar, esa fila
// envejece y el watchdog Telegram interno lo reporta a las 26h. No hace falta
// otro cron (que podría morirse igual de callado): los dos vigías se cubren.
//
// Recovery-aware (jul-2026): un cron stale NO cuenta para el 503 si (a) tiene
// recuperación conocida (colateral de la reconciliación 10/14/18 UTC, o 2ª
// entrada propia de backup/acs-fidelizacion), (b) esa recuperación AÚN viene
// hoy, y (c) lleva stale <30h (tope duro). Se reporta como pendingRecovery[]
// con 200 — así el monitor no despierta a nadie por algo que el sistema va a
// arreglar solo en horas; pasada la última oportunidad del día vuelve el 503
// normal. La metadata y la lógica (staleEsPendingRecovery) viven en
// cron-telemetry.ts, compartidas con el watchdog Telegram de la reconciliación.
// switch-reconciliacion y grupo-resumen-mensual JAMÁS se silencian; un cron sin
// heartbeat (fila ausente) tampoco (fail-closed).
//
// Slots huérfanos (jul-2026): un slot de switch-sync cuya invocación se perdió
// pero cuyo trabajo la reconciliación certificó como hecho (marca
// "switch-sync:<slot>#recuperado") sale en slotsCubiertos[] con 200. Tope duro:
// si su ENTRADA propia lleva >50h (2 ocurrencias) sin correr, vuelve a `stale`
// aunque la marca esté fresca — una entrada que Vercel dejó de invocar NO queda
// tapada por la recuperación diaria.
//
// Protección: token simple (?token= o header x-healthcheck-token), comparado en
// tiempo constante contra HEALTHCHECK_TOKEN. NO usa CRON_SECRET a propósito: un
// monitor de terceros no debe poder disparar crons — probarlo con Bearer
// CRON_SECRET da 401, y es lo esperado. Fail-closed y SIEMPRE 401: sin la env var
// configurada tampoco entra nadie, pero se responde 401 (no 503), porque un
// problema de credenciales no es una caída de los crons y confundirlos hace que
// el monitor externo alarme por lo que no es. Ver el bloque de AUTH en el GET.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseServer } from "@/lib/supabase-server";
import {
  CRON_STALE_HOURS_DEFAULT,
  cronStaleThresholdHours,
  staleEsPendingRecovery,
  CRONS_FAIL_CLOSED,
  SEED_TOLERANT_CRONS,
  SWITCH_SYNC_SLOTS,
  slotHeartbeatName,
  slotRecuperadoName,
  slotVistoName,
  slotCubiertoPorRecuperacion,
  slotNuncaSembradoVencido,
  SLOT_SEED_GRACE_HOURS,
  veredictoVigiaExterno,
  recordCronHeartbeat,
  VIGIA_EXTERNO_HEARTBEAT,
} from "@/lib/cron-telemetry";

export const dynamic = "force-dynamic";
// El App Router cachea fetch() por defecto (Data Cache) — incluye los fetch
// internos de supabase-js. Sin esto, la lectura de cron_heartbeats queda pegada
// al primer snapshot (ej. antes de existir la fila reebok-catalogo) y devuelve
// last_success_at:null indefinidamente, aunque la fila esté en la DB.
// `dynamic = "force-dynamic"` NO basta (ver switch-reconciliacion/route.ts).
export const fetchCache = "force-no-store";
// Cinturón de seguridad: acota la función por debajo del timeout (~30s) del
// monitor externo (cron-job.org) para responder SIEMPRE un HTTP claro (200/503)
// en vez de colgarse y producir un "Timeout" ambiguo.
export const maxDuration = 20;

// Todos los crons corren 1×/día (plan Hobby). Stale = sin success en >26h por
// defecto. El umbral (default + overrides mensuales) vive en cron-telemetry.ts,
// compartido con el watchdog interno de switch-reconciliacion.
const STALE_HOURS = CRON_STALE_HOURS_DEFAULT;

// Timeout interno de la lectura de cron_heartbeats. La query es diminuta (~14
// filas) pero no tiene timeout propio: si Supabase se atasca por contención
// (coincide con switch-reconciliacion a las 14:00 UTC), el handler esperaría
// indefinidamente y cruzaría los ~30s del monitor externo. Con esto falla rápido
// y reintenta una vez (absorbe el blip transitorio).
const READ_TIMEOUT_MS = 8000;

type Beat = { cron_name: string; last_success_at: string | null };

/** Lee cron_heartbeats con un deadline de READ_TIMEOUT_MS (AbortController +
 *  Promise.race). Lanza si vence o si Supabase devuelve error. */
async function leerHeartbeatsUnaVez(): Promise<Beat[]> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("read-timeout"));
    }, READ_TIMEOUT_MS);
  });
  try {
    const query = supabaseServer
      .from("cron_heartbeats")
      .select("cron_name, last_success_at")
      .abortSignal(controller.signal);
    const { data, error } = await Promise.race([query, timeoutPromise]);
    if (error) throw new Error(error.message);
    return (data ?? []) as Beat[];
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Crons que registran heartbeat (deben existir en cron_heartbeats). Un cron de
// esta lista SIN fila = nunca registró success → se reporta como stale (null).
//
// La lista VIVE en cron-telemetry.ts (CRONS_FAIL_CLOSED), no acá: es el mismo
// registro que usa el watchdog Telegram de switch-reconciliacion para decidir
// qué filas de cron_heartbeats son de crons vivos y cuáles de crons retirados.
// Cuando cada vigía tenía su copia, divergían — `db-salud` estaba vigilado por
// el watchdog Telegram (que recorre todas las filas) y era invisible acá.
const EXPECTED_CRONS = CRONS_FAIL_CLOSED;

/** Compara tokens en tiempo constante (evita fuga por timing). */
function tokenOk(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  // AUTH — un problema de credenciales JAMÁS devuelve 503.
  //
  // Antes, `HEALTHCHECK_TOKEN` sin configurar respondía 503 "fail-closed". Suena
  // prudente y es un error de diseño: hace que un olvido de configuración se vea
  // EXACTAMENTE igual que "los crons se cayeron", así que el monitor externo
  // dispara la alarma equivocada y, peor, la dispara para siempre (una env var
  // ausente no se arregla sola) hasta que el servicio de monitoreo apaga el
  // check. El 503 de este endpoint significa UNA sola cosa: la vigilancia no
  // funciona. Un problema de token es un 401 — sigue siendo fail-closed (nadie
  // entra sin credencial válida), pero le dice la verdad al que pregunta.
  const expected = process.env.HEALTHCHECK_TOKEN;
  const provided =
    req.nextUrl.searchParams.get("token") ??
    req.headers.get("x-healthcheck-token") ??
    "";
  if (!expected || !tokenOk(provided, expected)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Unauthorized",
        // Pista para quien lo pruebe a mano: la credencial de este endpoint NO
        // es CRON_SECRET (un monitor de terceros no debe poder disparar crons).
        comoAutenticar: "?token=<HEALTHCHECK_TOKEN> o header x-healthcheck-token",
      },
      { status: 401 },
    );
  }

  // Heartbeat del PROPIO vigía externo: si cron-job.org deja de llamar (se cayó,
  // o lo deshabilitaron tras N fallos como el 29-jul-2026), esta fila envejece y
  // el watchdog Telegram INTERNO lo reporta a las 26h como cualquier cron caído.
  // Vigilancia MUTUA sin agregar un tercer vigilante. Se registra ANTES de medir
  // y es no-fatal a propósito: lo que se afirma es "el vigía llamó", que ya es
  // cierto en este punto, y un fallo de escritura no debe cambiar el veredicto.
  await recordCronHeartbeat(VIGIA_EXTERNO_HEARTBEAT);

  // Lectura con timeout interno + 1 reintento. El reintento absorbe el blip
  // transitorio (lo más común); si tras el reintento sigue fallando, respondemos
  // 503 RÁPIDO (dentro de la ventana del monitor) manteniendo el fail-closed.
  let data: Beat[];
  try {
    try {
      data = await leerHeartbeatsUnaVez();
    } catch {
      data = await leerHeartbeatsUnaVez();
    }
  } catch (err) {
    const detalle = err instanceof Error ? err.message : String(err);
    const veredicto = veredictoVigiaExterno({ stale: [], lecturaFallo: true });
    return NextResponse.json(
      { ok: false, error: veredicto.detalle, motivo: veredicto.motivo, detalle },
      { status: veredicto.http },
    );
  }

  const beats = new Map<string, string | null>(
    data.map((h) => [h.cron_name, h.last_success_at]),
  );
  const now = Date.now();

  const stale: Array<{ cron: string; last_success_at: string | null; hours_ago: number | null }> = [];
  const fresh: Array<{ cron: string; last_success_at: string; hours_ago: number }> = [];
  // Stale pero con recuperación en camino hoy → NO cuenta para el 503 (200 con
  // detalle). Un cron SIN heartbeat nunca entra aquí (fail-closed → stale).
  const pendingRecovery: Array<{ cron: string; last_success_at: string; hours_ago: number }> = [];

  for (const cron of EXPECTED_CRONS) {
    const cutoffMs = now - cronStaleThresholdHours(cron) * 3600 * 1000;
    const last = beats.get(cron) ?? null;
    const t = last ? new Date(last).getTime() : NaN;
    const hoursAgo = Number.isFinite(t) ? Math.round((now - t) / 3600000) : null;
    if (!Number.isFinite(t) || t < cutoffMs) {
      if (staleEsPendingRecovery(cron, last, now)) {
        pendingRecovery.push({ cron, last_success_at: last as string, hours_ago: hoursAgo as number });
      } else {
        stale.push({ cron, last_success_at: last, hours_ago: hoursAgo });
      }
    } else {
      fresh.push({ cron, last_success_at: last as string, hours_ago: hoursAgo as number });
    }
  }

  // Slots granulares de switch-sync (switch-sync:<tipo>-<hhmm>, ver
  // cron-telemetry.ts). Regla DISTINTA del fail-closed de los nombres base:
  // fila ausente = aún no sembrada (el cron la crea solo en <24h tras el
  // deploy) → NO es stale; solo alerta si la fila EXISTE y está vieja. Así el
  // primer día post-deploy no dispara un 503 falso con los 13 slots ausentes.
  const slotsUnseeded: string[] = [];
  // Slots cuya invocación se perdió pero cuyo trabajo la reconciliación certificó
  // como hecho (marca "switch-sync:<slot>#recuperado"): NO cuentan para el 503,
  // se informan aparte. El tope duro de 50h sobre el heartbeat PROPIO del slot
  // (slotCubiertoPorRecuperacion) impide que una entrada que Vercel dejó de
  // invocar del todo quede tapada: al 2º día vuelve a `stale`.
  const slotsCubiertos: Array<{ cron: string; last_success_at: string; hours_ago: number }> = [];
  for (const s of SWITCH_SYNC_SLOTS) {
    const slot = slotHeartbeatName(s.slot);
    const last = beats.get(slot);
    if (last === undefined || last === null) {
      // Fila ausente. La tolerancia de siembra ya NO es eterna: la
      // reconciliación fecha con la marca "#visto" cuándo vio el slot por
      // primera vez y, pasadas SLOT_SEED_GRACE_HOURS (50h = dos ocurrencias +
      // jitter), un slot que nunca logró un success propio se reporta como
      // caído. Sin este vencimiento, switch-sync:all-0540 llevaba desde el
      // 23-jul-2026 sin fila propia (su entrada corrió y falló el 24, y el 25
      // Vercel perdió la invocación) y NINGÚN vigía lo notaba.
      if (slotNuncaSembradoVencido(beats.get(slotVistoName(s.slot)), now)) {
        stale.push({ cron: slot, last_success_at: null, hours_ago: null });
      } else {
        slotsUnseeded.push(slot);
      }
      continue;
    }
    const t = new Date(last).getTime();
    const hoursAgo = Number.isFinite(t) ? Math.round((now - t) / 3600000) : null;
    if (!Number.isFinite(t) || t < now - cronStaleThresholdHours(slot) * 3600 * 1000) {
      if (slotCubiertoPorRecuperacion(last, beats.get(slotRecuperadoName(s.slot)), now)) {
        slotsCubiertos.push({ cron: slot, last_success_at: last, hours_ago: hoursAgo as number });
      } else if (staleEsPendingRecovery("switch-sync", last, now)) {
        // Los slots también son recuperables por la reconciliación (los pares que
        // cubren) — misma semántica pendingRecovery que el base "switch-sync".
        pendingRecovery.push({ cron: slot, last_success_at: last, hours_ago: hoursAgo as number });
      } else {
        stale.push({ cron: slot, last_success_at: last, hours_ago: hoursAgo });
      }
    } else {
      fresh.push({ cron: slot, last_success_at: last, hours_ago: hoursAgo as number });
    }
  }

  // Crons nuevos seed-tolerantes (backup-switch, backup-storage): misma regla
  // que los slots — fila ausente = aún no sembrada (NO stale); solo alerta si
  // existe y está vieja. A diferencia de los slots, el pendingRecovery usa su
  // PROPIO nombre (entradas extra propias en EXTRA_ENTRY_HOURS_UTC, no la
  // reconciliación).
  for (const cron of SEED_TOLERANT_CRONS) {
    const last = beats.get(cron);
    if (last === undefined || last === null) {
      slotsUnseeded.push(cron);
      continue;
    }
    const t = new Date(last).getTime();
    const hoursAgo = Number.isFinite(t) ? Math.round((now - t) / 3600000) : null;
    if (!Number.isFinite(t) || t < now - cronStaleThresholdHours(cron) * 3600 * 1000) {
      if (staleEsPendingRecovery(cron, last, now)) {
        pendingRecovery.push({ cron, last_success_at: last, hours_ago: hoursAgo as number });
      } else {
        stale.push({ cron, last_success_at: last, hours_ago: hoursAgo });
      }
    } else {
      fresh.push({ cron, last_success_at: last, hours_ago: hoursAgo as number });
    }
  }

  // El código HTTP responde "¿la vigilancia funciona?", NO "¿hay hallazgos?".
  // Los hallazgos van SIEMPRE en el cuerpo (stale[]); el 503 se reserva para lo
  // que el watchdog Telegram interno no puede reportar por sí mismo. Ver el
  // bloque "Veredicto del vigía EXTERNO" en cron-telemetry.ts.
  const veredicto = veredictoVigiaExterno({ stale: stale.map((s) => s.cron) });
  const ok = stale.length === 0;
  return NextResponse.json(
    {
      // `ok` sigue significando "cero hallazgos" — no cambia de sentido para
      // quien ya lo leía. El semáforo del monitor es el código HTTP.
      ok,
      vigilanciaOk: veredicto.http === 200,
      motivo: veredicto.motivo,
      detalle: veredicto.detalle,
      checkedAt: new Date(now).toISOString(),
      staleHours: STALE_HOURS,
      slotSeedGraceHours: SLOT_SEED_GRACE_HOURS,
      totalExpected: EXPECTED_CRONS.length,
      freshCount: fresh.length,
      staleCount: stale.length,
      stale,
      pendingRecoveryCount: pendingRecovery.length,
      pendingRecovery,
      slotsUnseeded,
      slotsCubiertosCount: slotsCubiertos.length,
      slotsCubiertos,
    },
    { status: veredicto.http },
  );
}
