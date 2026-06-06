// ─────────────────────────────────────────────────────────────────────────────
// Cron: REFRESH MATERIALIZED VIEW CONCURRENTLY clientes_empresa_12m_vw
//
// Propósito de la materialized view:
//   Alimenta la tab Clientes del módulo Ventas — agrega por (cliente, empresa)
//   las compras de los últimos 12 meses, YTD del año actual y año anterior.
//   Sin refresh, las facturas nuevas no aparecen en la lista.
//
// CONCURRENTLY:
//   No bloquea lecturas durante el refresh. El UNIQUE INDEX
//   (cliente_norm, empresa) creado en migration 20260510040000 es prerequisito.
//
// Wrapper RPC:
//   supabase-js no expone SQL raw — el REFRESH se invoca via la función SQL
//   refresh_clientes_empresa_12m_vw() (migration 20260510080000), que ejecuta
//   el REFRESH con SECURITY DEFINER.
//
// Schedule: 5:00 UTC = 12:00 AM Panamá — ventana de baja actividad, antes
// del jornada laboral. Backup ya ocupa 6:00 UTC; este cron evita contention.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { recordCronHeartbeat, logCronError } from "@/lib/cron-telemetry";

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
      const session = req.cookies.get("cxc_session")?.value;
      if (session) {
        const parsed = JSON.parse(Buffer.from(session, "base64url").toString("utf-8"));
        if (parsed.role === "admin") authorized = true;
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

  const refreshedAt = new Date().toISOString();
  const durationMs = Date.now() - startedAt;
  console.log(`[cron/refresh-clientes-views] ok in ${durationMs}ms`);
  await recordCronHeartbeat(CRON_NAME);
  return NextResponse.json({ ok: true, refreshedAt, durationMs });
}
