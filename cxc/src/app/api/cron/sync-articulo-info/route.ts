/**
 * Cron del snapshot de catálogo del tab Ventas › Referencia
 * (`switch_articulo_info`): existencia, precio de etiqueta, nombre real del
 * catálogo y costo CIF (guardado, no mostrado) para las 6 empresas de
 * Fashion Group.
 *
 * Antes esto SOLO corría a mano (botón "Actualizar datos de Switch" del tab,
 * por empresa). Daniel: *"es que debería ser ya automático"* — la existencia
 * cambia con cada venta y un dato perecedero no puede depender de acordarse de
 * un botón. **El botón SE QUEDA** para el dato del momento antes de comprar;
 * este cron garantiza el piso de 1×/día por empresa.
 *
 * TRES entradas de 2 empresas (04:30 / 04:40 / 04:50 UTC = 11:30-11:50 pm
 * Panamá), espejo de los pares del bloque `all` de las 05:3x — NO una sola de
 * 6: el único barrido medido en producción (vistana, 10-ago-2026) tardó
 * **155 s para 8.122 artículos**, y 6 empresas de ese tamaño rondan los
 * 15-20 min contra un techo de función de 800 s — la muerte garantizada del
 * caso Boston (all-0630). Con 2 por entrada el peor caso queda en ~5-7 min.
 *
 * Por qué esa franja (elegida midiendo SWITCH_CRON_ENTRADAS, no al ojo):
 *   • 00:30-05:15 UTC es la única banda del día sin NINGUNA sesión de Switch
 *     de estas 6 empresas (antes: facturas-0015, solo ACS; después: el bloque
 *     `all` de las 05:30/05:35/05:40).
 *   • Cada grupo queda a 60/55/50 min de SU par del bloque `all` — la regla de
 *     la casa para crons largos (≥50 min, no solo los 15 del test).
 *   • 23:30-23:50 Panamá = después del cierre de ventas: la existencia que se
 *     guarda es la del día completo.
 *   • Fuera de las ventanas de deploy (23:50-00:20 y 05:50-06:10 UTC).
 *
 * Auth: `Authorization: Bearer ${CRON_SECRET}`.
 * Query: `empresas=a,b` — OBLIGATORIO y subconjunto de las 6 FG. Explícito a
 * propósito: una invocación sin lista que corriera las 6 en serie es
 * exactamente el desborde de maxDuration que el diseño de 3 entradas evita.
 * Boston y American Classic NO entran (decisión de Daniel — el propio
 * syncArticuloInfo también las rechaza).
 */

import { NextRequest, NextResponse } from "next/server";
import { logoutAllSwitchSessions } from "@/lib/switch-api/client";
import { syncArticuloInfo, type ArticuloInfoSyncResult } from "@/lib/switch-api/sync-articulo-info";
import { recordCronHeartbeat } from "@/lib/cron-telemetry";
import { alertSwitchCronErrors } from "@/lib/switch-api/alert-policy";
import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";

export const dynamic = "force-dynamic";
// Techo del plan (Pro + Fluid). Medido: 155 s por empresa del tamaño de
// vistana (8.122 artículos) → 2 empresas ≈ 5-7 min, con margen de sobra.
export const maxDuration = 800;

const CRON_NAME = "sync-articulo-info";

interface ResultadoEmpresa {
  empresaKey: string;
  ok: boolean;
  error?: string;
  resultado?: ArticuloInfoSyncResult;
}

async function handleCron(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET no configurado" }, { status: 500 });
  }
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const crudas = (req.nextUrl.searchParams.get("empresas") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const invalidas = crudas.filter((e) => !(B2B_EMPRESA_KEYS as readonly string[]).includes(e));
  if (crudas.length === 0 || invalidas.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error:
          crudas.length === 0
            ? "falta ?empresas=a,b (subconjunto de las 6 FG) — sin lista no se corre nada"
            : `empresas fuera del tab Referencia: ${invalidas.join(", ")}`,
      },
      { status: 400 },
    );
  }

  // SECUENCIAL (sesión única de Switch por empresa) y con catch POR empresa:
  // que una falle no le quita la corrida a la siguiente.
  const results: ResultadoEmpresa[] = [];
  for (const empresaKey of crudas) {
    try {
      const r = await syncArticuloInfo(empresaKey, "cron");
      results.push({ empresaKey, ok: true, resultado: r });
      if (!r.tablaLista) {
        // Patrón tommy-catalogo: mientras la DDL no corra, se omite limpio sin
        // tocar Switch (el propio sync ya lo dejó anotado en el log/console).
        console.warn(`[cron/${CRON_NAME}] ${empresaKey}: tabla ausente — corrida no-op.`);
      }
    } catch (err) {
      results.push({
        empresaKey,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const errors = results.filter((r) => !r.ok);

  // Heartbeat SOLO si todo el grupo salió bien (mismo criterio que
  // sync-proveedores/boston-cartera): un fallo callado deja el heartbeat sin
  // refrescar y el watchdog lo ve envejecer. El aviso pasa por la política
  // anti-ruido de siempre — un fallo suelto se calla, 2 seguidos del mismo par
  // (empresa, articulo_info) avisan (el sync escribe switch_sync_log, así que
  // el streak funciona).
  if (errors.length === 0) {
    await recordCronHeartbeat(CRON_NAME);
  } else {
    await alertSwitchCronErrors(
      CRON_NAME,
      errors.map((e) => ({
        empresaKey: e.empresaKey,
        syncType: "articulo_info",
        error: e.error ?? "error desconocido",
      })),
    );
  }

  return NextResponse.json(
    { ok: errors.length === 0, results },
    { status: errors.length === 0 ? 200 : 207 },
  );
}

// Higiene de sesión única: al terminar —éxito o fallo— se cierran las sesiones
// de Switch abiertas por este proceso (POST /cierresesion, best-effort). Sin
// esto el token queda vivo ~60 min y mata el login del siguiente cron que
// toque la misma empresa (code 0006).
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    return await handleCron(req);
  } finally {
    await logoutAllSwitchSessions();
  }
}
