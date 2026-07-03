// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cron/switch-reconciliacion
//
// Red de seguridad del ciclo diario de syncs Switch. Corre DESPUÉS de toda la
// cadena (switch-sync 05:30-06:30, clientes-master 07:00, utilidad 08:00, recibos
// 08:30, articulos 09:00). Detecta qué quedó SIN success de HOY (fecha Panamá) y
// lo RE-EJECUTA IN-PROCESS —llamando las funciones de sync directamente, NO por
// self-fetch HTTP.
//
// POR QUÉ IN-PROCESS (incidente 7-jun-2026): el scheduler de Vercel pierde
// invocaciones de cron (3 de 4 switch-sync + utilidad + clientes-master murieron
// sin dejar ni fila `running`). La versión vieja recuperaba por
// `fetch(${origin}/api/cron/switch-sync?...)` en lotes de 2 con maxDuration=300:
// 6 empresas × ~200s excedían el límite → la mataban a media recuperación y los
// switch-sync self-fetched no sobrevivían a la muerte del caller → recuperó 0/16.
// Ahora ejecuta el trabajo dentro de ESTA invocación (maxDuration=800), serial
// por empresa (token único de Switch), idempotente (upserts), acotado por un
// presupuesto de tiempo. Lo que no entre en una pasada lo toma la siguiente:
// corre 3×/día (10:00, 14:00, 18:00 UTC), todas idempotentes.
//
// COBERTURA: switch-sync (facturas/estadocuenta/costo, por par vía
// switch_sync_log) + los crons "de una sola unidad" (clientes-master, utilidad,
// recibos, articulos, detectados por cron_heartbeats sin success hoy). NO cubre
// multifashion-sync (no registra heartbeat → sin señal fiable; su data igual
// entra por american_classic en switch-sync).
//
// Telegram (Opción A, jun-2026 — SOLO fallos reales):
//   - Algo sigue sin success / sin tiempo → ALERTA (qué falló + último error;
//     las recuperaciones van como contexto dentro de la alerta).
//   - Ciclo 100% exitoso (con o SIN recuperaciones) → NO envía nada. Recuperar
//     es el sistema funcionando bien, no un fallo → silencio.
//
// Auth: Bearer con CRON_SECRET (igual que el resto de crons).
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import {
  syncEmpresaFacturas,
  syncEmpresaEstadoCuenta,
  syncCostoDiario,
} from "@/lib/switch-api/sync-empresa";
import { syncAllUtilidad, mesesCronDiario } from "@/lib/switch-api/sync-utilidad";
import { syncAllRecibos } from "@/lib/switch-api/sync-recibos";
import { syncArticulosDiario } from "@/lib/switch-api/sync-articulos";
import { syncClientesMaster } from "@/lib/switch-api/sync-clientes-master";
import { syncMultifashionTickets } from "@/lib/switch-api/sync";
import { syncAllProveedores } from "@/lib/switch-api/sync-proveedores";
import { runIntegrityCheck } from "@/lib/integrity-check-run";
import { runCleanupPackingLists } from "@/lib/cleanup-packing-lists";
import { runChequesAlert } from "@/lib/cheques-alert";
import { empresasConFacturas, empresasConCxc } from "@/lib/switch-api/empresas";
import { sendTelegramAlert } from "@/lib/telegram";
import { recordCronHeartbeat } from "@/lib/cron-telemetry";
import type { EmpresaKey } from "@/lib/empresa-mapping";

const CRON_NAME = "switch-reconciliacion";
// Watchdog: alerta si algún cron lleva más de 26h sin registrar success. 26h da
// margen sobre el ciclo diario (1×/día) sin tragarse un día entero: un cron
// saltado se detecta en la pasada del día siguiente, no esperando 30h.
const WATCHDOG_STALE_HOURS = 26;
// Horas UTC de las pasadas de reconciliación (espejo de vercel.json). El watchdog
// las usa para saber si un colateral stale TODAVÍA tiene una pasada de
// recuperación hoy → si la tiene, no alerta (se va a auto-recuperar).
const RECONCILIACION_PASS_HOURS = [10, 14, 18];

