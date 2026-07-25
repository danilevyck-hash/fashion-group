// ─────────────────────────────────────────────────────────────────────────────
// Cron: REFRESH MATERIALIZED VIEW CONCURRENTLY de las vistas de /ventas + CXC
//   1) clientes_empresa_12m_vw  — tab Clientes (compras 12m + YTD por cliente).
//   2) ventas_rollup_mensual_mv — rollup mensual empresa x mes (ventas + costo)
//      que sirve el histórico de los 3 RPC del dashboard (Tier 2 perf). Los
//      meses cerrados salen de aquí; el mes en curso lo lee el RPC en vivo, así
//      que este refresh NO le quita frescura al mes corriente.
//   3) switch_estadocuenta_aging_mv — aging de CXC, tras el switch-sync B2B.
//
// CONCURRENTLY:
//   No bloquea lecturas durante el refresh. Cada MV tiene su UNIQUE INDEX
//   (clientes: (cliente_norm, empresa); rollup: (empresa_key, mes)).
//
// Wrapper RPC:
//   supabase-js no expone SQL raw — cada REFRESH se invoca via su función SQL
//   SECURITY DEFINER (refresh_clientes_empresa_12m_vw / refresh_ventas_rollup_mensual_mv
//   / refresh_switch_estadocuenta_aging_mv).
//
// Resiliencia (jul-2026, incidentes 4-jul y 23-jul: "canceling statement due to
// statement timeout", transitorio — el reintento manual horas después pasó):
//   - maxDuration=800 (antes corría con el default de 10s de Vercel).
//   - UN reintento interno tras una espera corta si la RPC falla con error
//     transitorio (statement timeout / red), respetando el presupuesto de tiempo.
//   - Sin Telegram inmediato ({telegram:false}): es colateral de la
//     reconciliación (10/14/18 UTC) — ella re-ejecuta las 3 MVs y alerta solo si
//     sigue caído. Rastro del fallo en cron_email_errors.
//
// Schedule: 07:35 UTC — después del switch-sync de las 6 B2B (05:30-05:40) y de
// AC/Boston (06:30), fuera de la ráfaga 07:00-07:31 (utilidad + clientes-master).
// No llama al API de Switch (lee tablas ya sincronizadas) → single-token N/A.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { recordCronHeartbeat, logCronError } from "@/lib/cron-telemetry";
import { verifySession } from "@/lib/session-cookie";

export const dynamic = "force-dynamic";
// Tope del plan Hobby. Sin esto Vercel corta a los 10s default — un REFRESH
// lento (contención) moría sin margen ni chance de reintento.
export const maxDuration = 800; // techo del plan (Pro + Fluid)

const CRON_NAME = "refresh-clientes-views";

// Las 3 MVs, en orden. `tipo` = etiqueta histórica en cron_email_errors.
const REFRESHES = [
  { rpc: "refresh_clientes_empresa_12m_vw", tipo: "refresh_clientes_vw" },
  { rpc: "refresh_ventas_rollup_mensual_mv", tipo: "refresh_ventas_rollup_mv" },
  { rpc: "refresh_switch_estadocuenta_aging_mv", tipo: "refresh_cxc_aging_mv" },
] as const;

// Reintento único para fallos transitorios: espera corta y de nuevo. Solo si
// queda presupuesto (los 3 refreshes + 1 espera deben caber en maxDuration).
const RETRY_WAIT_MS = 45_000;
const RETRY_BUDGET_MS = 200_000;

/** ¿Error transitorio que amerita reintento? (statement timeout de Postgres,
 *  cortes de red). Un error de permiso/SQL no se reintenta: fallaría igual. */
function esTransitorio(msg: string): boolean {
  return /statement timeout|canceling statement|timed? ?out|57014|fetch failed|ECONNRESET|ETIMEDOUT|socket hang up/i.test(
    msg,
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Ejecuta la RPC de refresh; si falla con error transitorio y queda
 *  presupuesto, espera RETRY_WAIT_MS y reintenta UNA vez. */
async function refreshConRetry(
  rpc: string,
  startedAt: number,
): Promise<{ error: string | null; retried: boolean }> {
  const first = await supabaseServer.rpc(rpc);
  if (!first.error) return { error: null, retried: false };
  const msg = first.error.message;
  if (!esTransitorio(msg) || Date.now() - startedAt > RETRY_BUDGET_MS) {
    return { error: msg, retried: false };
  }
  console.warn(`[cron/refresh-clientes-views] ${rpc} transitorio ("${msg}") — reintento en ${RETRY_WAIT_MS / 1000}s`);
  await sleep(RETRY_WAIT_MS);
  const second = await supabaseServer.rpc(rpc);
  return { error: second.error ? second.error.message : null, retried: true };
}

export async function GET(req: NextRequest) {
  // Auth: Bearer header preferido, ?secret= como fallback, admin cookie para
  // ejecuciones manuales desde el panel.
  const secret = req.headers.get("authorization")?.replace("Bearer ", "")
    ?? req.nextUrl.searchParams.get("secret");
  let authorized = !!secret && secret === process.env.CRON_SECRET;
  if (!authorized) {
    try {
      if (verifySession(req.cookies.get("cxc_session")?.value)?.role === "admin") {
        authorized = true;
      }
    } catch { /* invalid cookie */ }
  }
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const startedAt = Date.now();
  const startedAtIso = new Date(startedAt).toISOString();
  console.log(`[cron/refresh-clientes-views] start ${startedAtIso}`);

  const retried: string[] = [];
  for (const { rpc, tipo } of REFRESHES) {
    const r = await refreshConRetry(rpc, startedAt);
    if (r.retried) retried.push(rpc);
    if (r.error) {
      const durationMs = Date.now() - startedAt;
      console.error(`[cron/refresh-clientes-views] ${rpc} failed after ${durationMs}ms:`, r.error);
      // Persistir en cron_email_errors (los logs de Vercel rotan en 24h). SIN
      // Telegram inmediato: colateral de la reconciliación → ella re-ejecuta
      // las 3 MVs y alerta solo si sigue caído (patrón anti-ruido 17-jul-2026).
      await logCronError(tipo, r.error, null, { telegram: false });
      // Sin heartbeat: el cron solo está "sano" si las 3 vistas refrescaron.
      return NextResponse.json(
        { ok: false, rpc, error: r.error, retried, durationMs, refreshedAt: startedAtIso },
        { status: 500 },
      );
    }
  }

  const refreshedAt = new Date().toISOString();
  const durationMs = Date.now() - startedAt;
  console.log(`[cron/refresh-clientes-views] ok in ${durationMs}ms${retried.length ? ` (reintentadas: ${retried.join(", ")})` : ""}`);
  await recordCronHeartbeat(CRON_NAME);
  return NextResponse.json({ ok: true, refreshedAt, durationMs, retried });
}
