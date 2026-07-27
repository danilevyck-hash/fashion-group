/**
 * DIAGNÓSTICO DE LOS DOS CANALES DE TELEGRAM — read-only, no manda nada.
 *
 * El problema que resuelve: después de cargar `TELEGRAM_BOT_TOKEN_NEGOCIO` y
 * `TELEGRAM_CHAT_ID_NEGOCIO` en Vercel, la ÚNICA forma de saber si quedaron
 * bien era mandarle un mensaje real a Daniel. Eso es spam para confirmar una
 * configuración. Acá se responde lo mismo sin escribirle a nadie: a qué bot y
 * a qué chat resuelve cada canal, y si esos dos bots son DISTINTOS entre sí
 * (que es el punto de todo el #323).
 *
 * ── EL TOKEN ES UNA CREDENCIAL — NUNCA SALE ENTERO ───────────────────────────
 * Un token de bot de Telegram tiene forma `<bot_id>:<secreto>`. El `bot_id` es
 * público (Telegram lo expone en cualquier mensaje que el bot manda) y alcanza
 * de sobra para distinguir un bot de otro; el secreto que va después de los ":"
 * da control TOTAL del bot a quien lo tenga. Por eso de acá salen solo:
 *   - `bot_id`         → el número antes de los ":" (público)
 *   - `token_final`    → los últimos 4 chars, para cotejar contra el panel
 *   - `token_largo`    → cuántos chars tiene (delata un copy-paste cortado)
 * Si esta respuesta se filtra entera, nadie puede controlar ningún bot.
 * `sinToken()` además barre el secreto de cualquier mensaje de error antes de
 * devolverlo — un error de red puede traer la URL completa adentro.
 *
 * ── POR QUÉ MIRA LAS VARIABLES CRUDAS ────────────────────────────────────────
 * `canal.ts` hace `.trim()` a propósito (un espacio pegado al pegar en Vercel
 * no debe romper nada), y eso es correcto para ENVIAR. Pero para DIAGNOSTICAR
 * hay que ver lo crudo: si la variable trae espacios, el diagnóstico lo dice
 * en vez de taparlo — es exactamente el tipo de error que Daniel comete en el
 * panel y que después nadie encuentra.
 *
 * No importa `canal.ts` sólo por prolijidad: la resolución del destino DEBE
 * salir de `destinoNegocio()` / `destinoSistema()`, las mismas funciones que
 * usan los envíos de verdad. Un diagnóstico que reimplementa la lógica que
 * vigila puede jurar que todo está bien mientras la producción hace otra cosa.
 */

import { destinoNegocio, destinoSistema } from "@/lib/alertas/canal";
import { destinoPorDefecto, type DestinoTelegram } from "@/lib/telegram";

const TELEGRAM_API = "https://api.telegram.org";

export type NombreCanal = "NEGOCIO" | "SISTEMA";

/** Cómo llegó (o no) una env var al runtime. */
export type EstadoVariable =
  | "ausente"
  | "vacía"
  | "ok"
  | "ok (pero tiene espacios de más)";

/** Identidad del bot que se puede publicar sin comprometer nada. */
export type BotPublico = {
  /** El número antes de los ":". Público: no sirve para controlar el bot. */
  bot_id: string;
  /** Últimos 4 chars del token, para cotejar contra el panel de Vercel. */
  token_final: string;
  /** Largo total del token: un valor raro delata un copy-paste cortado. */
  token_largo: number;
};

/** Lo que contestó Telegram a `getMe` (read-only: no manda mensajes). */
export type VerificacionBot =
  | { verificado: true; username: string; nombre: string }
  | { verificado: false; error: string };

export type DiagnosticoCanal = {
  canal: NombreCanal;
  /** En castellano, para alguien que no programa. */
  estado:
    | "destino propio (bot y chat aparte)"
    | "bot de siempre, chat aparte"
    | "canal de siempre";
  explicacion: string;
  variables: Record<string, EstadoVariable>;
  destino: (BotPublico & { chat_id: string }) | null;
  bot: VerificacionBot | null;
};

