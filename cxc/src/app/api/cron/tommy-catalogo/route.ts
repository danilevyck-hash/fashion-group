/**
 * Cron diario: catálogo Tommy Hilfiger (tommy_products) auto-actualizado desde
 * Switch (empresa fashion_shoes, artículos con marcaId=3). Mismo patrón que
 * reebok-catalogo / joybees-catalogo.
 *
 * Schedule: 40 12 * * * y 40 17 * * * UTC (2 corridas/día, decisión Daniel).
 * fashion_shoes también la tocan: all 05:35, utilidad 07:00, recibos
 * 07:50/15:15/19:15/23:15, articulos 08:40, proveedores 09:30, ventas
 * 15:00/19:00/23:00, estadocuenta 16:05/21:15 y la reconciliación 10/14/18. El
 * slot 12:40 va a ≥1h de todos;
 * el 17:40 queda a 20 min de la reconciliación de las 18:00 — aceptado: el
 * sync tarda ~2-3 min y cierra su sesión al terminar (/cierresesion), y la
 * reconciliación solo abre fashion_shoes si tiene pares que recuperar.
 *
 * Refresca precio/existencia/disponibilidad, deriva nombres
 * ("{codigo} · {categoría} {género}", respetando nombre_manual), oculta los que
 * quedan en existencia 0, auto-agrega nuevos con existencia >= 1 y alerta por
 * Telegram los nuevos sin foto. Fail-safe: un fallo de Switch NO modifica el
 * catálogo. Dry-run: ?dryRun=1.
 *
 * TOLERANCIA PRE-DDL: mientras la migración 20260724150000 no corra, el sync
 * se omite limpio (sin tocar Switch, sin Telegram) y responde 503.
 */

import { NextRequest, NextResponse } from "next/server";
import { logoutAllSwitchSessions } from "@/lib/switch-api/client";
import { syncCatalogoTommy } from "@/lib/switch-api/sync-catalogo-tommy";
import { logCronError, recordCronHeartbeat } from "@/lib/cron-telemetry";
import { avisarNuevosSinFoto } from "@/lib/catalogos/fotos-nuevos";
import { alertSwitchCronErrors } from "@/lib/switch-api/alert-policy";

export const dynamic = "force-dynamic";
export const maxDuration = 800; // techo del plan (Pro + Fluid)

const CRON_NAME = "tommy-catalogo";

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
    result = await syncCatalogoTommy({ dryRun });
  } catch (err) {
    // Fallo catastrófico — no se tocó nada útil (fail-safe). SIN Telegram
    // inmediato (anti-ruido): colateral de la reconciliación → ella re-ejecuta
    // y alerta si sigue caído. El rastro queda en cron_email_errors.
    const msg = err instanceof Error ? err.message : String(err);
    if (!dryRun) {
      await logCronError("tommy_catalogo_failed", msg, null, { telegram: false });
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }

  // DDL 20260724150000 pendiente: omitido sin tocar Switch. Rastro consultable
  // en cron_email_errors, CERO Telegram (correr la DDL lo resuelve solo).
  if (result.ddlPendiente) {
    if (!dryRun) {
      await logCronError(
        "tommy_catalogo_ddl_pendiente",
        "Falta correr la migración 20260724150000 (tablas Tommy) — sync omitido",
        null,
        { telegram: false },
      );
    }
    return NextResponse.json({ ok: false, ddlPendiente: true, ...result }, { status: 503 });
  }

  if (!dryRun) {
    // Fallo por empresa: NO se tocó esa empresa (fail-safe). Política anti-ruido
    // (alert-policy.ts): 401/red/timeout/5xx solo alertan con 2+ corridas
    // consecutivas (streak en switch_sync_log, sync_type='catalogo_tommy').
    const fallidas = result.empresas.filter((e) => e.error);
    if (fallidas.length > 0) {
      await alertSwitchCronErrors(
        CRON_NAME,
        fallidas.map((e) => ({ empresaKey: e.empresaKey, syncType: "catalogo_tommy", error: e.error! })),
        { nota: "El catálogo NO se modificó (fail-safe)." },
      );
    }
    // Aviso de productos NUEVOS sin foto — nada si no entró ninguno (anti-ruido;
    // los viejos sin foto los cubre el resumen semanal). Es un delta de ESTADO
    // contra una marca de agua, NO el resultado de esta corrida: por eso el
    // mismo aviso lo dispara "Actualizar ahora" y la reconciliación. Ver el
    // encabezado de lib/catalogos/fotos-nuevos.ts.
    await avisarNuevosSinFoto("tommy");
    if (!result.hadError) await recordCronHeartbeat(CRON_NAME);
  }

  return NextResponse.json({ ok: !result.hadError, ...result }, { status: result.hadError ? 207 : 200 });
}

// Higiene de sesión única: al terminar el cron —éxito o fallo— se cierran las
// sesiones de Switch abiertas por este proceso (POST /cierresesion,
// best-effort). Sin esto el token queda vivo ~60min y mata el login del
// siguiente cron que toque fashion_shoes (colisión code 0006).
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    return await handleCron(req);
  } finally {
    await logoutAllSwitchSessions();
  }
}
