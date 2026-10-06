// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cron/pedidos-pendientes — cada mañana, por 📊 NEGOCIO (el grupo de
// Daniel con el celular de la empresa que mira bodega), los pedidos
// «Pendiente» de Guías › Pedidos con más de 7 días. Aprobado el 6-oct-2026.
//
// 12:30 UTC = 7:30 a.m. de Panamá, 20 min después del `sync-pedidos` de las
// 12:10. No toca Switch —lee solo Supabase—, así que la separación de 15 min
// no le aplica. Sin ninguno viejo NO manda nada. El texto: `pedidos-aviso.ts`.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { recordCronHeartbeat, logCronError } from "@/lib/cron-telemetry";
import { verifySession } from "@/lib/session-cookie";
import { enviarNegocio } from "@/lib/alertas/canal";
import { hoyPanama } from "@/lib/fecha-panama";
import { PEDIDOS_BODEGA_2026_10, esEstadoPedido, type EstadoPedido } from "@/lib/guias/pedidos-bodega";
import { mensajePedidosViejos } from "@/lib/guias/pedidos-aviso";

const CRON_NAME = "pedidos-pendientes";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization")?.replace("Bearer ", "");
  let authorized = !!process.env.CRON_SECRET && secret === process.env.CRON_SECRET;
  if (!authorized) {
    try {
      authorized = verifySession(req.cookies.get("cxc_session")?.value)?.role === "admin";
    } catch {
      /* cookie inválida */
    }
  }
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!PEDIDOS_BODEGA_2026_10) return NextResponse.json({ ok: true, apagado: true });

  const [ped, est] = await Promise.all([
    supabaseServer.from("switch_pedidos").select("empresa_key, pedido_switch_id, secuencial, fecha, cliente_nombre").limit(1000),
    supabaseServer.from("pedidos_bodega_estado").select("empresa_key, pedido_switch_id, estado").limit(5000),
  ]);
  if (ped.error || est.error) {
    const msg = ped.error?.message ?? est.error?.message ?? "error";
    await logCronError("pedidos_pendientes_query_failed", msg, null, { telegram: false });
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const marca = new Map((est.data ?? []).map((e) => [`${e.empresa_key}:${e.pedido_switch_id}`, e.estado]));
  const pedidos = (ped.data ?? []).map((p) => {
    const m = marca.get(`${p.empresa_key}:${p.pedido_switch_id}`);
    return { ...p, estado: (esEstadoPedido(m) ? m : "pendiente") as EstadoPedido };
  });
  const mensaje = mensajePedidosViejos(pedidos, hoyPanama());

  if (req.nextUrl.searchParams.get("test") === "true") {
    return NextResponse.json({ pedidos: pedidos.length, mensaje: mensaje ?? "(no se mandaría nada)" });
  }

  let enviado = false;
  if (mensaje) {
    enviado = await enviarNegocio(mensaje);
    if (!enviado) {
      await logCronError("pedidos_pendientes_telegram_failed", "Telegram no aceptó el mensaje", null, { telegram: false });
    }
  }
  await recordCronHeartbeat(CRON_NAME);
  return NextResponse.json({ ok: true, pedidos: pedidos.length, enviado });
}
