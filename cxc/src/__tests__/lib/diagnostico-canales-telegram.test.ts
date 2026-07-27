/**
 * CANDADO del diagnóstico de canales de Telegram (27-jul-2026).
 *
 * Este endpoint existe para poder responder "¿las variables llegaron a
 * producción?" sin mandarle un mensaje a Daniel. Tres cosas tienen que
 * aguantar para siempre:
 *
 *   1. Que sin secreto no conteste NADA (la ruta vive bajo un prefijo público
 *      del middleware: la puerta es el propio route).
 *   2. Que diga la VERDAD sobre el ruteo — canal de siempre vs destino propio
 *      — leyendo `process.env` en cada llamada, no en el build.
 *   3. Que el token NO salga entero. Es una credencial: quien la tenga controla
 *      el bot. Un diagnóstico que filtra lo que diagnostica es peor que no
 *      tener diagnóstico.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// El route importa session-cookie, que arrastra supabase-server en top-level.
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: { from: vi.fn() } }));

import { NextRequest } from "next/server";
import { GET } from "@/app/api/diag/canales-telegram/route";
import {
  diagnosticarCanales,
  botPublico,
  sinToken,
  type ConsultarBot,
  type DiagnosticoCanales,
} from "@/lib/alertas/diagnostico-canales";

// Tokens con la forma real `<bot_id>:<secreto>` (inventados).
const TOKEN_VIEJO = "111111111:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAviejo";
const TOKEN_NUEVO = "222222222:BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBnuevo";
const CHAT = "1367251585";
const SECRETO = "secreto-de-cron-para-tests";

/** getMe falso: no toca la red, devuelve un username por bot. */
const botFalso: ConsultarBot = async (token) =>
  token === TOKEN_NUEVO
    ? { verificado: true, username: "@fashiongr_sistema_bot", nombre: "FashionGR Sistema" }
    : { verificado: true, username: "@fashiongr_alertas_bot", nombre: "FashionGR Alertas" };

const CLAVES = [
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
  "TELEGRAM_BOT_TOKEN_NEGOCIO",
  "TELEGRAM_CHAT_ID_NEGOCIO",
  "TELEGRAM_BOT_TOKEN_SISTEMA",
  "TELEGRAM_CHAT_ID_SISTEMA",
  "CRON_SECRET",
];

const OLD = process.env;
beforeEach(() => {
  vi.resetModules();
  process.env = { ...OLD };
  for (const k of CLAVES) delete process.env[k];
  // El canal de siempre, que en producción ya existe.
  process.env.TELEGRAM_BOT_TOKEN = TOKEN_VIEJO;
  process.env.TELEGRAM_CHAT_ID = CHAT;
});
afterEach(() => {
  process.env = OLD;
  vi.restoreAllMocks();
});

const canal = (d: DiagnosticoCanales, nombre: "NEGOCIO" | "SISTEMA") =>
  d.canales.find((c) => c.canal === nombre)!;

