// Cron de madrugada: pedidos ACTIVOS (sin facturar) de Switch → switch_pedidos,
// para Guías › «Pedidos» (5-oct-2026). 06:10 UTC = 01:10 de Panamá, a 30 min
// del `switch-sync all` de las 05:40 y a 50 del `sync-utilidad` de las 07:00.
// Con `PEDIDOS_BODEGA_2026_10 = false` no abre Switch: contesta y sale.
import { NextRequest, NextResponse } from "next/server";
import { logoutAllSwitchSessions } from "@/lib/switch-api/client";
import { syncAllPedidos } from "@/lib/switch-api/sync-pedidos";
import { recordCronHeartbeat } from "@/lib/cron-telemetry";
import { alertSwitchCronErrors } from "@/lib/switch-api/alert-policy";
import { PEDIDOS_BODEGA_2026_10 } from "@/lib/guias/pedidos-bodega";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CRON_NAME = "sync-pedidos";

async function handleCron(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "CRON_SECRET no configurado" }, { status: 500 });
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!PEDIDOS_BODEGA_2026_10) return NextResponse.json({ ok: true, apagado: true });

  const results = await syncAllPedidos("cron");
  const errors = results.filter((r) => !r.ok);
  if (errors.length === 0) {
    await recordCronHeartbeat(CRON_NAME);
  } else {
    await alertSwitchCronErrors(
      CRON_NAME,
      errors.map((e) => ({ empresaKey: e.empresaKey, syncType: "pedidos", error: e.error ?? "error desconocido" })),
    );
  }
  return NextResponse.json({ ok: errors.length === 0, results }, { status: errors.length === 0 ? 200 : 207 });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    return await handleCron(req);
  } finally {
    await logoutAllSwitchSessions();
  }
}
