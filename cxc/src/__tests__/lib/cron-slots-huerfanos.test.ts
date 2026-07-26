// Slots huérfanos de switch-sync (fix jul-2026).
//
// Contexto: cada entrada de switch-sync en vercel.json registra su heartbeat
// granular "switch-sync:<tipo>-<hhmm>". Cuando Vercel pierde una invocación
// (ventana de deploy) y el trabajo lo hace otro (la recuperación de la
// reconciliación, o la entrada tipo=all que cubre los mismos pares), el
// heartbeat del slot se queda congelado y el watchdog lo reporta stale con los
// datos perfectamente al día — falso positivo medido el 25-jul-2026.
//
// Estos tests usan los timestamps REALES de switch_sync_log y cron_heartbeats
// de producción de ese día.
import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: { from: vi.fn() },
}));
vi.mock("@/lib/telegram", () => ({
  sendTelegramAlert: vi.fn(),
  shortError: (s: string) => s,
}));

import {
  SWITCH_SYNC_SLOTS,
  SWITCH_SYNC_SLOT_HEARTBEATS,
  SLOT_ENTRY_DEAD_HOURS,
  paresDelSlot,
  slotCubreTipo,
  ultimaOcurrenciaUtc,
  slotsHuerfanos,
  slotCubiertoPorRecuperacion,
  slotHeartbeatName,
  slotRecuperadoName,
  type SyncLogRowMin,
} from "@/lib/cron-telemetry";
// Calendario CONGELADO del 25-jul-2026: estos tests reproducen el incidente de
// ese día con filas reales, así que se evalúan contra los slots de ENTONCES, no
// contra el calendario vivo (que cambia y tiene sus propios tests).
import { SLOTS_JUL2026 } from "../fixtures/slots-jul2026";

const H = 3600 * 1000;
const CXC = ["vistana", "fashion_wear", "fashion_shoes", "active_shoes", "active_wear", "joystep"];

const row = (started_at: string, empresa_key: string, sync_type: string, status = "success"): SyncLogRowMin => ({
  empresa_key,
  sync_type,
  status,
  started_at,
});

// ── switch_sync_log real de producción (24 y 25 de julio 2026, UTC) ───────────
const LOG_24_25: SyncLogRowMin[] = [
  row("2026-07-24T10:53:06Z", "joystep", "facturas"),
  row("2026-07-24T10:53:12Z", "joystep", "estadocuenta"),
  row("2026-07-24T10:54:16Z", "joystep", "costo"),
  row("2026-07-24T15:26:12Z", "american_classic", "facturas"),
  row("2026-07-24T16:11:26Z", "active_shoes", "estadocuenta"),
  row("2026-07-24T16:13:16Z", "joystep", "estadocuenta"),
  row("2026-07-24T16:54:27Z", "fashion_shoes", "estadocuenta"),
  row("2026-07-24T16:55:01Z", "fashion_wear", "estadocuenta"),
  row("2026-07-24T17:06:48Z", "vistana", "estadocuenta"),
  row("2026-07-24T17:08:43Z", "active_wear", "estadocuenta"),
  row("2026-07-24T18:34:23Z", "american_classic", "facturas"),
  row("2026-07-24T21:13:57Z", "vistana", "estadocuenta"),
  row("2026-07-24T21:15:49Z", "active_wear", "estadocuenta"),
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
  row("2026-07-25T10:32:45Z", "active_shoes", "estadocuenta", "error"),
  row("2026-07-25T14:31:31Z", "active_shoes", "estadocuenta"),
  row("2026-07-25T14:33:01Z", "active_shoes", "costo"),
  row("2026-07-25T14:33:07Z", "joystep", "facturas"),
  row("2026-07-25T14:33:15Z", "joystep", "estadocuenta"),
  row("2026-07-25T14:34:52Z", "joystep", "costo"),
];

/** Filas visibles en un momento dado (una query real nunca ve el futuro). */
const hasta = (now: Date) => LOG_24_25.filter((r) => Date.parse(r.started_at) <= now.getTime());

