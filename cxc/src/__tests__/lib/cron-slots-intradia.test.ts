// Slots INTRADÍA de switch-sync: recuperación y reporte anclados en la
// OCURRENCIA del slot, no en el día calendario (fix jul-2026).
//
// Tres defectos medidos en producción el 25-jul-2026, todos con la misma raíz:
// la reconciliación razonaba por PAR (empresa, sync_type) contra el día Panamá
// —correcto para un cron DIARIO, ciego para uno INTRADÍA cuyo trabajo es
// "refrescar otra vez lo mismo"—.
//
//  D1: `switch-sync:facturas-1500` (ventas ACS, 15:00 UTC) perdió su invocación
//      en el deploy de las 15:00. Nadie la recuperó: el par
//      american_classic/facturas ya tenía success de las 05:09 y 06:52, así que
//      la reconciliación de las 18:00 lo vio sano. Las ventas de ACS quedaron
//      sin refrescar de 06:52 a 23:15 (16.4h).
//  D2: `fashion_shoes/estadocuenta` falló a las 16:20 con "canceling statement
//      due to statement timeout" y fashion_wear/active_wear quedaron colgados en
//      'running' hasta las 21:1x — la invocación murió sin poder alertar. Cero
//      filas en cron_email_errors, cero Telegram: el success de las 10:28-10:30
//      tapaba el fallo.
//  D3: `switch-sync:all-0540` no tenía fila de heartbeat propia (solo su marca
//      #recuperado) desde que se introdujeron los slots (#239, 23-jul 14:08
//      UTC): el 24-jul su entrada corrió y FALLÓ (joystep, auth devolvió HTML) y
//      el 25-jul Vercel perdió la invocación. La regla seed-tolerante ("fila
//      ausente = todavía no sembrada") no tenía vencimiento → invisible para
//      siempre en AMBOS vigías.
//
// Todos los timestamps de abajo son los REALES de switch_sync_log y
// cron_heartbeats de producción.
import { describe, it, expect, vi } from "vitest";

// cron-telemetry importa supabase-server y telegram en el top-level.
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: { from: vi.fn() } }));
vi.mock("@/lib/telegram", () => ({
  sendTelegramAlert: vi.fn(),
  shortError: (s: string) => s,
}));

import {
  SWITCH_SYNC_SLOTS,
  SLOT_RUN_WINDOW_MIN,
  SLOT_SEED_GRACE_HOURS,
  clasificarSlots,
  slotsHuerfanos,
  slotNuncaSembradoVencido,
  esMarcaDeSlot,
  paresDelSlot,
  ultimaOcurrenciaUtc,
  slotHeartbeatName,
  slotRecuperadoName,
  slotVistoName,
  type SyncLogRowMin,
} from "@/lib/cron-telemetry";
import { isSwitchSilenciable } from "@/lib/switch-api/alert-policy";

const H = 3600 * 1000;
const CXC = ["vistana", "fashion_wear", "fashion_shoes", "active_shoes", "active_wear", "joystep"];

const row = (
  started_at: string,
  empresa_key: string,
  sync_type: string,
  status = "success",
  error_message: string | null = null,
): SyncLogRowMin => ({ empresa_key, sync_type, status, started_at, error_message });