export const dynamic = "force-dynamic";
// El App Router cachea fetch() por defecto (Data Cache) — incluye los fetch
// internos de supabase-js. Sin esto, la re-consulta del log devuelve datos stale.
export const fetchCache = "force-no-store";
// Recuperación in-process: una corrida puede re-ejecutar varios syncs pesados en
// serie (estadocuenta ~85-120s/empresa). 300s es el TECHO del plan (Hobby con
// Fluid Compute; ver docs/cron-reliability-recovery.md). Lo que no entre en una
// pasada lo toma la siguiente (10:00/14:00/18:00) — todas idempotentes.
export const maxDuration = 300;
// Dejar de ARRANCAR trabajo nuevo pasado este umbral (headroom antes del kill a
// 300s). El trabajo ya iniciado termina; lo no arrancado lo toma la otra pasada.
const RECOVERY_BUDGET_MS = 270_000;

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

/** Fecha de HOY en Panamá (YYYY-MM-DD). Panamá es UTC-5 fijo (sin DST). */
function panamaToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Panama" }).format(new Date());
}

/** Inicio del día de Panamá (medianoche) en ISO UTC, para filtrar started_at. */
function panamaDayStartIso(): string {
  return new Date(`${panamaToday()}T00:00:00-05:00`).toISOString();
}

/** Fecha Panamá con offset de días (YYYY-MM-DD) — replica switch-sync/articulos. */
function panamaDate(offsetDays = 0): string {
  const now = new Date();
  const panama = new Date(now.toLocaleString("en-US", { timeZone: "America/Panama" }));
  panama.setDate(panama.getDate() + offsetDays);
  return panama.toISOString().slice(0, 10);
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
  const row = rows.find((r) => r.empresa_key === pair.empresa && r.sync_type === pair.syncType);
  if (!row) return "sin corrida hoy";
  return row.error_message ?? `status=${row.status}`;
}

/**
 * Error legible para Telegram: solo el primer renglón útil, truncado a ~200
 * chars. Switch a veces devuelve una página HTML de excepción completa como
 * error_message — sin esto la alerta queda ilegible.
 */
function shortError(msg: string | null, max = 200): string {
  if (!msg) return "—";
  const firstLine = msg.split(/\r?\n/)[0].trim();
  return firstLine.length > max ? `${firstLine.slice(0, max)}…` : firstLine;
}

// ─── Crons "de una sola unidad" recuperables in-process ──────────────────────
// Detección por heartbeat (success hoy o no). Recuperación llamando su función
// de sync directamente; si recupera OK, registramos su heartbeat (las funciones
// lib NO lo hacen — eso es del route/orquestador).
interface ColateralCron {
  cronName: string;
  label: string;
  recover: () => Promise<{ ok: boolean; detail: string }>;
  // Hora UTC mínima para recuperar (idempotencia de crons que corren TARDE en el
  // día y/o disparan una alerta única). Si la pasada de reconciliación ocurre
  // antes de esta hora, NO se recupera (el run normal del cron aún puede correr,
  // y recuperarlo antes duplicaría la alerta). Sin valor = recuperable siempre
  // (caso de los Switch syncs, que corren temprano: 05:30–09:30 UTC).
  recoverAfterHourUtc?: number;
}

