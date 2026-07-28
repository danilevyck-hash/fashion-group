/**
 * "No me avises al primer fallo — avisame cuando ya van 2" (28-jul-2026).
 *
 * Pedido de Daniel, textual: *"quiero q un error de crones me avise si no paso
 * de 2 en adelante, no cada vez porq aveces se recupera y es en vano"*.
 *
 * Este archivo es el candado de esa regla, y está escrito en las DOS
 * direcciones a propósito: lo que tiene que CALLARSE **y** lo que tiene que
 * seguir sonando. Silenciar de más es peor que avisar de más —el mismo día de
 * este cambio había un caso de cheques rotos 3 meses y medio en silencio—, así
 * que la mitad de los casos de acá existen para que la regla nueva no abra un
 * agujero.
 *
 * El caso REAL que lo disparó (27-jul 23:11 UTC, medido contra producción) está
 * al final, con las fechas y los pares tal como ocurrieron.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const enviarSistemaMock = vi.hoisted(() => vi.fn(async (_texto: string) => true));
const logCronErrorMock = vi.hoisted(() => vi.fn(async () => {}));
/** Filas que devolverá la consulta a switch_sync_log, por par "empresa|tipo". */
const logPorPar = vi.hoisted(() => new Map<string, unknown[]>());
/** Si es true, la consulta al log responde con error (caso `lectura-fallo`). */
const lecturaRota = vi.hoisted(() => ({ valor: false }));

vi.mock("@/lib/alertas/canal", () => ({ enviarSistema: enviarSistemaMock }));
vi.mock("@/lib/cron-telemetry", () => ({ logCronError: logCronErrorMock }));
vi.mock("@/lib/telegram", () => ({
  sendTelegramAlert: vi.fn(),
  shortError: (s: string) => s,
}));

// Doble mínimo de PostgREST: encadena .eq/.neq/.order/.limit y resuelve con las
// filas del par pedido. Guarda empresa_key/sync_type de los .eq para saber cuál.
vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: {
    from: () => {
      const filtros: Record<string, string> = {};
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (col: string, val: string) => {
          filtros[col] = val;
          return chain;
        },
        neq: () => chain,
        order: () => chain,
        limit: () => {
          if (lecturaRota.valor) return Promise.resolve({ data: null, error: { message: "boom" } });
          const key = `${filtros.empresa_key}|${filtros.sync_type}`;
          return Promise.resolve({ data: logPorPar.get(key) ?? [], error: null });
        },
      };
      return chain;
    },
  },
}));

import { alertSwitchCronErrors, evaluateSwitchEscalation } from "@/lib/switch-api/alert-policy";

const err = (started_at: string, error_message: string) => ({
  status: "error",
  started_at,
  error_message,
});
const ok = (started_at: string) => ({ status: "success", started_at, error_message: null });

/** Error real de producción del 27-jul: la base tosió y el INSERT del log falló. */
const ERR_LOG = "No pude crear switch_sync_log: vacío";
const ERR_401 = "/apifactura → HTTP 401: TOKEN INVALIDO";
const ERR_TIMEOUT = "UPSERT falló: canceling statement due to statement timeout";

/** El texto que salió al celular, o null si no salió ninguno. */
const mensaje = (): string | null =>
  enviarSistemaMock.mock.calls.length ? String(enviarSistemaMock.mock.calls[0][0]) : null;

beforeEach(() => {
  enviarSistemaMock.mockClear();
  logCronErrorMock.mockClear();
  logPorPar.clear();
  lecturaRota.valor = false;
});

