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
import { syncArticulosDiario, type ArticulosSyncResult } from "@/lib/switch-api/sync-articulos";
import { empresasConFacturas } from "@/lib/switch-api/empresas";
import { recordCronHeartbeat } from "@/lib/cron-telemetry";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CRON_NAME = "switch-articulos";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function panamaDate(offsetDays = 0): string {
  const now = new Date();
  const panama = new Date(now.toLocaleString("en-US", { timeZone: "America/Panama" }));
  panama.setDate(panama.getDate() + offsetDays);
  return panama.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
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

  const results: ArticulosSyncResult[] = [];
  const errors: Array<{ empresaKey: string; error: string }> = [];
  for (const empresaKey of empresas) {
    try {
      results.push(await syncArticulosDiario(empresaKey, desde, hasta));
    } catch (err: unknown) {
      errors.push({ empresaKey, error: err instanceof Error ? err.message : String(err) });
    }
  }

  await recordCronHeartbeat(CRON_NAME);

  return NextResponse.json(
    { ok: errors.length === 0, range: { desde, hasta }, results, errors },
    { status: errors.length === 0 ? 200 : 207 },
  );
}
