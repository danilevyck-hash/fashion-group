/**
 * Cron + trigger manual del sync de RECIBOS (cobros) → switch_recibos.
 * Fuente: /apireporte/recibos (API JSON). Alimenta último pago CXC y comisión-cobro.
 *
 * Auth: Authorization: Bearer ${CRON_SECRET}.
 * Params (opcionales): empresas=a,b,c · year=YYYY · mes=1..12 · backfill=1
 * sin params → mes en curso, todas (RECIBOS_EMPRESA_KEYS).
 */
import { NextRequest, NextResponse } from "next/server";
import {
  syncEmpresaRecibos,
  RECIBOS_EMPRESA_KEYS,
  type SyncRecibosResult,
} from "@/lib/switch-api/sync-recibos";
import { mesActual, mesesDeAnio, type Mes } from "@/lib/switch-api/sync-utilidad";
import { isEmpresaKey } from "@/lib/switch-api/empresas";
import type { EmpresaKey } from "@/lib/empresa-mapping";
import { recordCronHeartbeat, logCronError } from "@/lib/cron-telemetry";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CRON_NAME = "sync-recibos";

export async function GET(req: NextRequest): Promise<NextResponse> {
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
    meses = [cur];
  }

  const triggeredBy = hasParams ? "manual" : "cron";
  const results: SyncRecibosResult[] = [];
  for (const empresaKey of empresas) {
    results.push(await syncEmpresaRecibos(empresaKey, meses, triggeredBy));
  }
  const errors = results.filter((r) => !r.ok);
  // Heartbeat de éxito SOLO si TODAS las empresas corrieron OK. Si alguna falló,
  // NO registramos éxito (el watchdog/reconciliación lo verán stale y recuperarán)
  // y disparamos alerta Telegram. Antes el heartbeat se registraba siempre → falso
  // éxito: el watchdog lo veía fresco y nunca alertaba (bug de doble ceguera).
  if (errors.length === 0) {
    await recordCronHeartbeat(CRON_NAME);
  } else {
    const detalle = errors.map((e) => `${e.empresaKey}: ${e.error ?? "error"}`).join("; ");
    await logCronError(CRON_NAME, `${errors.length}/${results.length} empresas fallaron — ${detalle}`);
  }
  return NextResponse.json({ ok: errors.length === 0, meses, results }, { status: errors.length === 0 ? 200 : 207 });
}
