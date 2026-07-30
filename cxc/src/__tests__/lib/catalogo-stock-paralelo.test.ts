/**
 * CANDADO — el sync de catálogo pide `/apiarticulos/stock` en paralelo, y eso
 * solo es seguro si UN solo login sale por empresa.
 *
 * 🩸 EL PROBLEMA MEDIDO (30-jul-2026). El cron `tommy-catalogo` era el más largo
 * del sistema: **395-485 s contra un techo de función de 800 s**, o sea ~40% de
 * margen. Medido fase por fase con datos de producción
 * (`scripts/_medir-tommy-catalogo.ts`):
 *
 *   login ....................  ~3 s
 *   /apiarticulos/lista ......  17 s   (14 páginas de 50)
 *   /apiarticulos/stock ...... 432 s   **478 llamadas, una por artículo → 72%**
 *   UPDATE a Supabase ........ 125 s   (490 filas → 21%)
 *
 * Es la MISMA forma que tenía el sync de Boston antes del #361 (4.912 llamadas,
 * 54 min). La diferencia es que la salida de Boston —reemplazar las llamadas por
 * un reporte masivo del panel web— acá **no existe**, y eso está medido, no
 * supuesto (`scripts/_probe-tommy-alternativas.ts`):
 *   · `/apiarticulos/lista` devuelve 26 campos y NINGUNO es el saldo. Trae
 *     `disponible`, que no sirve: la regla del catálogo es por EXISTENCIA.
 *   · `/apiarticulos/stock` sin `articuloId` (o con vacío / 0 / -1) responde
 *     **200 con body vacío**, que en Switch significa "esa forma no existe".
 *
 * Así que no se bajó el NÚMERO de llamadas: se bajó el tiempo de pared. Medido
 * de punta a punta con el código real (`scripts/_medir-tommy-dryrun.ts`, dos
 * corridas consecutivas en la misma red, mismas 478 llamadas):
 *
 *   en serie ....... 471,2 s → 41% de margen
 *   en paralelo ×4 . 114,1 s → 86% de margen      **4,1× más rápido**
 *
 * 🔴 **POR QUÉ ESTE TEST EXISTE Y NO ALCANZA CON "anda más rápido".** Switch
 * admite **UNA SOLA SESIÓN por empresa**: cada `POST /autenticacion` invalida el
 * token anterior (code 0006). `getToken` no tenía de-dup, así que N llamadas
 * concurrentes que encontraran el token vencido habrían disparado N logins
 * simultáneos y se habrían matado el token entre sí — la tanda entera cayendo en
 * cascada. Mientras TODO fue serial eso era imposible; desde que hay paralelismo,
 * no. El de-dup (`loginEnVuelo` en client.ts) es lo que hace segura la
 * concurrencia, y estos tests lo fijan en las dos direcciones.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

import { createSwitchClient } from "@/lib/switch-api/client";
import { enParalelo } from "@/lib/switch-api/en-paralelo";

// ─────────────────────────────────────────────────────────────────────────────
// enParalelo — orden, límite y fail-safe
// ─────────────────────────────────────────────────────────────────────────────

describe("enParalelo", () => {
  it("devuelve los resultados EN EL ORDEN DE ENTRADA, no en el de llegada", async () => {
    // El más lento va primero a propósito: si el resultado se armara por orden
    // de llegada, este test lo cazaría.
    const demoras = [50, 5, 30, 1, 20];
    const out = await enParalelo(demoras, 3, async (ms, i) => {
      await new Promise((r) => setTimeout(r, ms));
      return i;
    });
    expect(out).toEqual([0, 1, 2, 3, 4]);
  });

  it("nunca tiene más de `limite` llamadas en vuelo", async () => {
    let enVuelo = 0;
    let pico = 0;
    await enParalelo(Array.from({ length: 30 }, (_, i) => i), 4, async () => {
      enVuelo++;
      pico = Math.max(pico, enVuelo);
      await new Promise((r) => setTimeout(r, 5));
      enVuelo--;
      return null;
    });
    expect(pico).toBeLessThanOrEqual(4);
    // Y que de verdad haya paralelizado (si no, este candado no probaría nada).
    expect(pico).toBeGreaterThan(1);
  });

  it("el PRIMER error se propaga — el fail-safe del motor depende de eso", async () => {
    // syncCatalogo junta todos los /stock ANTES de escribir: una sola llamada
    // fallida tiene que tumbar la empresa entera sin tocar el catálogo.
    await expect(
      enParalelo([1, 2, 3, 4, 5, 6], 3, async (n) => {
        if (n === 4) throw new Error("Switch 401");
        return n;
      }),
    ).rejects.toThrow("Switch 401");
  });

  it("no revienta con lista vacía ni con límite mayor que la lista", async () => {
    expect(await enParalelo([], 4, async () => 1)).toEqual([]);
    expect(await enParalelo([1, 2], 99, async (n) => n * 2)).toEqual([2, 4]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// loginEnVuelo — UN login por empresa aunque haya N llamadas a la vez
// ─────────────────────────────────────────────────────────────────────────────

const BASE = "https://switch.test";
const EMPRESA = "concurco";
const OTRA = "concurdos";

let llamadas: string[] = [];
/** Qué responde /autenticacion. Se cambia por test. */
let authResponde: () => { status: number; body: unknown } = () => ({
  status: 200,
  body: { data: { token: "TOKEN_A", expires_in: 60 } },
});

function envDe(key: string) {
  process.env[`SWITCH_${key.toUpperCase()}_API_URL`] = BASE;
  process.env[`SWITCH_${key.toUpperCase()}_API_USER`] = "u";
  process.env[`SWITCH_${key.toUpperCase()}_API_PASSWORD`] = "p";
}

