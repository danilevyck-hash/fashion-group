// ─────────────────────────────────────────────────────────────────────────────
// 🔴 «PAUSAR SWITCH» (26-nov-2026, Daniel). Candado de:
//   A. las reglas puras (máximo 24 h, textos en hora de Panamá, gracia),
//   B. el FRENO: en pausa ni el API (con token) ni el panel web salen a la red,
//   C. el BARRIDO: nadie más que `client.ts` y `web-client.ts` habla con
//      Switch, y las dos puertas llaman al freno antes de su `fetch`,
//   D. los crons de Switch arrancan preguntando por la pausa,
//   E. lo que corta la pausa no es una avería (ni 🔧 SISTEMA ni racha),
//   F. un pedido confirmado en pausa queda EN ESPERA, no en «error».
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import path from "path";

vi.mock("@/lib/catalogo/pedidos-en-espera", () => ({
  TABLA_EN_ESPERA: "switch_pausa_pedidos",
  encolarPedidoEnEspera: vi.fn(async () => undefined),
}));

import {
  CRONS_DE_SWITCH,
  SwitchEnPausaError,
  esCronDeSwitch,
  esErrorDePausa,
  hastaTexto,
  pausaActiva,
  pausaEnGracia,
  textoPausa,
  validarHoras,
  type PausaSwitch,
} from "@/lib/switch-api/pausa";
import { _fijarPausaParaPruebas } from "@/lib/switch-api/pausa-io";
import { createSwitchClient } from "@/lib/switch-api/client";
import { loginSwitchWeb } from "@/lib/switch-api/web-client";
import { enviarPedidoSwitch } from "@/lib/catalogo/switch-envio";
import { motivoSinEnvio } from "@/lib/catalogo/envio-en-segundo-plano";
import { encolarPedidoEnEspera } from "@/lib/catalogo/pedidos-en-espera";

const SRC = path.resolve(__dirname, "../..");
const leer = (rel: string) => readFileSync(path.join(SRC, rel), "utf8");

// 10:00 a. m. de Panamá = 15:00 UTC.
const AHORA = Date.parse("2026-11-26T15:00:00Z");
const pausa = (horas: number, extra: Partial<PausaSwitch> = {}): PausaSwitch => ({
  id: 1,
  pausadoPor: "daniel",
  desde: new Date(AHORA - 60_000).toISOString(),
  hasta: new Date(AHORA + horas * 3_600_000).toISOString(),
  reanudadaEn: null,
  ...extra,
});

describe("A. reglas puras", () => {
  it("valida las horas: entero o decimal, máximo 24", () => {
    expect(validarHoras("1")).toEqual({ ok: true, horas: 1 });
    expect(validarHoras("1,5")).toEqual({ ok: true, horas: 1.5 });
    expect(validarHoras(24)).toEqual({ ok: true, horas: 24 });
    expect(validarHoras("24.5")).toEqual({ ok: false, error: "Máximo 24 horas." });
    expect(validarHoras(48)).toEqual({ ok: false, error: "Máximo 24 horas." });
    expect(validarHoras("abc").ok).toBe(false);
    expect(validarHoras(0).ok).toBe(false);
  });

  it("dice hasta cuándo en hora de Panamá", () => {
    expect(hastaTexto(new Date(AHORA + 5 * 3_600_000).toISOString(), AHORA)).toBe("hasta las 3:00 p. m.");
    expect(hastaTexto(new Date(AHORA + 20 * 3_600_000).toISOString(), AHORA)).toBe("hasta mañana a las 6:00 a. m.");
    expect(textoPausa(pausa(5), AHORA)).toBe("Switch en pausa hasta las 3:00 p. m.");
  });

  it("activa hasta el plazo o hasta «Reanudar ahora»; después, gracia de 26 h", () => {
    expect(pausaActiva(pausa(2), AHORA)).toBe(true);
    expect(pausaActiva(pausa(2), AHORA + 3 * 3_600_000)).toBe(false);
    const reanudada = pausa(2, { reanudadaEn: new Date(AHORA - 1000).toISOString() });
    expect(pausaActiva(reanudada, AHORA)).toBe(false);
    expect(pausaEnGracia(reanudada, AHORA)).toBe(true);
    expect(pausaEnGracia(reanudada, AHORA + 27 * 3_600_000)).toBe(false);
    expect(pausaEnGracia(null, AHORA)).toBe(false);
  });

  it("los slots de switch-sync cuentan como crons de Switch; los demás no", () => {
    expect(esCronDeSwitch("switch-sync:facturas-1150")).toBe(true);
    expect(esCronDeSwitch("sync-recibos")).toBe(true);
    expect(esCronDeSwitch("cheques-alert")).toBe(false);
    expect(esCronDeSwitch("asistencia-vigia")).toBe(false);
  });
});

