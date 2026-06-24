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
//   - 200 { ok: true, ... }   → todos los crons frescos (success en <26h).
//   - 503 { ok: false, stale: [...] } → ≥1 cron viejo o sin heartbeat nunca.
//   El monitor externo alerta cuando el status ≠ 200 (o cuando ok=false).
//
// Protección: token simple (?token= o header x-healthcheck-token), comparado en
// tiempo constante contra HEALTHCHECK_TOKEN. NO usa CRON_SECRET a propósito: un
// monitor de terceros no debe poder disparar crons. Fail-closed: sin la env var
// configurada responde 503.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// Todos los crons corren 1×/día (plan Hobby). Stale = sin success en >26h
// (mismo umbral que el watchdog interno de switch-reconciliacion).
const STALE_HOURS = 26;

// Crons que registran heartbeat (deben existir en cron_heartbeats). Un cron de
// esta lista SIN fila = nunca registró success → se reporta como stale (null).
const EXPECTED_CRONS = [
  "backup",
  "cheques-alert",
  "cleanup-packing-lists",
  "integrity-check",
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

  const { data, error } = await supabaseServer
    .from("cron_heartbeats")
    .select("cron_name, last_success_at");
  if (error) {
    return NextResponse.json(
      { ok: false, error: `No pude leer cron_heartbeats: ${error.message}` },
      { status: 503 },
    );
  }

  const beats = new Map(
    (data ?? []).map((h) => [h.cron_name as string, h.last_success_at as string]),
  );
  const now = Date.now();
  const cutoffMs = now - STALE_HOURS * 3600 * 1000;

  const stale: Array<{ cron: string; last_success_at: string | null; hours_ago: number | null }> = [];
  const fresh: Array<{ cron: string; last_success_at: string; hours_ago: number }> = [];

  for (const cron of EXPECTED_CRONS) {
    const last = beats.get(cron) ?? null;
    const t = last ? new Date(last).getTime() : NaN;
    const hoursAgo = Number.isFinite(t) ? Math.round((now - t) / 3600000) : null;
    if (!Number.isFinite(t) || t < cutoffMs) {
      stale.push({ cron, last_success_at: last, hours_ago: hoursAgo });
    } else {
      fresh.push({ cron, last_success_at: last as string, hours_ago: hoursAgo as number });
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
    },
    { status: ok ? 200 : 503 },
  );
}
