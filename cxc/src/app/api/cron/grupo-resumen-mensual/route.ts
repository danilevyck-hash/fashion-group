// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cron/grupo-resumen-mensual — Resumen mensual del grupo a Telegram.
// Corre el día 3 de cada mes a las 13:00 UTC (08:00 Panamá) y reporta el MES
// ANTERIOR cerrado: total grupo + las 8 empresas, % vs mismo mes año pasado.
//
// Solo lee la DB (RPC ventas_dashboard_summary, la misma del tab Resumen de
// /ventas → paridad al centavo por construcción) — NO toca la API de Switch,
// no necesita higiene de sesión. Semántica y guardia: ver
// src/lib/grupo-resumen-mensual.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import {
  calcularResumenMensual,
  buildMensajeMensual,
  mesAnterior,
  fmtMesLabel,
} from "@/lib/grupo-resumen-mensual";
import { hoyPanama } from "@/lib/fecha-panama";
import { sendTelegramAlert } from "@/lib/telegram";
import { recordCronHeartbeat, logCronError } from "@/lib/cron-telemetry";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 60;

const CRON_NAME = "grupo-resumen-mensual";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET no configurado" }, { status: 500 });
  }
  const provided = req.headers.get("authorization")?.replace("Bearer ", "") || req.nextUrl.searchParams.get("secret");
  if (provided !== secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // ?mes=YYYY-MM solo para pruebas manuales; el cron reporta el mes anterior
  // al día de la corrida (hoy Panamá).
  const mesParam = req.nextUrl.searchParams.get("mes");
  let anio: number, mes: number;
  if (mesParam) {
    if (!/^\d{4}-\d{2}$/.test(mesParam)) {
      return NextResponse.json({ ok: false, error: "mes inválido (YYYY-MM)" }, { status: 400 });
    }
    anio = Number(mesParam.slice(0, 4));
    mes = Number(mesParam.slice(5, 7));
    if (mes < 1 || mes > 12) {
      return NextResponse.json({ ok: false, error: "mes inválido (YYYY-MM)" }, { status: 400 });
    }
  } else {
    ({ anio, mes } = mesAnterior(hoyPanama()));
  }

  try {
    const resumen = await calcularResumenMensual(anio, mes);
    // Guardia anti-ruido: un mes real del grupo nunca es $0 — si da 0, la MV no
    // tiene el mes (refresh caído / sync roto). Error interno, no mensaje falso.
    if (resumen.total === 0) {
      throw new Error(`sin data para ${fmtMesLabel(anio, mes)} — ¿ventas_rollup_mensual_mv sin refrescar?`);
    }
    const mensaje = buildMensajeMensual(resumen);
    const sent = await sendTelegramAlert(mensaje);
    if (!sent) throw new Error("Telegram no aceptó el mensaje (ver logs)");

    await recordCronHeartbeat(CRON_NAME);
    return NextResponse.json({ ok: true, anio, mes, mensaje, resumen });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logCronError(`${CRON_NAME}_failed`, msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