describe("un fallo aislado seguido de éxito NO avisa", () => {
  it("primera corrida fallida (la anterior fue bien) → silencio", async () => {
    logPorPar.set("vistana|facturas", [err("2026-07-27T23:11:00Z", ERR_TIMEOUT), ok("2026-07-27T21:00:00Z")]);
    await alertSwitchCronErrors("switch-sync", [
      { empresaKey: "vistana", syncType: "facturas", error: ERR_TIMEOUT },
    ]);
    expect(enviarSistemaMock).not.toHaveBeenCalled();
  });

  it("…pero el fallo NO se pierde: queda persistido con el motivo escrito", async () => {
    logPorPar.set("vistana|facturas", [err("2026-07-27T23:11:00Z", ERR_TIMEOUT), ok("2026-07-27T21:00:00Z")]);
    await alertSwitchCronErrors("switch-sync", [
      { empresaKey: "vistana", syncType: "facturas", error: ERR_TIMEOUT },
    ]);
    expect(logCronErrorMock).toHaveBeenCalledTimes(1);
    const [, texto, , opts] = logCronErrorMock.mock.calls[0] as unknown as [string, string, null, { telegram: boolean }];
    expect(texto).toContain("primer-fallo");
    expect(texto).toContain("vistana/facturas");
    expect(opts.telegram).toBe(false); // se guarda, no se manda
  });

  it("la racha se REINICIA tras un éxito: fallo → éxito → fallo NO avisa", async () => {
    logPorPar.set("joystep|recibos", [
      err("2026-07-27T23:00:00Z", ERR_401),
      ok("2026-07-27T19:00:00Z"), // el éxito del medio borra la racha anterior
      err("2026-07-27T15:00:00Z", ERR_401),
    ]);
    const r = await evaluateSwitchEscalation("joystep", "recibos");
    expect(r.streak).toBe(1);
    expect(r.escalate).toBe(false);
    expect(r.motivo).toBe("primer-fallo");
  });
});

describe("dos fallos seguidos SÍ avisan, y el mensaje dice que van 2", () => {
  beforeEach(() => {
    logPorPar.set("fashion_wear|estadocuenta", [
      err("2026-07-27T21:15:00Z", ERR_401),
      err("2026-07-27T16:05:00Z", ERR_401),
      ok("2026-07-27T05:35:00Z"),
    ]);
  });

  it("avisa", async () => {
    await alertSwitchCronErrors("switch-sync", [
      { empresaKey: "fashion_wear", syncType: "estadocuenta", error: ERR_401 },
    ]);
    expect(enviarSistemaMock).toHaveBeenCalledTimes(1);
  });

  it("y el texto dice CUÁNTAS van y desde cuándo — no solo 'falló'", async () => {
    await alertSwitchCronErrors("switch-sync", [
      { empresaKey: "fashion_wear", syncType: "estadocuenta", error: ERR_401 },
    ]);
    const t = mensaje()!;
    expect(t).toContain("van 2 corridas seguidas");
    expect(t).toMatch(/desde .*jul/); // fecha en hora Panamá
    expect(t).toContain("no se está recuperando sola");
    // Y sigue diciendo qué significa para el negocio y qué hacer.
    expect(t).toContain("Cuentas por Cobrar");
    expect(t).toContain("Qué hacer:");
  });

  it("tres fallos seguidos dicen 3, no 2 (el conteo es real)", async () => {
    logPorPar.set("fashion_wear|estadocuenta", [
      err("2026-07-27T21:15:00Z", ERR_401),
      err("2026-07-27T16:05:00Z", ERR_TIMEOUT), // otra clase de error: no corta
      err("2026-07-27T05:35:00Z", ERR_401),
      ok("2026-07-26T21:15:00Z"),
    ]);
    await alertSwitchCronErrors("switch-sync", [
      { empresaKey: "fashion_wear", syncType: "estadocuenta", error: ERR_401 },
    ]);
    expect(mensaje()).toContain("van 3 corridas seguidas");
  });
});

