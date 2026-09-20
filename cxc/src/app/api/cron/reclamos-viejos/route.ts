// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cron/reclamos-viejos — avisa por 📊 NEGOCIO los reclamos que llevan
// más de `DIAS_RECLAMO_VIEJO` días sin cobrarse.
//
// La regla vive en `src/lib/reclamos/viejos.ts` (el corte, compartido con la
// portada) y el texto en `src/lib/reclamos/aviso-viejos.ts` (puro); acá solo el
// I/O. Medido el 20-sep-2026, antes de que existiera: 15 reclamos pasados de 90
// días por $6.220,41 y ninguna forma de enterarse sin abrir el módulo.
//
// 🔴 UNA VEZ POR SEMANA: LUNES 14:00 UTC = 9:00 a.m. de Panamá, arrancando la
// semana. Una entrada de cron, una ocurrencia. No toca Switch —lee solo
// Supabase—, así que la separación de 15 min entre crons que comparten empresa
// en Switch no le aplica.
//
// Sin ningún reclamo viejo NO manda nada: nunca un «todo al día ✅».
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { recordCronHeartbeat, logCronError } from "@/lib/cron-telemetry";
import { verifySession } from "@/lib/session-cookie";
import { enviarNegocio } from "@/lib/alertas/canal";
import { hoyPanama } from "@/lib/fecha-panama";
import { mensajeReclamosViejos } from "@/lib/reclamos/aviso-viejos";
import { resumenViejos } from "@/lib/reclamos/viejos";

const CRON_NAME = "reclamos-viejos";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

  // Solo lo VIVO y lo que hace falta para el aviso: el total sale de los
  // renglones, igual que en la portada.
  const { data, error } = await supabaseServer
    .from("reclamos")
    .select("id, nro_reclamo, empresa, estado, fecha_factura, reclamo_items(cantidad, precio_unitario)")
    .eq("deleted", false);

  if (error) {
    console.error("[reclamos-viejos] query falló:", error.message);
    // Sin Telegram inmediato: es un fallo NUESTRO, no del negocio, y la
    // política anti-ruido pide esperar al 2º fallo seguido. Queda el rastro.
    await logCronError("reclamos_viejos_query_failed", error.message, null, { telegram: false });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const reclamos = (data ?? []) as unknown as Parameters<typeof mensajeReclamosViejos>[0];
  const hoy = hoyPanama();
  const resumen = resumenViejos(reclamos, hoy);
  const mensaje = mensajeReclamosViejos(reclamos, hoy);

  // Modo prueba: devuelve lo que MANDARÍA, sin mandarlo.
  if (req.nextUrl.searchParams.get("test") === "true") {
    return NextResponse.json({
      vivos: reclamos.length,
      viejos: resumen.n,
      monto: resumen.monto,
      mensaje: mensaje ?? "(no se mandaría nada)",
    });
  }

  let enviado = false;
  if (mensaje) {
    enviado = await enviarNegocio(mensaje);
    if (!enviado) {
      await logCronError("reclamos_viejos_telegram_failed", "Telegram no aceptó el mensaje", null, {
        telegram: false,
      });
    }
  }

  // «No había nada que avisar» es una corrida exitosa.
  await recordCronHeartbeat(CRON_NAME);
  return NextResponse.json({ ok: true, vivos: reclamos.length, viejos: resumen.n, enviado });
}