// cron_heartbeats real del 25-jul-2026 14:53 UTC (all-0540, estadocuenta-2115 y
// estadocuenta-2120 NO tenían fila: nunca sembraron).
const HB_25 = new Map<string, string | null | undefined>([
  ["switch-sync:all-0530", "2026-07-25T05:43:21Z"],
  ["switch-sync:all-0535", "2026-07-24T05:51:52Z"],
  ["switch-sync:all-0630", "2026-07-25T06:52:25Z"],
  ["switch-sync:facturas-1500", "2026-07-24T15:26:28Z"],
  ["switch-sync:estadocuenta-1600", "2026-07-24T16:14:39Z"],
  ["switch-sync:estadocuenta-1605", "2026-07-24T16:55:44Z"],
  ["switch-sync:estadocuenta-1610", "2026-07-24T17:10:41Z"],
  ["switch-sync:estadocuenta-2110", "2026-07-24T21:17:43Z"],
  ["switch-sync:facturas-2315", "2026-07-23T23:38:20Z"],
  ["switch-sync:facturas-0015", "2026-07-24T00:23:38Z"],
]);

describe("SWITCH_SYNC_SLOTS — fuente única, espejo de vercel.json", () => {
  it("los slots derivados coinciden EXACTAMENTE con los ?slot= de vercel.json", () => {
    const vercel = fs.readFileSync(path.resolve(__dirname, "../../../vercel.json"), "utf8");
    const enVercel = [...vercel.matchAll(/switch-sync\?[^"]*?&slot=([a-z]+-\d{4})/g)].map((m) => m[1]);
    // Una entrada = una ocurrencia = un slot: ningún nombre de slot repetido.
    expect(new Set(enVercel).size).toBe(enVercel.length);
    expect(enVercel.length).toBe(SWITCH_SYNC_SLOTS.length);
    expect([...SWITCH_SYNC_SLOTS.map((s) => s.slot)].sort()).toEqual([...enVercel].sort());
    expect(SWITCH_SYNC_SLOT_HEARTBEATS).toEqual(SWITCH_SYNC_SLOTS.map((s) => `switch-sync:${s.slot}`));
  });

  it("cada slot lleva las MISMAS empresas que su entrada de vercel.json", () => {
    const vercel = fs.readFileSync(path.resolve(__dirname, "../../../vercel.json"), "utf8");
    for (const s of SWITCH_SYNC_SLOTS) {
      const re = new RegExp(`switch-sync\\?[^"]*empresas?=([a-z_,]+)[^"]*&slot=${s.slot}`);
      const m = vercel.match(re);
      expect(m, `slot ${s.slot} no encontrado en vercel.json`).toBeTruthy();
      expect([...s.empresas].sort()).toEqual(m![1].split(",").sort());
    }
  });

  it("tipo=all responde por facturas, estadocuenta y costo; los demás solo por el suyo", () => {
    expect(slotCubreTipo("all", "costo")).toBe(true);
    expect(slotCubreTipo("facturas", "facturas")).toBe(true);
    expect(slotCubreTipo("facturas", "costo")).toBe(false);
    expect(slotCubreTipo("estadocuenta", "facturas")).toBe(false);
  });

  it("paresDelSlot omite estadocuenta en las empresas sin CXC (american_classic, boston)", () => {
    const all0630 = SWITCH_SYNC_SLOTS.find((s) => s.slot === "all-0630")!;
    expect(paresDelSlot(all0630, CXC).map((p) => `${p.empresa}/${p.syncType}`)).toEqual([
      "american_classic/facturas",
      "american_classic/costo",
      "confecciones_boston/facturas",
      "confecciones_boston/costo",
    ]);
  });
});

describe("ultimaOcurrenciaUtc", () => {
  const now = new Date("2026-07-25T14:35:00Z");
  it("hora ya pasada hoy → la de hoy", () => {
    expect(ultimaOcurrenciaUtc("0535", now).toISOString()).toBe("2026-07-25T05:35:00.000Z");
  });
  it("hora que aún no llega hoy → la de ayer", () => {
    expect(ultimaOcurrenciaUtc("1500", now).toISOString()).toBe("2026-07-24T15:00:00.000Z");
    expect(ultimaOcurrenciaUtc("2315", now).toISOString()).toBe("2026-07-24T23:15:00.000Z");
  });
});

describe("slotsHuerfanos — caso REAL del 25-jul-2026 (pasada de las 14:00 UTC)", () => {
  const now = new Date("2026-07-25T14:35:00Z");
  const marcados = slotsHuerfanos({ now, rows: LOG_24_25, heartbeats: HB_25, empresasConCxc: CXC, slots: SLOTS_JUL2026 }).map(
    (s) => s.slot,
  );

  it("marca los 3 slots que el watchdog reportaba stale con los datos al día", () => {
    // 39.7h / 38.9h / 33.5h sin success el 25-jul 14:53 UTC, todos falsos positivos.
    expect(marcados).toContain("facturas-2315");
    expect(marcados).toContain("facturas-0015");
    expect(marcados).toContain("all-0535");
  });

  it("NO toca ningún slot cuya entrada sí corrió (0530 / 0630 / 1600 / 1605 / 1610 / 2110)", () => {
    for (const sano of [
      "all-0530",
      "all-0630",
      "estadocuenta-1600",
      "estadocuenta-1605",
      "estadocuenta-1610",
      "estadocuenta-2110",
    ]) {
      expect(marcados).not.toContain(sano);
    }
  });

  it("NO marca facturas-1500, cuya hora de hoy (15:00) todavía no llegó", () => {
    expect(marcados).not.toContain("facturas-1500");
  });

  it("american_classic/facturas nunca fue un par faltante: sin este barrido los slots quedaban huérfanos", () => {
    // 05:09 y 06:52 dejaron el par al día antes de la 1ª pasada (10:00 UTC) →
    // la reconciliación no tenía NADA que recuperar y jamás tocaría sus slots.
    const acHoy = LOG_24_25.filter(
      (r) => r.empresa_key === "american_classic" && r.sync_type === "facturas" && r.started_at >= "2026-07-25",
    );
    expect(acHoy.length).toBeGreaterThan(0);
    expect(acHoy.every((r) => r.status === "success")).toBe(true);
  });
});

describe("slotsHuerfanos — no tapa fallos legítimos", () => {
  it("la recuperación de un par marca su slot vencido", () => {
    // all-0535 perdió su invocación de las 05:35; la reconciliación recuperó
    // fashion_shoes/fashion_wear a las 10:28-10:32 → el slot queda certificado.
    const now = new Date("2026-07-25T10:35:00Z");
    const out = slotsHuerfanos({ now, rows: hasta(now), heartbeats: HB_25, empresasConCxc: CXC, slots: SLOTS_JUL2026 });
    const s = out.find((x) => x.slot === "all-0535");
    expect(s).toBeTruthy();
    expect(s!.ocurrencia).toBe("2026-07-25T05:35:00.000Z");
    expect(s!.heartbeat).toBe("switch-sync:all-0535#recuperado");
    expect(s!.pares).toContain("fashion_shoes/estadocuenta");
  });

  it("un slot ROTO de verdad (su entrada corrió y falló) NO se marca — sigue reportándose", () => {
    // 24-jul: la entrada de las 05:40 SÍ se invocó (06:04-06:06) pero joystep
    // falló con error; a las 10:53 la reconciliación recuperó joystep. Aunque el
    // par quedó al día, el slot NO se cubre: su entrada corrió y salió mal.
    const rows: SyncLogRowMin[] = [
      row("2026-07-24T06:04:37Z", "active_shoes", "facturas"),
      row("2026-07-24T06:04:42Z", "active_shoes", "estadocuenta"),
      row("2026-07-24T06:06:21Z", "active_shoes", "costo"),
      row("2026-07-24T06:06:24Z", "joystep", "facturas", "error"),
      row("2026-07-24T06:06:41Z", "joystep", "estadocuenta", "error"),
      row("2026-07-24T06:06:42Z", "joystep", "costo", "error"),
      row("2026-07-24T10:53:06Z", "joystep", "facturas"),
      row("2026-07-24T10:53:12Z", "joystep", "estadocuenta"),
      row("2026-07-24T10:54:16Z", "joystep", "costo"),
    ];
    const out = slotsHuerfanos({
      now: new Date("2026-07-24T14:00:00Z"),
      rows,
      heartbeats: new Map([["switch-sync:all-0540", "2026-07-23T05:54:00Z"]]),
      empresasConCxc: CXC,
      slots: SLOTS_JUL2026,
    });
    expect(out.map((s) => s.slot)).not.toContain("all-0540");
  });

  it("NO marca un slot cuyo trabajo quedó a medias (falta un par por recuperar)", () => {
    // Pasada de las 10:00: active_shoes/estadocuenta seguía en error y joystep
    // ni se había intentado → el slot 05:40 no está compensado todavía.
    const now = new Date("2026-07-25T10:35:00Z");
    const out = slotsHuerfanos({ now, rows: hasta(now), heartbeats: HB_25, empresasConCxc: CXC, slots: SLOTS_JUL2026 });
    expect(out.map((s) => s.slot)).not.toContain("all-0540");
    // Cuatro horas después, con todo recuperado, sí queda certificado.
    const out2 = slotsHuerfanos({
      now: new Date("2026-07-25T14:35:00Z"),
      rows: LOG_24_25,
      heartbeats: HB_25,
      empresasConCxc: CXC,
      slots: SLOTS_JUL2026,
    });
    expect(out2.map((s) => s.slot)).toContain("all-0540");
  });

  it("NO marca un slot cuya entrada ya registró su propio heartbeat en la ocurrencia", () => {
    const now = new Date("2026-07-25T14:35:00Z");
    const out = slotsHuerfanos({
      now,
      rows: LOG_24_25,
      // all-0535 con heartbeat de HOY 05:51 (la entrada sí corrió).
      heartbeats: new Map([["switch-sync:all-0535", "2026-07-25T05:51:52Z"]]),
      empresasConCxc: CXC,
      slots: SLOTS_JUL2026,
    });
    expect(out.map((s) => s.slot)).not.toContain("all-0535");
  });
});

describe("slotCubiertoPorRecuperacion — tope duro anti-enmascaramiento", () => {
  const now = Date.parse("2026-07-25T14:53:00Z");

  it("slot stale 33h con marca fresca → cubierto (no alerta)", () => {
    expect(
      slotCubiertoPorRecuperacion(new Date(now - 33.5 * H).toISOString(), new Date(now - 4 * H).toISOString(), now),
    ).toBe(true);
  });

  it("entrada muerta (>50h sin correr) vuelve a alertar aunque la marca esté fresca", () => {
    expect(
      slotCubiertoPorRecuperacion(
        new Date(now - (SLOT_ENTRY_DEAD_HOURS + 1) * H).toISOString(),
        new Date(now - 1 * H).toISOString(),
        now,
      ),
    ).toBe(false);
  });

  it("sin marca de recuperación, o sin heartbeat propio nunca → NO cubierto", () => {
    expect(slotCubiertoPorRecuperacion(new Date(now - 33 * H).toISOString(), null, now)).toBe(false);
    expect(slotCubiertoPorRecuperacion(null, new Date(now - 1 * H).toISOString(), now)).toBe(false);
  });

  it("marca vieja (>26h) tampoco cubre", () => {
    expect(
      slotCubiertoPorRecuperacion(new Date(now - 40 * H).toISOString(), new Date(now - 27 * H).toISOString(), now),
    ).toBe(false);
  });

  it("los nombres de heartbeat y de marca no se pisan", () => {
    expect(slotHeartbeatName("facturas-2315")).toBe("switch-sync:facturas-2315");
    expect(slotRecuperadoName("facturas-2315")).toBe("switch-sync:facturas-2315#recuperado");
  });
});
