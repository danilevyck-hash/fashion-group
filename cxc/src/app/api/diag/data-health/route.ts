// ─────────────────────────────────────────────────────────────────────────────
// GET /api/diag/data-health — los chequeos de integridad, SIN pantalla.
//
// POR QUÉ EXISTE (11-sep-2026). Daniel, textual: «data health quiero que el
// sistema o tú mida todo pero no verlo… no lo uso y no lo quiero usar». Y antes:
// «yo no uso Data Health, nunca lo veo». Así que se retiró la PANTALLA —era la
// 2ª pestaña de Usuarios— y NO la medición: el cron `integrity-check` sigue
// corriendo a las 12:00 UTC, `data_integrity_checks` sigue recibiendo filas
// (insert-only) y un check CRÍTICO sigue avisando por Telegram 🔧 SISTEMA.
//
// Esta ruta es lo que queda para MIRAR el resultado cuando hace falta: es la
// misma lectura que alimentaba el dashboard, movida de `/api/admin/data-health`
// a `/api/diag/` para que se pueda consultar con `CRON_SECRET` desde una
// terminal, sin sesión y sin navegador. No dibuja nada y no escribe nada.
//
//   curl -s -H "Authorization: Bearer $CRON_SECRET" \
//     https://fashiongr.com/api/diag/data-health | jq '.latest[] | {check_name, severity, rows_affected}'
//
// AUTH: Bearer CRON_SECRET (o `?secret=`), o sesión de admin. FAIL-CLOSED: sin
// CRON_SECRET configurado responde 503, y sin secreto ni sesión, 401 — la ruta
// vive bajo `/api/diag/`, que es prefijo público del middleware, así que la
// puerta es ésta y sólo ésta. Mismo patrón que `/api/diag/canales-telegram`.
//
// READ-ONLY DE VERDAD: un solo SELECT sobre `data_integrity_checks`. No corre
// los checks (eso es `/api/cron/integrity-check`) ni toca ninguna otra tabla.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseServer } from "@/lib/supabase-server";
import { verifySession } from "@/lib/session-cookie";
import { LIVE_CHECK_NAMES } from "@/lib/integrity-checks";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface CheckRow {
  id: string;
  check_name: string;
  table_name: string;
  severity: "ok" | "info" | "warning" | "critical";
  rows_affected: number;
  threshold_exceeded: boolean;
  details: Record<string, unknown> | null;
  checked_at: string;
}

const SEVERITY_RANK: Record<CheckRow["severity"], number> = { ok: 0, info: 1, warning: 2, critical: 3 };

/** Compara secretos en tiempo constante (evita fuga por timing). */
function secretoOk(recibido: string, esperado: string): boolean {
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  const esperado = process.env.CRON_SECRET;
  if (!esperado) {
    // Fail-closed: sin secreto configurado no se abre por defecto.
    return NextResponse.json({ error: "CRON_SECRET no configurado" }, { status: 503 });
  }

  const recibido =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    req.nextUrl.searchParams.get("secret") ??
    "";

  const porSecreto = recibido.length > 0 && secretoOk(recibido, esperado);
  const porSesion = verifySession(req.cookies.get("cxc_session")?.value)?.role === "admin";
  if (!porSecreto && !porSesion) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabaseServer
    .from("data_integrity_checks")
    .select("id, check_name, table_name, severity, rows_affected, threshold_exceeded, details, checked_at")
    .gte("checked_at", since30d)
    .order("checked_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Solo checks VIVOS (los que produce runAllChecks). Oculta el historial stale
  // de los checks legacy del CSV ya retirados (cxc_fecha_null, last_upload_age_ventas,
  // upload_desync_cxc_ventas, etc.). `data_integrity_checks` queda INTACTA — el
  // historial sigue como archivo; esto es solo filtro de presentación.
  const rows = ((data ?? []) as CheckRow[]).filter(r => LIVE_CHECK_NAMES.has(r.check_name));

  // Latest por check_name (la lista viene ordenada desc → primer match gana).
  const latestByCheck = new Map<string, CheckRow>();
  for (const r of rows) {
    if (!latestByCheck.has(r.check_name)) latestByCheck.set(r.check_name, r);
  }
  const latest = [...latestByCheck.values()].sort((a, b) => {
    const sb = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (sb !== 0) return sb;
    return a.check_name.localeCompare(b.check_name);
  });

  // History 30d: para cada check, agrupar por día y quedarnos con la peor
  // severity. Output: { check_name → { date(YYYY-MM-DD) → severity } }.
  const history: Record<string, Record<string, CheckRow["severity"]>> = {};
  for (const r of rows) {
    const day = r.checked_at.slice(0, 10);
    if (!history[r.check_name]) history[r.check_name] = {};
    const prev = history[r.check_name][day];
    if (!prev || SEVERITY_RANK[r.severity] > SEVERITY_RANK[prev]) {
      history[r.check_name][day] = r.severity;
    }
  }

  const lastRun = rows[0]?.checked_at ?? null;

  return NextResponse.json({
    latest,
    history,
    last_run: lastRun,
    total_runs_30d: new Set(rows.map(r => r.checked_at.slice(0, 16))).size,
  });
}