export type DiagnosticoCanales = {
  ok: boolean;
  ahora_utc: string;
  entorno: { vercel_env: string; commit: string };
  canal_de_siempre: (BotPublico & { chat_id: string }) | null;
  canales: DiagnosticoCanal[];
  /** LO QUE IMPORTA: que negocio y sistema NO caigan en el mismo bot. */
  bots_distintos: boolean;
  resumen: string;
  /** Qué tiene que corregir Daniel en el panel de Vercel. Vacío = nada. */
  acciones: string[];
};

/** Nombre de la env var de token/chat de un canal. */
const varToken = (c: NombreCanal) => `TELEGRAM_BOT_TOKEN_${c}`;
const varChat = (c: NombreCanal) => `TELEGRAM_CHAT_ID_${c}`;

function estadoVariable(nombre: string): EstadoVariable {
  const crudo = process.env[nombre];
  if (crudo === undefined) return "ausente";
  if (crudo.trim() === "") return "vacía";
  return crudo === crudo.trim() ? "ok" : "ok (pero tiene espacios de más)";
}

/**
 * Recorta un token a lo que se puede publicar. Un token sin ":" (mal copiado)
 * no tiene bot_id: se dice así en vez de inventar uno.
 */
export function botPublico(token: string): BotPublico {
  const i = token.indexOf(":");
  return {
    bot_id: i > 0 ? token.slice(0, i) : "(el token no tiene el formato id:secreto)",
    token_final: token.slice(-4),
    token_largo: token.length,
  };
}

/** Borra cualquier rastro del secreto de un texto que va a salir en la respuesta. */
export function sinToken(texto: string, token: string): string {
  const secreto = token.includes(":") ? token.slice(token.indexOf(":") + 1) : token;
  return texto.split(token).join("«token»").split(secreto).join("«token»");
}

/** Lo que se le pide a Telegram por cada bot. Inyectable para poder testear. */
export type ConsultarBot = (token: string) => Promise<VerificacionBot>;

/**
 * `getMe` contra la API real de Telegram. Es un GET: confirma que el token es
 * válido y devuelve el username del bot SIN escribirle a nadie.
 */
export const consultarBotReal: ConsultarBot = async (token) => {
  try {
    const res = await fetch(`${TELEGRAM_API}/bot${token}/getMe`, { cache: "no-store" });
    const j = (await res.json().catch(() => null)) as {
      ok?: boolean;
      description?: string;
      result?: { username?: string; first_name?: string };
    } | null;

    if (!res.ok || !j?.ok || !j.result?.username) {
      const detalle = j?.description ?? `HTTP ${res.status}`;
      return {
        verificado: false,
        error: sinToken(
          `Telegram rechazó este token: ${detalle}. Revisá que esté completo y sin espacios.`,
          token,
        ),
      };
    }
    return {
      verificado: true,
      username: `@${j.result.username}`,
      nombre: j.result.first_name ?? "",
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      verificado: false,
      error: sinToken(`no se pudo consultar a Telegram: ${msg}`, token),
    };
  }
};

/** ¿Este canal tiene destino propio, o cae en el de siempre? */
function estadoDeCanal(
  canal: NombreCanal,
  destino: DestinoTelegram | undefined,
  porDefecto: DestinoTelegram | null,
): Pick<DiagnosticoCanal, "estado" | "explicacion"> {
  if (!destino) {
    return {
      estado: "canal de siempre",
      explicacion:
        `Sin ${varToken(canal)} ni ${varChat(canal)} configurados, este canal usa ` +
        "el bot y el chat de siempre (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID).",
    };
  }
  if (porDefecto && destino.token === porDefecto.token) {
    return {
      estado: "bot de siempre, chat aparte",
      explicacion:
        `Sólo está ${varChat(canal)}: los mensajes salen con el bot de siempre ` +
        "pero a otro chat.",
    };
  }
  return {
    estado: "destino propio (bot y chat aparte)",
    explicacion: `${varToken(canal)} y ${varChat(canal)} están configurados: este canal tiene su propio bot y su propio chat.`,
  };
}

/**
 * Arma el diagnóstico completo. NO manda ningún mensaje: lo único que sale a
 * la red es `getMe`, que es de lectura.
 */
