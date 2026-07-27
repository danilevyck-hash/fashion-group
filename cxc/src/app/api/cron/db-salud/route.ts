// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cron/db-salud — vigía de recursos de la base de datos.
//
// Lee el endpoint de métricas de Supabase (add-on gratis del plan Pro), lo
// compara contra los umbrales de src/lib/db-recursos.ts y avisa por Telegram
// ANTES de que la base se ahogue.
//
// EL PUNTO CIEGO QUE CIERRA (26-jul-2026): esa noche el proyecto devolvió 521
// durante 1 h 16 min y no quedó ni una fila en `cron_email_errors` — porque esa
// tabla vive en la base que se cayó. Toda la telemetría del sistema tenía el
// mismo defecto: escribe en el paciente. Esta ruta es el único vigía cuyo
// camino de alerta (métricas HTTP → Telegram) NO pasa por Postgres, así que
// sigue hablando justo cuando todo lo demás se quedó mudo.
//
// Por eso el orden importa: PRIMERO se manda el Telegram, DESPUÉS se toca la
// base (dedup y heartbeat), y las dos cosas van envueltas para que un fallo de
// Supabase no se lleve puesta la alerta.
//
// Auth: igual que el resto de los crons — Bearer CRON_SECRET, ?secret=, o
// sesión de admin (para poder probarlo desde el navegador).
//
// Modo prueba: ?test=true devuelve la muestra y la evaluación SIN mandar nada
// a Telegram y SIN escribir en la base. Es lo que hay que usar para mirar cómo
// está la base ahora mismo sin spamear el canal.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { enviarSistema } from "@/lib/alertas/canal";
import { recordCronHeartbeat, logCronError } from "@/lib/cron-telemetry";
import { verifySession } from "@/lib/session-cookie";
import { supabaseServer } from "@/lib/supabase-server";
import {
  leerMuestra,
  evaluarRecursos,
  mensajeRecursos,
  mensajeSinLectura,
} from "@/lib/db-recursos";

const CRON_NAME = "db-salud";

/** Tipos en cron_email_errors — sirven de rastro Y de dedup entre corridas. */
const TIPO_ALERTA = "db_recursos";
const TIPO_SIN_LECTURA = "db_recursos_sin_lectura";

/**
 * Ventana de silencio por tipo de alerta. Con muestras cada 2 h, 5 h significa
 * "te aviso, y si sigue igual te vuelvo a avisar a la tercera muestra" — no una
 * sola vez (que se pierde) ni cada vez (que se ignora).
 */
const DEDUP_HORAS = 5;

export const dynamic = "force-dynamic";
// Un GET a un endpoint HTTP + un POST a Telegram. Sobra, pero explícito para no
// heredar el default de 10 s si Supabase se pone lento justo cuando importa.
export const maxDuration = 60;

/** Timeout propio: si la base está agonizando, el endpoint puede colgarse. */
const FETCH_TIMEOUT_MS = 20_000;

function urlMetricas(): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base.replace(/\/+$/, "")}/customer/v1/privileged/metrics`;
}

/**
 * ¿Ya avisamos de esto hace poco? Consulta best-effort a cron_email_errors.
 *
 * FAIL-ABIERTO A PROPÓSITO: si la consulta falla (típicamente porque la base
 * está caída — o sea, exactamente el caso que motivó todo esto) devolvemos
 * `true` = "sí, alertá". Preferimos un mensaje repetido a un silencio.
 */
async function debeAlertar(tipo: string): Promise<boolean> {
  try {
    const desde = new Date(Date.now() - DEDUP_HORAS * 3600_000).toISOString();
    const { data, error } = await supabaseServer
      .from("cron_email_errors")
      .select("id")
      .eq("tipo", tipo)
      .gte("created_at", desde)
      .limit(1);
    if (error) return true;
    return !data || data.length === 0;
  } catch {
    return true;
  }
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

  const esPrueba = req.nextUrl.searchParams.get("test") === "true";

  const url = urlMetricas();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    // Sin credenciales no hay nada que vigilar: se omite limpio en vez de
    // fallar (mismo criterio que la réplica a R2 cuando faltan las env vars).
    return NextResponse.json({
      message: "Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY; omito",
      ok: true,
    });
  }

  // ── 1. Leer las métricas ───────────────────────────────────────────────────
  let texto: string;
  try {
    const auth = Buffer.from(`service_role:${key}`).toString("base64");
    const res = await fetch(url, {
      headers: { Authorization: `Basic ${auth}` },
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    texto = await res.text();
  } catch (e) {
    const detalle = e instanceof Error ? e.message : String(e);
    if (esPrueba) {
      return NextResponse.json({ modo: "prueba", error: detalle }, { status: 200 });
    }
    // No poder leer las métricas ES la señal: o Supabase está caído o el
    // endpoint dejó de responder. Se alerta con dedup propio para no repetir
    // el mismo mensaje en cada muestra de una caída larga.
    if (await debeAlertar(TIPO_SIN_LECTURA)) {
      await enviarSistema(mensajeSinLectura(detalle));
      await logCronError(TIPO_SIN_LECTURA, detalle, null, { telegram: false });
    }
    return NextResponse.json({ error: detalle, alertado: true }, { status: 500 });
  }

  // ── 2. Evaluar ─────────────────────────────────────────────────────────────
  const muestra = leerMuestra(texto);
  const evaluacion = evaluarRecursos(muestra);

  if (esPrueba) {
    return NextResponse.json({ modo: "prueba", muestra, evaluacion, enviado: false });
  }

  // ── 3. Alertar (Telegram PRIMERO: no depende de la base) ───────────────────
  let enviado = false;
  if (evaluacion.nivel !== "ok") {
    if (await debeAlertar(TIPO_ALERTA)) {
      enviado = await enviarSistema(mensajeRecursos(muestra, evaluacion));
      await logCronError(
        TIPO_ALERTA,
        `${evaluacion.nivel}: ${evaluacion.hallazgos.map((h) => h.texto).join(" | ")}`,
        null,
        { telegram: false },
      );
    }
  }

  // ── 4. Heartbeat (para que el watchdog note si este vigía se muere) ────────
  await recordCronHeartbeat(CRON_NAME);

  return NextResponse.json({
    nivel: evaluacion.nivel,
    hallazgos: evaluacion.hallazgos,
    muestra,
    enviado,
  });
}
