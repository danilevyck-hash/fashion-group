/**
 * Cron + trigger manual del sync de UTILIDAD por documento (comisiones B2B).
 *
 * Baja el reporte web /reportesventa/facturas de cada empresa B2B y lo cachea en
 * switch_factura_utilidad (atribución por cartera). Ver sync-utilidad.ts.
 *
 * ⚠️ El login web usa changesession=SI → EXPULSA al humano logueado en esa
 * empresa (single-session). Por eso el cron corre off-hours (vercel.json).
 *
 * Auth: Authorization: Bearer ${CRON_SECRET}.
 * Query params (opcionales):
 *   empresas=a,b,c   subconjunto de las 5 B2B (default: todas)
 *   year=YYYY        (default: año UTC actual)
 *   mes=1..12        un solo mes
 *   backfill=1       todos los meses del año hasta el mes actual (o 12 si año pasado)
 *   sin params       → mes en curso, todas las B2B (modo cron diario)
 */

import { NextRequest, NextResponse } from "next/server";
import {
  syncEmpresaUtilidad,
  B2B_COMISION_KEYS,
  mesActual,
  mesesDeAnio,
  type Mes,
  type SyncUtilidadResult,
} from "@/lib/switch-api/sync-utilidad";
import { isEmpresaKey } from "@/lib/switch-api/empresas";
import type { EmpresaKey } from "@/lib/empresa-mapping";
import { recordCronHeartbeat } from "@/lib/cron-telemetry";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CRON_NAME = "sync-utilidad";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET no configurado" }, { status: 500 });
  }
  if ((req.headers.get("authorization") ?? "") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const hasParams = [...sp.keys()].length > 0;

  // Empresas (subconjunto de las B2B).
  const empresasParam = sp.get("empresas");
  let empresas: EmpresaKey[] = B2B_COMISION_KEYS;
  if (empresasParam !== null) {
    const raw = empresasParam.split(",").map((s) => s.trim()).filter(Boolean);
    const invalid = raw.filter((e) => !isEmpresaKey(e) || !B2B_COMISION_KEYS.includes(e as EmpresaKey));
    if (invalid.length > 0) {
      return NextResponse.json(
        { ok: false, error: `empresa(s) no B2B: ${invalid.join(", ")}` },
        { status: 400 },
      );
    }
    empresas = [...new Set(raw)] as EmpresaKey[];
  }

  // Meses.
  const cur = mesActual();
  const year = sp.get("year") ? parseInt(sp.get("year")!, 10) : cur.year;
  if (!Number.isInteger(year) || year < 2024 || year > cur.year + 1) {
    return NextResponse.json({ ok: false, error: "year inválido" }, { status: 400 });
  }
  let meses: Mes[];
  if (sp.get("backfill") === "1") {
    const hasta = year === cur.year ? cur.month : 12;
    meses = mesesDeAnio(year, hasta);
  } else if (sp.get("mes")) {
    const mes = parseInt(sp.get("mes")!, 10);
    if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
      return NextResponse.json({ ok: false, error: "mes inválido (1..12)" }, { status: 400 });
    }
    meses = [{ year, month: mes }];
  } else {
    meses = [cur]; // cron diario: mes en curso
  }

  const triggeredBy = hasParams ? "manual" : "cron";
  const results: SyncUtilidadResult[] = [];
  for (const empresaKey of empresas) {
    results.push(await syncEmpresaUtilidad(empresaKey, meses, triggeredBy));
  }

  const errors = results.filter((r) => !r.ok);
  await recordCronHeartbeat(CRON_NAME);
  return NextResponse.json(
    { ok: errors.length === 0, meses, results },
    { status: errors.length === 0 ? 200 : 207 },
  );
}
