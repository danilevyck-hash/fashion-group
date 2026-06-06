// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cron/switch-reconciliacion
//
// Red de seguridad del ciclo diario de syncs Switch. Corre DESPUÉS de toda la
// cadena (switch-sync 05:30-06:30, costo, etc., que terminan ~09:00). Detecta
// qué empresas quedaron SIN success de HOY (fecha Panamá) en los sync_type que
// produce el cron switch-sync —facturas, estadocuenta, costo— y SOLO para esas
// re-dispara el mismo mecanismo de switch-sync (tipo=all&empresas=...), en serie.
//
// El retry in-process de client.ts (commit 3224bb4) cubre los fallos transitorios
// DENTRO de una corrida; este cron cubre el caso en que una corrida entera murió
// (timeout de auth, colisión single-session sostenida) y quedó sin re-intento en
// todo el día. Es la pieza cross-invocación que faltaba.
//
// Telegram:
//   - Re-disparó algo y TODO quedó OK   → mensaje informativo (qué se recuperó).
//   - Alguna empresa sigue sin success  → ALERTA (empresa, sync_type, último error).
//   - Todo estaba OK desde el inicio     → no envía nada (cero ruido).
//
// Auth: Bearer con CRON_SECRET (igual que el resto de crons).
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { empresasConFacturas, empresasConCxc } from "@/lib/switch-api/empresas";
import { sendTelegramAlert } from "@/lib/telegram";
import { recordCronHeartbeat } from "@/lib/cron-telemetry";
import type { EmpresaKey } from "@/lib/empresa-mapping";

const CRON_NAME = "switch-reconciliacion";
// Watchdog: alerta si algún cron lleva más de 30h sin registrar success.
const WATCHDOG_STALE_HOURS = 30;

export const dynamic = "force-dynamic";
// El App Router cachea fetch() por defecto (Data Cache) — incluye los fetch
// internos de supabase-js Y nuestro fetch a switch-sync. Sin esto, la re-consulta
// del log devuelve datos stale y la re-corrida se sirve cacheada (mismo logId).
export const fetchCache = "force-no-store";
export const maxDuration = 300;

// sync_type que el cron switch-sync (tipo=all) escribe a switch_sync_log.
const DAILY_SYNC_TYPES = ["facturas", "estadocuenta", "costo"] as const;
type DailySyncType = (typeof DAILY_SYNC_TYPES)[number];

interface SyncLogRow {
  empresa_key: string;
  sync_type: string;
  status: string;
  started_at: string;
  error_message: string | null;
}

interface Pair {
  empresa: EmpresaKey;
  syncType: DailySyncType;
}

const key = (empresa: string, syncType: string) => `${empresa}|${syncType}`;

/** Fecha de HOY en Panamá (YYYY-MM-DD). Panamá es UTC-5 fijo (sin horario de verano). */
function panamaToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Panama" }).format(
    new Date(),
  );
}

/** Inicio del día de Panamá (medianoche) expresado en ISO UTC, para filtrar started_at. */
function panamaDayStartIso(): string {
  return new Date(`${panamaToday()}T00:00:00-05:00`).toISOString();
}

/**
 * Pares (empresa, sync_type) que DEBEN tener un success hoy:
 *   - facturas y costo → todas las empresas con facturas (8).
 *   - estadocuenta     → solo las empresas con CXC (6).
 */
function expectedPairs(): Pair[] {
  const pairs: Pair[] = [];
  for (const e of empresasConFacturas()) {
    pairs.push({ empresa: e, syncType: "facturas" });
    pairs.push({ empresa: e, syncType: "costo" });
  }
  for (const e of empresasConCxc()) {
    pairs.push({ empresa: e, syncType: "estadocuenta" });
  }
  return pairs;
}

async function fetchTodayLog(sinceIso: string): Promise<SyncLogRow[]> {
  const { data, error } = await supabaseServer
    .from("switch_sync_log")
    .select("empresa_key,sync_type,status,started_at,error_message")
    .gte("started_at", sinceIso)
    .in("sync_type", DAILY_SYNC_TYPES as unknown as string[])
    .order("started_at", { ascending: false });

  if (error) {
    throw new Error(`No pude consultar switch_sync_log: ${error.message}`);
  }
  return (data ?? []) as SyncLogRow[];
}

/** Pares esperados que NO tienen ningún success hoy. */
function findMissing(expected: Pair[], rows: SyncLogRow[]): Pair[] {
  const successSet = new Set(
    rows.filter((r) => r.status === "success").map((r) => key(r.empresa_key, r.sync_type)),
  );
  return expected.filter((p) => !successSet.has(key(p.empresa, p.syncType)));
}

/** Último mensaje de error registrado hoy para un par (o null si no corrió). */
function lastErrorFor(pair: Pair, rows: SyncLogRow[]): string | null {
  // rows viene ordenado por started_at desc → el primero que matchea es el más reciente.
  const row = rows.find(
    (r) => r.empresa_key === pair.empresa && r.sync_type === pair.syncType,
  );
  if (!row) return "sin corrida hoy";
  return row.error_message ?? `status=${row.status}`;
}

/**
 * Error legible para Telegram: solo el primer renglón útil, truncado a ~200
 * chars. Switch a veces devuelve una página HTML de excepción completa
 * ("<!DOCTYPE html>...") como error_message — sin esto la alerta queda ilegible.
 */
function shortError(msg: string | null, max = 200): string {
  if (!msg) return "—";
  const firstLine = msg.split(/\r?\n/)[0].trim();
  return firstLine.length > max ? `${firstLine.slice(0, max)}…` : firstLine;
}

