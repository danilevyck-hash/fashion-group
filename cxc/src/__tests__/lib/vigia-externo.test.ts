// El vigía externo no se puede morir en silencio — candados del incidente
// del 29-jul-2026.
//
// 🩸 QUÉ PASÓ. cron-job.org le mandó a Daniel: "your cronjob has been disabled
// automatically because of too many failed executions" — 26 fallos consecutivos
// de https://www.fashiongr.com/api/health-crons, todos 503. Consecuencia: si un
// sync se caía, ya no le avisaba a nadie desde afuera.
//
// LA CADENA COMPLETA, medida contra producción:
//   1. `confecciones_boston` ganó `estadoCuenta: true` (pestaña de Boston). Su
//      estadocuenta hace UNA llamada HTTP por cliente y boston tiene 4.912
//      clientes (las otras empresas, 136-139): el único run exitoso de la
//      historia tardó 3.240 s (54 min) y fue un `backfill` local.
//   2. El techo de la función es 800 s → el run de las 06:30 muere SIEMPRE. Un
//      proceso matado no ejecuta `finally`: no registra heartbeat NI alerta.
//   3. Por eso `switch-sync:all-0630` no volvió a registrar heartbeat desde el
//      27-jul 06:30:39, aunque las facturas de american_classic de ese mismo run
//      SÍ salieran bien (06:31:23).
//   4. health-crons devolvía 503 en cuanto UN cron quedaba stale → 503 en todas
//      las llamadas → cron-job.org apagó el monitor a los 26 fallos.
//
// El 503 no estaba equivocado; estaba MAL DIRIGIDO, y un semáforo que se queda en
// rojo para siempre es un semáforo que alguien apaga. Estos tests fijan las tres
// mitades del arreglo:
//
//   A. UN PROBLEMA DE AUTH NUNCA ES UN 503. Auth correcta → 200; sin token o con
//      token malo → 401; env var sin configurar → 401 (no 503).
//   B. ESTAR VIVO ≠ NO TENER HALLAZGOS. Un puñado de crons stale devuelve 200 con
//      los hallazgos en el cuerpo (el watchdog Telegram ya los reporta); el 503
//      queda para lo que NADIE adentro puede contar.
//   C. EL QUE VIGILA ES VIGILADO. Cada llamada escribe el heartbeat
//      `vigia-externo`; si el monitor externo deja de llamar, el watchdog
//      Telegram interno lo reporta como cualquier cron caído.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const heartbeatsEscritos: string[] = [];
vi.mock("@/lib/cron-telemetry", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/cron-telemetry")>();
  return {
    ...real,
    recordCronHeartbeat: vi.fn(async (nombre: string) => {
      heartbeatsEscritos.push(nombre);
    }),
  };
});

let filasHeartbeat: Array<{ cron_name: string; last_success_at: string | null }> = [];
let lecturaFalla = false;
vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: {
    from: () => ({
      select: () => ({
        abortSignal: async () =>
          lecturaFalla
            ? { data: null, error: { message: "canceling statement due to statement timeout" } }
            : { data: filasHeartbeat, error: null },
      }),
    }),
  },
}));

import { GET } from "@/app/api/health-crons/route";
import {
  CRONS_FAIL_CLOSED,
  SEED_TOLERANT_CRONS,
  SWITCH_SYNC_SLOTS,
  slotHeartbeatName,
  cronsStaleParaAlerta,
  veredictoVigiaExterno,
  esCronRetirado,
  esHeartbeatNoVigilable,
  VIGIA_EXTERNO_HEARTBEAT,
  HEARTBEATS_EXTERNOS,
  UMBRAL_CAIDA_MASIVA,
  CRON_WATCHDOG_INTERNO,
  CRONS_CONOCIDOS,
  cronStaleThresholdHours,
  type HeartbeatRow,
} from "@/lib/cron-telemetry";

const TOKEN = "token-de-prueba-del-vigia";

/** Todas las filas frescas → un día sano, sin hallazgos. */
function todoFresco(): Array<{ cron_name: string; last_success_at: string }> {
  const ahora = new Date().toISOString();
  return [
    ...CRONS_FAIL_CLOSED.map((c) => ({ cron_name: c, last_success_at: ahora })),
    ...SEED_TOLERANT_CRONS.map((c) => ({ cron_name: c, last_success_at: ahora })),
    ...SWITCH_SYNC_SLOTS.map((s) => ({ cron_name: slotHeartbeatName(s.slot), last_success_at: ahora })),
  ];
}

/** Envejece N crons de la lista fail-closed (sin tocar el watchdog interno). */
function conStale(n: number) {
  const filas = todoFresco();
  const viejo = new Date(Date.now() - 40 * 3600 * 1000).toISOString();
  const victimas = CRONS_FAIL_CLOSED.filter(
    (c) => c !== CRON_WATCHDOG_INTERNO && cronStaleThresholdHours(c) < 40,
  ).slice(0, n);
  expect(victimas.length, "no hay suficientes crons diarios para el caso").toBe(n);
  for (const v of victimas) {
    filas.find((f) => f.cron_name === v)!.last_success_at = viejo;
  }
  return filas;
}

