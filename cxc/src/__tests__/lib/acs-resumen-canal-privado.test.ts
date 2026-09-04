/**
 * CANDADO — EL RESUMEN DIARIO DE VENTAS DE ACS VA AL CHAT PRIVADO (2-sep-2026)
 * Y EL RESUMEN MENSUAL DEL GRUPO TAMBIÉN (4-sep-2026).
 *
 * Daniel, textual sobre ACS: *"Solo me gustaría que las ventas de acs me
 * lleguen solo a mí o por el chat de alertas, ya que ahí no está el celular de
 * la empresa que tiene telegram para ver lo de las fotos, guías, etc."*
 * Y sobre el resumen mensual del grupo: *"este mensaje también lo quiero en
 * alertas de Telegram, no en negocio."* — el mismo motivo: 📊 NEGOCIO es un
 * grupo de tres y ahí no van los números del grupo.
 *
 * El motivo es **privacidad, no que sea una alerta**. El canal 📊 NEGOCIO
 * resultó ser un GRUPO DE TRES (Daniel + el celular de la empresa, que miran
 * bodega y marketing); el de 🔧 SISTEMA es el privado de Daniel. La venta del
 * día se muda al destino privado y todo el resto de 📊 NEGOCIO se queda donde
 * está — Daniel: *"De negocio que me llegue todo. Eso está bien."*
 *
 * Este archivo cierra las TRES formas de romperlo:
 *
 *   1. 🔑 SON DOS LUGARES, NO UNO. El resumen sale del cron de la 01:00 y
 *      TAMBIÉN de la recuperación de switch-reconciliacion (incidente
 *      11-jul-2026: la invocación de la 01:00 se perdió tras una promoción de
 *      deploy). Cambiar sólo el primero deja el resumen RECUPERADO —el que sale
 *      justo cuando algo falló— cayendo en el grupo. Acá se exige que los dos
 *      usen EXACTAMENTE la misma función de envío, para que no puedan
 *      separarse nunca más.
 *
 *   2. NADA DE PREFIJO. `enviarSistema` antepone "🔧 SISTEMA · " para que la
 *      notificación del iPhone se lea sin abrirla. La venta del día NO es una
 *      avería: rotularla así es mentir justo donde ese prefijo existe para no
 *      mentir. Por eso el envío va por `enviarNegocioPrivado`, que comparte el
 *      DESTINO de sistema pero no su marca de agua.
 *
 *   3. LA PROTECCIÓN ANTI-RUIDO SE MUDA CON EL MENSAJE. Ver
 *      `alertas-canal.test.ts` › «NEGOCIO no tiene perilla de silenciar»: ese
 *      candado ahora vigila `enviarNegocio` Y `enviarNegocioPrivado`.
 *
 * VERIFICADO POR MUTACIÓN (2-sep-2026) — cada una pone algo de acá en rojo:
 *   - devolver el route a `enviarNegocio`            → rojo (mismo-destino + route)
 *   - dejar la recuperación en `enviarNegocio`       → rojo (mismo-destino + recuperación)
 *   - ponerle el prefijo "🔧 SISTEMA ·" al resumen   → rojo (sin prefijo)
 *   - CONTROL: mover `catalogos-fotos-resumen` a otro archivo/formato → verde
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Código SIN comentarios. Todo lo de este archivo mira lo que se EJECUTA: una
 * explicación que nombra `enviarNegocio` o escribe el prefijo de sistema para
 * decir por qué NO se usan no puede pintar el candado de rojo — y al revés,
 * tampoco puede taparlo.
 */
function sinComentarios(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ") // bloques /* … */ y JSDoc
    .replace(/^\s*\/\/.*$/gm, " "); // líneas que son sólo comentario
}

const leer = (rel: string) =>
  sinComentarios(fs.readFileSync(path.join(process.cwd(), rel), "utf8"));

const ROUTE_ACS = "src/app/api/cron/acs-resumen-diario/route.ts";
const ROUTE_RECON = "src/app/api/cron/switch-reconciliacion/route.ts";
const ROUTE_MENSUAL = "src/app/api/cron/grupo-resumen-mensual/route.ts";

