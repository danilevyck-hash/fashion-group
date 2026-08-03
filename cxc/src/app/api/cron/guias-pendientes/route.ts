// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cron/guias-pendientes — avisa por 📊 NEGOCIO las guías que llevan
// DIAS_PARA_AVISAR o más sin despacharse.
//
// La regla vive en `src/lib/guias/pendientes-aviso.ts` (módulo puro); acá solo
// el I/O. Ver ese archivo para el porqué (55 guías pendientes acumuladas, la
// más vieja del 24-jul, descubiertas el 3-ago-2026).
//
// Corre 14:30 UTC = 9:30 a.m. Panamá, arrancando la mañana. Sin guías vencidas
// NO manda nada.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { recordCronHeartbeat, logCronError } from "@/lib/cron-telemetry";
import { verifySession } from "@/lib/session-cookie";
import { enviarNegocio } from "@/lib/alertas/canal";
import {
  guiasVencidas,
  buildAvisoPendientes,
  type GuiaPendiente,
} from "@/lib/guias/pendientes-aviso";

const CRON_NAME = "guias-pendientes";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface FilaGuia {
  numero: number;
  fecha: string | null;
  modo_entrega: string | null;
  transportistas: { nombre: string | null } | { nombre: string | null }[] | null;
}

function nombreTransportista(f: FilaGuia): string | null {
  const t = f.transportistas;
  if (!t) return null;
  return Array.isArray(t) ? (t[0]?.nombre ?? null) : (t.nombre ?? null);
}

export async function GET(req: NextRequest) {
  const secret =
    req.headers.get("authorization")?.replace("Bearer ", "") ||
    req.nextUrl.searchParams.get("secret");
  let authorized = secret === process.env.CRON_SECRET;
  if (!authorized) {
    try {
      if (verifySession(req.cookies.get("cxc_session")?.value)?.role === "admin") {
        authorized = true;
      }
    } catch {
      /* cookie inválida */
    }
  }
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabaseServer
    .from("guia_transporte")
    .select("numero, fecha, modo_entrega, transportistas(nombre)")
    .eq("estado", "Pendiente Bodega")
    .eq("deleted", false)
    .order("fecha", { ascending: true });

  if (error) {
    console.error("[guias-pendientes] query falló:", error.message);
    // Sin Telegram inmediato: es un fallo NUESTRO, no del negocio, y la política
    // anti-ruido pide esperar al 2º fallo seguido. Queda el rastro.
    await logCronError("guias_pendientes_query_failed", error.message, null, { telegram: false });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const pendientes: GuiaPendiente[] = ((data ?? []) as unknown as FilaGuia[]).map((f) => ({
    numero: f.numero,
    fecha: f.fecha,
    modo_entrega: f.modo_entrega,
    transportista: nombreTransportista(f),
  }));

  const vencidas = guiasVencidas(pendientes, new Date());
  const mensaje = buildAvisoPendientes(vencidas);

  // Modo prueba: devuelve lo que MANDARÍA, sin mandarlo.
  if (req.nextUrl.searchParams.get("test") === "true") {
    return NextResponse.json({
      pendientes: pendientes.length,
      vencidas: vencidas.length,
      mensaje: mensaje ?? "(no se mandaría nada)",
    });
  }

  // Sin vencidas no se manda NADA — nunca un "todas al día ✅" (mismo criterio
  // que el resumen de fotos). El heartbeat se registra igual: "no había nada
  // que avisar" es una corrida exitosa.
  let enviado = false;
  if (mensaje) {
    enviado = await enviarNegocio(mensaje);
    if (!enviado) {
      await logCronError("guias_pendientes_telegram_failed", "Telegram no aceptó el mensaje", null, {
        telegram: false,
      });
    }
  }

  await recordCronHeartbeat(CRON_NAME);
  return NextResponse.json({
    ok: true,
    pendientes: pendientes.length,
    vencidas: vencidas.length,
    enviado,
  });
}
