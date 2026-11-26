// «Pausar Switch» (26-nov-2026). GET: cualquiera con sesión (las pantallas
// apagan «Actualizar» y muestran hasta cuándo). POST: solo admin —
// { horas } pausa (máximo 24) · { accion: "reanudar" } reanuda ya.
// Rastro en activity_logs (módulo `switch`). Reglas en `lib/switch-api/pausa.ts`.

import { NextRequest, NextResponse } from "next/server";
import { getSession, requireAuth } from "@/lib/require-auth";
import { leerPausaSwitch, pausarSwitch, reanudarSwitch } from "@/lib/switch-api/pausa-io";
import { textoPausa, validarHoras, type PausaSwitch } from "@/lib/switch-api/pausa";
import { enviarPedidosQueEsperaron } from "@/lib/switch-api/pausa-cron";
import { entregarAWaitUntil } from "@/lib/catalogo/envio-en-segundo-plano";
import { logActivity } from "@/lib/log-activity";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function cuerpo(p: PausaSwitch | null) {
  return p
    ? { activa: true, hasta: p.hasta, desde: p.desde, pausadoPor: p.pausadoPor, texto: textoPausa(p) }
    : { activa: false };
}

export async function GET(req: NextRequest) {
  const authError = requireAuth(req);
  if (authError) return authError;
  return NextResponse.json(cuerpo(await leerPausaSwitch({ fresca: true })));
}

export async function POST(req: NextRequest) {
  const authError = requireAuth(req, ["admin"]);
  if (authError) return authError;
  const s = getSession(req)!;
  const quien = s.userName ?? s.userId ?? "admin";
  const body = (await req.json().catch(() => null)) as { horas?: unknown; accion?: unknown } | null;

  if (body?.accion === "reanudar") {
    const cerrada = await reanudarSwitch(quien);
    if (cerrada) {
      await logActivity(s.role, "switch_reanudar", "switch", { pausa_id: cerrada.id, hasta: cerrada.hasta }, quien);
      // Los pedidos que esperaron salen ya, sin esperar al próximo cron.
      const envio = enviarPedidosQueEsperaron();
      if (!entregarAWaitUntil(envio)) await envio;
    }
    return NextResponse.json(cuerpo(null));
  }

  const v = validarHoras(body?.horas);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  try {
    const p = await pausarSwitch(v.horas, quien);
    await logActivity(s.role, "switch_pausar", "switch", { pausa_id: p.id, horas: v.horas, hasta: p.hasta }, quien);
    return NextResponse.json(cuerpo(p));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo pausar" }, { status: 500 });
  }
}
