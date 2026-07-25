// ─────────────────────────────────────────────────────────────────────────────
// GET /api/health-crons  — Meta-watchdog externo (P3)
//
// Expone el estado de cron_heartbeats para que un monitor externo gratuito
// (cron-job.org / UptimeRobot / healthchecks.io) lo polee cada hora y avise si
// algún cron NO corrió. Esta es la red que detecta "el cron se perdió" AUNQUE la
// propia reconciliación interna se caiga (si Vercel deja de invocar crons, el
// watchdog interno tampoco corre → solo un observador EXTERNO lo nota).
//
// Respuesta:
//   - 200 { ok: true, ... }   → todos los crons frescos (success en <26h) o
//     stale pero con recuperación EN CAMINO hoy (pendingRecovery, ver abajo).
//   - 503 { ok: false, stale: [...] } → ≥1 cron viejo o sin heartbeat nunca.
//   El monitor externo alerta cuando el status ≠ 200 (o cuando ok=false).
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
// Protección: token simple (?token= o header x-healthcheck-token), comparado en
// tiempo constante contra HEALTHCHECK_TOKEN. NO usa CRON_SECRET a propósito: un
// monitor de terceros no debe poder disparar crons. Fail-closed: sin la env var
// configurada responde 503.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseServer } from "@/lib/supabase-server";
import {
  CRON_STALE_HOURS_DEFAULT,
  cronStaleThresholdHours,
  staleEsPendingRecovery,
  SEED_TOLERANT_CRONS,
  SWITCH_SYNC_SLOT_HEARTBEATS,
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
const EXPECTED_CRONS = [
  "acs-fidelizacion",
  "acs-resumen-diario",
  "backup",
  "cheques-alert",
  "cleanup-packing-lists",
  "grupo-resumen-mensual",
  "integrity-check",
  "joybees-catalogo",
  "multifashion-sync",
  "reebok-catalogo",
  "refresh-clientes-views",
  "switch-articulos",
  "switch-reconciliacion",
  "switch-sync",
  "sync-clientes-master",
  "sync-proveedores",
  "sync-recibos",
  "sync-utilidad",
  "tommy-catalogo",
] as const;

/** Compara tokens en tiempo constante (evita fuga por timing). */
function tokenOk(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const expected = process.env.HEALTHCHECK_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "HEALTHCHECK_TOKEN no configurado" },
      { status: 503 },
    );
  }
  const provided =
    req.nextUrl.searchParams.get("token") ??
    req.headers.get("x-healthcheck-token") ??
    "";
  if (!tokenOk(provided, expected)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

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
    return NextResponse.json(
      { ok: false, error: "timeout leyendo cron_heartbeats", detalle },
      { status: 503 },
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
  for (const slot of SWITCH_SYNC_SLOT_HEARTBEATS) {
    const last = beats.get(slot);
    if (last === undefined || last === null) {
      slotsUnseeded.push(slot);
      continue;
    }
    const t = new Date(last).getTime();
    const hoursAgo = Number.isFinite(t) ? Math.round((now - t) / 3600000) : null;
    if (!Number.isFinite(t) || t < now - cronStaleThresholdHours(slot) * 3600 * 1000) {
      // Los slots también son recuperables por la reconciliación (los pares que
      // cubren) — misma semántica pendingRecovery que el base "switch-sync".
      if (staleEsPendingRecovery("switch-sync", last, now)) {
        pendingRecovery.push({ cron: slot, last_success_at: last, hours_ago: hoursAgo as number });
      } else {
        stale.push({ cron: slot, last_success_at: last, hours_ago: hoursAgo });
      }
    } else {
      fresh.push({ cron: slot, last_success_at: last, hours_ago: hoursAgo as number });
    }
  }

  // Crons nuevos seed-tolerantes (backup-switch): misma regla que los slots —
  // fila ausente = aún no sembrada (NO stale); solo alerta si existe y está
  // vieja. A diferencia de los slots, el pendingRecovery usa su PROPIO nombre
  // (2ª entrada propia en SECOND_ENTRY_HOUR_UTC, no la reconciliación).
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

  const ok = stale.length === 0;
  return NextResponse.json(
    {
      ok,
      checkedAt: new Date(now).toISOString(),
      staleHours: STALE_HOURS,
      totalExpected: EXPECTED_CRONS.length,
      freshCount: fresh.length,
      staleCount: stale.length,
      stale,
      pendingRecoveryCount: pendingRecovery.length,
      pendingRecovery,
      slotsUnseeded,
    },
    { status: ok ? 200 : 503 },
  );
}
