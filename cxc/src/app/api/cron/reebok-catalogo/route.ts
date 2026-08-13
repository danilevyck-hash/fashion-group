/**
 * Cron diario: catálogo Reebok (products) auto-actualizado desde Switch.
 *
 * Schedule: 10 12 * * *, 0 17 * * * y 25 20 * * * UTC (3 corridas/día desde el
 * 13-ago-2026) — cada una lejos de los otros crons que abren la sesión única de
 * active_shoes (12:10: ventas 11:50 a 20 min; 17:00: estadocuenta 16:00 y
 * reconciliación 18:00; 20:25: sync-recibos 19:15 a 70 min y estadocuenta 21:20
 * a 55). El slot 20:25 (3:25 p.m. Panamá) es el tercer pase, el que cubre la
 * tarde de Panamá. Barrido medido: 49 s (12-ago-2026, tras el #540).
 *
 * Refresca precio/existencia/disponibilidad de los productos visibles, oculta
 * los que quedan en existencia 0, auto-agrega los nuevos con existencia >= 1, y
 * alerta por Telegram los nuevos sin foto. Fail-safe: un fallo de Switch NO
 * modifica el catálogo. Dry-run: ?dryRun=1 (no escribe, devuelve el plan).
 */

import { NextRequest, NextResponse } from "next/server";
import { logoutAllSwitchSessions } from "@/lib/switch-api/client";
import { syncCatalogoReebok } from "@/lib/switch-api/sync-catalogo-reebok";
import { logCronError, recordCronHeartbeat } from "@/lib/cron-telemetry";
import { avisarNuevosSinFoto } from "@/lib/catalogos/fotos-nuevos";
import { alertSwitchCronErrors } from "@/lib/switch-api/alert-policy";

export const dynamic = "force-dynamic";
export const maxDuration = 800; // techo del plan (Pro + Fluid)

const CRON_NAME = "reebok-catalogo";

async function handleCron(req: NextRequest): Promise<NextResponse> {
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
    result = await syncCatalogoReebok({ dryRun });
  } catch (err) {
    // Fallo catastrófico (inesperado) — no se tocó nada útil (fail-safe). SIN
    // Telegram inmediato (anti-ruido 17-jul-2026): este cron está en
    // COLATERAL_CRONS → la reconciliación lo re-ejecuta y alerta ella misma si
    // sigue caído. El rastro queda en cron_email_errors.
    const msg = err instanceof Error ? err.message : String(err);
    if (!dryRun) {
      await logCronError("reebok_catalogo_failed", msg, null, { telegram: false });
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }

  if (!dryRun) {
    // Fallo por empresa (Switch 401 / vacío): NO se tocó esa empresa (fail-safe).
    // Política anti-ruido (alert-policy.ts): 401/red/timeout/5xx solo alertan
    // con 2+ corridas consecutivas (streak en switch_sync_log, sync_type='catalogo_reebok').
    const fallidas = result.empresas.filter((e) => e.error);
    if (fallidas.length > 0) {
      await alertSwitchCronErrors(
        CRON_NAME,
        fallidas.map((e) => ({ empresaKey: e.empresaKey, syncType: "catalogo_reebok", error: e.error! })),
        { nota: "El catálogo NO se modificó (fail-safe)." },
      );
    }
    // Aviso de productos NUEVOS sin foto — nada si no entró ninguno (anti-ruido;
    // los viejos sin foto los cubre el resumen semanal). Es un delta de ESTADO
    // contra una marca de agua, NO el resultado de esta corrida: por eso el
    // mismo aviso lo dispara "Actualizar ahora" y la reconciliación. Ver el
    // encabezado de lib/catalogos/fotos-nuevos.ts.
    await avisarNuevosSinFoto("reebok");
    // Heartbeat de éxito SOLO si no hubo error (las empresas fallidas ya
    // alertaron arriba). Antes se registraba siempre → falso éxito ante un 207.
    if (!result.hadError) await recordCronHeartbeat(CRON_NAME);
  }

  return NextResponse.json({ ok: !result.hadError, ...result }, { status: result.hadError ? 207 : 200 });
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
