/**
 * Cron del MAYOR CONTABLE — trae los gastos de las 8 empresas desde Switch.
 *
 * Corre 1×/día a las **09:05 UTC = 04:05 a.m. de Panamá**.
 *
 * ── Por qué esa hora, y por qué NO entre las 00:20 y las 05:20 UTC ──────────
 *
 * El login web usa `changesession="SI"`, que TOMA la sesión y EXPULSA a quien
 * esté en el panel de esa empresa. El usuario configurado en
 * `SWITCH_<EMPRESA>_WEB_USER` es el de **Daniel**, así que la hora se elige
 * para que no haya nadie adentro.
 *
 * ⚠️ Los crons de Vercel van en **UTC**, y Panamá es **UTC−5 fijo**. La franja
 * 00:20-05:20 UTC —que a primera vista parece de madrugada— es en realidad
 * **19:20 a 00:20 de Panamá**, o sea la tarde-noche: la hora en la que Daniel
 * perfectamente puede estar mirando Switch. La madrugada de Panamá es
 * **06:00-11:00 UTC**, y ahí es donde ya viven los otros dos crons que abren
 * esta misma puerta: `sync-utilidad` 07:00 UTC (2:00 a.m.) y `boston-cartera`
 * 08:10 UTC (3:10 a.m.). Este se suma a esa franja, no la contradice.
 *
 * 09:05 UTC en concreto:
 *   • `switch-articulos` 08:40 → 25 min de separación.
 *   • `sync-proveedores` 09:30 → 25 min por delante.
 *     (Los dos por encima de los 15 de `SEPARACION_MINIMA_MIN`, que aplica
 *      porque este cron toca las 8 empresas y comparte empresa con ambos.)
 *   • Fuera de las ventanas de deploy (23:50-00:20 y 05:50-06:10 UTC).
 *   • 04:05 a.m. de Panamá: no hay nadie en el panel.
 *
 * ── Frecuencia: 1×/día ─────────────────────────────────────────────────────
 * La contabilidad se cierra por MES. Correrlo más seguido no traería un dato
 * nuevo y multiplicaría las veces que se le toma la sesión a Daniel.
 *
 * Las empresas van SECUENCIALES, una sesión por empresa, cerrada al terminar
 * (ver `sync-mayor.ts`). Nada de paralelo: serían N sesiones simultáneas.
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}`.
 * Query params (opcionales, uso manual):
 *   empresas=a,b   solo esas empresas.
 *   anio=2025      otro año (backfill).
 */

import { NextRequest, NextResponse } from "next/server";
import {
  syncAllMayor,
  MAYOR_EMPRESA_KEYS,
  type ResultadoEmpresa,
} from "@/lib/switch-api/sync-mayor";
import { recordCronHeartbeat } from "@/lib/cron-telemetry";
import { alertSwitchCronErrors } from "@/lib/switch-api/alert-policy";
import { hoyPanama } from "@/lib/fecha-panama";

export const dynamic = "force-dynamic";
export const maxDuration = 800; // techo del plan (Pro + Fluid).

const CRON_NAME = "sync-mayor";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET no configurado" }, { status: 500 });
  }
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const pedidas = sp.get("empresas")?.split(",").map((s) => s.trim()).filter(Boolean);
  const empresas = pedidas?.length
    ? pedidas.filter((e) => MAYOR_EMPRESA_KEYS.includes(e))
    : MAYOR_EMPRESA_KEYS;

  const anioParam = sp.get("anio");
  const anio = anioParam && /^\d{4}$/.test(anioParam)
    ? Number(anioParam)
    : Number(hoyPanama().slice(0, 4));

  const resultados: ResultadoEmpresa[] = await syncAllMayor(empresas, anio);
  const fallidas = resultados.filter((r) => !r.ok);

  // Heartbeat SOLO si TODO salió bien. Si algo falló, el heartbeat no se
  // refresca (el vigía lo ve envejecer) y el error pasa por la política
  // anti-ruido de siempre: un fallo suelto se calla, dos corridas seguidas del
  // mismo par avisan. NO se agrega una alerta de sistema nueva — la lista de 3
  // está cerrada, y ésta entra en la regla 2 ("algo se rompió y no se arregló
  // solo") reusando el mecanismo que ya existe.
  if (fallidas.length === 0) {
    await recordCronHeartbeat(CRON_NAME);
  } else {
    await alertSwitchCronErrors(
      CRON_NAME,
      fallidas.map((r) => ({
        empresaKey: r.empresaKey,
        syncType: "mayor" as const,
        error: r.error ?? "error",
      })),
    );
  }

  return NextResponse.json(
    {
      ok: fallidas.length === 0,
      anio,
      empresas: empresas.length,
      resultados,
    },
    { status: fallidas.length === 0 ? 200 : 500 },
  );
}
