/**
 * Cron diario: catálogo Joybees (joybees_products) auto-actualizado desde Switch
 * (empresa joystep, que vende EXCLUSIVAMENTE Joybees). Mismo patrón que reebok-catalogo.
 *
 * Schedule: 0 11 * * * UTC — ≥50min de todos los crons que tocan Switch (el más
 * cercano es switch-reconciliacion 10:00) para no chocar con la sesión única.
 *
 * Refresca precio/existencia/disponibilidad, oculta los que quedan en existencia 0,
 * auto-agrega los nuevos con existencia >= 1, y alerta por Telegram los nuevos sin
 * foto. Fail-safe: un fallo de Switch NO modifica el catálogo. Dry-run: ?dryRun=1.
 */

import { NextRequest, NextResponse } from "next/server";
import { syncCatalogoJoybees } from "@/lib/switch-api/sync-catalogo-joybees";
import { recordCronHeartbeat } from "@/lib/cron-telemetry";
import { sendTelegramAlert, shortError } from "@/lib/telegram";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CRON_NAME = "joybees-catalogo";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET no configurado" }, { status: 500 });
  }
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";

  let result;
  try {
    result = await syncCatalogoJoybees({ dryRun });
  } catch (err) {
    if (!dryRun) {
      await sendTelegramAlert(`🚨 Cron joybees-catalogo falló: ${shortError(err instanceof Error ? err.message : String(err))}`);
    }
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }

  if (!dryRun) {
    const fallidas = result.empresas.filter((e) => e.error);
    if (fallidas.length > 0) {
      await sendTelegramAlert(
        `🚨 Joybees catálogo: ${fallidas.map((e) => `${e.empresaKey} (${shortError(e.error)})`).join("; ")}. ` +
        `Su catálogo NO se modificó (fail-safe).`,
      );
    }
    const cods = result.nuevosSinFotoTotal;
    if (cods.length > 0) {
      const lista = cods.slice(0, 40).join(", ") + (cods.length > 40 ? `, +${cods.length - 40} más` : "");
      await sendTelegramAlert(
        `🟦 Joybees: ${cods.length} producto${cods.length === 1 ? "" : "s"} nuevo${cods.length === 1 ? "" : "s"} sin foto — ${lista}. ` +
        `Súbelas en el catálogo.`,
      );
    }
    if (!result.hadError) await recordCronHeartbeat(CRON_NAME);
  }

  return NextResponse.json({ ok: !result.hadError, ...result }, { status: result.hadError ? 207 : 200 });
}