const COLATERAL_CRONS: ColateralCron[] = [
  {
    cronName: "sync-clientes-master",
    label: "clientes-master",
    recover: async () => {
      const r = await syncClientesMaster();
      return { ok: r.ok, detail: r.ok ? `${r.upserted} upserted` : r.error ?? "error" };
    },
  },
  {
    cronName: "sync-utilidad",
    label: "utilidad",
    recover: async () => {
      // Misma ventana que el cron diario (mes en curso + anterior los días 1-5):
      // si el recovery corre el 1-5, no debe re-abrir el gap del último día del mes.
      const rs = await syncAllUtilidad(mesesCronDiario());
      const bad = rs.filter((r) => !r.ok);
      return {
        ok: bad.length === 0,
        detail: bad.length === 0 ? `${rs.length} empresas` : `falló: ${bad.map((b) => b.empresaKey).join(",")}`,
      };
    },
  },
  {
    cronName: "sync-recibos",
    label: "recibos",
    recover: async () => {
      const rs = await syncAllRecibos(mesesCronDiario());
      const bad = rs.filter((r) => !r.ok);
      return {
        ok: bad.length === 0,
        detail: bad.length === 0 ? `${rs.length} empresas` : `falló: ${bad.map((b) => b.empresaKey).join(",")}`,
      };
    },
  },
  {
    cronName: "switch-articulos",
    label: "articulos",
    recover: async () => {
      const desde = panamaDate(-3);
      const hasta = panamaDate(0);
      const bad: string[] = [];
      for (const empresaKey of empresasConFacturas()) {
        try {
          await syncArticulosDiario(empresaKey, desde, hasta);
        } catch (err) {
          bad.push(empresaKey);
          console.error(`[reconciliacion] articulos ${empresaKey}: ${err instanceof Error ? err.message : err}`);
        }
      }
      return { ok: bad.length === 0, detail: bad.length === 0 ? "ok" : `falló: ${bad.join(",")}` };
    },
  },
  {
    // Sync legacy de multifashion_tickets (Switch american_classic). Su route ya
    // registra heartbeat, pero como cualquier otro colateral puede perder su
    // invocación de cron → aquí la reconciliación lo detecta (sin heartbeat hoy) y
    // lo re-ejecuta in-process con la MISMA ventana de 7 días que su cron diario,
    // lo que además rellena cualquier hueco de días saltados.
    cronName: "multifashion-sync",
    label: "multifashion",
    recover: async () => {
      const r = await syncMultifashionTickets({
        desde: panamaDate(-7),
        hasta: panamaDate(0),
        triggeredBy: "cron",
      });
      return { ok: true, detail: `${r.inserted}+${r.updated} tickets` };
    },
  },
  {
    // Cuentas por Pagar (proveedores). Itera /apiproveedor/info por las 6 B2B y
    // upserta switch_proveedor_estadocuenta. Igual que los demás colaterales: si
    // su cron diario (09:30) se pierde, la reconciliación lo detecta y re-ejecuta.
    cronName: "sync-proveedores",
    label: "proveedores",
    recover: async () => {
      const rs = await syncAllProveedores();
      const bad = rs.filter((r) => !r.ok);
      return {
        ok: bad.length === 0,
        detail: bad.length === 0 ? `${rs.length} empresas` : `falló: ${bad.map((b) => b.empresaKey).join(",")}`,
      };
    },
  },
  {
    // Alerta de cheques por vencer (Telegram). NO toca data (query + Telegram).
    // Su cron corre 13:00 UTC → recoverAfterHourUtc=14 para NO recuperarlo antes
    // de su hora normal (si no, la pasada de las 10:00 mandaría la alerta y luego
    // el run de las 13:00 la duplicaría). Idempotente: solo se re-ejecuta si NO
    // hubo success hoy → manda la alerta perdida UNA vez (las pasadas siguientes
    // ven el heartbeat de hoy y lo saltan).
    cronName: "cheques-alert",
    label: "cheques-alert",
    recoverAfterHourUtc: 14,
    recover: async () => {
      const r = await runChequesAlert();
      return { ok: r.ok, detail: r.ok ? (r.count === 0 ? "sin cheques por vencer" : `${r.count} por vencer`) : r.detail };
    },
  },
  {
    // Checks de integridad (Telegram SOLO si hay críticos). Su cron corre 12:00
    // UTC → recoverAfterHourUtc=13 para NO adelantarse a su run normal: sin el
    // guard, la pasada de las 10:00 lo correría y mandaría la alerta crítica
    // antes de tiempo, y el run de las 12:00 la duplicaría. El persist es append
    // (igual que el botón "Correr ahora" del dashboard) → re-correr no corrompe
    // data, solo agrega un snapshot del día. Lo recuperan las pasadas 14:00/18:00.
    cronName: "integrity-check",
    label: "integrity-check",
    recoverAfterHourUtc: 13,
    recover: async () => {
      const r = await runIntegrityCheck();
      return { ok: r.ok, detail: r.ok ? (r.criticalCount > 0 ? `${r.criticalCount} críticos` : "ok") : r.detail };
    },
  },
  {
    // Refresh de las MVs de Ventas: clientes_empresa_12m_vw (tab Clientes) +
    // ventas_rollup_mensual_mv (rollup mensual del dashboard). Idempotente:
    // REFRESH ... CONCURRENTLY recomputa las mismas vistas, no duplica nada. No
    // dispara alerta y corre temprano (06:30 UTC) → sin guard de hora. Ambas RPC
    // ligeras; falla si cualquiera falla.
    cronName: "refresh-clientes-views",
    label: "refresh-clientes-views",
    recover: async () => {
      const { error: e1 } = await supabaseServer.rpc("refresh_clientes_empresa_12m_vw");
      if (e1) return { ok: false, detail: `clientes_12m: ${e1.message}` };
      const { error: e2 } = await supabaseServer.rpc("refresh_ventas_rollup_mensual_mv");
      if (e2) return { ok: false, detail: `ventas_rollup: ${e2.message}` };
      return { ok: true, detail: "vistas refrescadas (clientes_12m + ventas_rollup)" };
    },
  },
  {
    // Purga física de packing lists soft-deleted con retención vencida (90d),
    // con snapshot previo a activity_logs. Idempotente: re-correr ya no encuentra
    // candidatos (los purgados se fueron) → deleted=0, sin snapshot nuevo. No
    // alerta y corre temprano (03:00 UTC) → sin guard de hora.
    cronName: "cleanup-packing-lists",
    label: "cleanup-packing-lists",
    recover: async () => {
      const r = await runCleanupPackingLists();
      return { ok: r.ok, detail: r.detail };
    },
  },
];