/** Las tres puertas de salida a Telegram. Ninguna otra existe (ver el barrido). */
const ENVIOS = /\benviar(?:NegocioPrivado|Negocio|Sistema)\s*\(/g;

/** Qué funciones de envío se llaman dentro de un pedazo de código. */
function enviosUsados(codigo: string): string[] {
  return [...new Set((codigo.match(ENVIOS) ?? []).map((m) => m.replace(/\s*\($/, "")))].sort();
}

/**
 * El bloque de recuperación de UN colateral dentro de switch-reconciliacion:
 * desde su `cronName` hasta el `cronName` del colateral siguiente. Acotarlo
 * importa: ese archivo recupera también resúmenes que SÍ siguen en el grupo.
 */
function bloqueRecuperacion(src: string, cron: string): string {
  const desde = src.indexOf(`cronName: "${cron}"`);
  expect(desde, `no encontré el colateral ${cron} en la reconciliación`).toBeGreaterThan(-1);
  const hasta = src.indexOf("cronName:", desde + 10);
  return hasta > desde ? src.slice(desde, hasta) : src.slice(desde);
}
const bloqueRecuperacionAcs = (src: string) => bloqueRecuperacion(src, "acs-resumen-diario");

describe("🔑 los DOS lugares que mandan el resumen ACS apuntan al MISMO destino", () => {
  it("el cron de la 01:00 y la recuperación usan la misma función de envío", () => {
    const enRoute = enviosUsados(leer(ROUTE_ACS));
    const enRecuperacion = enviosUsados(bloqueRecuperacionAcs(leer(ROUTE_RECON)));

    // Cada lado manda por una sola puerta…
    expect(enRoute).toHaveLength(1);
    expect(enRecuperacion).toHaveLength(1);
    // …y tiene que ser LA MISMA. Ésta es la línea que impide que se separen.
    expect(enRecuperacion).toEqual(enRoute);
    // Y esa puerta es la privada.
    expect(enRoute).toEqual(["enviarNegocioPrivado"]);
  });

  it("ninguno de los dos quedó en enviarNegocio (el grupo de tres)", () => {
    expect(leer(ROUTE_ACS)).not.toMatch(/\benviarNegocio\s*\(/);
    expect(bloqueRecuperacionAcs(leer(ROUTE_RECON))).not.toMatch(/\benviarNegocio\s*\(/);
  });

  it("y el import del route trae la función privada, no la del grupo", () => {
    const imports = leer(ROUTE_ACS).match(/import \{[^}]*\} from "@\/lib\/alertas\/canal";/)?.[0] ?? "";
    expect(imports).toContain("enviarNegocioPrivado");
    expect(imports).not.toMatch(/\benviarNegocio\b\s*[,}]/);
  });
});

describe("🔒 el resumen MENSUAL del grupo también va al privado (4-sep-2026)", () => {
  // Daniel: «este mensaje también lo quiero en alertas de Telegram, no en
  // negocio.» Mutación: devolver route o recuperación a `enviarNegocio` → rojo.
  it("el cron del día 1 y su recuperación usan la misma función de envío, y es la privada", () => {
    const enRoute = enviosUsados(leer(ROUTE_MENSUAL));
    const enRecuperacion = enviosUsados(bloqueRecuperacion(leer(ROUTE_RECON), "grupo-resumen-mensual"));
    expect(enRoute).toHaveLength(1);
    expect(enRecuperacion).toHaveLength(1);
    expect(enRecuperacion).toEqual(enRoute);
    expect(enRoute).toEqual(["enviarNegocioPrivado"]);
  });

  it("ninguno de los dos quedó en enviarNegocio (el grupo de tres) ni mete el prefijo de sistema", () => {
    for (const codigo of [leer(ROUTE_MENSUAL), bloqueRecuperacion(leer(ROUTE_RECON), "grupo-resumen-mensual")]) {
      expect(codigo).not.toMatch(/\benviarNegocio\s*\(/);
      expect(codigo).not.toContain("PREFIJO_SISTEMA");
      expect(codigo).not.toMatch(/🔧\s*SISTEMA/);
      expect(codigo).not.toMatch(/\benviarSistema\s*\(/);
    }
  });
});

describe("el resto de 📊 NEGOCIO se queda donde está", () => {
  it("la recuperación del resumen de fotos sigue en enviarNegocio", () => {
    expect(enviosUsados(bloqueRecuperacion(leer(ROUTE_RECON), "catalogos-fotos-resumen"))).toEqual([
      "enviarNegocio",
    ]);
  });

  it("los avisos de negocio de todos los días siguen en el canal del grupo", () => {
    // Muestra de los que Daniel mira desde el celular de la empresa.
    for (const archivo of [
      "src/app/api/cron/guias-pendientes/route.ts",
      "src/app/api/cron/cheques-alert/route.ts",
      "src/app/api/cron/catalogos-fotos-resumen/route.ts",
    ]) {
      expect(enviosUsados(leer(archivo)), archivo).toEqual(["enviarNegocio"]);
    }
  });
});

describe("NADA DE PREFIJO — la venta del día no es una avería", () => {
  it("ninguno de los dos lugares mete el prefijo de sistema en el mensaje", () => {
    for (const codigo of [leer(ROUTE_ACS), bloqueRecuperacionAcs(leer(ROUTE_RECON))]) {
      // Ni la constante, ni el literal pegado a mano.
      expect(codigo).not.toContain("PREFIJO_SISTEMA");
      expect(codigo).not.toMatch(/🔧\s*SISTEMA/);
      expect(codigo).not.toMatch(/\benviarSistema\s*\(/);
    }
  });
});

describe("RUTEO REAL — a dónde cae cada uno", () => {
  const OLD = process.env;
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...OLD, TELEGRAM_BOT_TOKEN: "tok-viejo", TELEGRAM_CHAT_ID: "chat-privado" };
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

  it("con la configuración REAL de producción, el resumen se va del grupo y cae en el privado", async () => {
    // Producción (verificado en Vercel el 2-sep-2026): NEGOCIO tiene bot y chat
    // propios —el grupo de tres— y SISTEMA no tiene ninguna variable, así que
    // cae en el canal de siempre, que es el privado de Daniel.
    process.env.TELEGRAM_BOT_TOKEN_NEGOCIO = "tok-bot-grupo";
    process.env.TELEGRAM_CHAT_ID_NEGOCIO = "-100grupo";

    const enviados = await capturar(async (m) => {
      await m.enviarNegocio("📦 GT-1234 despachada");
      await m.enviarNegocioPrivado("📊 Ventas de hoy: $1.234,00");
      await m.enviarSistema("La base no responde.");
    });

    expect(enviados[0]).toMatchObject({ token: "tok-bot-grupo", chat_id: "-100grupo" });
    // El resumen NO cae donde cae la guía…
    expect(enviados[1].chat_id).not.toBe(enviados[0].chat_id);
    // …sino exactamente donde caen las alertas: el privado.
    expect(enviados[1]).toMatchObject({ token: "tok-viejo", chat_id: "chat-privado" });
    expect(enviados[2].token).toBe(enviados[1].token);
    expect(enviados[2].chat_id).toBe(enviados[1].chat_id);
  });

  it("el texto sale TAL CUAL: sin prefijo, aunque comparta chat con las alertas", async () => {
    const { PREFIJO_SISTEMA } = await import("@/lib/alertas/canal");
    const texto = "📊 Ventas ACS · hoy $1.234,00";
    const [msg] = await capturar((m) => m.enviarNegocioPrivado(texto));
    expect(msg.text).toBe(texto);
    expect(msg.text).not.toContain(PREFIJO_SISTEMA);
  });

  it("sigue el destino de SISTEMA aunque SISTEMA se mude a su propio bot", async () => {
    // Si mañana Daniel le pone bot propio a las alertas, el resumen se va CON
    // ellas: comparten `destinoSistema()`, no una copia del valor.
    process.env.TELEGRAM_BOT_TOKEN_SISTEMA = "tok-sis";
    process.env.TELEGRAM_CHAT_ID_SISTEMA = "chat-sis";
    const [msg] = await capturar((m) => m.enviarNegocioPrivado("hola"));
    expect(msg).toMatchObject({ token: "tok-sis", chat_id: "chat-sis" });
  });
});

describe("BARRIDO GLOBAL — nadie llama sendTelegramAlert directo", () => {
  /**
   * Hasta hoy esta regla sólo tenía candados POR ARCHIVO
   * (asistencia-vigia-hueco, telegram-pedido-origen, monto-guard-candado): tres
   * puntos vigilados de un sistema con más de cien rutas. Y encima seis
   * archivos importaban `sendTelegramAlert` sin usarlo —importación muerta— así
   * que cualquier barrido los habría marcado como falsos positivos. Borradas
   * esas seis líneas, el barrido es limpio y se puede hacer general.
   */
  const raiz = path.join(process.cwd(), "src");
  const PERMITIDO = path.join("lib", "alertas", "canal.ts");

  function archivosFuente(dir: string, acc: string[] = []): string[] {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "__tests__" || e.name === "node_modules") continue;
        archivosFuente(p, acc);
      } else if (/\.tsx?$/.test(e.name)) {
        acc.push(p);
      }
    }
    return acc;
  }

  it("el único archivo que importa sendTelegramAlert es lib/alertas/canal.ts", () => {
    const culpables = archivosFuente(raiz).filter((p) => {
      if (p.endsWith(PERMITIDO)) return false;
      // Sólo importaciones: las menciones en comentarios son documentación.
      const src = sinComentarios(fs.readFileSync(p, "utf8"));
      return /import[^;]*\bsendTelegramAlert\b[^;]*from\s*["']@?\/?[^"']*telegram["']/.test(src);
    });
    expect(culpables.map((p) => path.relative(process.cwd(), p))).toEqual([]);
  });

  it("y nadie lo LLAMA fuera de canal.ts y de su propia definición", () => {
    const culpables = archivosFuente(raiz).filter((p) => {
      if (p.endsWith(PERMITIDO) || p.endsWith(path.join("lib", "telegram.ts"))) return false;
      return /\bsendTelegramAlert\s*\(/.test(sinComentarios(fs.readFileSync(p, "utf8")));
    });
    expect(culpables.map((p) => path.relative(process.cwd(), p))).toEqual([]);
  });
});

/** Lo que Telegram recibiría: a qué bot (token de la URL) y a qué chat. */
type Envio = { token: string; chat_id: string; text: string };

/** Corre `fn` con `fetch` interceptado y devuelve los POST que habrían salido. */
async function capturar(
  fn: (m: typeof import("@/lib/alertas/canal")) => Promise<unknown>,
): Promise<Envio[]> {
  const enviados: Envio[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: { body: string }) => {
      const token = /\/bot([^/]+)\/sendMessage/.exec(url)?.[1] ?? "";
      const body = JSON.parse(init.body) as { chat_id: string; text: string };
      enviados.push({ token, ...body });
      return { ok: true, text: async () => "" } as Response;
    }),
  );
  const mod = await import("@/lib/alertas/canal");
  await fn(mod);
  return enviados;
}
