/**
 * Candado del sync manual "Actualizar ahora" (/api/admin/sync-now):
 *   - los 3 motivos de 409 (running / cron-proximo / cooldown) y su orden,
 *   - el cronograma espejo de vercel.json (proximoCronParaEmpresa),
 *   - la llave de lock por módulo (lockKeyDe) y la detección del conflicto
 *     del índice único (isRunningLockConflict).
 */
import { describe, it, expect, vi } from "vitest";

// sync-now importa (vía cron-telemetry / empresa-mapping) supabase-server y
// telegram en el top-level; se mockean para que el import no construya el
// cliente real (mismo patrón que switch-alert-policy.test.ts).
vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: { from: vi.fn() },
}));
vi.mock("@/lib/telegram", () => ({
  sendTelegramAlert: vi.fn(),
  shortError: (s: string) => s,
}));

import { proximoCronParaEmpresa } from "@/lib/cron-telemetry";
import {
  precheckSyncNow,
  proximoCronDe,
  lockKeyDe,
  isSyncNowModulo,
  moduloConfig,
  SYNC_NOW_COOLDOWN_MIN,
  SYNC_NOW_VENTANA_CRON_MIN,
} from "@/lib/switch-api/sync-now";
import { isRunningLockConflict } from "@/lib/switch-api/sync-log";

const minAntes = (base: Date, min: number) => new Date(base.getTime() - min * 60_000).toISOString();

// 12:00 UTC = 7:00 Panamá. Para vistana el próximo cron a esa hora es la
// reconciliación de las 14:00 UTC (120 min después) → lejos de la ventana de
// 40 min: los tests de running/cooldown no se contaminan con cron-proximo.
const AHORA = new Date("2026-07-23T12:00:00Z");

describe("precheckSyncNow — motivo running", () => {
  it("409 running con corrida fresca (<30 min), con el 'hace X min' en el detalle", () => {
    const r = precheckSyncNow({
      ahora: AHORA,
      runningStartedAt: minAntes(AHORA, 5),
      lastSuccessFinishedAt: null,
      proximo: null,
    });
    expect(r?.motivo).toBe("running");
    expect(r?.detalle).toContain("actualización en curso");
    expect(r?.detalle).toContain("hace 5 min");
  });

  it("una fila running huérfana (>30 min) NO bloquea", () => {
    const r = precheckSyncNow({
      ahora: AHORA,
      runningStartedAt: minAntes(AHORA, 45),
      lastSuccessFinishedAt: null,
      proximo: null,
    });
    expect(r).toBeNull();
  });

  it("running gana sobre cooldown y cron-proximo (orden de capas)", () => {
    const r = precheckSyncNow({
      ahora: AHORA,
      runningStartedAt: minAntes(AHORA, 2),
      lastSuccessFinishedAt: minAntes(AHORA, 3),
      proximo: { cron: "sync-recibos", hhmmUtc: "1210", horaPanama: "7:10", enMinutos: 10 },
    });
    expect(r?.motivo).toBe("running");
  });
});

describe("precheckSyncNow — motivo cron-proximo", () => {
  it("409 si el próximo cron de la empresa cae dentro de la ventana de 40 min", () => {
    const r = precheckSyncNow({
      ahora: AHORA,
      runningStartedAt: null,
      lastSuccessFinishedAt: null,
      proximo: { cron: "switch-sync estadocuenta", hhmmUtc: "1610", horaPanama: "11:10", enMinutos: 25 },
    });
    expect(r?.motivo).toBe("cron-proximo");
    expect(r?.detalle).toContain("11:10");
    expect(r?.detalle).toContain("hora Panamá");
  });

  it("no bloquea si el próximo cron está fuera de la ventana", () => {
    const r = precheckSyncNow({
      ahora: AHORA,
      runningStartedAt: null,
      lastSuccessFinishedAt: null,
      proximo: {
        cron: "switch-sync estadocuenta",
        hhmmUtc: "1610",
        horaPanama: "11:10",
        enMinutos: SYNC_NOW_VENTANA_CRON_MIN + 5,
      },
    });
    expect(r).toBeNull();
  });
});