describe("fallos de empresas DISTINTAS no cuentan como racha", () => {
  it("vistana falla una vez y joystep falla una vez → ninguna alerta", async () => {
    // Cada par con su propia historia: la anterior de cada uno fue un success.
    logPorPar.set("vistana|facturas", [err("2026-07-27T23:11:00Z", ERR_401), ok("2026-07-27T21:00:00Z")]);
    logPorPar.set("joystep|facturas", [err("2026-07-27T23:11:00Z", ERR_401), ok("2026-07-27T21:00:00Z")]);
    await alertSwitchCronErrors("switch-sync", [
      { empresaKey: "vistana", syncType: "facturas", error: ERR_401 },
      { empresaKey: "joystep", syncType: "facturas", error: ERR_401 },
    ]);
    expect(enviarSistemaMock).not.toHaveBeenCalled();
  });

  it("tampoco cuentan dos TIPOS distintos de la misma empresa", async () => {
    // vistana/facturas y vistana/estadocuenta son trabajos distintos: que cada
    // uno falle una vez no es "el mismo problema repitiéndose".
    logPorPar.set("vistana|facturas", [err("2026-07-27T23:11:00Z", ERR_401), ok("2026-07-27T21:00:00Z")]);
    logPorPar.set("vistana|estadocuenta", [err("2026-07-27T23:11:00Z", ERR_401), ok("2026-07-27T21:00:00Z")]);
    await alertSwitchCronErrors("switch-sync", [
      { empresaKey: "vistana", syncType: "facturas", error: ERR_401 },
      { empresaKey: "vistana", syncType: "estadocuenta", error: ERR_401 },
    ]);
    expect(enviarSistemaMock).not.toHaveBeenCalled();
  });

  it("pero si DOS pares distintos ya van por su 2ª, sale UN solo mensaje con los dos", async () => {
    // Tres notificaciones seguidas diciendo lo mismo se leen peor que una con
    // tres renglones.
    logPorPar.set("vistana|facturas", [err("2026-07-27T23:11:00Z", ERR_401), err("2026-07-27T21:00:00Z", ERR_401), ok("2026-07-27T19:00:00Z")]);
    logPorPar.set("joystep|facturas", [err("2026-07-27T23:11:00Z", ERR_401), err("2026-07-27T21:00:00Z", ERR_401), ok("2026-07-27T19:00:00Z")]);
    await alertSwitchCronErrors("switch-sync", [
      { empresaKey: "vistana", syncType: "facturas", error: ERR_401 },
      { empresaKey: "joystep", syncType: "facturas", error: ERR_401 },
    ]);
    expect(enviarSistemaMock).toHaveBeenCalledTimes(1);
    const t = mensaje()!;
    expect(t).toContain("2 sincronizaciones");
    expect(t).toContain("Vistana");
    expect(t).toContain("Joystep");
  });
});

describe("la regla NO puede abrir un agujero de silencio", () => {
  it("un par SIN ninguna fila en el log avisa igual (fail-open)", async () => {
    // Caso real: american_classic/articulos falló el 5, 8 y 10-jul sin una sola
    // fila previa. Si su logging está roto, la racha nunca va a poder medir y
    // callarlo sería callarlo para siempre.
    logPorPar.set("american_classic|articulos", []);
    const r = await evaluateSwitchEscalation("american_classic", "articulos");
    expect(r.motivo).toBe("sin-historia");
    expect(r.escalate).toBe(true);
  });

  it("si no se puede LEER el log, avisa igual (fail-open)", async () => {
    lecturaRota.valor = true;
    const r = await evaluateSwitchEscalation("vistana", "facturas");
    expect(r.motivo).toBe("lectura-fallo");
    expect(r.escalate).toBe(true);
  });

  it("y en esos dos casos el texto NO inventa un número de corridas", async () => {
    logPorPar.set("american_classic|articulos", []);
    await alertSwitchCronErrors("switch-articulos", [
      { empresaKey: "american_classic", syncType: "articulos", error: ERR_401 },
    ]);
    const t = mensaje()!;
    expect(t).toContain("no pude confirmar si ya venía fallando");
    expect(t).not.toMatch(/van \d+ corridas/);
  });

  it("LICENCIA NO ACTIVA sigue avisando al PRIMER fallo (no se arregla sola)", async () => {
    const licencia = "Auth fallo: HTTP 400 — LICENCIA NO SE ENCUENTRA ACTIVA";
    // Historia impecable: sin la excepción, esto se callaría como primer fallo.
    logPorPar.set("confecciones_boston|facturas", [
      err("2026-07-27T07:13:00Z", licencia),
      ok("2026-07-26T07:02:00Z"),
    ]);
    await alertSwitchCronErrors("switch-sync", [
      { empresaKey: "confecciones_boston", syncType: "facturas", error: licencia },
    ]);
    expect(enviarSistemaMock).toHaveBeenCalledTimes(1);
    expect(mensaje()).toContain("licencia no está activa");
  });

  it("un fallo que NUNCA vuelve a correr no queda en silencio: lo levanta el watchdog", async () => {
    // La red no es un mecanismo nuevo. Los 11 routes que llaman a
    // alertSwitchCronErrors registran el heartbeat SOLO si no hubo ningún error
    // (`if (errors.length === 0) recordCronHeartbeat(...)`), así que un fallo
    // callado deja el heartbeat sin refrescar y a las 26h los dos vigías lo
    // reportan. Acá se verifica esa cadena de punta a punta.
    const { cronsStaleParaAlerta } =
      await vi.importActual<typeof import("@/lib/cron-telemetry")>("@/lib/cron-telemetry");
    const ahora = Date.parse("2026-07-28T12:00:00Z");
    const haceDosDias = "2026-07-26T11:00:00.000Z";
    const stale = cronsStaleParaAlerta([{ cron_name: "sync-recibos", last_success_at: haceDosDias }], ahora);
    expect(stale.some((s) => s.startsWith("sync-recibos"))).toBe(true);
  });
});

