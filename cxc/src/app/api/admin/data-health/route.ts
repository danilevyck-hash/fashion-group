// GET /api/admin/data-health
//
// Devuelve para el dashboard /admin/data-health:
//   - latest: el row más reciente de data_integrity_checks por check_name
//   - history: timeline 30d (1 row por día con la peor severity por check)
//   - last_run: timestamp de la última corrida (max checked_at)
//
// Solo accesible por admin.

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";
import { LIVE_CHECK_NAMES } from "@/lib/integrity-checks";

export const dynamic = "force-dynamic";

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

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

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
  // upload_desync_cxc_ventas, etc.). data_integrity_checks queda INTACTA — el
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
