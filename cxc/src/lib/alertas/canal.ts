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
 * El diseño original asumía el MISMO bot en otro chat: una env var con el
 * chat_id y listo. **No alcanza**, y contra producción se ve por qué:
 * `TELEGRAM_CHAT_ID` ya vale `1367251585`, que es el MISMO número del chat
 * nuevo. En un chat privado el chat_id es el id del USUARIO, idéntico para
 * todos los bots — apuntar el otro canal a ese número habría sido un no-op
 * perfecto. Y al revés tampoco funciona: Telegram sólo deja escribir al bot al
 * que el usuario le habló primero, así que el bot A mandando al privado que
 * abrió el bot B recibe 403.
 *
 * Por eso el destino es el PAR (token, chat) — `DestinoTelegram` — y el
 * override es SIMÉTRICO: cualquiera de los dos canales puede tener bot y chat
 * propios, y el que no tenga usa el de siempre. Ninguno es el caso especial.
 *
 *   TELEGRAM_BOT_TOKEN_NEGOCIO  + TELEGRAM_CHAT_ID_NEGOCIO
 *   TELEGRAM_BOT_TOKEN_SISTEMA  + TELEGRAM_CHAT_ID_SISTEMA
 *
 * Por canal:
 *   - TOKEN + CHAT → bot propio, chat propio.
 *   - Sólo CHAT    → el bot de siempre en otro chat (sirve para un grupo suyo).
 *   - Sólo TOKEN   → incoherente (un bot sin chat no tiene a dónde escribir):
 *                    se ignora con warning y cae en el de siempre.
 *   - Ninguna      → el canal de siempre. Cero configuración.
 *
 * **Cómo quedó el 27-jul-2026:** el bot NUEVO (@fashiongr_sistema_bot, chat
 * privado 1367251585) lleva el **NEGOCIO**, y las alertas de SISTEMA se quedan
 * en el bot de siempre (@fashiongr_alertas_bot) sin tocar nada. Sí: el nombre
 * del bot dice "sistema" y lleva negocio. Es a propósito, lo decidió Daniel, y
 * el nombre se cambia desde Telegram cuando quiera. **No invertir el ruteo para
 * que haga juego con el nombre.**
 *
 * ── EL FAIL-SAFE ──────────────────────────────────────────────────────────────
 * Si el envío al canal aparte FALLA, `sendTelegramAlert` lo reintenta solo en el
 * canal de siempre. Con el negocio en el bot nuevo esto pesa MÁS que antes: un
 * olvido de configuración ya no silenciaría avisos técnicos sino justo lo que
 * Daniel dijo que más le importa. Que el override sea de DESTINO, nunca de si
 * se manda.
 */

import { sendTelegramAlert, destinoPorDefecto, type DestinoTelegram } from "@/lib/telegram";

/** Marca de agua del canal de sistema. Va al PRINCIPIO para que se lea en la
 *  notificación del celular sin abrirla. */
export const PREFIJO_SISTEMA = "🔧 SISTEMA · ";

/**
 * A dónde va un canal, según lo que esté configurado en Vercel. `undefined` =
 * no hay canal aparte → cae en el de siempre.
 *
 * Se lee de `process.env` en cada llamada a propósito: los tests cambian las
 * variables entre casos y Vercel las inyecta por deploy.
 */
function destinoDeCanal(canal: "NEGOCIO" | "SISTEMA"): DestinoTelegram | undefined {
  const token = process.env[`TELEGRAM_BOT_TOKEN_${canal}`]?.trim();
  const chatId = process.env[`TELEGRAM_CHAT_ID_${canal}`]?.trim();

  if (token && chatId) return { token, chatId };

  // Sólo el chat: el bot de siempre en otro chat. Sigue valiendo para un grupo.
  if (chatId) {
    const base = destinoPorDefecto();
    return base ? { token: base.token, chatId } : undefined;
  }

  // Sólo el token: un bot sin chat no tiene a dónde escribir. No se inventa un
  // destino a medias (mandar el chat de siempre con el bot nuevo sería 403
  // seguro) — se avisa y se cae al canal de siempre.
  if (token) {
    console.warn(
      `[alertas] TELEGRAM_BOT_TOKEN_${canal} está puesto pero falta TELEGRAM_CHAT_ID_${canal}; ese canal va al de siempre`,
    );
  }
  return undefined;
}

/** Exportadas para que un diagnóstico pueda decir a qué bot y a qué chat va
 *  cada canal ANTES de escribir. */
export const destinoNegocio = (): DestinoTelegram | undefined => destinoDeCanal("NEGOCIO");
export const destinoSistema = (): DestinoTelegram | undefined => destinoDeCanal("SISTEMA");

/**
 * INFO DEL NEGOCIO. Pasa el texto TAL CUAL, sin prefijo y sin filtro alguno.
 *
 * Deliberadamente no acepta ninguna opción de silenciar, agrupar ni limitar:
 * que no exista la perilla es la garantía de que un cambio futuro no se lleve
 * por delante un aviso que Daniel considera esencial. Lo único que se resuelve
 * acá es A DÓNDE va — nunca SI va: sin condiciones, sin returns tempranos.
 */
export async function enviarNegocio(
  texto: string,
  parseMode?: "HTML" | "MarkdownV2",
): Promise<boolean> {
  return sendTelegramAlert(texto, parseMode, destinoNegocio());
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
  return sendTelegramAlert(`${PREFIJO_SISTEMA}${texto}`, parseMode, destinoSistema());
}
