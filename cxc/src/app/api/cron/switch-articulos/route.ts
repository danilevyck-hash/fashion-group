/**
 * Cron diario incremental: ventas por artículo/día → switch_articulo_diario.
 *
 * Schedule: 0 9 * * * UTC (después de switch-sync 5:30-6:30, utilidad 8:00,
 * recibos 8:30 — Switch es sesión única por empresa, no solapar).
 *
 * Default (sin params): re-sincroniza los últimos 3 días (upsert) de todas las
 * empresas con facturas. Override manual: ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
 * (usado por el backfill histórico). Tolerante a fallos por empresa.
 */

import { NextRequest, NextResponse } from "next/server";
import { logoutAllSwitchSessions } from "@/lib/switch-api/client";
import { syncArticulosDiario, type ArticulosSyncResult } from "@/lib/switch-api/sync-articulos";
import { empresasConFacturas } from "@/lib/switch-api/empresas";
import { recordCronHeartbeat } from "@/lib/cron-telemetry";
import { alertSwitchCronErrors } from "@/lib/switch-api/alert-policy";

export const dynamic = "force-dynamic";
export const maxDuration = 800; // techo del plan (Pro + Fluid)

const CRON_NAME = "switch-articulos";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function panamaDate(offsetDays = 0): string {
  const now = new Date();
  const panama = new Date(now.toLocaleString("en-US", { timeZone: "America/Panama" }));
  panama.setDate(panama.getDate() + offsetDays);
  return panama.toISOString().slice(0, 10);
}

async function handleCron(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET no configurado" }, { status: 500 });
  }
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const desde = sp.get("desde") ?? panamaDate(-3);
  const hasta = sp.get("hasta") ?? panamaDate(0);
  if (!YMD.test(desde) || !YMD.test(hasta) || desde > hasta) {
    return NextResponse.json({ ok: false, error: "rango inválido (desde<=hasta, YYYY-MM-DD)" }, { status: 400 });
  }

  // Override opcional de empresas (CSV) para el backfill dirigido.
  const empresasParam = sp.get("empresas");
  const universe = empresasConFacturas();
  const empresas = empresasParam
    ? empresasParam.split(",").map(s => s.trim()).filter(e => universe.includes(e as (typeof universe)[number]))
    : universe;

  // triggered_by del log: override manual de rango/empresas = corrida manual.
  const triggeredBy = sp.get("desde") !== null || sp.get("hasta") !== null || empresasParam !== null
    ? ("manual" as const)
    : ("cron" as const);

  const results: ArticulosSyncResult[] = [];
  const errors: Array<{ empresaKey: string; error: string }> = [];
  for (const empresaKey of empresas) {
    try {
      results.push(await syncArticulosDiario(empresaKey, desde, hasta, triggeredBy));
    } catch (err: unknown) {
      errors.push({ empresaKey, error: err instanceof Error ? err.message : String(err) });
    }
  }

  // Heartbeat de éxito SOLO si TODAS las empresas corrieron OK. Si alguna falló,
  // NO registramos éxito (el watchdog/reconciliación lo verán stale y recuperarán)
  // y alertamos vía alertSwitchCronErrors: errores NO-401 alertan de inmediato;
  // un 401/token (transitorio de sesión única) solo alerta si la empresa acumula
  // 2+ corridas consecutivas con 401 en switch_sync_log.
  if (errors.length === 0) {
    await recordCronHeartbeat(CRON_NAME);
  } else {
    await alertSwitchCronErrors(
      CRON_NAME,
      errors.map((e) => ({ empresaKey: e.empresaKey, syncType: "articulos", error: e.error })),
    );
  }

  return NextResponse.json(
    { ok: errors.length === 0, range: { desde, hasta }, results, errors },
    { status: errors.length === 0 ? 200 : 207 },
  );
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
