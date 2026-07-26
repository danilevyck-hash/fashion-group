/**
 * Cron diario: sync incremental de facturas Multifashion (últimos 7 días).
 *
 * Schedule: 0 5 * * * UTC (00:00 Panamá) — ver vercel.json.
 *
 * Ventana de 7 días para capturar ajustes y late entries (Switch puede modificar
 * saldo/total/descuento de facturas previas).
 *
 * Override manual: ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
 *   - Ambos parámetros son OPCIONALES, pero si uno está, el otro también debe estar.
 *   - Rango máximo: 365 días (protección contra syncs accidentales gigantes).
 *   - Cuando se usa override, triggered_by se loguea como 'manual'.
 */

import { NextRequest, NextResponse } from "next/server";
import { logoutAllSwitchSessions } from "@/lib/switch-api/client";
import { syncMultifashionTickets } from "@/lib/switch-api/sync";
import { recordCronHeartbeat } from "@/lib/cron-telemetry";
import { alertSwitchCronErrors } from "@/lib/switch-api/alert-policy";

export const dynamic = "force-dynamic";
// 60 → 800 (Vercel Pro, jul-2026). Era el techo más bajo de todos los crons que
// abren sesión de Switch, y Switch es lo impredecible: la corrida diaria de 7
// días tarda 6-15s (medido en multifashion_sync_log del 1 al 25-jul), pero el
// override manual acepta hasta 365 días — ~52x esa ventana, o sea varios
// minutos que NO entran en 300. 800 es el techo del plan y lo que ya usan los 13
// crons pesados (#285). Un ceiling alto no cuesta nada si la corrida normal
// termina en segundos; lo que cuesta es que la maten a mitad de un upsert.
export const maxDuration = 800;

const CRON_NAME = "multifashion-sync";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 365;

function panamaDate(offsetDays = 0): string {
  const now = new Date();
  const panama = new Date(
    now.toLocaleString("en-US", { timeZone: "America/Panama" }),
  );
  panama.setDate(panama.getDate() + offsetDays);
  return panama.toISOString().slice(0, 10);
}

/** YYYY-MM-DD válido y representa una fecha real (descarta 2026-02-31). */
function isValidYmd(s: string): boolean {
  if (!YMD_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === s;
}

/** Días entre dos YMD asumidos válidos. Positivo si hasta > desde, 0 si iguales. */
function daysBetween(desdeYmd: string, hastaYmd: string): number {
  const a = Date.UTC(
    Number(desdeYmd.slice(0, 4)),
    Number(desdeYmd.slice(5, 7)) - 1,
    Number(desdeYmd.slice(8, 10)),
  );
  const b = Date.UTC(
    Number(hastaYmd.slice(0, 4)),
    Number(hastaYmd.slice(5, 7)) - 1,
    Number(hastaYmd.slice(8, 10)),
  );
  return Math.round((b - a) / (24 * 3600 * 1000));
}

type SyncRange = {
  desde: string;
  hasta: string;
  triggeredBy: "cron" | "manual";
};

type RangeResult =
  | { ok: true; range: SyncRange }
  | { ok: false; status: 400; error: string };

function resolveRange(req: NextRequest): RangeResult {
  const desdeParam = req.nextUrl.searchParams.get("desde");
  const hastaParam = req.nextUrl.searchParams.get("hasta");
  const hasDesde = desdeParam !== null;
  const hasHasta = hastaParam !== null;

  if (hasDesde !== hasHasta) {
    return {
      ok: false,
      status: 400,
      error:
        "desde y hasta deben venir juntos (o ambos ausentes para usar la ventana de 7 días)",
    };
  }

  if (!hasDesde && !hasHasta) {
    return {
      ok: true,
      range: {
        desde: panamaDate(-7),
        hasta: panamaDate(0),
        triggeredBy: "cron",
      },
    };
  }

  // Override manual: ambos presentes.
  const desde = desdeParam as string;
  const hasta = hastaParam as string;

  if (!isValidYmd(desde) || !isValidYmd(hasta)) {
    return {
      ok: false,
      status: 400,
      error: "Fechas inválidas. Formato requerido: YYYY-MM-DD",
    };
  }

  const days = daysBetween(desde, hasta);
  if (days < 0) {
    return {
      ok: false,
      status: 400,
      error: "desde no puede ser mayor que hasta",
    };
  }
  if (days > MAX_RANGE_DAYS) {
    return {
      ok: false,
      status: 400,
      error: `Rango excede el máximo de ${MAX_RANGE_DAYS} días (recibido: ${days})`,
    };
  }

  return { ok: true, range: { desde, hasta, triggeredBy: "manual" } };
}

async function handleCron(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET no configurado" },
      { status: 500 },
    );
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const resolved = resolveRange(req);
  if (!resolved.ok) {
    return NextResponse.json(
      { ok: false, error: resolved.error },
      { status: resolved.status },
    );
  }
  const { desde, hasta, triggeredBy } = resolved.range;

  try {
    const r = await syncMultifashionTickets({ desde, hasta, triggeredBy });
    await recordCronHeartbeat(CRON_NAME);
    return NextResponse.json({
      ok: true,
      logId: r.logId,
      range: { desde, hasta },
      inserted: r.inserted,
      updated: r.updated,
      skipped: r.skipped,
      durationMs: r.durationMs,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    // Política anti-ruido 401 (alert-policy.ts): NO-401 alerta inmediato; un
    // 401/token solo alerta si acumula 2+ corridas consecutivas (streak en
    // switch_sync_log, sync_type='multifashion'). El tipo en cron_email_errors
    // pasa de "multifashion_sync_failed" a CRON_NAME (consistente con el resto).
    await alertSwitchCronErrors(CRON_NAME, [
      { empresaKey: "american_classic", syncType: "multifashion", error: message },
    ]);
    return NextResponse.json(
      { ok: false, error: message, range: { desde, hasta } },
      { status: 500 },
    );
  }
}

// Higiene de sesión única (4-jul-2026): al terminar el cron —éxito o fallo—
// se cierran las sesiones de Switch abiertas por este proceso (POST
// /cierresesion, best-effort). Sin esto el token queda vivo ~60min y mata el
// login del siguiente cron que toque la misma empresa (colisión code 0006).
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    return await handleCron(req);
  } finally {
    await logoutAllSwitchSessions();
  }
}
