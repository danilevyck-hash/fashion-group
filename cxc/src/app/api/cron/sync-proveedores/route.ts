// ─────────────────────────────────────────────────────────────────────────────
// Cron diario: Cuentas por Pagar (proveedores).
//
// Por cada empresa con CxP (empresasConCxp = 6 B2B + Multifashion), SECUENCIAL (token único de Switch),
// itera /apiproveedor/lista + /apiproveedor/info y upserta una fila por
// (empresa, proveedor) en switch_proveedor_estadocuenta. Cachea — el módulo lee de
// esa tabla, no del API en vivo.
//
// Schedule: 0 9 30 UTC (después de articulos 09:00, antes de la reconciliación
// 10:00). Una corrida 1x/día (plan Hobby). Auth: Bearer CRON_SECRET.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { logoutAllSwitchSessions } from "@/lib/switch-api/client";
import { syncAllProveedores } from "@/lib/switch-api/sync-proveedores";
import { recordCronHeartbeat } from "@/lib/cron-telemetry";
import { alertSwitchCronErrors } from "@/lib/switch-api/alert-policy";

export const dynamic = "force-dynamic";
export const maxDuration = 800; // techo del plan (Pro + Fluid)

const CRON_NAME = "sync-proveedores";

async function handleCron(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET no configurado" }, { status: 500 });
  }
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const results = await syncAllProveedores("cron");
  const errors = results.filter((r) => !r.ok);

  // Solo registramos heartbeat si TODAS las empresas corrieron OK (igual criterio
  // que la reconciliación usa para los demás colaterales).
  //
  // ── HUECO CERRADO (27-jul-2026) ──────────────────────────────────────────────
  // Este era el ÚNICO sync de Switch que fallaba en SILENCIO ABSOLUTO: sin
  // `alertSwitchCronErrors` y sin `logCronError`, lo único que quedaba era la
  // AUSENCIA de heartbeat. Eso alcanza para que el watchdog lo note a las 26h,
  // pero no deja ni una fila en cron_email_errors — o sea que un fallo de Cuentas
  // por Pagar era invisible para cualquier auditoría posterior. De hecho, de los
  // 58 errores de sync de los últimos 30 días, los de `proveedores` estaban entre
  // los 38 que no dejaron NINGÚN rastro.
  //
  // Pasa por la MISMA política anti-ruido que los demás (no es una alerta nueva
  // ruidosa): `sync-proveedores` sí escribe switch_sync_log con
  // sync_type='proveedores', así que el streak funciona y un corte de red
  // transitorio se calla en la 1ª corrida igual que en el resto.
  if (errors.length === 0) {
    await recordCronHeartbeat(CRON_NAME);
  } else {
    await alertSwitchCronErrors(
      CRON_NAME,
      errors.map((e) => ({
        empresaKey: e.empresaKey,
        syncType: "proveedores",
        error: e.error ?? "error desconocido",
      })),
    );
  }

  return NextResponse.json(
    { ok: errors.length === 0, results },
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
