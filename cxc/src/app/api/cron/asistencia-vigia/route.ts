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
// momento es lo que enseña a silenciar el canal. Tres pasadas entre las 10:00
// a.m. y las 5:15 p.m. de Panamá (15:00, 20:00 y 22:15 UTC).
//
// 🩸 Y por qué NINGUNA a primera hora (se quitó la de las 13:45 UTC = 8:45 a.m.
// Panamá, 10-ago-2026). Daniel empezó a apagar la PC de la oficina a las 5/6 de
// la tarde. Apagada desde las 6 p.m., a las 8:45 a.m. lleva ~14 horas de
// silencio: el umbral de 6 h se cruza SIEMPRE y el vigía avisaba todos los días
// de algo que no es una falla, sino el horario normal. Una alerta que suena
// todos los días deja de leerse, y el día que la PC de verdad no vuelva a
// prender el mensaje va a llegar igual de ignorado. La primera pasada que queda
// es a las 10 a.m.: a esa hora la oficina ya abrió, y que nadie haya prendido la
// PC sí merece que suene.
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
// ⚠️ Correr 3 veces NO multiplica los avisos — `alertado_en` deja pasar UNO por
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
  DIAS_RECUPERACION_AGENTE,
  esColumnaFaltante,
  textoSilencio,
  textoHuecoViejo,
  textoHuecoCerrado,
  vigiaDebeAlertar,
  vigiaDebeAlertarHueco,
  vigiaHuecoCerrado,
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

  // ── Chequeo 2: el hueco que el programa ya no alcanza ──────────────────────
  //
  // 🔔 Lo pidió Daniel explícitamente el 12-ago-2026, textual: "ok lo corro
  // pero si pasa mas de 15 dias que me llegue notificacion a telegram alertas
  // para saber q hay q arreglarlo". Es la 4ª alerta de sistema (la lista
  // cerrada de 3 de CLAUDE.md sigue vigente; esta se suma con su aprobación).
  //
  // El agente de la PC recupera solo hasta `DIAS_RECUPERACION_AGENTE` (15) días
  // hacia atrás: si lo último traído quedó más viejo que eso, esas marcaciones
  // ya NO entran solas y hay que ampliar la ventana en el .env de la PC.
  //
  // Mismo diseño que el chequeo de silencio: candado propio (`hueco_alertado_en`,
  // UN mensaje por episodio y no por pasada), se marca ANTES de mandar, y si la
  // columna no existe (DDL 20260812130000 sin correr) se degrada limpio sin
  // avisar — un aviso diario sin candado se vuelve ruido en tres días. El "ya
  // se arregló" sale una sola vez, solo si hubo alerta previa. Todo el bloque
  // va en try/catch: un tropiezo acá NO puede romper el chequeo de silencio ni
  // el heartbeat.
  const huecosAvisados: string[] = [];
  const huecosCerrados: string[] = [];
  try {
    for (const f of filas) {
      if (vigiaDebeAlertarHueco(f, ahora)) {
        const { error: errUpd } = await supabaseServer
          .from("asistencia_dispositivos")
          .update({
            hueco_alertado_en: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("dispositivo", f.dispositivo);

        if (errUpd) {
          if (esColumnaFaltante(errUpd)) {
            console.warn("[asistencia-vigia] falta la migración del hueco; no se avisa");
            continue;
          }
          console.error("[asistencia-vigia] no se pudo marcar el hueco:", errUpd.message);
          continue;
        }

        await enviarSistema(textoHuecoViejo(f.dispositivo, DIAS_RECUPERACION_AGENTE));
        huecosAvisados.push(f.dispositivo);
      } else if (vigiaHuecoCerrado(f, ahora)) {
        // Se limpia la marca ANTES de mandar, por la misma razón de siempre:
        // si Telegram falla, mejor perder el "ya se arregló" que repetirlo.
        const { error: errUpd } = await supabaseServer
          .from("asistencia_dispositivos")
          .update({ hueco_alertado_en: null, updated_at: new Date().toISOString() })
          .eq("dispositivo", f.dispositivo);

        if (errUpd) {
          console.error("[asistencia-vigia] no se pudo cerrar el hueco:", errUpd.message);
          continue;
        }

        await enviarSistema(textoHuecoCerrado(f.dispositivo));
        huecosCerrados.push(f.dispositivo);
      }
    }
  } catch (e) {
    console.error("[asistencia-vigia] chequeo de hueco falló (el resto sigue):", e);
  }

  // Que el vigía tenga su propio vigía: si un día deja de correr, el tablero de
  // salud lo ve. Va al final y solo si se llegó hasta acá.
  await recordCronHeartbeat("asistencia-vigia");

  return NextResponse.json({
    ok: true,
    revisados: filas.length,
    avisados,
    huecosAvisados,
    huecosCerrados,
  });
}
