/**
 * Cron diario incremental: ventas por artículo/día → switch_articulo_diario.
 *
 * Schedule: 40 8 * * * UTC (espejo de vercel.json; después de switch-sync
 * 05:30-06:30, sync-utilidad 07:00 y sync-recibos 07:50 — Switch admite un solo
 * token válido por USUARIO y cada empresa entra con un único usuario de API, así
 * que no solapar crons de la misma empresa: ≥15 min, `SEPARACION_MINIMA_MIN`).
 * Hasta el 3-sep-2026 este comentario decía 09:00 / 8:00 / 8:30.
 *
 * Default (sin params): re-sincroniza los últimos 3 días (upsert) de todas las
 * empresas con facturas. Override manual: ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
 * (usado por el backfill histórico). Tolerante a fallos por empresa.
 */

import { NextRequest, NextResponse } from "next/server";
import { logoutAllSwitchSessions } from "@/lib/switch-api/client";
import { syncArticulosDiario, type ArticulosSyncResult } from "@/lib/switch-api/sync-articulos";
import { syncArticuloMarca, type ArticuloMarcaSyncResult } from "@/lib/switch-api/sync-articulo-marca";
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

  // ── Diccionario articulo_id → MARCA (solo american_classic) ───────────────
  //
  // Va acá y no en un cron propio porque necesita EXACTAMENTE lo mismo que este:
  // una sesión de Switch de american_classic ya abierta y el slot horario que
  // nadie más usa. Un cron aparte sería una segunda sesión contra la misma
  // empresa — la colisión code 0006 que este proyecto ya pagó (CLAUDE.md).
  //
  // Y CABE, medido (7-ago-2026): las 8 empresas del sync de ventas por artículo
  // tardan 63-71 s (7 días seguidos de switch_sync_log) y el barrido completo
  // del catálogo —184 páginas, 9.126 renglones— mide 204 s con p50 de 658 ms por
  // página. Total ~280 s contra los 800 s de `maxDuration`: sobra más del doble.
  // O sea que "no entra en una corrida" NO era el problema y partirlo en un cron
  // reanudable habría sido complejidad sin causa (además de la segunda sesión).
  //
  // NO ES FATAL Y NO TOCA EL HEARTBEAT: si el catálogo falla, las VENTAS por
  // artículo (que es el dato) ya se guardaron y la pestaña funciona; lo único
  // que pasa es que el agrupador por marca queda con lo de ayer. Marcarlo como
  // fallo del cron apagaría el heartbeat de un trabajo que sí se hizo, y eso es
  // el error que este repo ya cometió con `all-0630` (CLAUDE.md).
  //
  // 🩸 PERO NO FATAL NO ES SILENCIOSO, y hasta el 7-ago-2026 lo era: el error
  // se guardaba en una variable, se escribía con console.error y se devolvía en
  // un JSON que no lee nadie. La corrida del 7-ago dejó el diccionario con
  // 2.000 de 8.447 artículos —el 8,7% de los códigos vendidos en 12 meses— y
  // NADIE se enteró. Ahora el fallo pasa por la MISMA política anti-ruido que
  // el resto (`alertSwitchCronErrors`, regla de los 2 fallos seguidos): se
  // reusa, no se duplica.
  //
  // Solo en la corrida sin overrides: un backfill dirigido a un rango de fechas
  // no tiene nada que ver con el catálogo, que es un snapshot de HOY.
  let marca: ArticuloMarcaSyncResult | null = null;
  let marcaError: string | null = null;
  if (triggeredBy === "cron" && empresas.includes("american_classic" as (typeof universe)[number])) {
    try {
      marca = await syncArticuloMarca("american_classic", "cron");
    } catch (err: unknown) {
      marcaError = err instanceof Error ? err.message : String(err);
      console.error("[switch-articulos] diccionario de marcas falló", err);
    }
  }

  // Heartbeat de éxito SOLO si TODAS las empresas corrieron OK. Si alguna falló,
  // NO registramos éxito (el watchdog/reconciliación lo verán stale y recuperarán)
  // y alertamos vía alertSwitchCronErrors: errores NO-401 alertan de inmediato;
  // un 401/token (transitorio de sesión única) solo alerta si la empresa acumula
  // 2+ corridas consecutivas con 401 en switch_sync_log.
  // El heartbeat sigue mirando SOLO las ventas por artículo (ver arriba: el
  // diccionario de marcas no es el trabajo de este cron).
  if (errors.length === 0) {
    await recordCronHeartbeat(CRON_NAME);
  }

  // Los avisos, en cambio, salen en UNA sola llamada con todo lo que falló —
  // ventas y diccionario juntos. Dos llamadas serían dos mensajes por la misma
  // corrida, que es justo el ruido que la política existe para evitar.
  const paraAlertar = [
    ...errors.map((e) => ({ empresaKey: e.empresaKey, syncType: "articulos" as const, error: e.error })),
    ...(marcaError
      ? [{ empresaKey: "american_classic", syncType: "articulo_marca" as const, error: marcaError }]
      : []),
  ];
  if (paraAlertar.length > 0) {
    await alertSwitchCronErrors(CRON_NAME, paraAlertar);
  }

  return NextResponse.json(
    { ok: errors.length === 0, range: { desde, hasta }, results, errors, marca, marcaError },
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
