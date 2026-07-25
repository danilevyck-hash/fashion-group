// Lógica recovery-aware compartida por health-crons y el watchdog Telegram de
// la reconciliación (cron-telemetry.ts): un cron stale con recuperación EN
// CAMINO hoy no alerta / no cuenta para el 503 (pendingRecovery), con tope duro
// de 30h y fail-closed para crons sin heartbeat.
import { describe, it, expect, vi } from "vitest";

// cron-telemetry importa supabase-server y telegram en el top-level; se mockean
// para que el import no construya el cliente real ni intente enviar Telegram.
vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: { from: vi.fn() },
}));
vi.mock("@/lib/telegram", () => ({
  sendTelegramAlert: vi.fn(),
  shortError: (s: string) => s,
}));

import {
  recoveryStillComingToday,
  staleEsPendingRecovery,
  PENDING_RECOVERY_MAX_HOURS,
  RECONCILIACION_PASS_HOURS,
  COLATERAL_RECOVER_AFTER_HOUR_UTC,
  EXTRA_ENTRY_HOURS_UTC,
} from "@/lib/cron-telemetry";

const H = 3600 * 1000;

describe("recoveryStillComingToday", () => {
  it("colateral sin hora mínima: pendiente mientras quede una pasada POSTERIOR (estricto)", () => {
    expect(recoveryStillComingToday("sync-clientes-master", 8)).toBe(true); // vienen 10/14/18
    expect(recoveryStillComingToday("sync-clientes-master", 14.5)).toBe(true); // viene la 18
    expect(recoveryStillComingToday("sync-clientes-master", 18)).toBe(false); // la 18 en curso NO cuenta
    expect(recoveryStillComingToday("sync-clientes-master", 19)).toBe(false); // ya no viene nada hoy
  });

  it("colateral con hora mínima (cheques-alert=14): solo cuentan pasadas elegibles", () => {
    // A las 12: la pasada de las 14 y la de las 18 son elegibles (>=14) → viene.
    expect(recoveryStillComingToday("cheques-alert", 12)).toBe(true);
    // A las 17: queda la de las 18 → viene. A las 18 en punto: estricto → no.
    expect(recoveryStillComingToday("cheques-alert", 17)).toBe(true);
    expect(recoveryStillComingToday("cheques-alert", 18)).toBe(false);
  });

  it("switch-sync también es recuperable (pares vía switch_sync_log)", () => {
    expect(COLATERAL_RECOVER_AFTER_HOUR_UTC["switch-sync"]).toBe(0);
    expect(recoveryStillComingToday("switch-sync", 9)).toBe(true);
    expect(recoveryStillComingToday("switch-sync", 20)).toBe(false);
  });

  it("entradas extra propias: backup 10:30+18:30, acs-fidelizacion 16:30 (hora fraccional)", () => {
    expect(EXTRA_ENTRY_HOURS_UTC["backup"]).toEqual([10.5, 18.5]);
    expect(recoveryStillComingToday("backup", 8)).toBe(true); // vienen 10:30 y 18:30
    expect(recoveryStillComingToday("backup", 10.75)).toBe(true); // pasó la de 10:30, viene la de 18:30
    expect(recoveryStillComingToday("backup", 18.25)).toBe(true); // 18:15 < 18:30
    expect(recoveryStillComingToday("backup", 18.75)).toBe(false); // 18:45 ya pasó
    expect(recoveryStillComingToday("acs-fidelizacion", 12)).toBe(true);
    expect(recoveryStillComingToday("acs-fidelizacion", 17)).toBe(false);
  });

  it("los 3 grupos de backup tienen sus propias entradas extra (espejo de vercel.json)", () => {
    expect(EXTRA_ENTRY_HOURS_UTC["backup-switch"]).toEqual([11.25, 19.25]);
    expect(EXTRA_ENTRY_HOURS_UTC["backup-storage"]).toEqual([15.5]);
    // backup-storage corre 04:00 y 15:30 → a las 05:00 su 2ª entrada aún viene.
    expect(recoveryStillComingToday("backup-storage", 5)).toBe(true);
    expect(recoveryStillComingToday("backup-storage", 16)).toBe(false);
  });

  it("switch-reconciliacion y grupo-resumen-mensual JAMÁS se silencian", () => {
    for (const h of [0, 9, 13, 17]) {
      expect(recoveryStillComingToday("switch-reconciliacion", h)).toBe(false);
      expect(recoveryStillComingToday("grupo-resumen-mensual", h)).toBe(false);
    }
  });

  it("cron desconocido (sin recuperación en la metadata) → nunca pendiente", () => {
    expect(recoveryStillComingToday("cron-inventado", 8)).toBe(false);
  });

  it("las pasadas de reconciliación son 10/14/18 UTC (espejo de vercel.json)", () => {
    expect(RECONCILIACION_PASS_HOURS).toEqual([10, 14, 18]);
  });
});

