/**
 * Cron diario: sync incremental de facturas Multifashion (últimos 7 días).
 *
 * Schedule: 0 5 * * * UTC (00:00 Panamá) — ver vercel.json.
 *
 * Ventana de 7 días para capturar ajustes y late entries (Switch puede modificar
 * saldo/total/descuento de facturas previas).
 */

import { NextRequest, NextResponse } from "next/server";
import { syncMultifashionTickets } from "@/lib/switch-api/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function panamaDate(offsetDays = 0): string {
  const now = new Date();
  const panama = new Date(
    now.toLocaleString("en-US", { timeZone: "America/Panama" }),
  );
  panama.setDate(panama.getDate() + offsetDays);
  return panama.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
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

  const desde = panamaDate(-7);
  const hasta = panamaDate(0);

  try {
    const r = await syncMultifashionTickets({
      desde,
      hasta,
      triggeredBy: "cron",
    });
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
    return NextResponse.json(
      { ok: false, error: message, range: { desde, hasta } },
      { status: 500 },
    );
  }
}
