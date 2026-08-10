// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cron/asistencia-vigia — el único que puede ver el silencio.
//
// 🩸 EL CASO QUE NINGÚN CÓDIGO DEL AGENTE PUEDE DETECTAR.
// El contador de fallas de `/api/asistencia/ingest` sube cuando el agente
// REPORTA que no pudo leer el reloj. Pero si la PC de la oficina está apagada,
// el agente no reporta nada: no hay falla, hay silencio. Y el silencio no
// ejecuta código. Alguien del lado de Vercel tiene que mirar el reloj de pared.
//
// ── POR QUÉ SOLO DE DÍA, Y POR QUÉ AHORA TAMBIÉN SÁBADO Y DOMINGO ────────────
// De día: un aviso a las 3 a.m. diciendo que hay que prender una PC no lo va a
// atender nadie hasta la mañana, y una alerta que no se puede accionar en el
// momento es lo que enseña a silenciar el canal. Cuatro pasadas entre las 8:45
// a.m. y las 5:15 p.m. de Panamá (13:45, 15:00, 20:00 y 22:15 UTC).
//
// 🩸 Todos los días, y ANTES eran solo lunes a viernes (`0 15 * * 1-5`). El
// razonamiento viejo —"la PC apagada el fin de semana es lo normal"— confundía
// la OFICINA con la PC: la oficina cierra, pero el agente reporta cada 3
// minutos haya gente o no. Con la regla vieja, una PC que se apagaba el viernes
// a las 6 p.m. se avisaba recién el lunes a las 10 a.m.: 64 horas de silencio,
// y el lunes ya con dos días de asistencia sin entrar.
//
// El horario y los días los filtra el propio `vercel.json`, no una condición
// acá: un cron que corre y decide no hacer nada gasta invocación y deja logs
// que confunden.
//
// ⚠️ Correr 4 veces NO multiplica los avisos — `alertado_en` deja pasar UNO por
// episodio (ver `vigiaDebeAlertar`). Lo único que se achica es la demora entre
// que la PC se apaga y Daniel se entera.
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
