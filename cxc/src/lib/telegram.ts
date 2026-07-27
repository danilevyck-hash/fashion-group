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
 * ¿El texto es una página de error del PROVEEDOR (HTML o XML) en vez de datos?
 *
 * Casos reales medidos en cron_email_errors (30 días a jul-2026):
 *   - Switch: "Auth respondió 200 pero sin token: <!DOCTYPE html><html><head>
 *     <title>Exception - SWITCH SOFT</title>…"  (19-jul, 24-jul)
 *   - Switch a media llamada: "update products sku=100202441: <!DOCTYPE html>
 *     <!--[if lt IE 7]>…"                        (24-jul, reebok-catalogo)
 *   - Cloudflare R2: "<?xml version=\"1.0\"?><Error><Code>AccessDenied</Code>…"
 *                                                (5-jul, backup_r2)
 * Los tres le llegaron a Daniel al celular como sopa de etiquetas. Nada de eso
 * le dice qué pasó, y él no puede hacer nada con un stack trace.
 */
export function esPaginaDeErrorDelProveedor(msg: string): boolean {
  return /<!DOCTYPE\s+html|<html[\s>]|<\?xml|<Error>|<!--\[if /i.test(msg);
}

/**
 * Error legible para Telegram: solo el primer renglón útil, truncado a ~200
 * chars. Si lo que viene es la página de error del proveedor (HTML/XML), se
 * reemplaza por una frase en castellano — conserva el prefijo humano que el
 * código haya puesto delante ("update products sku=100202441: <!DOCTYPE…" →
 * "update products sku=100202441: el proveedor devolvió una página de error en
 * vez de datos") y tira la sopa de etiquetas.
 */
export function shortError(msg: string | null | undefined, max = 200): string {
  if (!msg) return "—";
  let texto = msg;
  if (esPaginaDeErrorDelProveedor(texto)) {
    const corte = texto.search(/<!DOCTYPE\s+html|<html[\s>]|<\?xml|<Error>|<!--\[if /i);
    const prefijo = corte > 0 ? texto.slice(0, corte).trim() : "";
    texto = prefijo
      ? `${prefijo} el proveedor devolvió una página de error en vez de datos`
      : "el proveedor devolvió una página de error en vez de datos";
  }
  const firstLine = texto.split(/\r?\n/)[0].trim();
  return firstLine.length > max ? `${firstLine.slice(0, max)}…` : firstLine;
}

/**
 * @param parseMode opcional. Por defecto el mensaje va como TEXTO PLANO (sin
 * parse_mode) — ese es el modo seguro para alertas con contenido arbitrario.
 * Pásalo solo cuando el texto ya viene formateado y escapado (ej. "HTML" con
 * un bloque `<pre>` para texto monoespaciado que alinee).
 */
export async function sendTelegramAlert(
  text: string,
  parseMode?: "HTML" | "MarkdownV2",
  chatIdOverride?: string,
): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = chatIdOverride || process.env.TELEGRAM_CHAT_ID;

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
        ...(parseMode ? { parse_mode: parseMode } : {}),
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
