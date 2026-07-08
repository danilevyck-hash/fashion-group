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
  CRON_STALE_HOURS_DEFAULT,
  cronStaleThresholdHours,
  cronIsStale,
} from "@/lib/cron-telemetry";

const H = 3600 * 1000;

describe("cronStaleThresholdHours", () => {
  it("default 26h para un cron diario cualquiera", () => {
    expect(cronStaleThresholdHours("switch-sync")).toBe(CRON_STALE_HOURS_DEFAULT);
    expect(cronStaleThresholdHours("switch-sync")).toBe(26);
  });

  it("grupo-resumen-mensual usa 33 días (el mensual no es diario)", () => {
    expect(cronStaleThresholdHours("grupo-resumen-mensual")).toBe(33 * 24);
  });
});

describe("cronIsStale — umbral por-cron compartido", () => {
  const now = Date.parse("2026-07-08T12:00:00.000Z");

  it("cron diario: fresco a 10h, stale a 27h", () => {
    expect(cronIsStale("switch-sync", new Date(now - 10 * H).toISOString(), now)).toBe(false);
    expect(cronIsStale("switch-sync", new Date(now - 27 * H).toISOString(), now)).toBe(true);
  });

  it("grupo-resumen-mensual NO es stale a 29 días (falso positivo que causó la alerta)", () => {
    // Escenario real: última corrida piloto 5-jul, hoy 8-jul → luego ~29 días
    // hasta la próxima del día 3. Con 33d de umbral NO debe marcarse stale.
    expect(cronIsStale("grupo-resumen-mensual", new Date(now - 29 * 24 * H).toISOString(), now)).toBe(false);
    // Pero sí stale si de verdad pasa el ciclo mensual + margen (>33 días).
    expect(cronIsStale("grupo-resumen-mensual", new Date(now - 34 * 24 * H).toISOString(), now)).toBe(true);
  });

  it("sin heartbeat (null) o fecha inválida → stale", () => {
    expect(cronIsStale("switch-sync", null, now)).toBe(true);
    expect(cronIsStale("switch-sync", undefined, now)).toBe(true);
    expect(cronIsStale("switch-sync", "no-es-fecha", now)).toBe(true);
  });
});
