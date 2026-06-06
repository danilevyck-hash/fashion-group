/**
 * Cron diario: costo/venta/utilidad diario del mes en curso → switch_costo_diario.
 *
 * Schedule: 0 6 * * * UTC (después de switch-sync facturas 5:30 y CXC 5:45).
 *
 * Corre todas las empresas con facturas=true (las 8). Una llamada a
 * /apireporte/totalventas?tipo=03 por empresa (rápido, sin /apifactura/info).
 * Es forward: solo refresca el mes en curso. El histórico cerrado no tiene
 * costo del API (ver investigación sprint 2.0).
 */

import { NextRequest, NextResponse } from "next/server";
import { syncCostoDiario, type CostoDiarioResult } from "@/lib/switch-api/sync-empresa";
import { empresasConFacturas } from "@/lib/switch-api/empresas";
import { recordCronHeartbeat } from "@/lib/cron-telemetry";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const CRON_NAME = "switch-costo-diario";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET no configurado" }, { status: 500 });
  }
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const results: CostoDiarioResult[] = [];
  const errors: Array<{ empresaKey: string; error: string }> = [];

  for (const empresaKey of empresasConFacturas()) {
    try {
      results.push(await syncCostoDiario(empresaKey));
    } catch (err: unknown) {
      errors.push({ empresaKey, error: err instanceof Error ? err.message : String(err) });
    }
  }

  await recordCronHeartbeat(CRON_NAME);

  return NextResponse.json(
    { ok: errors.length === 0, results, errors },
    { status: errors.length === 0 ? 200 : 207 },
  );
}