/**
 * Re-dispara el cron switch-sync (tipo=all) para las empresas dadas, en una sola
 * llamada HTTP — switch-sync las procesa SERIALMENTE adentro (requisito de la
 * sesión única de Switch). Usamos el mismo origin de este request para construir
 * la URL absoluta. No lanza: si la llamada falla, lo registramos y dejamos que la
 * re-consulta de switch_sync_log sea la fuente de verdad del estado final.
 */
async function retriggerSwitchSync(
  origin: string,
  secret: string,
  empresas: EmpresaKey[],
): Promise<{ ok: boolean; detail: string }> {
  const url = `${origin}/api/cron/switch-sync?tipo=all&empresas=${empresas.join(",")}`;
  try {
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${secret}` },
      cache: "no-store",
    });
    const body = await res.text().catch(() => "");
    return { ok: res.ok, detail: `HTTP ${res.status} ${body.slice(0, 300)}` };
  } catch (err) {
    return {
      ok: false,
      detail: `fetch falló: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Watchdog de heartbeats: revisa cron_heartbeats y alerta por Telegram si algún
 * cron lleva más de WATCHDOG_STALE_HOURS sin un success. Devuelve la lista de
 * crons stale. No lanza: si la tabla no existe aún (migración pendiente) o la
 * query falla, devuelve [] y sigue.
 */
async function checkStaleCrons(): Promise<string[]> {
  const { data, error } = await supabaseServer
    .from("cron_heartbeats")
    .select("cron_name, last_success_at");
  if (error) {
    console.error(`[watchdog] no pude leer cron_heartbeats: ${error.message}`);
    return [];
  }
  const cutoffMs = Date.now() - WATCHDOG_STALE_HOURS * 3600 * 1000;
  const stale = (data || [])
    .filter((h) => {
      const t = new Date(h.last_success_at).getTime();
      return Number.isFinite(t) && t < cutoffMs;
    })
    .map((h) => `${h.cron_name} (último: ${h.last_success_at})`);
  if (stale.length > 0) {
    await sendTelegramAlert(
      `⏰ Watchdog crons — ${stale.length} sin success >${WATCHDOG_STALE_HOURS}h:\n` +
        stale.map((s) => `• ${s}`).join("\n"),
    );
  }
  return stale;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET no configurado" },
      { status: 500 },
    );
  }
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const fecha = panamaToday();
  const sinceIso = panamaDayStartIso();
  const expected = expectedPairs();

  // 0. Watchdog de heartbeats (corre en ambos desenlaces) + registrar el propio.
  const staleCrons = await checkStaleCrons();
  await recordCronHeartbeat(CRON_NAME);

  // 1. Detección inicial.
  const logBefore = await fetchTodayLog(sinceIso);
  const missingBefore = findMissing(expected, logBefore);

  // Todo OK desde el inicio → cero ruido, no se toca nada.
  if (missingBefore.length === 0) {
    return NextResponse.json({
      ok: true,
      fecha,
      allHealthy: true,
      reconciled: [],
      stillFailing: [],
      telegram: "none",
      staleCrons,
    });
  }

  // 2. Re-disparar SOLO las empresas afectadas (distintas), en serie vía switch-sync.
  const empresasAfectadas = [...new Set(missingBefore.map((p) => p.empresa))] as EmpresaKey[];
  const retrigger = await retriggerSwitchSync(req.nextUrl.origin, secret, empresasAfectadas);

  // 3. Re-consultar el log: fuente de verdad del estado final.
  const logAfter = await fetchTodayLog(sinceIso);
  const missingAfter = findMissing(expected, logAfter);

  const recovered = missingBefore.filter(
    (p) => !missingAfter.some((m) => m.empresa === p.empresa && m.syncType === p.syncType),
  );

  // 4. Telegram.
  let telegram: "info" | "alert" | "none" = "none";

  if (missingAfter.length > 0) {
    telegram = "alert";
    const lineas = missingAfter
      .map((p) => `• ${p.empresa} / ${p.syncType}: ${shortError(lastErrorFor(p, logAfter))}`)
      .join("\n");
    const recuperadas = recovered.length
      ? `\n\nRecuperadas en esta corrida: ${recovered.map((p) => `${p.empresa}/${p.syncType}`).join(", ")}`
      : "";
    await sendTelegramAlert(
      `🚨 ALERTA sync Switch (${fecha})\n` +
        `${missingAfter.length} sin success tras reconciliación:\n${lineas}${recuperadas}`,
    );
  } else if (recovered.length > 0) {
    telegram = "info";
    await sendTelegramAlert(
      `✅ Reconciliación Switch (${fecha})\n` +
        `Recuperadas ${recovered.length}: ${recovered.map((p) => `${p.empresa}/${p.syncType}`).join(", ")}\n` +
        `Todo el ciclo diario quedó en success.`,
    );
  }

  return NextResponse.json(
    {
      ok: missingAfter.length === 0,
      fecha,
      allHealthy: false,
      empresasReDisparadas: empresasAfectadas,
      retrigger,
      reconciled: recovered.map((p) => ({ empresa: p.empresa, syncType: p.syncType })),
      stillFailing: missingAfter.map((p) => ({
        empresa: p.empresa,
        syncType: p.syncType,
        lastError: lastErrorFor(p, logAfter),
      })),
      telegram,
      staleCrons,
    },
    { status: missingAfter.length === 0 ? 200 : 207 },
  );
}