const pedir = (qs = `?token=${TOKEN}`) =>
  GET(new NextRequest(`https://www.fashiongr.com/api/health-crons${qs}`));

beforeEach(() => {
  heartbeatsEscritos.length = 0;
  lecturaFalla = false;
  filasHeartbeat = todoFresco();
  process.env.HEALTHCHECK_TOKEN = TOKEN;
});

// ─────────────────────────────────────────────────────────────────────────────
describe("A. un problema de AUTH nunca devuelve 503", () => {
  it("auth correcta por query param → 200", async () => {
    const res = await pedir();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.vigilanciaOk).toBe(true);
  });

  it("auth correcta por header x-healthcheck-token → 200", async () => {
    const res = await GET(
      new NextRequest("https://www.fashiongr.com/api/health-crons", {
        headers: { "x-healthcheck-token": TOKEN },
      }),
    );
    expect(res.status).toBe(200);
  });

  it("sin token → 401, nunca 503", async () => {
    const res = await pedir("");
    expect(res.status).toBe(401);
  });

  it("token equivocado → 401, nunca 503", async () => {
    const res = await pedir("?token=otra-cosa");
    expect(res.status).toBe(401);
  });

  it("token de largo distinto → 401 (timingSafeEqual exige mismo largo)", async () => {
    for (const t of ["", "a", `${TOKEN}x`, TOKEN.slice(0, -1)]) {
      const res = await pedir(`?token=${t}`);
      expect(res.status, `token "${t}" no dio 401`).toBe(401);
    }
  });

  it("HEALTHCHECK_TOKEN sin configurar → 401, NO 503 (era el bug de diseño)", async () => {
    // Un olvido de configuración no puede verse igual que "los crons se cayeron":
    // el monitor externo alarmaría por lo que no es, y para siempre, hasta que el
    // servicio de monitoreo apague el check.
    delete process.env.HEALTHCHECK_TOKEN;
    const res = await pedir();
    expect(res.status).toBe(401);
    expect(res.status).not.toBe(503);
  });

  it("sin credencial no se filtra ningún estado de crons", async () => {
    const body = await (await pedir("?token=mal")).json();
    expect(body.stale).toBeUndefined();
    expect(body.staleCount).toBeUndefined();
  });

  it("dice cómo autenticarse, y NO es CRON_SECRET", async () => {
    // Probar con `Authorization: Bearer $CRON_SECRET` da 401 a propósito: un
    // monitor de terceros no debe poder disparar crons.
    const body = await (await pedir("")).json();
    expect(body.comoAutenticar).toContain("HEALTHCHECK_TOKEN");
    expect(JSON.stringify(body)).not.toContain("CRON_SECRET");
  });

  it("un 401 no escribe el heartbeat del vigía (no hubo llamada legítima)", async () => {
    await pedir("?token=mal");
    expect(heartbeatsEscritos).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("B. estar vivo ≠ no tener hallazgos", () => {
  it("un día sano → 200 sin hallazgos", async () => {
    const body = await (await pedir()).json();
    expect(body.staleCount).toBe(0);
    expect(body.motivo).toBe("sano");
  });

  it("UN cron atrasado → 200 con el hallazgo en el cuerpo (el caso all-0630)", async () => {
    // Reproduce el estado real del 30-jul-2026: `switch-sync:all-0630` sin
    // heartbeat desde el 27-jul y TODO lo demás al día. Antes: 503 en cada
    // llamada → 26 fallos → monitor deshabilitado.
    filasHeartbeat = todoFresco();
    const slot = filasHeartbeat.find((f) => f.cron_name === "switch-sync:all-0630")!;
    slot.last_success_at = new Date(Date.now() - 72 * 3600 * 1000).toISOString();

    const res = await pedir();
    expect(res.status, "un cron roto no puede volver a apagar el vigía").toBe(200);
    const body = await res.json();
    // El hallazgo NO se esconde: sigue en el cuerpo.
    expect(body.staleCount).toBe(1);
    expect(body.stale.map((s: { cron: string }) => s.cron)).toContain("switch-sync:all-0630");
    expect(body.motivo).toBe("solo-hallazgos");
    expect(body.ok).toBe(false); // `ok` conserva su viejo significado
    expect(body.vigilanciaOk).toBe(true); // el semáforo del monitor
  });

  it(`≥ ${UMBRAL_CAIDA_MASIVA} atrasados a la vez → 503 (Vercel dejó de invocar crons)`, async () => {
    filasHeartbeat = conStale(UMBRAL_CAIDA_MASIVA);
    const res = await pedir();
    expect(res.status).toBe(503);
    expect((await res.json()).motivo).toBe("caida-masiva");
  });

  it(`${UMBRAL_CAIDA_MASIVA - 1} atrasados todavía es 200 (el umbral no se corrió solo)`, async () => {
    filasHeartbeat = conStale(UMBRAL_CAIDA_MASIVA - 1);
    expect((await pedir()).status).toBe(200);
  });

  it("el watchdog INTERNO caído → 503 aunque sea el único hallazgo", async () => {
    // Es EL caso que justifica un observador externo: si switch-reconciliacion no
    // corre, el watchdog Telegram no corre, y nadie adentro puede avisar nada.
    filasHeartbeat = todoFresco();
    filasHeartbeat.find((f) => f.cron_name === CRON_WATCHDOG_INTERNO)!.last_success_at = new Date(
      Date.now() - 40 * 3600 * 1000,
    ).toISOString();
    const res = await pedir();
    expect(res.status).toBe(503);
    expect((await res.json()).motivo).toBe("watchdog-interno-caido");
  });

  it("no se pudo leer cron_heartbeats → 503 fail-closed (un vigía ciego grita)", async () => {
    lecturaFalla = true;
    const res = await pedir();
    expect(res.status).toBe(503);
    expect((await res.json()).motivo).toBe("lectura-fallo");
  });

  it("el veredicto es una función pura y decide en las dos direcciones", () => {
    expect(veredictoVigiaExterno({ stale: [] }).http).toBe(200);
    expect(veredictoVigiaExterno({ stale: ["switch-sync:all-0630"] }).http).toBe(200);
    expect(
      veredictoVigiaExterno({ stale: Array(UMBRAL_CAIDA_MASIVA).fill("x") }).http,
    ).toBe(503);
    expect(veredictoVigiaExterno({ stale: [CRON_WATCHDOG_INTERNO] }).http).toBe(503);
    // El watchdog interno se reconoce con o sin la etiqueta "(último: ...)".
    expect(
      veredictoVigiaExterno({ stale: [`${CRON_WATCHDOG_INTERNO} (último: 2026-07-27T18:00:00Z)`] }).http,
    ).toBe(503);
    expect(veredictoVigiaExterno({ stale: [], lecturaFallo: true }).http).toBe(503);
  });

  it("ningún detalle del veredicto vomita jerga técnica al monitor", () => {
    for (const stale of [[], ["a"], Array(UMBRAL_CAIDA_MASIVA).fill("x"), [CRON_WATCHDOG_INTERNO]]) {
      const { detalle } = veredictoVigiaExterno({ stale });
      expect(detalle).not.toMatch(/cron_heartbeats|<!DOCTYPE|undefined|null/);
      expect(detalle.length).toBeGreaterThan(10);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("C. el que vigila es vigilado (vigilancia mutua, sin otro cron)", () => {
  it("cada llamada autenticada escribe el heartbeat del vigía", async () => {
    await pedir();
    expect(heartbeatsEscritos).toContain(VIGIA_EXTERNO_HEARTBEAT);
  });

  it("lo escribe incluso cuando el veredicto es 503 (el vigía SÍ llamó)", async () => {
    lecturaFalla = true;
    await pedir();
    expect(heartbeatsEscritos).toContain(VIGIA_EXTERNO_HEARTBEAT);
  });

  it("si el vigía externo deja de llamar, el watchdog INTERNO lo reporta", () => {
    // Esto es lo que faltaba el 29-jul: 26 fallos y nadie se enteró.
    const viejo = new Date(Date.now() - 40 * 3600 * 1000).toISOString();
    const filas: HeartbeatRow[] = [{ cron_name: VIGIA_EXTERNO_HEARTBEAT, last_success_at: viejo }];
    expect(cronsStaleParaAlerta(filas)).toEqual([`${VIGIA_EXTERNO_HEARTBEAT} (último: ${viejo})`]);
  });

  it("mientras el vigía llame, no se reporta", () => {
    const filas: HeartbeatRow[] = [
      { cron_name: VIGIA_EXTERNO_HEARTBEAT, last_success_at: new Date().toISOString() },
    ];
    expect(cronsStaleParaAlerta(filas)).toEqual([]);
  });

  it("NO se confunde con un cron retirado ni con un heartbeat manual", () => {
    // Es el error que lo dejaría sin vigilancia: no está en vercel.json, así que
    // el filtro de "crons retirados" lo descartaría si no estuviera en el registro.
    expect(esCronRetirado(VIGIA_EXTERNO_HEARTBEAT)).toBe(false);
    expect(esHeartbeatNoVigilable(VIGIA_EXTERNO_HEARTBEAT)).toBe(false);
    expect(CRONS_CONOCIDOS.has(VIGIA_EXTERNO_HEARTBEAT)).toBe(true);
  });

  it("se vigila con el umbral normal de 26h (cron-job.org llama cada hora)", () => {
    expect(cronStaleThresholdHours(VIGIA_EXTERNO_HEARTBEAT)).toBe(26);
  });

  it("HEARTBEATS_EXTERNOS no se solapa con las listas de crons de vercel.json", () => {
    for (const n of HEARTBEATS_EXTERNOS) {
      expect(CRONS_FAIL_CLOSED as readonly string[]).not.toContain(n);
      expect(SEED_TOLERANT_CRONS as readonly string[]).not.toContain(n);
    }
  });
});
