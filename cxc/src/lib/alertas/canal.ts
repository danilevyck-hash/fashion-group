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
 * Hoy los dos canales caen en el MISMO chat. La separación es visual y va al
 * frente del mensaje, que es lo único que se ve en la notificación del iPhone
 * antes de abrirla: todo lo de sistema abre con "🔧 SISTEMA · ". Lo de negocio
 * conserva su emoji de siempre (🛒 pedido, 📦 guía, 📊 resumen) y NO lleva
 * prefijo — así el cambio no toca ni un texto que hoy le sirve.
 *
 * Y queda listo para separarlos DE VERDAD sin tocar código: si algún día existe
 * la env var TELEGRAM_CHAT_ID_SISTEMA, el canal de sistema se va solo a ese
 * chat. Mientras no exista, ambos caen donde caen hoy. Eso requiere que Daniel
 * cree un segundo grupo de Telegram y agregue el bot — decisión suya, no del
 * código; el código ya está preparado para las dos formas.
 */

import { sendTelegramAlert } from "@/lib/telegram";

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
 * ALERTA DE SISTEMA. Antepone la marca de agua y, si está configurado el chat
 * aparte, la manda allá.
 *
 * Con parseMode "HTML" el prefijo va fuera de cualquier etiqueta (es texto
 * plano seguro: no lleva < > &), así que no rompe el marcado del caller.
 */
export async function enviarSistema(
  texto: string,
  parseMode?: "HTML" | "MarkdownV2",
): Promise<boolean> {
  const chatSistema = process.env.TELEGRAM_CHAT_ID_SISTEMA || undefined;
  return sendTelegramAlert(`${PREFIJO_SISTEMA}${texto}`, parseMode, chatSistema);
}