/** Heartbeats de los colaterales que NO tienen success de hoy (= se perdieron). */
async function findMissingColaterales(dayStartIso: string): Promise<ColateralCron[]> {
  const names = COLATERAL_CRONS.map((c) => c.cronName);
  const { data, error } = await supabaseServer
    .from("cron_heartbeats")
    .select("cron_name, last_success_at")
    .in("cron_name", names);
  if (error) {
    console.error(`[reconciliacion] no pude leer cron_heartbeats: ${error.message}`);
    return []; // sin señal fiable → no recuperar a ciegas (evita trabajo innecesario)
  }
  const successHoy = new Set(
    (data ?? [])
      .filter((h) => h.last_success_at && h.last_success_at >= dayStartIso)
      .map((h) => h.cron_name),
  );
  // No recuperar un colateral antes de su hora programada (recoverAfterHourUtc):
  // su run normal aún puede correr; recuperarlo antes duplicaría su alerta.
  const nowHourUtc = new Date().getUTCHours();
  return COLATERAL_CRONS.filter(
    (c) =>
      !successHoy.has(c.cronName) &&
      (c.recoverAfterHourUtc === undefined || nowHourUtc >= c.recoverAfterHourUtc),
  );
}

/**
 * Watchdog de heartbeats: revisa cron_heartbeats y alerta por Telegram si algún
 * cron lleva más de WATCHDOG_STALE_HOURS sin un success. No lanza.
 */
// ¿este cron stale TODAVÍA se va a auto-recuperar hoy? → no alertar (alerta
// fantasma). Solo aplica a colaterales (los que la reconciliación recupera). Un
// colateral se recupera en las pasadas cuya hora >= recoverAfterHourUtc; si aún
// queda alguna pasada elegible hoy (ahora o más tarde), la recuperación está por
// venir → silenciar. Si su fallo es real, el alert de failedColaterales/skipped
// de la propia reconciliación lo reporta (mensaje preciso, no fantasma). Los
// crons SIN recuperación (no colaterales) nunca se silencian → alerta normal.
function autoRecoveryStillComingToday(cronName: string, nowHourUtc: number): boolean {
  const col = COLATERAL_CRONS.find((c) => c.cronName === cronName);
  if (!col) return false; // sin recuperación → alertar normal
  const after = col.recoverAfterHourUtc ?? 0;
  const eligible = RECONCILIACION_PASS_HOURS.filter((p) => p >= after);
  if (eligible.length === 0) return false; // nunca elegible hoy → alertar
  return Math.max(...eligible) >= nowHourUtc; // queda una pasada hoy → silenciar
}