// ─────────────────────────────────────────────────────────────────────────────
describe("sin variables nuevas: los dos canales caen en el de siempre", () => {
  it("reporta 'canal de siempre' en ambos y avisa que NO están separados", async () => {
    const d = await diagnosticarCanales(botFalso);

    expect(canal(d, "NEGOCIO").estado).toBe("canal de siempre");
    expect(canal(d, "SISTEMA").estado).toBe("canal de siempre");
    expect(canal(d, "NEGOCIO").variables.TELEGRAM_BOT_TOKEN_NEGOCIO).toBe("ausente");
    expect(canal(d, "NEGOCIO").variables.TELEGRAM_CHAT_ID_NEGOCIO).toBe("ausente");

    // Lo que importa: mismo bot en los dos → no hay separación.
    expect(d.bots_distintos).toBe(false);
    expect(d.ok).toBe(false);
    expect(d.resumen).toMatch(/MISMO BOT/);
  });

  it("'mismo bot' SIEMPRE deja una acción concreta con el nombre de las variables", async () => {
    // Sin esto el reporte devolvía `acciones: []` con los dos canales pegados:
    // un OK aparente sobre el problema exacto que este endpoint vigila.
    const d = await diagnosticarCanales(botFalso);
    expect(d.acciones.length).toBeGreaterThan(0);
    expect(d.acciones.join(" ")).toContain("TELEGRAM_BOT_TOKEN_NEGOCIO");
    expect(d.acciones.join(" ")).toContain("TELEGRAM_CHAT_ID_NEGOCIO");
  });

  it("aun así dice a qué bot y chat resuelve cada canal (el de siempre, no null)", async () => {
    const d = await diagnosticarCanales(botFalso);
    expect(canal(d, "NEGOCIO").destino).toEqual({
      bot_id: "111111111",
      token_final: TOKEN_VIEJO.slice(-4),
      token_largo: TOKEN_VIEJO.length,
      chat_id: CHAT,
    });
    expect(canal(d, "SISTEMA").bot).toEqual({
      verificado: true,
      username: "@fashiongr_alertas_bot",
      nombre: "FashionGR Alertas",
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("con las variables de NEGOCIO cargadas: destino propio y bots distintos", () => {
  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN_NEGOCIO = TOKEN_NUEVO;
    process.env.TELEGRAM_CHAT_ID_NEGOCIO = CHAT;
  });

  it("negocio queda con destino propio y sistema en el de siempre", async () => {
    const d = await diagnosticarCanales(botFalso);
    expect(canal(d, "NEGOCIO").estado).toBe("destino propio (bot y chat aparte)");
    expect(canal(d, "SISTEMA").estado).toBe("canal de siempre");
    expect(canal(d, "NEGOCIO").destino!.bot_id).toBe("222222222");
    expect(canal(d, "SISTEMA").destino!.bot_id).toBe("111111111");
  });

  it("dice que los bots son DISTINTOS y da el username real de cada uno", async () => {
    const d = await diagnosticarCanales(botFalso);
    expect(d.bots_distintos).toBe(true);
    expect(d.ok).toBe(true);
    expect(canal(d, "NEGOCIO").bot).toMatchObject({ username: "@fashiongr_sistema_bot" });
    expect(canal(d, "SISTEMA").bot).toMatchObject({ username: "@fashiongr_alertas_bot" });
    expect(d.resumen).toMatch(/SEPARADOS/);
  });

  it("el MISMO chat_id en los dos canales NO los confunde: la separación la da el bot", async () => {
    // Caso real: TELEGRAM_CHAT_ID ya vale 1367251585, igual que el chat nuevo.
    const d = await diagnosticarCanales(botFalso);
    expect(canal(d, "NEGOCIO").destino!.chat_id).toBe(canal(d, "SISTEMA").destino!.chat_id);
    expect(d.bots_distintos).toBe(true);
  });

  it("lee process.env EN CADA LLAMADA (no queda horneado del build)", async () => {
    expect((await diagnosticarCanales(botFalso)).bots_distintos).toBe(true);
    delete process.env.TELEGRAM_BOT_TOKEN_NEGOCIO;
    delete process.env.TELEGRAM_CHAT_ID_NEGOCIO;
    expect((await diagnosticarCanales(botFalso)).bots_distintos).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("configuraciones a medias: dice EXACTAMENTE qué corregir en Vercel", () => {
  it("token sin chat → sigue en el canal de siempre y nombra la variable que falta", async () => {
    process.env.TELEGRAM_BOT_TOKEN_NEGOCIO = TOKEN_NUEVO;
    const d = await diagnosticarCanales(botFalso);
    expect(canal(d, "NEGOCIO").estado).toBe("canal de siempre");
    expect(d.acciones.join(" ")).toContain("TELEGRAM_CHAT_ID_NEGOCIO");
    expect(d.ok).toBe(false);
  });

  it("sólo el chat → bot de siempre en otro chat (no es lo mismo que destino propio)", async () => {
    process.env.TELEGRAM_CHAT_ID_NEGOCIO = "-100999";
    const d = await diagnosticarCanales(botFalso);
    expect(canal(d, "NEGOCIO").estado).toBe("bot de siempre, chat aparte");
    expect(canal(d, "NEGOCIO").destino!.chat_id).toBe("-100999");
    expect(d.bots_distintos).toBe(false);
  });

  it("variable con espacios de más: lo dice en vez de taparlo con el trim", async () => {
    process.env.TELEGRAM_BOT_TOKEN_NEGOCIO = ` ${TOKEN_NUEVO}\n`;
    process.env.TELEGRAM_CHAT_ID_NEGOCIO = CHAT;
    const d = await diagnosticarCanales(botFalso);
    expect(canal(d, "NEGOCIO").variables.TELEGRAM_BOT_TOKEN_NEGOCIO).toBe(
      "ok (pero tiene espacios de más)",
    );
    expect(d.acciones.join(" ")).toMatch(/TELEGRAM_BOT_TOKEN_NEGOCIO.*espacios/);
    // …pero el ruteo igual funciona (canal.ts hace trim): no es un falso rojo.
    expect(canal(d, "NEGOCIO").destino!.bot_id).toBe("222222222");
  });

  it("variable vacía: se reporta como vacía, no como ausente", async () => {
    process.env.TELEGRAM_CHAT_ID_NEGOCIO = "   ";
    const d = await diagnosticarCanales(botFalso);
    expect(canal(d, "NEGOCIO").variables.TELEGRAM_CHAT_ID_NEGOCIO).toBe("vacía");
    expect(d.acciones.join(" ")).toContain("TELEGRAM_CHAT_ID_NEGOCIO");
  });

  it("token inválido: lo DICE en vez de fingir que está bien", async () => {
    process.env.TELEGRAM_BOT_TOKEN_NEGOCIO = TOKEN_NUEVO;
    process.env.TELEGRAM_CHAT_ID_NEGOCIO = CHAT;
    const rechaza: ConsultarBot = async (t) =>
      t === TOKEN_NUEVO
        ? { verificado: false, error: "Telegram rechazó este token: Unauthorized" }
        : { verificado: true, username: "@fashiongr_alertas_bot", nombre: "Alertas" };

    const d = await diagnosticarCanales(rechaza);
    expect(canal(d, "NEGOCIO").bot).toMatchObject({ verificado: false });
    expect(d.ok).toBe(false);
    expect(d.acciones.join(" ")).toContain("TELEGRAM_BOT_TOKEN_NEGOCIO");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("EL TOKEN NUNCA SALE ENTERO", () => {
  it("no aparece completo en ninguna parte del JSON, con o sin overrides", async () => {
    process.env.TELEGRAM_BOT_TOKEN_NEGOCIO = TOKEN_NUEVO;
    process.env.TELEGRAM_CHAT_ID_NEGOCIO = CHAT;
    const json = JSON.stringify(await diagnosticarCanales(botFalso));

    for (const t of [TOKEN_VIEJO, TOKEN_NUEVO]) {
      expect(json).not.toContain(t);
      // Tampoco el secreto suelto (lo que va después de los ":").
      expect(json).not.toContain(t.slice(t.indexOf(":") + 1));
    }
    // Pero sí lo suficiente para distinguir un bot de otro.
    expect(json).toContain("222222222");
    expect(json).toContain("111111111");
  });

  it("botPublico corta por los ':' y sólo deja el id y 4 chars", () => {
    const p = botPublico(TOKEN_NUEVO);
    expect(p.bot_id).toBe("222222222");
    expect(p.token_final).toBe(TOKEN_NUEVO.slice(-4));
    expect(p.token_final.length).toBe(4);
    expect(p.token_largo).toBe(TOKEN_NUEVO.length);
  });

  it("un token mal formado (sin ':') no inventa un bot_id ni filtra el valor", () => {
    const p = botPublico("estonoesuntoken");
    expect(p.bot_id).not.toContain("estonoesuntoken");
    expect(p.bot_id).toMatch(/formato/);
  });

  it("sinToken barre el secreto de un mensaje de error antes de devolverlo", () => {
    const crudo = `fetch failed: https://api.telegram.org/bot${TOKEN_NUEVO}/getMe`;
    const limpio = sinToken(crudo, TOKEN_NUEVO);
    expect(limpio).not.toContain(TOKEN_NUEVO);
    expect(limpio).not.toContain(TOKEN_NUEVO.slice(TOKEN_NUEVO.indexOf(":") + 1));
    expect(limpio).toContain("«token»");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("GET /api/diag/canales-telegram — la puerta", () => {
  // El route usa el getMe REAL. Acá se corta la red: los tests no dependen de
  // que Telegram esté arriba (y no se le hace tráfico a la API por un test).
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ ok: true, result: { username: "bot_de_prueba", first_name: "Prueba" } }),
        { headers: { "content-type": "application/json" } },
      ),
    );
  });

  const pedir = (init?: { auth?: string; query?: string }) =>
    GET(
      new NextRequest(`http://localhost/api/diag/canales-telegram${init?.query ?? ""}`, {
        headers: init?.auth ? { authorization: init.auth } : undefined,
      }),
    );

  it("sin auth → 401", async () => {
    process.env.CRON_SECRET = SECRETO;
    const res = await pedir();
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Unauthorized");
  });

  it("con el secreto equivocado → 401", async () => {
    process.env.CRON_SECRET = SECRETO;
    expect((await pedir({ auth: "Bearer otra-cosa" })).status).toBe(401);
    expect((await pedir({ query: "?secret=otra-cosa" })).status).toBe(401);
  });

  it("sin CRON_SECRET configurado → 503, NUNCA abierto (fail-closed)", async () => {
    // Sin esto, `undefined === undefined` dejaría entrar a cualquiera sin auth.
    const res = await pedir();
    expect(res.status).toBe(503);
    const res2 = await pedir({ auth: "Bearer " });
    expect(res2.status).toBe(503);
  });

  it("con Bearer CRON_SECRET → 200 y reporta 'canal de siempre' si no hay variables", async () => {
    process.env.CRON_SECRET = SECRETO;
    const res = await pedir({ auth: `Bearer ${SECRETO}` });
    expect(res.status).toBe(200);
    const j = (await res.json()) as DiagnosticoCanales;
    expect(canal(j, "NEGOCIO").estado).toBe("canal de siempre");
    expect(j.bots_distintos).toBe(false);
  });

  it("con las variables cargadas → reporta destino propio, y el token no viaja entero", async () => {
    process.env.CRON_SECRET = SECRETO;
    process.env.TELEGRAM_BOT_TOKEN_NEGOCIO = TOKEN_NUEVO;
    process.env.TELEGRAM_CHAT_ID_NEGOCIO = CHAT;

    const res = await pedir({ query: `?secret=${SECRETO}` });
    expect(res.status).toBe(200);
    const texto = await res.text();
    expect(texto).not.toContain(TOKEN_NUEVO);
    expect(texto).not.toContain(TOKEN_VIEJO);

    const j = JSON.parse(texto) as DiagnosticoCanales;
    expect(canal(j, "NEGOCIO").estado).toBe("destino propio (bot y chat aparte)");
    expect(canal(j, "NEGOCIO").destino!.bot_id).toBe("222222222");
    expect(j.bots_distintos).toBe(true);
  });

  it("no manda NADA a Telegram: ningún fetch a sendMessage", async () => {
    process.env.CRON_SECRET = SECRETO;
    process.env.TELEGRAM_BOT_TOKEN_NEGOCIO = TOKEN_NUEVO;
    process.env.TELEGRAM_CHAT_ID_NEGOCIO = CHAT;

    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: { username: "b", first_name: "B" } }), {
        headers: { "content-type": "application/json" },
      }),
    );

    await pedir({ auth: `Bearer ${SECRETO}` });

    expect(spy).toHaveBeenCalled();
    for (const llamada of spy.mock.calls) {
      const url = String(llamada[0]);
      expect(url).toContain("/getMe");
      expect(url).not.toContain("sendMessage");
      // El método por defecto de getMe es GET: nada que escriba.
      expect((llamada[1] as RequestInit | undefined)?.method ?? "GET").toBe("GET");
    }
  });
});