describe("staleEsPendingRecovery", () => {
  // 08:00 UTC — antes de la primera pasada del día (10:00).
  const now8 = Date.parse("2026-07-23T08:00:00.000Z");
  // 19:00 UTC — después de la última pasada (18:00) y de la última entrada de backup.
  const now19 = Date.parse("2026-07-23T19:00:00.000Z");

  it("colateral stale 27h con pasadas por venir → pendingRecovery", () => {
    const last = new Date(now8 - 27 * H).toISOString();
    expect(staleEsPendingRecovery("sync-clientes-master", last, now8)).toBe(true);
  });

  it("tope duro: stale >= 30h NUNCA es pendingRecovery aunque venga recuperación", () => {
    const last = new Date(now8 - PENDING_RECOVERY_MAX_HOURS * H).toISOString();
    expect(staleEsPendingRecovery("sync-clientes-master", last, now8)).toBe(false);
    // justo por debajo del tope sí califica
    const casi = new Date(now8 - (PENDING_RECOVERY_MAX_HOURS - 1) * H).toISOString();
    expect(staleEsPendingRecovery("sync-clientes-master", casi, now8)).toBe(true);
  });

  it("después de la última oportunidad del día → 503 normal (no pendiente)", () => {
    const last = new Date(now19 - 27 * H).toISOString();
    expect(staleEsPendingRecovery("sync-clientes-master", last, now19)).toBe(false);
    expect(staleEsPendingRecovery("backup", last, now19)).toBe(false);
  });

  it("backup stale por la mañana → pendiente (sus entradas 10:30/18:30 aún vienen)", () => {
    const last = new Date(now8 - 27 * H).toISOString();
    expect(staleEsPendingRecovery("backup", last, now8)).toBe(true);
  });

  it("sin heartbeat (null/inválido) → fail-closed, nunca pendiente", () => {
    expect(staleEsPendingRecovery("sync-clientes-master", null, now8)).toBe(false);
    expect(staleEsPendingRecovery("sync-clientes-master", undefined, now8)).toBe(false);
    expect(staleEsPendingRecovery("sync-clientes-master", "no-es-fecha", now8)).toBe(false);
  });

  it("los que jamás se silencian tampoco califican aunque estén recién stale", () => {
    const last = new Date(now8 - 27 * H).toISOString();
    expect(staleEsPendingRecovery("switch-reconciliacion", last, now8)).toBe(false);
  });

  it("usa hora UTC fraccional: backup a las 18:15 sigue pendiente, a las 18:45 no", () => {
    const last = (nowMs: number) => new Date(nowMs - 27 * H).toISOString();
    const n1815 = Date.parse("2026-07-23T18:15:00.000Z");
    const n1845 = Date.parse("2026-07-23T18:45:00.000Z");
    expect(staleEsPendingRecovery("backup", last(n1815), n1815)).toBe(true);
    expect(staleEsPendingRecovery("backup", last(n1845), n1845)).toBe(false);
  });
});
