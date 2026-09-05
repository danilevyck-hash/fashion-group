// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ventas/referencia/actualizar — botón "Actualizar datos de Switch"
// de /referencia (y del tab Ventas › Referencia).
//
// 🔴 LO VEN TODOS LOS QUE VEN LA PANTALLA (4-sep-2026). Daniel: *«activa el
// botón de Referencia»*, *«referencia lo puede ver todos, y sin aviso»*. Los
// roles salen de `REFERENCIA_ROLES` —la MISMA lista que la página y la
// búsqueda—, no de una copia escrita acá: esta ruta se quedó en `["admin"]`
// mientras la pantalla se abría a vendedor y bodega, y el botón que volvió les
// habría muerto en 403.
//
// 🩸 Y el botón se había perdido: la ruta siguió viva, pero su botón desapareció
// en el rediseño de Referencia del 11-ago-2026 (`9b1899e1`) junto con la franja
// de catálogo que lo alojaba. No fue una decisión, fue colateral.
//
// Body: { "empresa": "<una de las 6 FG>" }. Corre syncArticuloInfo para ESA
// empresa (la de la referencia buscada), con el lock existente de
// switch_sync_log (fila 'running' + índice único parcial — sesión única de
// Switch). Desde el 10-ago-2026 también hay CRON diario
// (/api/cron/sync-articulo-info, 04:30-04:50 UTC); este botón SE QUEDA para
// cuando se quiere el dato del momento antes de comprar.
//
// 🔴 ACELERADOR (el de Guías, `SYNC_NOW_COOLDOWN_MIN` = 10 min): si esa empresa
// ya trajo su catálogo hace menos del cooldown, se contesta `omitido: "fresca"`
// SIN tocar Switch. El lock de `switch_sync_log` frena las corridas
// SIMULTÁNEAS; esto frena las CONSECUTIVAS, que es el caso real — dos toques
// seguidos abrían dos sesiones, y la sesión de Switch es una por usuario: cada
// login extra expulsa al anterior y puede tumbar el cron de esa empresa.
//
// El `finally` cierra las sesiones de Switch abiertas por este proceso
// (logoutAllSwitchSessions) — sin eso el token queda vivo ~60 min y tumba el
// login del próximo cron de la misma empresa (code 0006).
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { syncArticuloInfo } from "@/lib/switch-api/sync-articulo-info";
import { logoutAllSwitchSessions } from "@/lib/switch-api/client";
import { isRunningLockConflict } from "@/lib/switch-api/sync-log";
import { SYNC_NOW_COOLDOWN_MIN } from "@/lib/switch-api/sync-now";
import { REFERENCIA_EMPRESA_KEYS, REFERENCIA_ROLES } from "@/lib/ventas/referencia";

/**
 * ¿El catálogo de esta empresa ya se trajo hace menos del cooldown?
 *
 * Fail-open a propósito: si la consulta falla, se refresca. Un error de lectura
 * no puede convertirse en "no actualizo nunca más".
 */
async function catalogoFresco(empresaKey: string): Promise<boolean> {
  const corte = new Date(Date.now() - SYNC_NOW_COOLDOWN_MIN * 60_000).toISOString();
  const { data, error } = await supabaseServer
    .from("switch_sync_log")
    .select("id")
    .eq("empresa_key", empresaKey)
    .eq("sync_type", "articulo_info")
    .eq("status", "success")
    .gte("finished_at", corte)
    .limit(1);
  if (error) return false;
  return (data ?? []).length > 0;
}

export const dynamic = "force-dynamic";
// El barrido del catálogo más grande medido (american_classic, 9.126 artículos)
// tarda ~204 s; los de las 6 FG son menores. 300 s deja aire sin acercarse al
// techo de 800 de la cuenta.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const auth = requireRole(req, [...REFERENCIA_ROLES]);
  if (auth instanceof NextResponse) return auth;

  let empresa = "";
  try {
    const body = (await req.json()) as { empresa?: string };
    empresa = body.empresa ?? "";
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }
  if (!REFERENCIA_EMPRESA_KEYS.includes(empresa)) {
    return NextResponse.json({ error: "empresa inválida" }, { status: 400 });
  }

  try {
    // El acelerador va ANTES de tocar Switch: dos toques seguidos no abren dos
    // sesiones. La pantalla trata `omitido` como un éxito (los datos ya están
    // frescos), así que no hay un mensaje nuevo que leer.
    if (await catalogoFresco(empresa)) {
      return NextResponse.json({ ok: true, empresa, omitido: "fresca" });
    }
    const r = await syncArticuloInfo(empresa, "manual");
    if (!r.tablaLista) {
      return NextResponse.json(
        {
          error:
            "La tabla switch_articulo_info todavía no existe — falta correr la migración 20260810130000 en Supabase.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json({
      ok: true,
      empresa,
      articulos: r.articulosUnicos,
      filasEscritas: r.filasEscritas,
      rechazadasPorMonto: r.rechazadasPorMonto,
      syncedAt: r.syncedAt,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (isRunningLockConflict(err) || /Ya hay una corrida/.test(msg)) {
      return NextResponse.json(
        { error: "Ya hay una actualización de esta empresa en curso — espera a que termine." },
        { status: 409 },
      );
    }
    console.error("[api/ventas/referencia/actualizar]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    await logoutAllSwitchSessions();
  }
}