// ── switch_sync_log REAL del 25-jul-2026 (UTC) ───────────────────────────────
// Solo facturas/estadocuenta/costo (los sync_type que miran los slots).
const LOG_25: SyncLogRowMin[] = [
  row("2026-07-25T05:09:40Z", "american_classic", "facturas"),
  row("2026-07-25T05:39:08Z", "vistana", "facturas"),
  row("2026-07-25T05:39:16Z", "vistana", "estadocuenta"),
  row("2026-07-25T05:41:31Z", "vistana", "costo"),
  row("2026-07-25T05:41:32Z", "active_wear", "facturas"),
  row("2026-07-25T05:41:35Z", "active_wear", "estadocuenta"),
  row("2026-07-25T05:43:19Z", "active_wear", "costo"),
  row("2026-07-25T06:52:03Z", "american_classic", "facturas"),
  row("2026-07-25T06:52:14Z", "american_classic", "costo"),
  row("2026-07-25T06:52:16Z", "confecciones_boston", "facturas"),
  row("2026-07-25T06:52:23Z", "confecciones_boston", "costo"),
  row("2026-07-25T10:28:40Z", "fashion_wear", "facturas"),
  row("2026-07-25T10:28:44Z", "fashion_wear", "estadocuenta"),
  row("2026-07-25T10:30:21Z", "fashion_wear", "costo"),
  row("2026-07-25T10:30:24Z", "fashion_shoes", "facturas"),
  row("2026-07-25T10:30:32Z", "fashion_shoes", "estadocuenta"),
  row("2026-07-25T10:32:40Z", "fashion_shoes", "costo"),
  row("2026-07-25T10:32:41Z", "active_shoes", "facturas"),
  row(
    "2026-07-25T10:32:45Z",
    "active_shoes",
    "estadocuenta",
    "error",
    "Run previo atascado en 'running' (probable timeout); cerrado por el siguiente run.",
  ),
  row("2026-07-25T14:31:31Z", "active_shoes", "estadocuenta"),
  row("2026-07-25T14:33:01Z", "active_shoes", "costo"),
  row("2026-07-25T14:33:07Z", "joystep", "facturas"),
  row("2026-07-25T14:33:15Z", "joystep", "estadocuenta"),
  row("2026-07-25T14:34:52Z", "joystep", "costo"),
  // Ronda estadocuenta de las 16:00/16:05/16:10 — el incidente del defecto 2.
  row(
    "2026-07-25T16:20:09Z",
    "fashion_shoes",
    "estadocuenta",
    "error",
    "UPSERT estadocuenta falló: canceling statement due to statement timeout",
  ),
  row("2026-07-25T16:22:37Z", "fashion_wear", "estadocuenta", "running"),
  row("2026-07-25T16:23:47Z", "vistana", "estadocuenta"),
  row("2026-07-25T16:26:23Z", "active_wear", "estadocuenta", "running"),
  row("2026-07-25T16:29:36Z", "active_shoes", "estadocuenta"),
  row("2026-07-25T16:31:59Z", "joystep", "estadocuenta"),
];

// cron_heartbeats REAL del 25-jul-2026 (all-0540 SIN fila propia — defecto 3).
const HB_25 = new Map<string, string | null | undefined>([
  ["switch-sync:all-0530", "2026-07-25T05:43:21Z"],
  ["switch-sync:all-0535", "2026-07-24T05:51:52Z"],
  ["switch-sync:all-0630", "2026-07-25T06:52:25Z"],
  ["switch-sync:facturas-1500", "2026-07-24T15:26:28Z"],
  ["switch-sync:estadocuenta-1600", "2026-07-25T16:33:54Z"],
  ["switch-sync:estadocuenta-1605", "2026-07-24T16:55:44Z"],
  ["switch-sync:estadocuenta-1610", "2026-07-24T17:10:41Z"],
  ["switch-sync:facturas-2315", "2026-07-24T23:38:20Z"],
  ["switch-sync:facturas-0015", "2026-07-24T00:23:38Z"],
]);

const PASADA_14 = new Date("2026-07-25T14:00:00Z");
const PASADA_18 = new Date("2026-07-25T18:00:00Z");

const clasificar = (now: Date, rows = LOG_25, hb = HB_25) =>
  clasificarSlots({ now, rows, heartbeats: hb, empresasConCxc: CXC });
const desatendido = (now: Date, slot: string, rows = LOG_25) =>
  clasificar(now, rows).desatendidos.find((d) => d.slot === slot);

