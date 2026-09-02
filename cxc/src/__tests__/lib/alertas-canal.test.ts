/**
 * CANDADO de la auditoría de alertas (27-jul-2026).
 *
 * Daniel divide los mensajes en dos, textual: "info de la empresa" y "alertas
 * cuando el sistema no funciona". Este archivo prueba las DOS direcciones de
 * cada regla nueva:
 *   - que el RUIDO se calle, y
 *   - que lo REAL siga sonando.
 *
 * La segunda mitad es la que importa: silenciar es fácil, y un vigía que se
 * calla cuando todo se rompe es peor que uno ruidoso.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// alert-policy / cron-telemetry construyen el cliente de Supabase en el
// top-level. Se mockea SOLO eso: `@/lib/telegram` y `@/lib/alertas/canal` van
// REALES a propósito — son justamente lo que estos tests verifican.
vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: { from: vi.fn() },
}));

import {
  isSwitchTransitorio,
  isSwitch401,
  isSwitchSilenciable,
  consecuenciaDeSyncType,
} from "@/lib/switch-api/alert-policy";
import { isSwitchCaida } from "@/lib/switch-api/outage-resumen";
import { shortError, esPaginaDeErrorDelProveedor } from "@/lib/telegram";
import { recoveryStillComingToday, describirCronParaDaniel } from "@/lib/cron-telemetry";
import { PREFIJO_SISTEMA } from "@/lib/alertas/canal";

// Mensajes REALES sacados de cron_email_errors / switch_sync_log de producción.
const HTML_SWITCH =
  'Auth respondió 200 pero sin token: <!DOCTYPE html>\n<html>\n    <head>\n        <title>Exception - SWITCH SOFT</title>';
const HTML_MEDIA_LLAMADA =
  'update products sku=100202441: <!DOCTYPE html>\n<!--[if lt IE 7]> <html class="no-js ie6 oldie" lang="en-US"> <![endif]-->';
const XML_R2 =
  '<?xml version="1.0" encoding="UTF-8"?><Error><Code>AccessDenied</Code><Message>Access Denied</Message></Error>';
const RED = "Error de red en /autenticacion: fetch failed (UND_ERR_CONNECT_TIMEOUT)";
const LICENCIA = "Auth fallo: HTTP 400 — LICENCIA NO SE ENCUENTRA ACTIVA";
const TIMEOUT_BASE = "UPSERT estadocuenta falló: canceling statement due to statement timeout";

describe("RUIDO que se calla — la página de error de Switch es una caída, no una emergencia", () => {
  it("silencia la página de excepción de Switch en el auth (5 casos en 30d, 5 recuperados solos)", () => {
    expect(isSwitchTransitorio(HTML_SWITCH)).toBe(true);
    expect(isSwitchSilenciable(HTML_SWITCH)).toBe(true);
  });

  it("silencia la página HTML soltada a media llamada (caso reebok-catalogo 24-jul)", () => {
    expect(isSwitchTransitorio(HTML_MEDIA_LLAMADA)).toBe(true);
  });

  it("los dos archivos ya NO pueden divergir: isSwitchCaida delega en isSwitchTransitorio", () => {
    // Éste era el bug: outage-resumen decía "sin impacto" y alert-policy 🚨.
    for (const m of [HTML_SWITCH, HTML_MEDIA_LLAMADA, RED, LICENCIA, TIMEOUT_BASE, ""]) {
      expect(isSwitchCaida(m)).toBe(isSwitchTransitorio(m));
    }
  });
});

describe("SEÑAL que sigue sonando — lo que NO se arregla solo", () => {
  it("LICENCIA vencida NUNCA se silencia, ni envuelta en la página HTML", () => {
    expect(isSwitchSilenciable(LICENCIA)).toBe(false);
    expect(isSwitchTransitorio(`${LICENCIA} <!DOCTYPE html><html>`)).toBe(false);
    // Y tampoco se confunde con una caída de Switch (no se arregla sola).
    expect(isSwitchCaida(LICENCIA)).toBe(false);
  });

  it("el statement timeout de la base NO es silenciable (caso fashion_shoes 25-jul)", () => {
    expect(isSwitchSilenciable(TIMEOUT_BASE)).toBe(false);
    expect(isSwitch401(TIMEOUT_BASE)).toBe(false);
  });

  it("un error de negocio desconocido sigue alertando de inmediato", () => {
    expect(isSwitchSilenciable("El pedido 123 no tiene cliente asignado")).toBe(false);
  });
});

describe("Nada de HTML ni XML crudo al celular", () => {
  it("detecta las páginas de error de Switch y de Cloudflare R2", () => {
    for (const m of [HTML_SWITCH, HTML_MEDIA_LLAMADA, XML_R2]) {
      expect(esPaginaDeErrorDelProveedor(m)).toBe(true);
    }
  });

  it("reemplaza la sopa de etiquetas por una frase, conservando el prefijo humano", () => {
    const salida = shortError(HTML_MEDIA_LLAMADA);
    expect(salida).toContain("update products sku=100202441");
    expect(salida).toContain("el proveedor devolvió una página de error en vez de datos");
    expect(salida).not.toContain("<!DOCTYPE");
    expect(salida).not.toContain("<html");
  });

  it("el XML de R2 tampoco pasa", () => {
    const salida = shortError(XML_R2);
    expect(salida).not.toContain("<?xml");
    expect(salida).not.toContain("AccessDenied");
  });

  it("un error normal se conserva tal cual (no rompe lo que ya servía)", () => {
    expect(shortError(RED)).toBe(RED);
    expect(shortError(LICENCIA)).toBe(LICENCIA);
  });
});

describe("Backup — un fallo con segunda oportunidad hoy no despierta a nadie", () => {
  it("core: falla a las 06:00 y quedan 10:30 y 18:30 → espera", () => {
    expect(recoveryStillComingToday("backup", 6)).toBe(true);
  });

  it("core: falla a las 18:30, ya no queda nada hoy → SUENA", () => {
    expect(recoveryStillComingToday("backup", 18.5)).toBe(false);
    expect(recoveryStillComingToday("backup", 19)).toBe(false);
  });

  it("switch: la última entrada es 23:30 y no tiene red detrás → SUENA", () => {
    expect(recoveryStillComingToday("backup-switch", 6.75)).toBe(true);
    expect(recoveryStillComingToday("backup-switch", 23.5)).toBe(false);
  });

  it("storage: 04:00 espera a 15:30; 15:30 ya suena", () => {
    expect(recoveryStillComingToday("backup-storage", 4)).toBe(true);
    expect(recoveryStillComingToday("backup-storage", 15.5)).toBe(false);
  });
});

describe("Los textos hablan de negocio, no de código", () => {
  const tipos = [
    "switch-sync",
    "switch-articulos",
    "sync-proveedores",
    "backup_switch_r2",
    "refresh_clientes_vw",
    "reebok_catalogo_failed",
    "integrity_check_failed",
    "cleanup_sessions_failed",
    "un_tipo_que_nadie_previo",
  ];

  it("ningún mensaje filtra el identificador interno del cron", () => {
    for (const t of tipos) {
      const msg = describirCronParaDaniel(t);
      expect(msg).not.toContain(t);
      expect(msg).not.toContain("_");
    }
  });

  it("todos dicen qué significa y qué hacer", () => {
    for (const t of tipos) {
      const msg = describirCronParaDaniel(t);
      expect(msg).toContain("Qué significa:");
      expect(msg).toContain("Qué hacer:");
    }
  });

  it("la consecuencia de cada sync está en castellano de negocio", () => {
    expect(consecuenciaDeSyncType("estadocuenta")).toContain("Cuentas por Cobrar");
    expect(consecuenciaDeSyncType("facturas")).toContain("ventas");
    expect(consecuenciaDeSyncType("proveedores")).toContain("proveedores");
    // 🩸 `egresos_varios` NO estaba en el switch y caía al default («puede haber
    // datos sin actualizar en la app»), que no nombra una sola pantalla. Cuando
    // Switch cambió el formato del reporte el 1-sep-2026 y este sync falló cinco
    // días seguidos, el aviso no decía dónde mirar. Tiene que nombrar Gastos.
    expect(consecuenciaDeSyncType("egresos_varios")).toContain("Gastos");
    expect(consecuenciaDeSyncType("egresos_varios")).not.toBe(
      consecuenciaDeSyncType("tipo_inventado"),
    );
    // Un tipo nuevo no revienta ni filtra el identificador.
    expect(consecuenciaDeSyncType("tipo_inventado")).not.toContain("tipo_inventado");
  });
});

describe("Los dos canales — negocio intacto, sistema marcado", () => {
  const OLD = process.env;
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...OLD, TELEGRAM_BOT_TOKEN: "tok-viejo", TELEGRAM_CHAT_ID: "chat-viejo" };
    for (const k of [
      "TELEGRAM_BOT_TOKEN_NEGOCIO",
      "TELEGRAM_CHAT_ID_NEGOCIO",
      "TELEGRAM_BOT_TOKEN_SISTEMA",
      "TELEGRAM_CHAT_ID_SISTEMA",
    ])
      delete process.env[k];
  });
  afterEach(() => {
    process.env = OLD;
    vi.unstubAllGlobals();
  });

  it("un mensaje de NEGOCIO sale EXACTAMENTE como se escribió — sin prefijo ni adornos", async () => {
    const texto = "📦 GT-1234 despachada · Cliente X";
    const [msg] = await capturar((m) => m.enviarNegocio(texto));
    expect(msg.text).toBe(texto);
    expect(msg.text).not.toContain(PREFIJO_SISTEMA);
  });

  it("un mensaje de SISTEMA lleva la marca al PRINCIPIO (se lee en la notificación)", async () => {
    const [msg] = await capturar((m) => m.enviarSistema("Falló el respaldo."));
    expect(msg.text.startsWith(PREFIJO_SISTEMA)).toBe(true);
  });

  it("sin ningún override, los dos caen donde caen hoy (cero setup)", async () => {
    const enviados = await capturar(async (m) => {
      await m.enviarNegocio("hola");
      await m.enviarSistema("falla");
    });
    expect(enviados.map((e) => e.chat_id)).toEqual(["chat-viejo", "chat-viejo"]);
    expect(enviados.map((e) => e.token)).toEqual(["tok-viejo", "tok-viejo"]);
  });

  it("EL RUTEO REAL (27-jul-2026): NEGOCIO al bot nuevo, SISTEMA al de siempre", async () => {
    // Sí, el bot se llama "sistema" y lleva negocio. Lo decidió Daniel.
    process.env.TELEGRAM_BOT_TOKEN_NEGOCIO = "tok-bot-nuevo";
    process.env.TELEGRAM_CHAT_ID_NEGOCIO = "1367251585";
    const enviados = await capturar(async (m) => {
      await m.enviarNegocio("🛒 Pedido nuevo");
      await m.enviarSistema("Falló el respaldo.");
    });
    expect(enviados).toHaveLength(2);
    expect(enviados[0]).toMatchObject({ token: "tok-bot-nuevo", chat_id: "1367251585" });
    expect(enviados[1]).toMatchObject({ token: "tok-viejo", chat_id: "chat-viejo" });
  });

  it("el override es SIMÉTRICO: cada canal puede tener su bot, sin caso especial", async () => {
    process.env.TELEGRAM_BOT_TOKEN_NEGOCIO = "tok-neg";
    process.env.TELEGRAM_CHAT_ID_NEGOCIO = "chat-neg";
    process.env.TELEGRAM_BOT_TOKEN_SISTEMA = "tok-sis";
    process.env.TELEGRAM_CHAT_ID_SISTEMA = "chat-sis";
    const enviados = await capturar(async (m) => {
      await m.enviarNegocio("hola");
      await m.enviarSistema("falla");
    });
    expect(enviados[0]).toMatchObject({ token: "tok-neg", chat_id: "chat-neg" });
    expect(enviados[1]).toMatchObject({ token: "tok-sis", chat_id: "chat-sis" });
  });

  it("sólo el CHAT de un canal = el bot de siempre en otro chat (sirve para un grupo)", async () => {
    process.env.TELEGRAM_CHAT_ID_NEGOCIO = "grupo-negocio";
    const [msg] = await capturar((m) => m.enviarNegocio("hola"));
    expect(msg).toMatchObject({ token: "tok-viejo", chat_id: "grupo-negocio" });
  });

  it("el chat_id de un privado es el MISMO para todos los bots: sin token no hay separación", async () => {
    // Éste es el hallazgo que tumbó el diseño anterior: TELEGRAM_CHAT_ID ya es
    // 1367251585 en producción. Apuntar el otro canal a ese número, sin bot
    // propio, es un no-op perfecto — los dos mensajes al mismo chat.
    process.env.TELEGRAM_CHAT_ID = "1367251585";
    process.env.TELEGRAM_CHAT_ID_NEGOCIO = "1367251585";
    const enviados = await capturar(async (m) => {
      await m.enviarNegocio("hola");
      await m.enviarSistema("falla");
    });
    expect(enviados[0].token).toBe(enviados[1].token);
    expect(enviados[0].chat_id).toBe(enviados[1].chat_id);
    expect(enviados[0].chat_id).toBe("1367251585");
  });
});

describe("FAIL-SAFE — un olvido de configuración NUNCA silencia un aviso", () => {
  const OLD = process.env;
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...OLD, TELEGRAM_BOT_TOKEN: "tok-viejo", TELEGRAM_CHAT_ID: "chat-viejo" };
    for (const k of [
      "TELEGRAM_BOT_TOKEN_NEGOCIO",
      "TELEGRAM_CHAT_ID_NEGOCIO",
      "TELEGRAM_BOT_TOKEN_SISTEMA",
      "TELEGRAM_CHAT_ID_SISTEMA",
    ])
      delete process.env[k];
  });
  afterEach(() => {
    process.env = OLD;
    vi.unstubAllGlobals();
  });

  it("olvidar las variables de NEGOCIO no pierde nada — y es lo que más le importa a Daniel", async () => {
    const enviados = await capturar((m) => m.enviarNegocio("🛒 Pedido nuevo · $1.980,00"));
    expect(enviados).toHaveLength(1);
    expect(enviados[0]).toMatchObject({ token: "tok-viejo", chat_id: "chat-viejo" });
  });

  it("token de negocio SIN chat es incoherente → canal de siempre, no se inventa destino", async () => {
    process.env.TELEGRAM_BOT_TOKEN_NEGOCIO = "tok-bot-nuevo";
    const enviados = await capturar((m) => m.enviarNegocio("hola"));
    expect(enviados).toHaveLength(1);
    // Lo peor sería mandar el chat de siempre con el bot nuevo: 403 seguro.
    expect(enviados[0]).toMatchObject({ token: "tok-viejo", chat_id: "chat-viejo" });
  });

  it("si el bot nuevo rechaza el mensaje de NEGOCIO, se reintenta en el canal de siempre", async () => {
    process.env.TELEGRAM_BOT_TOKEN_NEGOCIO = "tok-bot-nuevo";
    process.env.TELEGRAM_CHAT_ID_NEGOCIO = "1367251585";
    const enviados = await capturar((m) => m.enviarNegocio("🛒 Pedido nuevo"), ["tok-bot-nuevo"]);
    expect(enviados).toHaveLength(2);
    expect(enviados[0]).toMatchObject({ token: "tok-bot-nuevo", chat_id: "1367251585" });
    expect(enviados[1]).toMatchObject({ token: "tok-viejo", chat_id: "chat-viejo" });
    expect(enviados[1].text).toBe("🛒 Pedido nuevo");
  });

  it("lo mismo para SISTEMA, y el prefijo viaja intacto al canal de rescate", async () => {
    process.env.TELEGRAM_BOT_TOKEN_SISTEMA = "tok-sis";
    process.env.TELEGRAM_CHAT_ID_SISTEMA = "chat-sis";
    const enviados = await capturar((m) => m.enviarSistema("La base no responde."), ["tok-sis"]);
    expect(enviados).toHaveLength(2);
    expect(enviados[1]).toMatchObject({ token: "tok-viejo", chat_id: "chat-viejo" });
    expect(enviados[1].text.startsWith(PREFIJO_SISTEMA)).toBe(true);
  });

  it("el reintento NO duplica el mensaje cuando el canal aparte SÍ acepta", async () => {
    process.env.TELEGRAM_BOT_TOKEN_NEGOCIO = "tok-bot-nuevo";
    process.env.TELEGRAM_CHAT_ID_NEGOCIO = "1367251585";
    const enviados = await capturar((m) => m.enviarNegocio("hola"));
    expect(enviados).toHaveLength(1);
  });

  it("si el canal de siempre es el único destino y falla, no hay reintento infinito", async () => {
    const enviados = await capturar((m) => m.enviarNegocio("hola"), ["tok-viejo"]);
    expect(enviados).toHaveLength(1);
  });
});

describe("NEGOCIO no tiene perilla de silenciar — la garantía del #321", () => {
  /**
   * AMPLIADO EL 2-sep-2026. Antes este candado vigilaba UNA sola función,
   * `enviarNegocio`. El resumen diario de ventas de ACS se mudó al chat privado
   * de Daniel (por privacidad: 📊 NEGOCIO es un grupo de tres donde está el
   * celular de la empresa) y sale por `enviarNegocioPrivado`, que comparte el
   * DESTINO de sistema pero no su trato.
   *
   * 🔴 La protección tiene que viajar CON el mensaje. Hoy `enviarSistema`
   * tampoco filtra nada por dentro, pero eso es casualidad: toda su anti-ruido
   * vive en los llamadores. El día que alguien agrupe o demore DENTRO de
   * `enviarSistema`, el resumen de ventas se iría con la agrupación y dejaría
   * de llegar sin que nadie lo note. Por eso las DOS funciones de negocio pasan
   * por el mismo cedazo, y `enviarSistema` NO — ese canal sí tiene derecho a
   * filtrar algún día.
   */
  const DE_NEGOCIO = ["enviarNegocio", "enviarNegocioPrivado"] as const;

  it("las funciones de negocio reciben SOLO (texto, parseMode): no hay dónde meter un filtro", async () => {
    const mod = await import("@/lib/alertas/canal");
    for (const nombre of DE_NEGOCIO) expect(mod[nombre].length, nombre).toBe(2);
    expect(mod.enviarSistema.length).toBe(2);
  });

  it.each(DE_NEGOCIO)(
    "el cuerpo de %s no tiene condición alguna: resuelve DESTINO, nunca SI se manda",
    async (nombre) => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const src = fs.readFileSync(path.join(process.cwd(), "src/lib/alertas/canal.ts"), "utf8");
      // El "(" del final ata el nombre EXACTO: sin él, buscar "enviarNegocio"
      // encontraría también a "enviarNegocioPrivado" y una de las dos quedaría
      // sin revisar.
      const desde = src.indexOf(`export async function ${nombre}(`);
      expect(desde, `no encontré ${nombre} en canal.ts`).toBeGreaterThan(-1);
      // Hasta la llave de cierre de la función (primera "}" en columna 0).
      const cuerpo = src.slice(desde, src.indexOf("\n}", desde) + 2);
      for (const perilla of ["if (", "return false", "return true", "silenc", "process.env"]) {
        expect(cuerpo, `${nombre} · perilla "${perilla}"`).not.toContain(perilla);
      }
      // Una sola sentencia: manda siempre, y sólo elige a dónde.
      expect(cuerpo).toMatch(
        /return sendTelegramAlert\(texto, parseMode, destino(?:Negocio|Sistema)\(\)\);/,
      );
      // Y el texto sale intacto: el prefijo es exclusivo de `enviarSistema`.
      expect(cuerpo).not.toContain("PREFIJO_SISTEMA");
    },
  );

  // (El ruteo en vivo de `enviarNegocioPrivado` —que cae en el chat privado y
  // sale sin prefijo— se prueba en acs-resumen-canal-privado.test.ts, que sí
  // arma las env vars de los dos canales antes de cada caso.)
});

/** Lo que Telegram recibiría: a qué bot (token de la URL) y a qué chat. */
type Envio = { token: string; chat_id: string; text: string };

/**
 * Corre `fn` con `fetch` interceptado y devuelve los POST que habrían salido.
 * `tokensQueFallan` simula un bot mal configurado (403 de Telegram).
 */
async function capturar(
  fn: (m: typeof import("@/lib/alertas/canal")) => Promise<unknown>,
  tokensQueFallan: string[] = [],
): Promise<Envio[]> {
  const enviados: Envio[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: { body: string }) => {
      const token = /\/bot([^/]+)\/sendMessage/.exec(url)?.[1] ?? "";
      const body = JSON.parse(init.body) as { chat_id: string; text: string };
      enviados.push({ token, ...body });
      if (tokensQueFallan.includes(token)) {
        return { ok: false, status: 403, text: async () => "Forbidden" } as Response;
      }
      return { ok: true, text: async () => "" } as Response;
    }),
  );
  const mod = await import("@/lib/alertas/canal");
  await fn(mod);
  return enviados;
}
