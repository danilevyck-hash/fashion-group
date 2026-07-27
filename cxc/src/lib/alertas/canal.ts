/**
 * LOS DOS CANALES DE TELEGRAM — así los piensa Daniel, textual (27-jul-2026):
 *
 *   "tengo dividido los mensajes en info de la empresa y alertas cuando el
 *    sistema no funciona"
 *
 * No son "un flujo con más o menos ruido": son DOS COSAS DISTINTAS, con reglas
 * OPUESTAS. Meterlas en la misma bolsa fue el error de diseño original.
 *
 * ── 📊 NEGOCIO ────────────────────────────────────────────────────────────────
 * Qué está pasando en la empresa: ventas del día, pedidos que entran, guías que
 * salen, cheques por vencer, fotos que faltan en el catálogo, costos mal
 * cargados en Switch. Daniel los quiere TODOS —textual: "NO, ES SUPER
 * IMPORTANTE ESAS. NECESITO SABER QUE PASA EN LA EMPRESA Y ESO AYUDA BASTANTE"—
 * y por eso:
 *
 *   ⛔ NINGUNA regla anti-ruido aplica a este canal. Ni frecuencia, ni
 *      agrupación, ni "esto funciona bien, no avisar". Que un pedido entre
 *      todos los días no lo vuelve ruido: es la señal que él pidió.
 *
 * El texto de estos mensajes NO se toca (ya le sirven tal como están). Este
 * canal existe para DEJARLOS EN PAZ de forma explícita, no para filtrarlos.
 *
 * ── 🔧 SISTEMA ────────────────────────────────────────────────────────────────
 * Algo del sistema no está funcionando. Acá SÍ va la regla de tres:
 *   1. Es real (no un falso positivo).
 *   2. No se arregla solo (si la reconciliación, una 2ª oportunidad o el propio
 *      cron lo recupera en horas, NO se avisa — que el sistema se repare es el
 *      sistema funcionando bien, no un incidente).
 *   3. Alguien tiene que hacer algo: Daniel, o quien programa.
 * Y el texto dice qué pasó / qué significa para el negocio / qué hacer.
 *
 * ── CÓMO SE DISTINGUEN EN EL CELULAR ──────────────────────────────────────────
 * La separación visual va al frente del mensaje, que es lo único que se ve en
 * la notificación del iPhone antes de abrirla: todo lo de sistema abre con
 * "🔧 SISTEMA · ". Lo de negocio conserva su emoji de siempre (🛒 pedido,
 * 📦 guía, 📊 resumen) y NO lleva prefijo — así el cambio no toca ni un texto
 * que hoy le sirve. El prefijo se queda aunque los chats estén separados: es lo
 * que hace reconocible el mensaje si alguna vez cae en el chat de negocio (ver
 * el fail-safe más abajo).
 *
 * ── SEPARARLOS DE VERDAD: BOT PROPIO, NO SOLO CHAT PROPIO ─────────────────────
 * El diseño original asumía el MISMO bot en otro grupo (una env var
 * TELEGRAM_CHAT_ID_SISTEMA y listo). No alcanzó: Daniel creó un bot APARTE
 * (@fashiongr_sistema_bot) y lo usa en un chat PRIVADO con él.
 *
 * Un chat_id no significa nada sin su bot. En un chat privado el número de chat
 * es el id del usuario —el mismo para todos los bots— pero Telegram sólo deja
 * escribir al bot al que el usuario le habló primero: el bot viejo mandando a
 * ese mismo número recibe 403. Por eso el destino es el PAR (token, chat).
 *
 * Cómo se resuelve el destino del canal de sistema:
 *   - TOKEN + CHAT de sistema → bot nuevo, chat nuevo. Es el caso de hoy.
 *   - Sólo CHAT              → mismo bot de siempre, otro chat. Sigue sirviendo
 *                              para un grupo del bot viejo.
 *   - Sólo TOKEN             → incoherente (un bot sin chat no puede mandar a
 *                              ningún lado): se ignora y va al canal de siempre.
 *   - Ninguna                → todo cae donde cae hoy. Cero configuración.
 *
 * Y si el envío al canal aparte FALLA, `sendTelegramAlert` lo reintenta solo en
 * el canal de siempre. Un olvido de configuración nunca deja a Daniel sin
 * enterarse de que algo está roto.
 */

import {
  sendTelegramAlert,
  destinoPorDefecto,
  type DestinoTelegram,
} from "@/lib/telegram";

/** Marca de agua del canal de sistema. Va al PRINCIPIO para que se lea en la
 *  notificación del celular sin abrirla. */
export const PREFIJO_SISTEMA = "🔧 SISTEMA · ";

/**
 * INFO DEL NEGOCIO. Pasa el texto TAL CUAL, sin prefijo y sin filtro alguno.
 *
 * Deliberadamente no acepta ninguna opción de silenciar, agrupar ni limitar:
 * que no exista la perilla es la garantía de que un cambio futuro no se lleve
 * por delante un aviso que Daniel considera esencial.
 */
export async function enviarNegocio(
  texto: string,
  parseMode?: "HTML" | "MarkdownV2",
): Promise<boolean> {
  return sendTelegramAlert(texto, parseMode);
}

/**
 * A dónde va el canal de sistema, según lo que esté configurado en Vercel.
 * Devuelve `undefined` cuando no hay canal aparte → cae en el de siempre.
 *
 * Exportada para que un script de diagnóstico pueda decir a qué chat va a
 * escribir ANTES de escribir. Se lee de `process.env` en cada llamada a
 * propósito: los tests cambian las variables entre casos.
 */
export function destinoSistema(): DestinoTelegram | undefined {
  const token = process.env.TELEGRAM_BOT_TOKEN_SISTEMA?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID_SISTEMA?.trim();

  if (token && chatId) return { token, chatId };

  // Sólo el chat: el diseño original (mismo bot, otro grupo). Sigue valiendo.
  if (chatId) {
    const base = destinoPorDefecto();
    return base ? { token: base.token, chatId } : undefined;
  }

  // Sólo el token: un bot sin chat no tiene a dónde escribir. No se inventa un
  // destino — se avisa y se cae al canal de siempre.
  if (token) {
    console.warn(
      "[alertas] TELEGRAM_BOT_TOKEN_SISTEMA está puesto pero falta TELEGRAM_CHAT_ID_SISTEMA; las alertas de sistema van al canal de siempre",
    );
  }
  return undefined;
}

/**
 * ALERTA DE SISTEMA. Antepone la marca de agua y, si está configurado el canal
 * aparte, la manda allá (con su propio bot si lo tiene).
 *
 * Con parseMode "HTML" el prefijo va fuera de cualquier etiqueta (es texto
 * plano seguro: no lleva < > &), así que no rompe el marcado del caller.
 */
export async function enviarSistema(
  texto: string,
  parseMode?: "HTML" | "MarkdownV2",
): Promise<boolean> {
  return sendTelegramAlert(
    `${PREFIJO_SISTEMA}${texto}`,
    parseMode,
    destinoSistema(),
  );
}
