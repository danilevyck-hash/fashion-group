// ─────────────────────────────────────────────────────────────────────────────
// GET /api/diag/canales-telegram — ¿a qué bot y a qué chat va cada canal?
//
// POR QUÉ EXISTE (27-jul-2026): tras el #323, Daniel cargó en Vercel
// `TELEGRAM_BOT_TOKEN_NEGOCIO` y `TELEGRAM_CHAT_ID_NEGOCIO`. Hasta ahora la
// única forma de confirmar que quedaron bien era MANDARLE UN MENSAJE REAL —
// spam para verificar una configuración, y encima el fail-safe de
// `sendTelegramAlert` (reintenta en el canal de siempre si el aparte falla)
// hace que un mensaje que LLEGA no pruebe que el ruteo nuevo funciona: pudo
// haber llegado por el camino de rescate. Este endpoint contesta la pregunta
// sin escribirle a nadie.
//
// READ-ONLY DE VERDAD: lo único que sale a la red es `getMe` de Telegram, que
// es un GET y devuelve el username del bot. No hay `sendMessage` en ningún
// camino de este archivo, ni escritura en la base.
//
// AUTH: Bearer CRON_SECRET (o `?secret=`), igual que los crons; o sesión de
// admin, para que Daniel lo abra desde el navegador. FAIL-CLOSED: sin
// CRON_SECRET configurado responde 503 y sin secreto válido, 401 — la ruta
// vive bajo un prefijo público del middleware (como /api/health-crons), así
// que la puerta es esta y sólo esta.
//
// EL TOKEN NUNCA SALE ENTERO: ver la cabecera de lib/alertas/diagnostico-canales.
// De la respuesta salen bot_id (público), los últimos 4 chars y el largo.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { diagnosticarCanales } from "@/lib/alertas/diagnostico-canales";
import { verifySession } from "@/lib/session-cookie";

// Tiene que leer process.env EN CADA REQUEST: si quedara horneado en el build,
// una variable cargada en Vercel después del deploy se vería como ausente y el
// diagnóstico mentiría justo en el caso para el que se escribió.
export const dynamic = "force-dynamic";
export const revalidate = 0;
// Dos getMe contra Telegram. Sobra, pero explícito para no heredar el default
// de 10 s si la API está lenta.
export const maxDuration = 30;

/** Compara secretos en tiempo constante (evita fuga por timing). */
function secretoOk(recibido: string, esperado: string): boolean {
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const esperado = process.env.CRON_SECRET;
  if (!esperado) {
    // Fail-closed: sin secreto configurado no se abre por defecto.
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET no configurado" },
      { status: 503 },
    );
  }

  const recibido =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    req.nextUrl.searchParams.get("secret") ??
    "";

  let autorizado = recibido !== "" && secretoOk(recibido, esperado);
  if (!autorizado) {
    try {
      autorizado = verifySession(req.cookies.get("cxc_session")?.value)?.role === "admin";
    } catch {
      /* cookie inválida → sigue sin autorizar */
    }
  }
  if (!autorizado) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const diag = await diagnosticarCanales();
  return NextResponse.json(diag, {
    status: 200,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