describe("B. el freno: en pausa nada sale a la red", () => {
  const fetchOriginal = globalThis.fetch;
  const fetchFalso = vi.fn(async () => new Response("{}", { status: 200 }));
  beforeEach(() => {
    vi.useFakeTimers({ now: AHORA, toFake: ["Date"] });
    _fijarPausaParaPruebas(pausa(5));
    globalThis.fetch = fetchFalso as unknown as typeof fetch;
    fetchFalso.mockClear();
    for (const k of ["URL", "USER", "PASSWORD"]) process.env[`SWITCH_VISTANA_INTERNATIONAL_API_${k}`] = "x";
    process.env.SWITCH_VISTANA_INTERNATIONAL_API_URL = "https://ejemplo.invalid";
    process.env.SWITCH_VISTANA_INTERNATIONAL_WEB_USER = "x";
    process.env.SWITCH_VISTANA_INTERNATIONAL_WEB_PASSWORD = "x";
  });
  afterEach(() => {
    vi.useRealTimers();
    _fijarPausaParaPruebas(undefined);
    globalThis.fetch = fetchOriginal;
  });

  it("API con token: ni /autenticacion ni la lectura", async () => {
    await expect(createSwitchClient("vistana").listSucursales()).rejects.toBeInstanceOf(SwitchEnPausaError);
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("panel web: no se abre el login (changesession=SI expulsa a Daniel)", async () => {
    await expect(loginSwitchWeb("vistana")).rejects.toBeInstanceOf(SwitchEnPausaError);
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it("sin pausa, el freno deja pasar", async () => {
    _fijarPausaParaPruebas(null);
    await createSwitchClient("vistana").listSucursales().catch(() => undefined);
    expect(fetchFalso).toHaveBeenCalled();
  });
});

describe("C. barrido: todo camino a Switch pasa por el freno", () => {
  function archivos(dir: string): string[] {
    return readdirSync(dir).flatMap((n) => {
      const p = path.join(dir, n);
      if (statSync(p).isDirectory()) return n === "__tests__" ? [] : archivos(p);
      return /\.(ts|tsx)$/.test(n) ? [p] : [];
    });
  }
  // Sin comentarios: hablar de `/autenticacion` en un comentario no es entrar.
  const sinComentarios = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const todos = archivos(SRC).map((p) => ({ rel: path.relative(SRC, p), txt: sinComentarios(readFileSync(p, "utf8")) }));
  const PUERTAS = ["lib/switch-api/client.ts", "lib/switch-api/web-client.ts"];

  it("solo las dos puertas leen la URL de Switch o hacen login", () => {
    const fuera = todos.filter(
      (f) =>
        !PUERTAS.includes(f.rel) &&
        f.rel !== "lib/switch-api/types.ts" &&
        /process\.env\[`SWITCH_\$\{[^}]+\}_(API_URL|WEB_USER|API_USER)`\]|["'`]\/autenticacion["'`]|["'`][^"'`]*\/users\/login["'`]|switch-soft\.com/.test(f.txt),
    );
    expect(fuera.map((f) => f.rel)).toEqual([]);
  });

  it("rawCall y webFetch llaman al freno ANTES de su fetch", () => {
    const cuerpo = (txt: string, fn: string) => txt.slice(txt.indexOf(`async function ${fn}(`)).split("\n}\n")[0];
    for (const [rel, fn] of [["lib/switch-api/client.ts", "rawCall"], ["lib/switch-api/web-client.ts", "webFetch"]]) {
      const b = cuerpo(leer(rel), fn);
      const freno = b.indexOf("await frenoDePausaSwitch()");
      expect(freno, `${rel} › ${fn}`).toBeGreaterThan(-1);
      expect(freno).toBeLessThan(b.indexOf("fetch("));
    }
    // Y no hay otro fetch en las puertas fuera de esas dos funciones.
    for (const rel of PUERTAS) expect((leer(rel).match(/await fetch\(/g) ?? []).length).toBeLessThanOrEqual(2);
  });

  it("la fila del registro de syncs tampoco nace en pausa", () => {
    const t = leer("lib/switch-api/sync-log.ts");
    const b = t.slice(t.indexOf("export async function createSwitchSyncLog"));
    expect(b.indexOf("await frenoDePausaSwitch()")).toBeGreaterThan(-1);
    expect(b.indexOf("await frenoDePausaSwitch()")).toBeLessThan(b.indexOf(".insert("));
  });
});

describe("D. cada cron de Switch arranca preguntando por la pausa", () => {
  const CRON_DIR = path.join(SRC, "app/api/cron");
  // Importan algo de Switch pero no le hablan (o degradan solos): con razón.
  const EXENTOS: Record<string, string> = {
    "cleanup-sessions": "solo suelta candados de switch_sync_log",
    "sync-clientes-master": "lee switch_clientes de la base, no a Switch",
    "cobros-del-dia": "si Switch no contesta, el mensaje dice «+90 sin actualizar»",
  };

  it.each([...CRONS_DE_SWITCH])("%s", (cron) => {
    const t = readFileSync(path.join(CRON_DIR, cron, "route.ts"), "utf8");
    expect(t).toContain(`await respuestaSiSwitchEnPausa("${cron}")`);
  });

  it("ningún cron que use Switch queda fuera de la lista", () => {
    const usan = readdirSync(CRON_DIR).filter((d) => {
      const p = path.join(CRON_DIR, d, "route.ts");
      return existsSync(p) && /@\/lib\/switch-api\/(client|web-client|sync-|pausa-cron)|@\/lib\/cxc\/cobros-del-dia-io/.test(readFileSync(p, "utf8"));
    });
    const faltan = usan.filter((d) => !(CRONS_DE_SWITCH as readonly string[]).includes(d) && !EXENTOS[d]);
    expect(faltan).toEqual([]);
  });
});

describe("E. la pausa no es una avería", () => {
  it("el error de pausa se reconoce por tipo y por su marca en el mensaje", () => {
    const e = new SwitchEnPausaError(pausa(5));
    expect(esErrorDePausa(e)).toBe(true);
    expect(esErrorDePausa(e.message)).toBe(true);
    expect(esErrorDePausa(new Error("HTTP 500"))).toBe(false);
  });

  it("la política de alertas y la racha lo descartan", () => {
    const t = leer("lib/switch-api/alert-policy.ts");
    expect(t).toContain("errores.filter((x) => !esErrorDePausa(x.error))");
    expect(t).toContain("!esErrorDePausa(r.error_message");
  });
});

describe("F. pedido confirmado en pausa: en espera, nunca «error»", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: AHORA, toFake: ["Date"] });
    _fijarPausaParaPruebas(pausa(5));
    vi.mocked(encolarPedidoEnEspera).mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
    _fijarPausaParaPruebas(undefined);
  });

  const db = {
    from: () => ({
      select: () => ({ eq: () => ({ neq: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }),
    }),
  };
  const params = (dry = false) => ({
    empresaKey: "fashion_shoes",
    enviosTable: "tommy_switch_envios",
    db: db as never,
    orderId: "00000000-0000-0000-0000-000000000001",
    orderNumber: "TOM-100",
    marcaLabel: "Tommy Hilfiger",
    items: [{ product_id: "p1", sku: "A1", name: "x", quantity: 1, unit_price: 10 }],
    bultoSize: () => 1,
    categoryByProduct: new Map<string, string>(),
    bultoPzasByProduct: new Map<string, number | null>(),
    clienteId: 5,
    vendedorId: 2,
    dry,
  });

  it("queda en espera con su documento y no se anota como fallido", async () => {
    const r = await enviarPedidoSwitch({ ...params(), documento: "cotizacion" });
    expect(r.kind).toBe("en_pausa");
    expect(encolarPedidoEnEspera).toHaveBeenCalledWith(
      expect.objectContaining({ enviosTable: "tommy_switch_envios", orderNumber: "TOM-100", documento: "cotizacion" }),
    );
    expect(motivoSinEnvio(r)).toBeNull(); // ni fila «error» ni 🔧 SISTEMA
  });

  it("una vista previa (dry) no deja nada en espera", async () => {
    const r = await enviarPedidoSwitch(params(true));
    expect(r.kind).toBe("en_pausa");
    expect(encolarPedidoEnEspera).not.toHaveBeenCalled();
  });
});
