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
 * **Cómo quedó el 27-jul-2026:** el bot NUEVO (@fashiongr_sistema_bot) lleva el
 * **NEGOCIO**, y las alertas de SISTEMA se quedan en el bot de siempre
 * (@fashiongr_alertas_bot) sin tocar nada. Sí: el nombre del bot dice "sistema"
 * y lleva negocio. Es a propósito, lo decidió Daniel, y el nombre se cambia
 * desde Telegram cuando quiera. **No invertir el ruteo para que haga juego con
 * el nombre.**
 *
 * ⚠️ **QUIÉN ESTÁ EN CADA CHAT — este comentario lo decía AL REVÉS hasta el
 * 2-sep-2026.** Decía que NEGOCIO era el "chat privado 1367251585". No lo es.
 * Daniel, textual: *"las ventas de acs me lleguen solo a mí o por el chat de
 * alertas, ya que ahí no está el celular de la empresa que tiene telegram para
 * ver lo de las fotos, guías, etc."*. O sea:
 *
 *   📊 NEGOCIO → un GRUPO de TRES: Daniel más el celular de la empresa, que
 *                miran bodega y marketing (fotos, guías, cheques). NO es privado.
 *   🔧 SISTEMA → el canal de siempre, que ES el privado de Daniel con
 *                @fashiongr_alertas_bot (`TELEGRAM_CHAT_ID` = 1367251585).
 *
 * Verificado contra Vercel (Production) el 2-sep-2026: existen SOLO
 * `TELEGRAM_BOT_TOKEN_NEGOCIO` y `TELEGRAM_CHAT_ID_NEGOCIO`; no hay ninguna
 * variable `*_SISTEMA`, así que SISTEMA cae al canal de siempre por la última
 * rama de `destinoDeCanal`. El VALOR del chat no se puede leer desde el código
 * (las dos están marcadas "Sensitive" en Vercel): para verlo sin escribirle a
 * nadie está `GET /api/diag/canales-telegram`.
 *
 * ── EL TERCER ENVÍO: NEGOCIO, PERO PRIVADO (2-sep-2026) ───────────────────────
 * El resumen diario de ventas de ACS es NEGOCIO puro, pero Daniel no quiere que
 * la venta del día la vea el grupo. Se muda al DESTINO de sistema —al chat, no
 * al canal— y para eso existe `enviarNegocioPrivado`:
 *
 *   destino de SISTEMA ......... SÍ  (privacidad: es lo único que Daniel pidió)
 *   prefijo "🔧 SISTEMA · " .... NO  (mentiría en la notificación del iPhone:
 *                                    la venta del día no es una avería, y el
 *                                    prefijo existe justamente para no mentir)
 *   reglas anti-ruido .......... NO  (es negocio: se manda SIEMPRE)
 *
 * 🔴 **Por qué es una función propia y no `enviarSistema` a secas.** Hoy
 * `enviarSistema` tampoco filtra nada por dentro: toda la anti-ruido vive en
 * sus llamadores, uno por uno. Pero eso es CASUALIDAD, no diseño. El día que
 * alguien agrupe, demore o silencie DENTRO de `enviarSistema` —que es su canal
 * y tiene todo el derecho— el resumen de ventas se iría con la agrupación y
 * dejaría de llegar sin que nadie se entere. La protección tiene que viajar CON
 * el mensaje, no quedarse en el canal del que se fue. Por eso
 * `enviarNegocioPrivado` comparte el cuerpo de `enviarNegocio` —una sola
 * sentencia, cero condiciones— y el MISMO candado que le prohíbe tener perillas.
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
 * INFO DEL NEGOCIO QUE NO PUEDE VER TODO EL MUNDO (2-sep-2026).
 *
 * Mismo trato que `enviarNegocio` —el texto sale TAL CUAL, sin prefijo y sin
 * filtro alguno— pero al destino de SISTEMA, que es el chat privado de Daniel.
 * Lo pidió por privacidad, no porque sea una alerta: el canal 📊 NEGOCIO es un
 * grupo de tres donde está el celular de la empresa.
 *
 * 🔴 NO lleva el `PREFIJO_SISTEMA`: rotular la venta del día como una avería es
 *    mentir en la notificación del celular, que es exactamente lo que ese
 *    prefijo existe para no hacer.
 * 🔴 NO acepta —ni va a aceptar— opción de silenciar, agrupar ni limitar. Es la
 *    misma garantía de `enviarNegocio`, y se muda con el mensaje: el candado
 *    «NEGOCIO no tiene perilla de silenciar» vigila las DOS funciones. Lo único
 *    que se resuelve acá es A DÓNDE va — nunca SI va.
 *
 * ⚠️ Se pierde el fail-safe: `sendTelegramAlert` reintenta en el canal de
 *    siempre cuando falla un destino APARTE, y este destino ES el de siempre —
 *    no hay a quién reintentarle. Lo cubre la reconciliación, que reenvía el
 *    resumen en sus 3 pasadas del día si el de la 01:00 no quedó registrado.
 */
export async function enviarNegocioPrivado(
  texto: string,
  parseMode?: "HTML" | "MarkdownV2",
): Promise<boolean> {
  return sendTelegramAlert(texto, parseMode, destinoSistema());
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
