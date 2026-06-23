// ─────────────────────────────────────────────────────────────────────────────
// Cron: REFRESH MATERIALIZED VIEW CONCURRENTLY de las vistas de /ventas
//   1) clientes_empresa_12m_vw  — tab Clientes (compras 12m + YTD por cliente).
//   2) ventas_rollup_mensual_mv — rollup mensual empresa x mes (ventas + costo)
//      que sirve el histórico de los 3 RPC del dashboard (Tier 2 perf). Los
//      meses cerrados salen de aquí; el mes en curso lo lee el RPC en vivo, así
//      que este refresh nocturno NO le quita frescura al mes corriente.
//
// CONCURRENTLY:
//   No bloquea lecturas durante el refresh. Cada MV tiene su UNIQUE INDEX
//   (clientes: (cliente_norm, empresa); rollup: (empresa_key, mes)).
//
// Wrapper RPC:
//   supabase-js no expone SQL raw — cada REFRESH se invoca via su función SQL
//   SECURITY DEFINER (refresh_clientes_empresa_12m_vw / refresh_ventas_rollup_mensual_mv).
//
// Schedule: 5:00 UTC = 12:00 AM Panamá — ventana de baja actividad, antes
// del jornada laboral. Backup ya ocupa 6:00 UTC; este cron evita contention.
// No llama al API de Switch (lee tablas ya sincronizadas) → single-token N/A.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { recordCronHeartbeat, logCronError } from "@/lib/cron-telemetry";
import { verifySession } from "@/lib/session-cookie";

export const dynamic = "force-dynamic";

const CRON_NAME = "refresh-clientes-views";

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

  const { error } = await supabaseServer.rpc("refresh_clientes_empresa_12m_vw");

  if (error) {
    const durationMs = Date.now() - startedAt;
    console.error(`[cron/refresh-clientes-views] failed after ${durationMs}ms:`, error.message);
    // Persistir el fallo en cron_email_errors — los logs de Vercel rotan
    // en 24h y el dashboard de salud necesita historial. Best-effort: si
    // el propio INSERT falla, igual devolvemos el 500 con el error real.
    try {
      const { error: logErr } = await supabaseServer
        .from("cron_email_errors")
        .insert({
          tipo: "refresh_clientes_vw",
          cheque_context: null,
          error_message: error.message,
        });
      if (logErr) {
        console.error("[cron/refresh-clientes-views] cron_email_errors insert failed:", logErr.message);
      }
    } catch (logErr) {
      console.error("[cron/refresh-clientes-views] cron_email_errors insert threw:", logErr);
    }
    await logCronError("refresh_clientes_views_failed", error.message);
    return NextResponse.json(
      { ok: false, error: error.message, durationMs, refreshedAt: startedAtIso },
      { status: 500 }
    );
  }

  // 2) Rollup mensual de /ventas. Mismo patrón: REFRESH CONCURRENTLY via RPC
  //    SECURITY DEFINER. Si falla, persistir + 500 (no registramos heartbeat:
  //    el cron solo está "sano" si ambas vistas refrescaron).
  const { error: rollupError } = await supabaseServer.rpc("refresh_ventas_rollup_mensual_mv");

  if (rollupError) {
    const durationMs = Date.now() - startedAt;
    console.error(`[cron/refresh-clientes-views] rollup failed after ${durationMs}ms:`, rollupError.message);
    try {
      const { error: logErr } = await supabaseServer
        .from("cron_email_errors")
        .insert({
          tipo: "refresh_ventas_rollup_mv",
          cheque_context: null,
          error_message: rollupError.message,
        });
      if (logErr) {
        console.error("[cron/refresh-clientes-views] cron_email_errors insert failed:", logErr.message);
      }
    } catch (logErr) {
      console.error("[cron/refresh-clientes-views] cron_email_errors insert threw:", logErr);
    }
    await logCronError("refresh_ventas_rollup_mv_failed", rollupError.message);
    return NextResponse.json(
      { ok: false, error: rollupError.message, durationMs, refreshedAt: startedAtIso },
      { status: 500 }
    );
  }

  // 3) Aging de CXC (switch_estadocuenta_aging_mv). Mismo patrón: REFRESH
  //    CONCURRENTLY via RPC SECURITY DEFINER. Corre a las 6:30 UTC, después del
  //    switch-sync de las 6 empresas B2B (5:30–5:40) → la MV refleja el sync del día.
  const { error: agingError } = await supabaseServer.rpc("refresh_switch_estadocuenta_aging_mv");

  if (agingError) {
    const durationMs = Date.now() - startedAt;
    console.error(`[cron/refresh-clientes-views] aging mv failed after ${durationMs}ms:`, agingError.message);
    try {
      const { error: logErr } = await supabaseServer
        .from("cron_email_errors")
        .insert({
          tipo: "refresh_cxc_aging_mv",
          cheque_context: null,
          error_message: agingError.message,
        });
      if (logErr) {
        console.error("[cron/refresh-clientes-views] cron_email_errors insert failed:", logErr.message);
      }
    } catch (logErr) {
      console.error("[cron/refresh-clientes-views] cron_email_errors insert threw:", logErr);
    }
    await logCronError("refresh_cxc_aging_mv_failed", agingError.message);
    return NextResponse.json(
      { ok: false, error: agingError.message, durationMs, refreshedAt: startedAtIso },
      { status: 500 }
    );
  }

  const refreshedAt = new Date().toISOString();
  const durationMs = Date.now() - startedAt;
  console.log(`[cron/refresh-clientes-views] ok in ${durationMs}ms`);
  await recordCronHeartbeat(CRON_NAME);
  return NextResponse.json({ ok: true, refreshedAt, durationMs });
}