async function checkStaleCrons(): Promise<string[]> {
  const { data, error } = await supabaseServer
    .from("cron_heartbeats")
    .select("cron_name, last_success_at");
  if (error) {
    console.error(`[watchdog] no pude leer cron_heartbeats: ${error.message}`);
    return [];
  }
  const cutoffMs = Date.now() - WATCHDOG_STALE_HOURS * 3600 * 1000;
  const nowHourUtc = new Date().getUTCHours();
  const stale = (data || [])
    .filter((h) => {
      const t = new Date(h.last_success_at).getTime();
      return Number.isFinite(t) && t < cutoffMs;
    })
    // Silenciar los que aún se van a auto-recuperar hoy (anti alerta-fantasma).
    .filter((h) => !autoRecoveryStillComingToday(h.cron_name, nowHourUtc))
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
    return NextResponse.json({ ok: false, error: "CRON_SECRET no configurado" }, { status: 500 });
  }
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const startedMs = Date.now();
  const elapsed = () => Date.now() - startedMs;
  const budgetLeft = () => elapsed() < RECOVERY_BUDGET_MS;

  const fecha = panamaToday();
  const sinceIso = panamaDayStartIso();
  const expected = expectedPairs();

  // 0. Watchdog de heartbeats + registrar el propio.
  const staleCrons = await checkStaleCrons();
  await recordCronHeartbeat(CRON_NAME);

  // 1. Detección inicial (switch-sync por par + colaterales por heartbeat).
  const logBefore = await fetchTodayLog(sinceIso);
  const missingPairs = findMissing(expected, logBefore);
  const missingColaterales = await findMissingColaterales(sinceIso);

  // Todo OK desde el inicio → cero ruido, no se toca nada.
  if (missingPairs.length === 0 && missingColaterales.length === 0) {
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

  // 2. RECUPERACIÓN IN-PROCESS, serial, en orden de dependencia/prioridad, acotada
  //    por presupuesto de tiempo. Lo que no entre lo toma la próxima pasada.
  const win = { desde: panamaDate(-7), hasta: panamaDate(0), triggeredBy: "cron" as const };
  const skipped: string[] = [];

  // 2a. switch-sync: agrupar pares faltantes por empresa y correr SOLO los tipos
  //     faltantes de esa empresa, en orden canónico (reusa el token: facturas →
  //     estadocuenta → costo). Las funciones escriben switch_sync_log (fuente de
  //     verdad del re-chequeo); si lanzan, lo capturamos y seguimos.
  const empresasConPares = new Map<EmpresaKey, Set<DailySyncType>>();
  for (const p of missingPairs) {
    if (!empresasConPares.has(p.empresa)) empresasConPares.set(p.empresa, new Set());
    empresasConPares.get(p.empresa)!.add(p.syncType);
  }
  let switchSyncRecoveryRan = false;
  for (const [empresaKey, tipos] of empresasConPares) {
    if (!budgetLeft()) {
      skipped.push(`switch-sync/${empresaKey}`);
      continue;
    }
    switchSyncRecoveryRan = true;
    for (const tipo of DAILY_SYNC_TYPES) {
      if (!tipos.has(tipo)) continue;
      try {
        if (tipo === "facturas") await syncEmpresaFacturas(empresaKey, win);
        else if (tipo === "estadocuenta") await syncEmpresaEstadoCuenta(empresaKey, win);
        else await syncCostoDiario(empresaKey, win.triggeredBy);
      } catch (err) {
        console.error(`[reconciliacion] ${empresaKey}/${tipo}: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  // 2b. colaterales (orden: clientes-master primero — lee switch_clientes que
  //     facturas acaba de refrescar; luego utilidad/recibos/articulos).
  const colateralResults: Array<{ cronName: string; label: string; ok: boolean; detail: string }> = [];
  for (const c of missingColaterales) {
    if (!budgetLeft()) {
      skipped.push(c.cronName);
      continue;
    }
    try {
      const r = await c.recover();
      if (r.ok) await recordCronHeartbeat(c.cronName);
      colateralResults.push({ cronName: c.cronName, label: c.label, ...r });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      console.error(`[reconciliacion] ${c.cronName}: ${detail}`);
      colateralResults.push({ cronName: c.cronName, label: c.label, ok: false, detail });
    }
  }
  // Si switch-sync recuperó algo OK, refrescar su heartbeat (el watchdog usa el
  // heartbeat 'switch-sync'; las funciones lib no lo tocan).
  if (switchSyncRecoveryRan) await recordCronHeartbeat("switch-sync");

  // 3. Re-consultar: fuente de verdad del estado final.
  const logAfter = await fetchTodayLog(sinceIso);
  const stillMissingPairs = findMissing(expected, logAfter);
  const recoveredPairs = missingPairs.filter(
    (p) => !stillMissingPairs.some((m) => m.empresa === p.empresa && m.syncType === p.syncType),
  );
  const failedColaterales = colateralResults.filter((c) => !c.ok);
  const recoveredColaterales = colateralResults.filter((c) => c.ok);

  // 4. Telegram — SOLO si algo quedó realmente caído tras el ciclo (Opción A,
  //    jun-2026). Recuperar NO es un fallo: un ciclo 100% exitoso —con o sin
  //    recuperaciones— NO manda nada (cero ruido). El mensaje sale únicamente
  //    cuando hay un fallo real: colateral irrecuperable, sync que quedó sin
  //    success, o trabajo que no entró por tiempo (skipped). Las recuperaciones
  //    se siguen reportando como CONTEXTO dentro de esa alerta de fallo, y en el
  //    JSON de respuesta (reconciled[]) para auditoría.
  const hayProblemas = stillMissingPairs.length > 0 || failedColaterales.length > 0 || skipped.length > 0;
  let telegram: "alert" | "none" = "none";

  if (hayProblemas) {
    telegram = "alert";
    const lineasPares = stillMissingPairs.map(
      (p) => `• ${p.empresa}/${p.syncType}: ${shortError(lastErrorFor(p, logAfter))}`,
    );
    const lineasCol = failedColaterales.map((c) => `• ${c.label}: ${shortError(c.detail)}`);
    const lineasSkip = skipped.length ? [`• sin tiempo (próxima pasada): ${skipped.join(", ")}`] : [];
    const recuperadas =
      recoveredPairs.length || recoveredColaterales.length
        ? `\n\nRecuperadas: ${[
            ...recoveredPairs.map((p) => `${p.empresa}/${p.syncType}`),
            ...recoveredColaterales.map((c) => c.label),
          ].join(", ")}`
        : "";
    await sendTelegramAlert(
      `🚨 ALERTA sync Switch (${fecha})\n` +
        `Sin success tras reconciliación:\n${[...lineasPares, ...lineasCol, ...lineasSkip].join("\n")}${recuperadas}`,
    );
  }

  return NextResponse.json(
    {
      ok: !hayProblemas,
      fecha,
      allHealthy: false,
      elapsedMs: elapsed(),
      reconciled: [
        ...recoveredPairs.map((p) => ({ empresa: p.empresa, syncType: p.syncType })),
        ...recoveredColaterales.map((c) => ({ cron: c.cronName })),
      ],
      stillFailing: [
        ...stillMissingPairs.map((p) => ({
          empresa: p.empresa,
          syncType: p.syncType,
          lastError: lastErrorFor(p, logAfter),
        })),
        ...failedColaterales.map((c) => ({ cron: c.cronName, detail: c.detail })),
      ],
      skipped,
      telegram,
      staleCrons,
    },
    { status: hayProblemas ? 207 : 200 },
  );
}
