// ─────────────────────────────────────────────────────────────────────────────
// Cron: EXPIRACIÓN Y PURGA DE SESIONES (user_sessions) — 02:30 UTC
//
// EL HALLAZGO QUE ORIGINA ESTE CRON (jul-2026):
//   La tabla `user_sessions` NO tiene columna `expires_at` — sus columnas reales
//   son id, user_name, user_role, session_token, ip_address, last_seen,
//   created_at, revoked — y la cookie firmada (src/lib/session-cookie.ts)
//   TAMPOCO lleva claim de expiración. Consecuencia: hasta hoy una sesión no
//   expiraba NUNCA del lado del servidor. Lo único que la mataba era el `maxAge`
//   de 7 días de la cookie en el navegador, que es un control del CLIENTE: quien
//   se quede con el valor de la cookie lo ignora y entra igual, para siempre.
//   El middleware valida la sesión contra esta tabla, así que mientras la fila
//   siga con `revoked=false` la cookie robada sirve. Este cron le pone el
//   vencimiento del lado del servidor, que es el único que manda.
//
//   Efecto secundario del mismo agujero: la tabla crece sola. Cada login inserta
//   una fila nueva SIN revocar las anteriores del mismo usuario (medición jul-2026:
//   1.190 filas, 259 sin revocar para apenas 9 usuarios distintos — daniel con 73
//   sesiones activas, Angela 66, andrea 35, Bodega 30).
//
// LOS TRES PASOS (una sola pasada; constantes en src/lib/session-retention.ts):
//   1. REVOCAR POR INACTIVIDAD — `revoked=false AND last_seen < now()-14d`.
//      Por qué 14: COOKIE_MAX_AGE (src/middleware.ts) es 7 días y el middleware
//      RE-EMITE la cookie en cada request, así que un usuario legítimo que no
//      abre la app por más de 7 días ya perdió la cookie en su navegador. 14 =
//      el doble de esa ventana → no desloguea a nadie que todavía pudiera estar
//      usando la app, y deja margen por si el PATCH fire-and-forget de
//      `last_seen` del middleware falla. Medido el día del diseño: revocaría 147
//      de 259 activas de un solo golpe.
//   2. REVOCAR POR ANTIGÜEDAD ABSOLUTA — `revoked=false AND created_at < now()-90d`.
//      Tope duro: una sesión no vive más de 3 meses aunque se la mantenga viva a
//      pings. Sin esto, una cookie robada se renueva sola indefinidamente.
//   3. BORRAR — `revoked=true AND last_seen < now()-90d`. Deja 3 meses de rastro
//      de auditoría (quién, desde qué IP, hasta cuándo) y achica la tabla.
//
//   El DELETE corre PRIMERO. Es el mismo conjunto de reglas, solo cambia el
//   orden de ejecución: si se revocara antes, una sesión inactiva desde hace más
//   de 90 días se revocaría y se borraría en la MISMA pasada, sin dejar ni un
//   día del rastro de auditoría que el paso 3 promete. Borrando primero, lo que
//   se revoca hoy vive sus 90 días.
//
// TOLERANTE A DB: no depende de ninguna columna nueva ni de ninguna migración —
//   solo de columnas que ya existen. Si un paso falla, se registra y se sigue
//   con los otros (limpiar parcial es mejor que no limpiar), pero la respuesta
//   es 500 y NO se registra heartbeat: así el watchdog lo ve caído.
//
// Horario 02:30 UTC: vecinos a ≥30 min (acs-resumen-diario 01:00,
//   cleanup-packing-lists 03:00). No toca el API de Switch, así que la regla de
//   SEPARACION_MINIMA_MIN (sesión única por empresa) no aplica.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { recordCronHeartbeat, logCronError } from "@/lib/cron-telemetry";
import { verifySession } from "@/lib/session-cookie";
import { cortesDeLimpieza } from "@/lib/session-retention";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
// Tres queries acotadas sobre una tabla de ~1.200 filas: corre en segundos.
// Explícito para no depender del default de Vercel.
export const maxDuration = 60;

const CRON_NAME = "cleanup-sessions";

/** ¿El caller es el cron de Vercel (o un admin corriéndolo a mano)? */
function autorizado(req: NextRequest): boolean {
  const secret =
    req.headers.get("authorization")?.replace("Bearer ", "") ||
    req.headers.get("x-cron-secret") ||
    req.nextUrl.searchParams.get("secret");
  if (secret && process.env.CRON_SECRET && secret === process.env.CRON_SECRET) return true;
  try {
    if (verifySession(req.cookies.get("cxc_session")?.value)?.role === "admin") return true;
  } catch {
    /* cookie inválida */
  }
  return false;
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const startedAt = Date.now();
  const cortes = cortesDeLimpieza(new Date(startedAt));
  const errores: string[] = [];

  // ── Paso 3 primero: borrar lo revocado hace ya más de 90 días ──────────────
  let borradas = 0;
  {
    const { data, error } = await supabaseServer
      .from("user_sessions")
      .delete()
      .eq("revoked", true)
      .lt("last_seen", cortes.retencionRevocadas)
      .select("id");
    if (error) errores.push(`borrar: ${error.message}`);
    else borradas = data?.length ?? 0;
  }

  // ── Paso 1: revocar por inactividad ────────────────────────────────────────
  let revocadasPorInactividad = 0;
  {
    const { data, error } = await supabaseServer
      .from("user_sessions")
      .update({ revoked: true })
      .eq("revoked", false)
      .lt("last_seen", cortes.inactividad)
      .select("id");
    if (error) errores.push(`inactividad: ${error.message}`);
    else revocadasPorInactividad = data?.length ?? 0;
  }

  // ── Paso 2: revocar por vida máxima (las de inactividad ya salieron arriba,
  //    así que no hay doble conteo) ───────────────────────────────────────────
  let revocadasPorAntiguedad = 0;
  {
    const { data, error } = await supabaseServer
      .from("user_sessions")
      .update({ revoked: true })
      .eq("revoked", false)
      .lt("created_at", cortes.vidaMaxima)
      .select("id");
    if (error) errores.push(`antiguedad: ${error.message}`);
    else revocadasPorAntiguedad = data?.length ?? 0;
  }

  const durationMs = Date.now() - startedAt;

  if (errores.length > 0) {
    const detalle = errores.join(" | ");
    console.error(`[cron/cleanup-sessions] fallo tras ${durationMs}ms: ${detalle}`);
    // Persistir el fallo (los logs de Vercel rotan en 24h). Con Telegram: este
    // cron no tiene quien lo re-ejecute (la reconciliación no lo cubre), así que
    // un fallo silencioso dejaría las sesiones sin expirar sin que nadie se
    // entere — que es exactamente el agujero que este cron vino a cerrar.
    await logCronError("cleanup_sessions_failed", detalle, null);
    // SIN heartbeat: solo está sano si los tres pasos salieron.
    return NextResponse.json(
      {
        ok: false,
        error: detalle,
        revocadasPorInactividad,
        revocadasPorAntiguedad,
        borradas,
        durationMs,
      },
      { status: 500 },
    );
  }

  console.log(
    `[cron/cleanup-sessions] ok in ${durationMs}ms — inactividad:${revocadasPorInactividad} antiguedad:${revocadasPorAntiguedad} borradas:${borradas}`,
  );
  await recordCronHeartbeat(CRON_NAME);
  return NextResponse.json({
    ok: true,
    revocadasPorInactividad,
    revocadasPorAntiguedad,
    borradas,
    cortes,
    durationMs,
  });
}
