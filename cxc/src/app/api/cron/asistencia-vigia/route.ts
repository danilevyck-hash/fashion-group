// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cron/asistencia-vigia — el único que puede ver el silencio.
//
// 🩸 EL CASO QUE NINGÚN CÓDIGO DEL AGENTE PUEDE DETECTAR.
// El contador de fallas de `/api/asistencia/ingest` sube cuando el agente
// REPORTA que no pudo leer el reloj. Pero si la PC de la oficina está apagada,
// el agente no reporta nada: no hay falla, hay silencio. Y el silencio no
// ejecuta código. Alguien del lado de Vercel tiene que mirar el reloj de pared.
//
// ── POR QUÉ CORRE A LAS 10 DE LA MAÑANA Y SOLO DE LUNES A VIERNES ────────────
// La PC apagada de madrugada es lo NORMAL, y un aviso todas las noches diciendo
// que la oficina está cerrada es basura que enseña a ignorar el canal. La
// pregunta útil es otra: "son las 10 a.m. de un martes, ¿por qué no entraron
// las marcaciones de hoy?" — a esa hora ya todos marcaron entrada, así que la
// respuesta es accionable: prendé la PC.
//
// El día de la semana lo filtra el propio `vercel.json` (`0 15 * * 1-5`), no
// una condición acá: un cron que corre y decide no hacer nada gasta invocación
// y deja logs que confunden.
//
// ⚠️ NO manda nada si el agente nunca se instaló (`visto_en` vacío): no se
// reclama por algo que todavía no existe. Y no repite: `alertado_en` es el
// candado, y el "ya volvió" lo manda el propio ingest cuando el agente vuelve.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { verifySession } from "@/lib/session-cookie";
import { recordCronHeartbeat } from "@/lib/cron-telemetry";
import { enviarSistema } from "@/lib/alertas/canal";
import {
  HORAS_PARA_VIGIA,
  esColumnaFaltante,
  textoSilencio,
  vigiaDebeAlertar,
  type FilaDispositivo,
} from "@/lib/asistencia/agente";

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

  const { data, error } = await supabaseServer
    .from("asistencia_dispositivos")
    .select("*");
  if (error) {
    console.error("[asistencia-vigia] no se pudo leer:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ahora = Date.now();
  const filas = (data ?? []) as FilaDispositivo[];
  const avisados: string[] = [];

  for (const f of filas) {
    if (!vigiaDebeAlertar(f, ahora, HORAS_PARA_VIGIA)) continue;

    const minutos = (ahora - Date.parse(f.visto_en as string)) / 60_000;
    // Se marca ANTES de mandar: si el envío a Telegram falla, es preferible
    // perder un aviso a mandarlo cinco días seguidos. El silencio persiste y
    // la pantalla del módulo lo sigue diciendo en rojo de todas formas.
    const { error: errUpd } = await supabaseServer
      .from("asistencia_dispositivos")
      .update({ alertado_en: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("dispositivo", f.dispositivo);

    if (errUpd) {
      // Sin la migración corrida no hay `alertado_en`, o sea que no hay candado
      // contra repetir. Se prefiere NO avisar: un aviso diario e idéntico se
      // vuelve ruido en tres días y ahí se pierde la próxima alerta de verdad.
      if (esColumnaFaltante(errUpd)) {
        console.warn("[asistencia-vigia] falta la migración del agente; no se avisa");
        continue;
      }
      console.error("[asistencia-vigia] no se pudo marcar el aviso:", errUpd.message);
      continue;
    }

    await enviarSistema(textoSilencio(f.dispositivo, minutos));
    avisados.push(f.dispositivo);
  }

  // Que el vigía tenga su propio vigía: si un día deja de correr, el tablero de
  // salud lo ve. Va al final y solo si se llegó hasta acá.
  await recordCronHeartbeat("asistencia-vigia");

  return NextResponse.json({ ok: true, revisados: filas.length, avisados });
}