/** Espejo de la regla VIEJA (findMissing de la reconciliación): ¿el par tiene
 *  ALGÚN success en el día Panamá? Es lo que dejaba pasar los defectos 1 y 2. */
const parTieneSuccessHoy = (empresa: string, syncType: string, rows = LOG_25) =>
  rows.some(
    (r) =>
      r.empresa_key === empresa &&
      r.sync_type === syncType &&
      r.status === "success" &&
      r.started_at >= "2026-07-25T05:00:00Z",
  );

// ─────────────────────────────────────────────────────────────────────────────
describe("D1 — ocurrencia intradía perdida (facturas-1500, ventas ACS)", () => {
  it("la regla VIEJA (¿el par tuvo success hoy?) lo daba por sano", () => {
    // 05:09 y 06:52 → la reconciliación de las 18:00 no tenía nada que recuperar.
    expect(parTieneSuccessHoy("american_classic", "facturas")).toBe(true);
  });

  it("anclado en la ocurrencia de las 15:00 queda DESATENDIDO y sin invocación", () => {
    const d = desatendido(PASADA_18, "facturas-1500");
    expect(d).toBeTruthy();
    expect(d!.ocurrencia).toBe("2026-07-25T15:00:00.000Z");
    expect(d!.motivo).toBe("sin-invocacion");
    expect(d!.paresPendientes.map((p) => `${p.empresa}/${p.syncType}`)).toEqual([
      "american_classic/facturas",
    ]);
    // Sin corrida dentro de la ocurrencia → no hay error que reportar.
    expect(d!.paresPendientes[0].ultimoIntento).toBeNull();
  });

  it("NO se certifica como huérfano: el trabajo no está hecho", () => {
    const cubiertos = slotsHuerfanos({
      now: PASADA_18,
      rows: LOG_25,
      heartbeats: HB_25,
      empresasConCxc: CXC,
    }).map((s) => s.slot);
    expect(cubiertos).not.toContain("facturas-1500");
  });

  it("la pasada de las 14:00 NO lo toca: su ocurrencia de hoy aún no llegó", () => {
    // ultimaOcurrenciaUtc cae en AYER 15:00, que sí corrió (heartbeat 24-jul 15:26).
    expect(ultimaOcurrenciaUtc("1500", PASADA_14).toISOString()).toBe("2026-07-24T15:00:00.000Z");
    expect(desatendido(PASADA_14, "facturas-1500")).toBeUndefined();
  });

  it("no se adelanta a la entrada: dentro de la ventana de jitter no re-ejecuta", () => {
    // Re-sincronizar antes de que venza la ventana gastaría una sesión de Switch
    // al pedo y podría chocar con la entrada llegando tarde. Con Pro la ventana
    // es de 30 min (ver SLOT_RUN_WINDOW_MIN): el disparo medido es de segundos y
    // el slot más largo termina entero en ~4 min.
    expect(SLOT_RUN_WINDOW_MIN).toBe(30);
    const finVentana = new Date(Date.parse("2026-07-25T15:00:00Z") + SLOT_RUN_WINDOW_MIN * 60_000);
    expect(finVentana.toISOString()).toBe("2026-07-25T15:30:00.000Z");
    expect(desatendido(new Date("2026-07-25T15:29:00Z"), "facturas-1500")).toBeUndefined();
    expect(desatendido(new Date("2026-07-25T15:30:00Z"), "facturas-1500")).toBeTruthy();
  });

  it("tras recuperar el par, la ocurrencia deja de estar desatendida", () => {
    const conRecuperacion = [...LOG_25, row("2026-07-25T18:02:10Z", "american_classic", "facturas")];
    expect(desatendido(PASADA_18, "facturas-1500", conRecuperacion)).toBeUndefined();
  });

  it("la entrada real de las 23:15 tampoco deja el slot de las 15:00 colgado al día siguiente", () => {
    // 23:15 dejó el par al día; a la pasada de las 10:00 del 26-jul la ocurrencia
    // de facturas-1500 es la de AYER 15:00 y ya tiene success posterior → limpio.
    const conCierre = [...LOG_25, row("2026-07-25T23:15:32Z", "american_classic", "facturas")];
    const now = new Date("2026-07-26T10:00:00Z");
    expect(desatendido(now, "facturas-1500", conCierre)).toBeUndefined();
    // Y como su entrada no se invocó, queda CERTIFICADO como huérfano (no alerta).
    const cubiertos = slotsHuerfanos({
      now,
      rows: conCierre,
      heartbeats: HB_25,
      empresasConCxc: CXC,
    });
    expect(cubiertos.map((s) => s.slot)).toContain("facturas-1500");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("D2 — fallo intradía tapado por el éxito de la mañana", () => {
  it("la regla VIEJA daba sanos a los 3 pares que fallaron a las 16:2x", () => {
    expect(parTieneSuccessHoy("fashion_shoes", "estadocuenta")).toBe(true); // 10:30
    expect(parTieneSuccessHoy("fashion_wear", "estadocuenta")).toBe(true); // 10:28
    expect(parTieneSuccessHoy("active_wear", "estadocuenta")).toBe(true); // 05:41
  });

  it("estadocuenta-1605 sale como 'corrió y falló' con sus dos pares y su error real", () => {
    const d = desatendido(PASADA_18, "estadocuenta-1605");
    expect(d).toBeTruthy();
    expect(d!.motivo).toBe("corrio-y-fallo");
    expect(d!.ocurrencia).toBe("2026-07-25T16:05:00.000Z");
    expect(d!.paresPendientes.map((p) => p.empresa).sort()).toEqual(["fashion_shoes", "fashion_wear"]);
    const fs = d!.paresPendientes.find((p) => p.empresa === "fashion_shoes")!;
    expect(fs.ultimoIntento!.error_message).toContain("statement timeout");
    // El run colgado se reporta por su status: no hay error_message que mostrar.
    const fw = d!.paresPendientes.find((p) => p.empresa === "fashion_wear")!;
    expect(fw.ultimoIntento!.status).toBe("running");
  });

  it("un statement timeout NO es silenciable → alerta inmediata, no espera un 2º fallo", () => {
    expect(
      isSwitchSilenciable("UPSERT estadocuenta falló: canceling statement due to statement timeout"),
    ).toBe(false);
    // Contraste: la política anti-ruido 401/red sigue intacta.
    expect(isSwitchSilenciable("Auth fallo: HTTP 401 — TOKEN INVALIDO")).toBe(true);
    expect(isSwitchSilenciable("Error de red en /autenticacion: fetch failed (ECONNREFUSED)")).toBe(true);
  });

  it("estadocuenta-1610 reporta SOLO active_wear: vistana sí refrescó a las 16:23", () => {
    const d = desatendido(PASADA_18, "estadocuenta-1610");
    expect(d).toBeTruthy();
    expect(d!.motivo).toBe("corrio-y-fallo");
    expect(d!.paresPendientes.map((p) => p.empresa)).toEqual(["active_wear"]);
  });

  it("estadocuenta-1600, que corrió BIEN, no genera ruido", () => {
    // active_shoes 16:29 y joystep 16:31, ambos success → nada que reportar.
    expect(desatendido(PASADA_18, "estadocuenta-1600")).toBeUndefined();
  });

  it("un slot que corrió y falló NUNCA se certifica como huérfano", () => {
    const cubiertos = slotsHuerfanos({
      now: PASADA_18,
      rows: LOG_25,
      heartbeats: HB_25,
      empresasConCxc: CXC,
    }).map((s) => s.slot);
    expect(cubiertos).not.toContain("estadocuenta-1605");
    expect(cubiertos).not.toContain("estadocuenta-1610");
  });

  it("la ronda de las 21:1x lo repara y el fallo deja de reportarse (una sola alerta)", () => {
    const conRonda21 = [
      ...LOG_25,
      row("2026-07-25T21:12:29Z", "active_wear", "estadocuenta"),
      row("2026-07-25T21:15:13Z", "fashion_shoes", "estadocuenta"),
      row("2026-07-25T21:16:54Z", "fashion_wear", "estadocuenta"),
    ];
    const now = new Date("2026-07-26T10:00:00Z");
    expect(desatendido(now, "estadocuenta-1605", conRonda21)).toBeUndefined();
    expect(desatendido(now, "estadocuenta-1610", conRonda21)).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("D3 — un slot que NUNCA registró su heartbeat propio", () => {
  it("all-0540 no tenía fila propia el 25-jul (solo su marca #recuperado)", () => {
    expect(HB_25.get("switch-sync:all-0540")).toBeUndefined();
    expect(SWITCH_SYNC_SLOTS.map((s) => s.slot)).toContain("all-0540");
  });

  it("sin marca #visto la ausencia NO alerta (slot recién desplegado)", () => {
    const now = Date.parse("2026-07-25T18:00:00Z");
    expect(slotNuncaSembradoVencido(undefined, now)).toBe(false);
    expect(slotNuncaSembradoVencido(null, now)).toBe(false);
  });

  it("con marca #visto fresca sigue sin alertar; pasada la gracia, alerta", () => {
    const now = Date.parse("2026-07-25T18:00:00Z");
    expect(slotNuncaSembradoVencido(new Date(now - (SLOT_SEED_GRACE_HOURS - 1) * H).toISOString(), now)).toBe(
      false,
    );
    expect(slotNuncaSembradoVencido(new Date(now - (SLOT_SEED_GRACE_HOURS + 1) * H).toISOString(), now)).toBe(
      true,
    );
  });

  it("50h de gracia = dos ocurrencias diarias + jitter", () => {
    expect(SLOT_SEED_GRACE_HOURS).toBeGreaterThanOrEqual(48);
  });

  it("los tres nombres del slot no se pisan y las marcas no se vigilan como crons", () => {
    expect(slotHeartbeatName("all-0540")).toBe("switch-sync:all-0540");
    expect(slotRecuperadoName("all-0540")).toBe("switch-sync:all-0540#recuperado");
    expect(slotVistoName("all-0540")).toBe("switch-sync:all-0540#visto");
    expect(esMarcaDeSlot("switch-sync:all-0540")).toBe(false);
    expect(esMarcaDeSlot("switch-sync:all-0540#recuperado")).toBe(true);
    expect(esMarcaDeSlot("switch-sync:all-0540#visto")).toBe(true);
  });

  it("el 25-jul all-0540 estaba desatendido de verdad (su entrada nunca se invocó)", () => {
    // A las 10:00 no había NINGUNA corrida de active_shoes/joystep tras las 05:40.
    const hasta10 = LOG_25.filter((r) => r.started_at <= "2026-07-25T10:00:00Z");
    const d = desatendido(new Date("2026-07-25T10:00:00Z"), "all-0540", hasta10);
    expect(d).toBeTruthy();
    expect(d!.motivo).toBe("sin-invocacion");
    // Los 6 pares de la entrada (2 empresas × facturas/estadocuenta/costo).
    expect(d!.paresPendientes).toHaveLength(6);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("costo — un día sano no dispara NI UNA re-sincronización", () => {
  // Switch es sesión única por empresa y hay regla de ≥50 min entre crons de la
  // misma empresa: re-ejecutar de más es caro y peligroso. En un día en que cada
  // entrada corre y deja sus pares al día, el barrido debe ser un no-op total.
  const diaSano = (): SyncLogRowMin[] => {
    const rows: SyncLogRowMin[] = [];
    for (const dia of ["2026-07-24", "2026-07-25"]) {
      for (const s of SWITCH_SYNC_SLOTS) {
        const at = `${dia}T${s.hhmmUtc.slice(0, 2)}:${s.hhmmUtc.slice(2, 4)}:30Z`;
        for (const p of paresDelSlot(s, CXC)) rows.push(row(at, p.empresa, p.syncType));
      }
    }
    return rows;
  };

  it.each([10, 14, 18])("pasada de las %i:00 UTC → cero desatendidos y cero huérfanos", (hora) => {
    const now = new Date(`2026-07-25T${String(hora).padStart(2, "0")}:00:00Z`);
    const out = clasificarSlots({
      now,
      rows: diaSano(),
      // Heartbeats propios frescos: cada entrada corrió y salió OK.
      heartbeats: new Map(
        SWITCH_SYNC_SLOTS.map((s) => [
          slotHeartbeatName(s.slot),
          ultimaOcurrenciaUtc(s.hhmmUtc, now).toISOString(),
        ]),
      ),
      empresasConCxc: CXC,
    });
    expect(out.desatendidos).toEqual([]);
    expect(out.cubiertos).toEqual([]);
  });

  it("sin ningún heartbeat propio (slots recién desplegados) tampoco re-ejecuta nada", () => {
    // Las entradas corrieron y dejaron su trabajo al día: no hay nada que
    // recuperar NI que certificar — los heartbeats se siembran solos en la
    // primera corrida OK de cada entrada.
    const out = clasificarSlots({
      now: PASADA_18,
      rows: diaSano(),
      heartbeats: new Map(),
      empresasConCxc: CXC,
    });
    expect(out.desatendidos).toEqual([]);
    expect(out.cubiertos).toEqual([]);
  });
});

describe("guarda de concurrencia — no pisar una corrida viva", () => {
  it("un run 'running' RECIENTE congela el slot: no se re-ejecuta encima", () => {
    // Switch es sesión única por empresa y el índice de switch_sync_log es un
    // mutex sobre (empresa, tipo) WHERE status='running'.
    const rows = [row("2026-07-25T17:50:00Z", "american_classic", "facturas", "running")];
    expect(desatendido(new Date("2026-07-25T18:00:00Z"), "facturas-1500", rows)).toBeUndefined();
  });

  it("pasado el umbral de run muerto (30 min) sí se reporta y se re-ejecuta", () => {
    const rows = [row("2026-07-25T15:05:00Z", "american_classic", "facturas", "running")];
    const d = desatendido(new Date("2026-07-25T18:00:00Z"), "facturas-1500", rows);
    expect(d).toBeTruthy();
    expect(d!.motivo).toBe("corrio-y-fallo");
    expect(d!.paresPendientes[0].ultimoIntento!.status).toBe("running");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// La ventana de jitter bajó de 120 a 30 min al pasar la cuenta a Vercel PRO
// (26-jul-2026). El 120 venía del scheduler de Hobby, que disparaba con hasta
// ~58 min de retraso (medido en switch_sync_log del 20-24 jul). Con Pro el
// disparo es puntual (+1s a +40s en las ocurrencias del 25/26-jul) y la deriva
// que se ve en los heartbeats es la DURACIÓN del sync.
//
// La ventana de 2h TAPABA pérdidas reales: la ronda de las 16:0x tiene UNA sola
// pasada de reconciliación después (18:00), y con 120 min las ocurrencias de
// 16:05 y 16:10 vencían recién a las 18:05/18:10 → ese día no se re-ejecutaban.
describe("ventana de jitter con Vercel Pro (SLOT_RUN_WINDOW_MIN)", () => {
  const RONDA_16 = ["estadocuenta-1600", "estadocuenta-1605", "estadocuenta-1610"] as const;
  const PARES_16 = [
    ["active_shoes", "1600"], ["joystep", "1600"],
    ["fashion_shoes", "1605"], ["fashion_wear", "1605"],
    ["vistana", "1610"], ["active_wear", "1610"],
  ] as const;

  // Invocaciones de las 16:0x perdidas: los pares solo tienen el success de la
  // mañana (10:30), que es justo lo que tapaba el agujero.
  const soloManana: SyncLogRowMin[] = PARES_16.map(([empresa]) =>
    row("2026-07-25T10:30:00Z", empresa, "estadocuenta"),
  );
  // Heartbeats propios de AYER: la entrada de hoy no llegó.
  const hbAyer = new Map<string, string>(
    RONDA_16.map((s) => [slotHeartbeatName(s), "2026-07-24T16:40:00Z"]),
  );

  it("es 30 minutos", () => {
    expect(SLOT_RUN_WINDOW_MIN).toBe(30);
  });

  it("la pasada de las 18:00 SÍ alcanza a las tres ocurrencias de las 16:0x", () => {
    const out = clasificarSlots({
      now: PASADA_18,
      rows: soloManana,
      heartbeats: hbAyer,
      empresasConCxc: CXC,
    });
    for (const slot of RONDA_16) {
      const d = out.desatendidos.find((x) => x.slot === slot);
      expect(d, `${slot} debería quedar desatendido a las 18:00`).toBeTruthy();
      expect(d!.motivo).toBe("sin-invocacion");
      expect(d!.paresPendientes.length).toBe(2);
    }
  });

  it("con la ventana vieja de 120 min, 16:05 y 16:10 no llegaban a la pasada de las 18:00", () => {
    // Regresión que motivó el cambio: con 120 min el fin de ventana caía DESPUÉS
    // de la única pasada posterior del día.
    for (const [, hhmm] of PARES_16) {
      const occ = Date.parse(`2026-07-25T${hhmm.slice(0, 2)}:${hhmm.slice(2)}:00Z`);
      expect(occ + 30 * 60_000).toBeLessThan(PASADA_18.getTime());
      if (hhmm !== "1600") {
        expect(occ + 120 * 60_000).toBeGreaterThan(PASADA_18.getTime());
      }
    }
  });

  it("sigue cubriendo el disparo real bajo Pro: +40s y ~4 min de duración entran", () => {
    // estadocuenta-2110 (vistana+active_wear) el 25-jul: 21:10:01 → 21:13:57.
    const rows = [
      row("2026-07-25T21:10:01Z", "vistana", "estadocuenta", "error", "boom"),
      row("2026-07-25T21:12:29Z", "active_wear", "estadocuenta", "error", "boom"),
    ];
    const out = clasificarSlots({
      now: new Date("2026-07-26T10:00:00Z"),
      rows,
      heartbeats: new Map(),
      empresasConCxc: CXC,
    });
    const d = out.desatendidos.find((x) => x.slot === "estadocuenta-2110");
    // Corrió dentro de la ventana (aunque falló) → NO se cubre y se reporta como
    // fallo, no como invocación perdida.
    expect(d).toBeTruthy();
    expect(d!.motivo).toBe("corrio-y-fallo");
    expect(out.cubiertos.map((c) => c.slot)).not.toContain("estadocuenta-2110");
  });

  it("un slot 'all' que arranca tarde y dura 5 min sigue contando como invocado", () => {
    // Los slots `all` (facturas+estadocuenta+costo × 2 empresas) son los más
    // largos: 2-5 min medidos. Con 30 min de ventana hay ~5x de margen.
    const rows: SyncLogRowMin[] = [
      row("2026-07-26T05:31:00Z", "vistana", "facturas", "error", "boom"),
      row("2026-07-26T05:35:30Z", "active_wear", "facturas", "error", "boom"),
    ];
    const out = clasificarSlots({
      now: new Date("2026-07-26T10:00:00Z"),
      rows,
      heartbeats: new Map(),
      empresasConCxc: CXC,
    });
    expect(out.desatendidos.find((x) => x.slot === "all-0530")!.motivo).toBe("corrio-y-fallo");
  });
});