describe("EL CASO REAL — 27-jul-2026, 23:11 UTC (medido contra producción)", () => {
  /**
   * Lo que llegó al celular esa noche:
   *   "3 sync(s) fallaron — american_classic/facturas: No pude crear
   *    switch_sync_log: vacío; vistana/facturas: …; fashion_wear/facturas: …"
   *
   * A las 00:11 las 8 empresas corrieron bien solas. La base estaba bajo presión
   * de memoria y `db-salud` ya lo había avisado a las 22:45 — ESA era la alerta
   * correcta; estas tres eran el mismo hecho contado otra vez, y sin nada que
   * hacer. Los tres pares tenían historia larga en switch_sync_log y su última
   * fila era un success: lo único que faltaba era la fila de ESA corrida, porque
   * el INSERT es justamente lo que falló.
   */
  const pares = ["american_classic", "vistana", "fashion_wear"];

  beforeEach(() => {
    for (const p of pares) {
      logPorPar.set(`${p}|facturas`, [
        ok("2026-07-27T21:01:34Z"), // la corrida de las 23:11 NO dejó fila
        ok("2026-07-27T19:00:00Z"),
      ]);
    }
  });

  it("los 3 avisos NO habrían salido", async () => {
    await alertSwitchCronErrors(
      "switch-sync",
      pares.map((empresaKey) => ({ empresaKey, syncType: "facturas", error: ERR_LOG })),
    );
    expect(enviarSistemaMock).not.toHaveBeenCalled();
  });

  it("se clasifican como 'no-medible', no como 'sin-historia'", async () => {
    // La distinción que hace todo el trabajo: "no hay fila de ESTA corrida" no es
    // "no hay NINGUNA fila del par". Confundirlas obligaba a elegir entre el
    // ruido de esta noche y el silencio permanente de un par sin telemetría.
    for (const p of pares) {
      const r = await evaluateSwitchEscalation(p, "facturas");
      expect(r.motivo).toBe("no-medible");
      expect(r.escalate).toBe(false);
    }
  });

  it("pero si a las 00:11 hubiera vuelto a fallar, ESO sí avisa", async () => {
    for (const p of pares) {
      logPorPar.set(`${p}|facturas`, [
        err("2026-07-28T00:11:00Z", ERR_LOG),
        err("2026-07-27T23:11:00Z", ERR_LOG),
        ok("2026-07-27T21:01:34Z"),
      ]);
    }
    await alertSwitchCronErrors(
      "switch-sync",
      pares.map((empresaKey) => ({ empresaKey, syncType: "facturas", error: ERR_LOG })),
    );
    expect(enviarSistemaMock).toHaveBeenCalledTimes(1);
    expect(mensaje()).toContain("van 2 corridas seguidas");
  });
});
