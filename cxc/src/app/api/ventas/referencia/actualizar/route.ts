// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ventas/referencia/actualizar — botón "Actualizar datos de Switch"
// del tab Ventas › Referencia. SOLO ADMIN.
//
// Body: { "empresa": "<una de las 6 FG>" }. Corre syncArticuloInfo para ESA
// empresa (la de la referencia buscada), con el lock existente de
// switch_sync_log (fila 'running' + índice único parcial — sesión única de
// Switch). Desde el 10-ago-2026 también hay CRON diario
// (/api/cron/sync-articulo-info, 04:30-04:50 UTC); este botón SE QUEDA para
// cuando se quiere el dato del momento antes de comprar.
//
// El `finally` cierra las sesiones de Switch abiertas por este proceso
// (logoutAllSwitchSessions) — sin eso el token queda vivo ~60 min y tumba el
// login del próximo cron de la misma empresa (code 0006).
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { syncArticuloInfo } from "@/lib/switch-api/sync-articulo-info";
import { logoutAllSwitchSessions } from "@/lib/switch-api/client";
import { isRunningLockConflict } from "@/lib/switch-api/sync-log";
import { REFERENCIA_EMPRESA_KEYS } from "@/lib/ventas/referencia";

export const dynamic = "force-dynamic";
// El barrido del catálogo más grande medido (american_classic, 9.126 artículos)
// tarda ~204 s; los de las 6 FG son menores. 300 s deja aire sin acercarse al
// techo de 800 de la cuenta.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const auth = requireRole(req, ["admin"]);
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
