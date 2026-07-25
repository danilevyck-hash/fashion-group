/**
 * Cron + trigger manual del sync de RECIBOS (cobros) → switch_recibos.
 * Fuente: /apireporte/recibos (API JSON). Alimenta último pago CXC y comisión-cobro.
 *
 * Auth: Authorization: Bearer ${CRON_SECRET}.
 * Params (opcionales): empresas=a,b,c · year=YYYY · mes=1..12 · backfill=1
 * sin params → modo cron diario: VENTANA RODANTE de 3 meses (mes en curso + 2
 * anteriores, ver mesesCronRecibos), todas (RECIBOS_EMPRESA_KEYS). El
 * delete+insert por (empresa, mes) corrige solo anulados/editados/retro-cargas
 * dentro de la ventana.
 */
import { NextRequest, NextResponse } from "next/server";
import { logoutAllSwitchSessions } from "@/lib/switch-api/client";
import {
  syncEmpresaRecibos,
  mesesCronRecibos,
  RECIBOS_EMPRESA_KEYS,
  type SyncRecibosResult,
} from "@/lib/switch-api/sync-recibos";
import { mesActual, mesesDeAnio, type Mes } from "@/lib/switch-api/sync-utilidad";
import { isEmpresaKey } from "@/lib/switch-api/empresas";
import type { EmpresaKey } from "@/lib/empresa-mapping";
import { recordCronHeartbeat } from "@/lib/cron-telemetry";
import { alertSwitchCronErrors } from "@/lib/switch-api/alert-policy";

export const dynamic = "force-dynamic";
export const maxDuration = 800; // techo del plan (Pro + Fluid)

const CRON_NAME = "sync-recibos";

async function handleCron(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "CRON_SECRET no configurado" }, { status: 500 });
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const hasParams = [...sp.keys()].length > 0;

  let empresas: EmpresaKey[] = RECIBOS_EMPRESA_KEYS;
  const empresasParam = sp.get("empresas");
  if (empresasParam !== null) {
    const raw = empresasParam.split(",").map((s) => s.trim()).filter(Boolean);
    const invalid = raw.filter((e) => !isEmpresaKey(e) || !RECIBOS_EMPRESA_KEYS.includes(e as EmpresaKey));
    if (invalid.length) return NextResponse.json({ ok: false, error: `empresa(s) inválida(s): ${invalid.join(", ")}` }, { status: 400 });
    empresas = [...new Set(raw)] as EmpresaKey[];
  }

  const cur = mesActual();
  const year = sp.get("year") ? parseInt(sp.get("year")!, 10) : cur.year;
  if (!Number.isInteger(year) || year < 2024 || year > cur.year + 1) {
    return NextResponse.json({ ok: false, error: "year inválido" }, { status: 400 });
  }
  let meses: Mes[];
  if (sp.get("backfill") === "1") {
    meses = mesesDeAnio(year, year === cur.year ? cur.month : 12);
  } else if (sp.get("mes")) {
    const mes = parseInt(sp.get("mes")!, 10);
    if (!Number.isInteger(mes) || mes < 1 || mes > 12) return NextResponse.json({ ok: false, error: "mes inválido (1..12)" }, { status: 400 });
    meses = [{ year, month: mes }];
  } else {
    meses = mesesCronRecibos(); // cron diario: ventana rodante de 3 meses
  }

  const triggeredBy = hasParams ? "manual" : "cron";
  const results: SyncRecibosResult[] = [];
  for (const empresaKey of empresas) {
    results.push(await syncEmpresaRecibos(empresaKey, meses, triggeredBy));
  }
  const errors = results.filter((r) => !r.ok);
  // Heartbeat de éxito SOLO si TODAS las empresas corrieron OK. Si alguna falló,
  // NO registramos éxito (el watchdog/reconciliación lo verán stale y recuperarán)
  // y alertamos vía alertSwitchCronErrors: errores NO-401 alertan de inmediato;
  // un 401/token (transitorio de sesión única, el error más común de este cron)
  // solo alerta si la empresa acumula 2+ corridas consecutivas con 401.
  if (errors.length === 0) {
    await recordCronHeartbeat(CRON_NAME);
  } else {
    await alertSwitchCronErrors(
      CRON_NAME,
      errors.map((e) => ({ empresaKey: e.empresaKey, syncType: "recibos", error: e.error ?? "error" })),
    );
  }
  return NextResponse.json({ ok: errors.length === 0, meses, results }, { status: errors.length === 0 ? 200 : 207 });
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
