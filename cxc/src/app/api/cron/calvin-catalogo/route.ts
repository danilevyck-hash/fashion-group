/**
 * Cron diario: catálogo Calvin Klein (calvin_products) auto-actualizado desde
 * Switch (empresa vistana, artículos con marcaId=8 = CK FOOTWEAR). Mismo patrón
 * que reebok/joybees/tommy-catalogo.
 *
 * Schedule: 35 14, 5 17, 45 19 y 0 22 UTC = **9:35 a.m. · 12:05 p.m. · 2:45 p.m.
 * · 5:00 p.m. de Panamá** (4 corridas/día desde el 13-ago-2026, como Tommy). Las
 * cuatro caen DENTRO de la ventana de uso del catálogo (10 a.m. - 6 p.m., dato de
 * Daniel). Ver `CATALOGO_CRON_SLOTS_UTC`.
 *
 * vistana también la tocan: articulo-info 04:30, all 05:30, utilidad 07:00,
 * recibos 07:50/15:15/19:15/23:15, proveedores 09:30, egresos 10:35, ventas
 * 11:50/15/19/23, estadocuenta 16:10/21:10 y la reconciliación 10/14/18.
 * Márgenes: 14:35 → ventas 15:00 a 25 min y reconciliación 14:00 a 35 · 17:05 →
 * estadocuenta 16:10 a 55 y reconciliación 18:00 a 55 · 19:45 → recibos 19:15 a
 * 30 · 22:00 → estadocuenta 21:10 a 50 y ventas 23:00 a 60. El barrido de vistana
 * midió **70 s** (12-ago-2026, tras el paralelismo del #540): entra holgado.
 *
 * Refresca precio/existencia/disponibilidad, deriva nombres
 * ("{Género}-{Categoría}", respetando nombre_manual), oculta los que quedan en
 * existencia 0, auto-agrega nuevos con existencia >= 1 y alerta por Telegram
 * los nuevos sin foto. Fail-safe: un fallo de Switch NO modifica el catálogo.
 * Dry-run: ?dryRun=1.
 *
 * TOLERANCIA PRE-DDL: mientras la migración 20260812150000 no corra, el sync
 * se omite limpio (sin tocar Switch, sin Telegram) y responde 503.
 */

import { NextRequest, NextResponse } from "next/server";
import { logoutAllSwitchSessions } from "@/lib/switch-api/client";
import { syncCatalogoCalvin } from "@/lib/switch-api/sync-catalogo-calvin";
import { logCronError, recordCronHeartbeat } from "@/lib/cron-telemetry";
import { avisarNuevosSinFoto } from "@/lib/catalogos/fotos-nuevos";
import { alertSwitchCronErrors } from "@/lib/switch-api/alert-policy";

export const dynamic = "force-dynamic";
export const maxDuration = 800; // techo del plan (Pro + Fluid)

const CRON_NAME = "calvin-catalogo";

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
    result = await syncCatalogoCalvin({ dryRun });
  } catch (err) {
    // Fallo catastrófico — no se tocó nada útil (fail-safe). SIN Telegram
    // inmediato (anti-ruido): colateral de la reconciliación → ella re-ejecuta
    // y alerta si sigue caído. El rastro queda en cron_email_errors.
    const msg = err instanceof Error ? err.message : String(err);
    if (!dryRun) {
      await logCronError("calvin_catalogo_failed", msg, null, { telegram: false });
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }

  // DDL 20260812150000 pendiente: omitido sin tocar Switch. Rastro consultable
  // en cron_email_errors, CERO Telegram (correr la DDL lo resuelve solo).
  if (result.ddlPendiente) {
    if (!dryRun) {
      await logCronError(
        "calvin_catalogo_ddl_pendiente",
        "Falta correr la migración 20260812150000 (tablas Calvin) — sync omitido",
        null,
        { telegram: false },
      );
    }
    return NextResponse.json({ ok: false, ddlPendiente: true, ...result }, { status: 503 });
  }

  if (!dryRun) {
    // Fallo por empresa: NO se tocó esa empresa (fail-safe). Política anti-ruido
    // (alert-policy.ts): 401/red/timeout/5xx solo alertan con 2+ corridas
    // consecutivas (streak en switch_sync_log, sync_type='catalogo_calvin').
    const fallidas = result.empresas.filter((e) => e.error);
    if (fallidas.length > 0) {
      await alertSwitchCronErrors(
        CRON_NAME,
        fallidas.map((e) => ({ empresaKey: e.empresaKey, syncType: "catalogo_calvin", error: e.error! })),
        { nota: "El catálogo NO se modificó (fail-safe)." },
      );
    }
    // Aviso de productos NUEVOS sin foto — nada si no entró ninguno (anti-ruido;
    // los viejos sin foto los cubre el resumen semanal). Es un delta de ESTADO
    // contra una marca de agua, NO el resultado de esta corrida: por eso el
    // mismo aviso lo dispara "Actualizar ahora" y la reconciliación. Ver el
    // encabezado de lib/catalogos/fotos-nuevos.ts.
    await avisarNuevosSinFoto("calvin");
    if (!result.hadError) await recordCronHeartbeat(CRON_NAME);
  }

  return NextResponse.json({ ok: !result.hadError, ...result }, { status: result.hadError ? 207 : 200 });
}

// Higiene de sesión única: al terminar el cron —éxito o fallo— se cierran las
// sesiones de Switch abiertas por este proceso (POST /cierresesion,
// best-effort). Sin esto el token queda vivo ~60min y mata el login del
// siguiente cron que toque vistana (colisión code 0006).
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    return await handleCron(req);
  } finally {
    await logoutAllSwitchSessions();
  }
}
