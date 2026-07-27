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
    // Un tipo nuevo no revienta ni filtra el identificador.
    expect(consecuenciaDeSyncType("tipo_inventado")).not.toContain("tipo_inventado");
  });
});

describe("Los dos canales — negocio intacto, sistema marcado", () => {
  const OLD = process.env;
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...OLD, TELEGRAM_BOT_TOKEN: "t", TELEGRAM_CHAT_ID: "chat-unico" };
  });
  afterEach(() => {
    process.env = OLD;
    vi.unstubAllGlobals();
  });

  async function capturar(fn: (m: typeof import("@/lib/alertas/canal")) => Promise<unknown>) {
    const enviados: Array<{ chat_id: string; text: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        enviados.push(JSON.parse(init.body));
        return { ok: true, text: async () => "" } as Response;
      }),
    );
    const mod = await import("@/lib/alertas/canal");
    await fn(mod);
    return enviados;
  }

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

  it("sin chat aparte configurado, los dos caen en el chat de siempre (cero setup)", async () => {
    const enviados = await capturar(async (m) => {
      await m.enviarNegocio("hola");
      await m.enviarSistema("falla");
    });
    expect(enviados.map((e) => e.chat_id)).toEqual(["chat-unico", "chat-unico"]);
  });

  it("con TELEGRAM_CHAT_ID_SISTEMA, el sistema se va solo al otro grupo y el negocio NO se mueve", async () => {
    process.env.TELEGRAM_CHAT_ID_SISTEMA = "chat-sistema";
    const enviados = await capturar(async (m) => {
      await m.enviarNegocio("hola");
      await m.enviarSistema("falla");
    });
    expect(enviados[0].chat_id).toBe("chat-unico");
    expect(enviados[1].chat_id).toBe("chat-sistema");
  });
});
