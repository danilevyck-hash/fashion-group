/**
 * Cron diario: catálogo Joybees (joybees_products) auto-actualizado desde Switch
 * (empresa joystep, que vende EXCLUSIVAMENTE Joybees). Mismo patrón que reebok-catalogo.
 *
 * Schedule: 45 14, 15 17, 55 19 y 10 22 UTC = **9:45 a.m. · 12:15 p.m. · 2:55 p.m.
 * · 5:10 p.m. de Panamá** (4 corridas/día desde el 13-ago-2026, paridad con
 * reebok-catalogo). Las cuatro caen DENTRO de la ventana de uso del catálogo
 * (10 a.m. - 6 p.m., dato de Daniel). Ver `CATALOGO_CRON_SLOTS_UTC`.
 *
 * Solo toca `joystep`. Va ÚLTIMO de los cuatro catálogos en cada banda porque es
 * el más corto (**26 s** medidos el 12-ago-2026): el slot de las 14:45 queda a los
 * 15 min justos de las ventas de las 15:00 —el mínimo de `SEPARACION_MINIMA_MIN`—
 * y termina 14:45:26, con 14 min y medio de aire REAL. Los otros: 17:15 →
 * reconciliación 18:00 a 45 min · 19:55 → recibos 19:15 a 40 · 22:10 →
 * estadocuenta 21:20 a 50 y ventas 23:00 a 50.
 *
 * Los otros tres catálogos corren a 5 min de distancia pero tocan empresas
 * DISJUNTAS (patrón 05:30/05:35/05:40): el escalonamiento es para no apilar
 * cuatro barridos sobre la base en compute Micro, no por la sesión de Switch.
 *
 * Refresca precio/existencia/disponibilidad, oculta los que quedan en existencia 0,
 * auto-agrega los nuevos con existencia >= 1, y alerta por Telegram los nuevos sin
 * foto. Fail-safe: un fallo de Switch NO modifica el catálogo. Dry-run: ?dryRun=1.
 */

import { NextRequest, NextResponse } from "next/server";
import { logoutAllSwitchSessions } from "@/lib/switch-api/client";
import { syncCatalogoJoybees } from "@/lib/switch-api/sync-catalogo-joybees";
import { logCronError, recordCronHeartbeat } from "@/lib/cron-telemetry";
import { avisarNuevosSinFoto } from "@/lib/catalogos/fotos-nuevos";
import { alertSwitchCronErrors } from "@/lib/switch-api/alert-policy";

export const dynamic = "force-dynamic";
export const maxDuration = 800; // techo del plan (Pro + Fluid)

const CRON_NAME = "joybees-catalogo";

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
    result = await syncCatalogoJoybees({ dryRun });
  } catch (err) {
    // Fallo catastrófico — no se tocó nada útil (fail-safe). SIN Telegram
    // inmediato (anti-ruido 17-jul-2026): colateral de la reconciliación → ella
    // re-ejecuta y alerta si sigue caído. El rastro queda en cron_email_errors.
    const msg = err instanceof Error ? err.message : String(err);
    if (!dryRun) {
      await logCronError("joybees_catalogo_failed", msg, null, { telegram: false });
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }

  if (!dryRun) {
    // Fallo por empresa: NO se tocó esa empresa (fail-safe). Política anti-ruido
    // (alert-policy.ts): 401/red/timeout/5xx solo alertan con 2+ corridas
    // consecutivas (streak en switch_sync_log,
    // sync_type='catalogo_joybees').
    const fallidas = result.empresas.filter((e) => e.error);
    if (fallidas.length > 0) {
      await alertSwitchCronErrors(
        CRON_NAME,
        fallidas.map((e) => ({ empresaKey: e.empresaKey, syncType: "catalogo_joybees", error: e.error! })),
        { nota: "El catálogo NO se modificó (fail-safe)." },
      );
    }
    // Aviso de productos NUEVOS sin foto — nada si no entró ninguno (anti-ruido;
    // los viejos sin foto los cubre el resumen semanal). Es un delta de ESTADO
    // contra una marca de agua, NO el resultado de esta corrida: por eso el
    // mismo aviso lo dispara "Actualizar ahora" y la reconciliación. Ver el
    // encabezado de lib/catalogos/fotos-nuevos.ts.
    await avisarNuevosSinFoto("joybees");
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
