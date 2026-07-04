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

export const dynamic = "force-dynamic";
export const maxDuration = 300; // techo del plan (Hobby + Fluid)

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
  if (errors.length === 0) await recordCronHeartbeat(CRON_NAME);

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
