// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cxc/freshness
//
// Devuelve la fecha de último upload de CXC y de Ventas para que el header
// del Panel CXC pueda alertar a Daniel cuando la data está desactualizada
// (los CSVs de Switch se suben por separado y se desincronizan).
//
// Fuente primaria de last_update: activity_logs (acciones 'cxc_upload' y
// 'ventas_upload', ya emitidas por /api/cxc/upload y /api/ventas/upload).
// Fallback (uploads legacy pre-feature): MAX(uploaded_at) de cxc_uploads /
// ventas_raw. El response marca cuál fuente se usó.
//
// Además expone data_coverage_last = MAX(fecha) de la tabla raw, para que
// el header pueda mostrar hasta qué fecha realmente cubre la data dentro
// del CSV (Switch a veces se sube días después de la fecha de cobertura).
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireAuth } from "@/lib/require-auth";

export const dynamic = "force-dynamic";

type Severity = "ok" | "warning" | "danger";
type FreshnessSource = "activity_logs" | "fallback_max_created_at";

interface ModuleFreshness {
  last_update: string | null;
  age_days: number | null;
  age_label: string;
  severity: Severity;
  source: FreshnessSource | null;
  data_coverage_last: string | null;
  data_coverage_age_days: number | null;
  data_coverage_label: string;
}

interface FreshnessResponse {
  cxc: ModuleFreshness;
  ventas: ModuleFreshness;
}

// Acciones registradas por los endpoints de upload (src/app/api/cxc/upload
// y src/app/api/ventas/upload). 'upload_cxc_warning_fechas_null' se emite
// cuando el upload tuvo warnings de fechas null pero igual procesó.
const CXC_UPLOAD_ACTIONS = ["cxc_upload", "upload_cxc_warning_fechas_null"];
const VENTAS_UPLOAD_ACTIONS = ["ventas_upload"];

function severityForAge(ageDays: number | null): Severity {
  if (ageDays === null) return "danger";
  if (ageDays <= 3) return "ok";
  if (ageDays <= 7) return "warning";
  return "danger";
}

function ageLabel(ageDays: number | null): string {
  if (ageDays === null) return "sin data";
  if (ageDays === 0) return "hoy";
  if (ageDays === 1) return "ayer";
  return `hace ${ageDays} días`;
}

function daysBetween(iso: string, now: Date): number {
  const then = new Date(iso).getTime();
  const diffMs = now.getTime() - then;
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

// Formato corto en español: "9 may 2026". Acepta YYYY-MM-DD o ISO timestamp.
function shortDateLabel(iso: string): string {
  const datePart = iso.length >= 10 ? iso.slice(0, 10) : iso;
  try {
    return new Date(datePart + "T12:00:00")
      .toLocaleDateString("es-PA", { day: "numeric", month: "short", year: "numeric" })
      .replace(".", "");
  } catch {
    return datePart;
  }
}

function coverageLabel(iso: string | null): string {
  if (!iso) return "sin datos";
  return `hasta ${shortDateLabel(iso)}`;
}

async function lastUploadFromActivityLogs(actions: string[]): Promise<string | null> {
  const { data, error } = await supabaseServer
    .from("activity_logs")
    .select("created_at")
    .in("action", actions)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) {
    console.error("[freshness] activity_logs query error:", error.message);
    return null;
  }
  return data?.[0]?.created_at ?? null;
}

async function lastUploadFallback(table: "cxc_uploads" | "ventas_raw"): Promise<string | null> {
  const { data, error } = await supabaseServer
    .from(table)
    .select("uploaded_at")
    .order("uploaded_at", { ascending: false })
    .limit(1);
  if (error) {
    console.error(`[freshness] fallback ${table} query error:`, error.message);
    return null;
  }
  return data?.[0]?.uploaded_at ?? null;
}

async function lastFechaInTable(table: "cxc_rows" | "ventas_raw"): Promise<string | null> {
  const { data, error } = await supabaseServer
    .from(table)
    .select("fecha")
    .not("fecha", "is", null)
    .order("fecha", { ascending: false })
    .limit(1);
  if (error) {
    console.error(`[freshness] MAX(fecha) ${table} query error:`, error.message);
    return null;
  }
  return data?.[0]?.fecha ?? null;
}

async function buildModuleFreshness(
  actions: string[],
  fallbackTable: "cxc_uploads" | "ventas_raw",
  rawTable: "cxc_rows" | "ventas_raw",
  now: Date,
): Promise<ModuleFreshness> {
  const [activityLogsLast, dataCoverageLast] = await Promise.all([
    lastUploadFromActivityLogs(actions),
    lastFechaInTable(rawTable),
  ]);

  let source: FreshnessSource | null = null;
  let lastUpdate = activityLogsLast;
  if (lastUpdate) {
    source = "activity_logs";
  } else {
    lastUpdate = await lastUploadFallback(fallbackTable);
    if (lastUpdate) source = "fallback_max_created_at";
  }

  const ageDays = lastUpdate ? daysBetween(lastUpdate, now) : null;
  const coverageAgeDays = dataCoverageLast ? daysBetween(dataCoverageLast, now) : null;

  return {
    last_update: lastUpdate,
    age_days: ageDays,
    age_label: ageLabel(ageDays),
    severity: severityForAge(ageDays),
    source,
    data_coverage_last: dataCoverageLast,
    data_coverage_age_days: coverageAgeDays,
    data_coverage_label: coverageLabel(dataCoverageLast),
  };
}

export async function GET(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;

  const now = new Date();
  const [cxc, ventas] = await Promise.all([
    buildModuleFreshness(CXC_UPLOAD_ACTIONS, "cxc_uploads", "cxc_rows", now),
    buildModuleFreshness(VENTAS_UPLOAD_ACTIONS, "ventas_raw", "ventas_raw", now),
  ]);

  const response: FreshnessResponse = { cxc, ventas };
  return NextResponse.json(response);
}