const logins = () => llamadas.filter((u) => u.includes("/autenticacion"));

beforeEach(() => {
  llamadas = [];
  envDe(EMPRESA);
  envDe(OTRA);
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});

  // Stub por URL (no por cola): con llamadas concurrentes el orden no es fijo.
  vi.stubGlobal("fetch", async (url: string) => {
    const u = String(url);
    llamadas.push(u);
    if (u.includes("/autenticacion")) {
      // Demora real: sin esto los logins se resolverían antes de que salga el
      // segundo y el test pasaría aunque no hubiera de-dup.
      await new Promise((r) => setTimeout(r, 20));
      const r = authResponde();
      return { status: r.status, text: async () => JSON.stringify(r.body) } as unknown as Response;
    }
    return {
      status: 200,
      text: async () => JSON.stringify({ data: { stock: [] } }),
    } as unknown as Response;
  });

  createSwitchClient(EMPRESA).clearTokenCache();
  createSwitchClient(OTRA).clearTokenCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  authResponde = () => ({ status: 200, body: { data: { token: "TOKEN_A", expires_in: 60 } } });
  createSwitchClient(EMPRESA).clearTokenCache();
  createSwitchClient(OTRA).clearTokenCache();
});

describe("Sesión única bajo concurrencia", () => {
  it("8 llamadas a la vez con la caché fría → UN SOLO /autenticacion", async () => {
    // Sin de-dup salen 8 logins, y en Switch el 2º mata al 1º (code 0006):
    // la tanda entera se quedaría con tokens muertos.
    const client = createSwitchClient(EMPRESA);
    await Promise.all(Array.from({ length: 8 }, (_, i) => client.getStock(i + 1)));

    expect(logins()).toHaveLength(1);
    expect(llamadas.filter((u) => u.includes("/apiarticulos/stock"))).toHaveLength(8);
  });

  it("dos EMPRESAS distintas sí autentican cada una por su lado", async () => {
    // El de-dup es por empresa: son dos sesiones distintas y bloquearse entre
    // ellas sería un bug nuevo (serializaría empresas que no compiten).
    await Promise.all([
      createSwitchClient(EMPRESA).getStock(1),
      createSwitchClient(OTRA).getStock(1),
    ]);
    expect(logins()).toHaveLength(2);
  });

  it("un login FALLIDO no deja la empresa condenada: la próxima reintenta", async () => {
    // Si la promesa en vuelo quedara pegada, un login fallido dejaría a la
    // empresa devolviendo el mismo rechazo para siempre.
    let intentos = 0;
    // 400 a propósito: un 4xx de DATOS no es transitorio, así que no dispara el
    // backoff de reintentos y el test no depende de esperas de segundos.
    authResponde = () => {
      intentos++;
      return intentos === 1
        ? { status: 400, body: { error: { code: "0003", message: "CREDENCIALES" } } }
        : { status: 200, body: { data: { token: "TOKEN_OK", expires_in: 60 } } };
    };

    const client = createSwitchClient(EMPRESA);
    await expect(client.getStock(1)).rejects.toThrow();
    // …y la siguiente vuelve a intentar en vez de heredar el rechazo viejo.
    await expect(client.getStock(2)).resolves.toBeTruthy();
    expect(intentos).toBe(2);
  });

  it("con el token YA cacheado, N llamadas concurrentes no loguean de nuevo", async () => {
    const client = createSwitchClient(EMPRESA);
    await client.getStock(1); // calienta
    llamadas = [];
    await Promise.all(Array.from({ length: 6 }, (_, i) => client.getStock(i + 1)));
    expect(logins()).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// El candado que ata las dos piezas
// ─────────────────────────────────────────────────────────────────────────────

describe("La concurrencia no puede existir sin el de-dup de login", () => {
  const raiz = join(__dirname, "..", "..");
  const motor = readFileSync(join(raiz, "lib/switch-api/sync-catalogo.ts"), "utf8");
  const client = readFileSync(join(raiz, "lib/switch-api/client.ts"), "utf8");

  it("si STOCK_CONCURRENCIA > 1, client.ts TIENE que deduplicar el login", () => {
    const m = motor.match(/const STOCK_CONCURRENCIA = (\d+);/);
    expect(m, "no encontré STOCK_CONCURRENCIA").toBeTruthy();
    const n = Number(m![1]);
    expect(n).toBeGreaterThanOrEqual(1);
    if (n > 1) {
      expect(
        client,
        "sync-catalogo pide /stock en paralelo pero client.ts no deduplica el " +
          "login: N llamadas con el token vencido dispararían N /autenticacion y " +
          "Switch (sesión única) mataría la sesión en cada uno.",
      ).toContain("loginEnVuelo");
      // Y el de-dup tiene que limpiarse SIEMPRE, o un login fallido deja la
      // promesa rechazada pegada para toda la vida del proceso.
      expect(client).toMatch(/loginEnVuelo\.delete\(empresaKey\)/);
    }
  });

  it("las EMPRESAS se siguen recorriendo en serie (sesión única de Switch)", () => {
    // Lo que se paraleliza son las llamadas DENTRO de una empresa, que comparten
    // un solo token. Paralelizar empresas sí abriría dos sesiones a la vez.
    expect(motor).toMatch(/for \(const emp of config\.empresas\)/);
  });

  it("el /stock sigue juntándose ANTES de escribir (read-all-then-write)", () => {
    const iStock = motor.indexOf("await enParalelo(stockSet");
    const iWrite = motor.indexOf("// (4) WRITE");
    expect(iStock).toBeGreaterThan(-1);
    expect(iWrite).toBeGreaterThan(iStock);
  });
});