export async function diagnosticarCanales(
  consultarBot: ConsultarBot = consultarBotReal,
): Promise<DiagnosticoCanales> {
  const porDefecto = destinoPorDefecto();
  const acciones: string[] = [];

  const resueltos: Array<{ canal: NombreCanal; destino: DestinoTelegram | undefined }> = [
    { canal: "NEGOCIO", destino: destinoNegocio() },
    { canal: "SISTEMA", destino: destinoSistema() },
  ];

  const canales: DiagnosticoCanal[] = [];

  for (const { canal, destino } of resueltos) {
    const variables: Record<string, EstadoVariable> = {
      [varToken(canal)]: estadoVariable(varToken(canal)),
      [varChat(canal)]: estadoVariable(varChat(canal)),
    };

    // Un token sin chat es la trampa silenciosa: canal.ts lo ignora con un
    // warning que nadie lee, y el canal se queda en el de siempre creyendo
    // Daniel que lo configuró.
    if (variables[varToken(canal)] !== "ausente" && variables[varChat(canal)] === "ausente") {
      acciones.push(
        `En Vercel falta ${varChat(canal)} (${varToken(canal)} ya está). Un bot sin chat no tiene a dónde escribir, así que ese canal se queda en el de siempre.`,
      );
    }
    for (const [nombre, estado] of Object.entries(variables)) {
      if (estado === "vacía") {
        acciones.push(`En Vercel, ${nombre} existe pero está VACÍA. Cargale el valor o borrala.`);
      }
      if (estado === "ok (pero tiene espacios de más)") {
        acciones.push(
          `En Vercel, ${nombre} tiene espacios (o un salto de línea) al principio o al final. El sistema los ignora, pero conviene volver a pegar el valor limpio.`,
        );
      }
    }

    // El destino efectivo: el propio si lo tiene, el de siempre si no.
    const efectivo = destino ?? porDefecto;
    const bot = efectivo ? await consultarBot(efectivo.token) : null;
    if (bot && !bot.verificado) {
      acciones.push(
        `El bot del canal ${canal} no pasó la verificación con Telegram: ${bot.error}` +
          (destino ? ` Revisá ${varToken(canal)} en Vercel.` : " Revisá TELEGRAM_BOT_TOKEN en Vercel."),
      );
    }

    canales.push({
      canal,
      ...estadoDeCanal(canal, destino, porDefecto),
      variables,
      destino: efectivo ? { ...botPublico(efectivo.token), chat_id: efectivo.chatId } : null,
      bot,
    });
  }

  if (!porDefecto) {
    acciones.push(
      "Faltan TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID en Vercel: sin el canal de siempre no hay red de rescate si un canal aparte falla.",
    );
  }

  const [negocio, sistema] = canales;
  const botsDistintos =
    negocio.destino !== null &&
    sistema.destino !== null &&
    negocio.destino.bot_id !== sistema.destino.bot_id;

  // Que los dos canales salgan por el MISMO bot es el estado que el #323 vino a
  // corregir: no es sólo un dato del reporte, es algo que hay que arreglar en
  // el panel. Sin esto el diagnóstico podía devolver "acciones: []" con los dos
  // canales pegados — un OK aparente sobre el problema exacto que vigila.
  if (!botsDistintos) {
    const cual = canales.find((c) => c.estado === "canal de siempre")?.canal ?? "NEGOCIO";
    acciones.push(
      `Los dos canales salen por el mismo bot. Para separarlos, en Vercel (Project Settings → Environment Variables, entorno Production) tienen que existir ${varToken(cual)} y ${varChat(cual)}, y después hay que volver a desplegar para que el cambio entre.`,
    );
  }

  const nombreBot = (c: DiagnosticoCanal) =>
    c.bot?.verificado ? c.bot.username : `bot ${c.destino?.bot_id ?? "?"}`;

  const resumen = botsDistintos
    ? `SEPARADOS: negocio va por ${nombreBot(negocio)} y sistema por ${nombreBot(sistema)}. Son bots distintos, que es lo que se buscaba.`
    : `MISMO BOT: los dos canales salen por ${nombreBot(negocio)}. No están separados todavía.`;

  return {
    ok: acciones.length === 0 && botsDistintos,
    ahora_utc: new Date().toISOString(),
    entorno: {
      vercel_env: process.env.VERCEL_ENV ?? "local",
      commit: (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7) || "—",
    },
    canal_de_siempre: porDefecto
      ? { ...botPublico(porDefecto.token), chat_id: porDefecto.chatId }
      : null,
    canales,
    bots_distintos: botsDistintos,
    resumen,
    acciones,
  };
}