describe("precheckSyncNow — motivo cooldown", () => {
  it("409 si el último success fue hace menos de 10 min", () => {
    const r = precheckSyncNow({
      ahora: AHORA,
      runningStartedAt: null,
      lastSuccessFinishedAt: minAntes(AHORA, SYNC_NOW_COOLDOWN_MIN - 2),
      proximo: null,
    });
    expect(r?.motivo).toBe("cooldown");
    expect(r?.detalle).toContain("hace 8 min");
  });

  it("no bloquea pasado el cooldown", () => {
    const r = precheckSyncNow({
      ahora: AHORA,
      runningStartedAt: null,
      lastSuccessFinishedAt: minAntes(AHORA, SYNC_NOW_COOLDOWN_MIN + 1),
      proximo: null,
    });
    expect(r).toBeNull();
  });
});

describe("proximoCronParaEmpresa — espejo de vercel.json", () => {
  it("vistana a las 15:45 UTC → estadocuenta 16:10 (25 min)", () => {
    const p = proximoCronParaEmpresa("vistana", new Date("2026-07-23T15:45:00Z"));
    expect(p?.hhmmUtc).toBe("1610");
    expect(p?.enMinutos).toBe(25);
    expect(p?.horaPanama).toBe("11:10");
  });

  it("active_shoes a las 11:50 UTC → reebok-catalogo 12:10", () => {
    const p = proximoCronParaEmpresa("active_shoes", new Date("2026-07-23T11:50:00Z"));
    expect(p?.cron).toBe("reebok-catalogo");
    expect(p?.hhmmUtc).toBe("1210");
    expect(p?.enMinutos).toBe(20);
  });

  it("american_classic tarde en la noche cruza al 00:15 del día siguiente", () => {
    const p = proximoCronParaEmpresa("american_classic", new Date("2026-07-23T23:30:00Z"));
    expect(p?.hhmmUtc).toBe("0015");
    expect(p?.enMinutos).toBe(45);
  });

  it("empresa desconocida → null", () => {
    expect(proximoCronParaEmpresa("no_existe", AHORA)).toBeNull();
  });
});

describe("proximoCronDe / lockKeyDe / config por módulo", () => {
  it("clientes-master está exento de la ventana (no toca Switch) y no tiene lock", () => {
    expect(proximoCronDe("clientes-master", null, AHORA)).toBeNull();
    expect(lockKeyDe("clientes-master", null)).toBeNull();
  });

  it("catálogos fijan su empresa: reebok=active_shoes, joybees=joystep", () => {
    expect(lockKeyDe("catalogo-reebok", null)).toEqual({ empresaKey: "active_shoes", syncType: "catalogo_reebok" });
    expect(lockKeyDe("catalogo-joybees", null)).toEqual({ empresaKey: "joystep", syncType: "catalogo_joybees" });
    expect(proximoCronDe("catalogo-reebok", null, new Date("2026-07-23T11:50:00Z"))?.cron).toBe("reebok-catalogo");
  });

  it("estadocuenta/facturas/recibos usan la empresa del body como llave", () => {
    expect(lockKeyDe("estadocuenta", "fashion_wear")).toEqual({ empresaKey: "fashion_wear", syncType: "estadocuenta" });
    expect(lockKeyDe("recibos", "vistana")).toEqual({ empresaKey: "vistana", syncType: "recibos" });
  });

  it("valida módulos y universos de empresa", () => {
    expect(isSyncNowModulo("estadocuenta")).toBe(true);
    expect(isSyncNowModulo("costo")).toBe(false);
    expect(moduloConfig("estadocuenta").empresas).toContain("joystep");
    expect(moduloConfig("recibos").empresas).not.toContain("joystep");
    expect(moduloConfig("facturas").empresas).toContain("confecciones_boston");
  });
});

describe("isRunningLockConflict — conflicto del índice único", () => {
  it("detecta 23505 / duplicate key / nombre del índice", () => {
    expect(isRunningLockConflict({ code: "23505", message: "duplicate key value" })).toBe(true);
    expect(
      isRunningLockConflict(
        new Error('duplicate key value violates unique constraint "switch_sync_log_running_lock"'),
      ),
    ).toBe(true);
    expect(isRunningLockConflict("Ya hay una corrida (lock switch_sync_log_running_lock)")).toBe(true);
  });

  it("no confunde otros errores", () => {
    expect(isRunningLockConflict(new Error("HTTP 401: TOKEN INVALIDO"))).toBe(false);
    expect(isRunningLockConflict({ code: "23503", message: "foreign key violation" })).toBe(false);
    expect(isRunningLockConflict(null)).toBe(false);
  });
});
