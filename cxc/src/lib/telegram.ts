/**
 * Helper mínimo para enviar alertas a Telegram. Sin librerías: fetch nativo.
 *
 * Tolerante a fallos por diseño: una alerta caída NUNCA debe tumbar al caller
 * (ej. el cron que la dispara). Si faltan las env vars o el POST falla, loguea
 * y devuelve false en vez de lanzar.
 *
 * Env vars (ya configuradas en Vercel y .env.local):
 *   - TELEGRAM_BOT_TOKEN
 *   - TELEGRAM_CHAT_ID
 *
 * Texto plano (sin parse_mode) a propósito: evita los escapes de HTML/Markdown
 * y que un carácter especial en un mensaje de error rompa el envío.
 */

const TELEGRAM_API = "https://api.telegram.org";

/**
 * Error legible para Telegram: solo el primer renglón útil, truncado a ~200
 * chars. Switch (y otros) a veces devuelven una página HTML de excepción
 * completa como mensaje de error — sin esto la alerta queda ilegible.
 */
export function shortError(msg: string | null | undefined, max = 200): string {
  if (!msg) return "—";
  const firstLine = msg.split(/\r?\n/)[0].trim();
  return firstLine.length > max ? `${firstLine.slice(0, max)}…` : firstLine;
}

export async function sendTelegramAlert(text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.warn(
      "[telegram] TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID no configurados; omito alerta",
    );
    return false;
  }

  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(
        `[telegram] sendMessage HTTP ${res.status}: ${body.slice(0, 200)}`,
      );
      return false;
    }
    return true;
  } catch (err) {
    console.error(
      `[telegram] fallo al enviar alerta: ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }
}
