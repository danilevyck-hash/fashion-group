/**
 * Candado del sync manual "Actualizar ahora" (/api/admin/sync-now):
 *   - los 2 motivos de 409 (running —mismo tipo o cross-type— / cooldown) y su
 *     orden. La ventana "cron-proximo" se ELIMINÓ (jul-2026): el clic siempre
 *     actualiza; la concurrencia real la cubre el running cross-type.
 *   - el cronograma espejo de vercel.json (proximoCronParaEmpresa, que queda
 *     en cron-telemetry para telemetría),
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
  lockKeyDe,
  isSyncNowModulo,
  moduloConfig,
  rolesSyncNow,
  SYNC_NOW_MODULOS,
  SYNC_NOW_COOLDOWN_MIN,
} from "@/lib/switch-api/sync-now";
import { isRunningLockConflict } from "@/lib/switch-api/sync-log";

const minAntes = (base: Date, min: number) => new Date(base.getTime() - min * 60_000).toISOString();

// 12:00 UTC = 7:00 Panamá — instante de referencia arbitrario para los tests
// de running/cooldown (el precheck ya no mira el cronograma de crons).
const AHORA = new Date("2026-07-23T12:00:00Z");

describe("precheckSyncNow — motivo running (mismo tipo)", () => {
  it("409 running con corrida fresca (<30 min), con el 'hace X min' en el detalle", () => {
    const r = precheckSyncNow({
      ahora: AHORA,
      runningStartedAt: minAntes(AHORA, 5),
      lastSuccessFinishedAt: null,
    });
    expect(r?.motivo).toBe("running");
    expect(r?.detalle).toContain("actualización en curso");
    expect(r?.detalle).toContain("hace 5 min");
    // El cliente se engancha al running: el detalle NO trae instrucciones de
    // esperar ("espera", "sync de las HH:MM").
    expect(r?.detalle.toLowerCase()).not.toContain("espera");
  });

  it("una fila running huérfana (>30 min) NO bloquea", () => {
    const r = precheckSyncNow({
      ahora: AHORA,
      runningStartedAt: minAntes(AHORA, 45),
      lastSuccessFinishedAt: null,
    });
    expect(r).toBeNull();
  });

  it("running gana sobre cooldown (orden de capas)", () => {
    const r = precheckSyncNow({
      ahora: AHORA,
      runningStartedAt: minAntes(AHORA, 2),
      lastSuccessFinishedAt: minAntes(AHORA, 3),
    });
    expect(r?.motivo).toBe("running");
  });
});

describe("precheckSyncNow — running cross-type (misma empresa, otro sync_type)", () => {
  it("409 running si OTRO sync_type de la empresa corre fresco (ej. cron tipo=all)", () => {
    const r = precheckSyncNow({
      ahora: AHORA,
      runningStartedAt: null,
      runningOtroStartedAt: minAntes(AHORA, 3),
      lastSuccessFinishedAt: null,
    });
    expect(r?.motivo).toBe("running");
    expect(r?.detalle).toContain("actualización en curso");
  });

  it("un running cross-type huérfano (>30 min) NO bloquea", () => {
    const r = precheckSyncNow({
      ahora: AHORA,
      runningStartedAt: null,
      runningOtroStartedAt: minAntes(AHORA, 40),
      lastSuccessFinishedAt: null,
    });
    expect(r).toBeNull();
  });
});

describe("precheckSyncNow — la cercanía de un cron YA NO bloquea (Ajuste 3, jul-2026)", () => {
  it("con un cron a 25 min (vistana 15:45 → estadocuenta 16:10) el precheck deja pasar", () => {
    // El precheck ya ni conoce el cronograma: solo running + cooldown. Se fija
    // acá con un instante que ANTES caía dentro de la ventana de 40 min.
    const ahora = new Date("2026-07-23T15:45:00Z");
    expect(proximoCronParaEmpresa("vistana", ahora)?.enMinutos).toBe(25);
    const r = precheckSyncNow({
      ahora,
      runningStartedAt: null,
      lastSuccessFinishedAt: null,
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
    });
    expect(r?.motivo).toBe("cooldown");
    expect(r?.detalle).toContain("hace 8 min");
  });

  it("no bloquea pasado el cooldown", () => {
    const r = precheckSyncNow({
      ahora: AHORA,
      runningStartedAt: null,
      lastSuccessFinishedAt: minAntes(AHORA, SYNC_NOW_COOLDOWN_MIN + 1),
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

describe("lockKeyDe / config por módulo", () => {
  it("clientes-master no toca Switch y no tiene lock", () => {
    expect(moduloConfig("clientes-master").tocaSwitch).toBe(false);
    expect(lockKeyDe("clientes-master", null)).toBeNull();
  });

  it("catálogos fijan su empresa: reebok=active_shoes, joybees=joystep", () => {
    expect(lockKeyDe("catalogo-reebok", null)).toEqual({ empresaKey: "active_shoes", syncType: "catalogo_reebok" });
    expect(lockKeyDe("catalogo-joybees", null)).toEqual({ empresaKey: "joystep", syncType: "catalogo_joybees" });
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

  it("refresh-vistas: DB-only — sin empresa, sin Switch, sin lock; cooldown por heartbeats", () => {
    expect(isSyncNowModulo("refresh-vistas")).toBe(true);
    const cfg = moduloConfig("refresh-vistas");
    expect(cfg.empresas).toBeNull();
    expect(cfg.tocaSwitch).toBe(false);
    expect(lockKeyDe("refresh-vistas", null)).toBeNull();
    // Cooldown mira el heartbeat manual Y el del cron de las 07:35.
    expect(cfg.cooldownHeartbeats).toEqual(["sync-now-refresh-vistas", "refresh-clientes-views"]);
  });

  it("proveedores: por empresa (universo empresasConCxp = 6 B2B + Multifashion, sin Boston)", () => {
    expect(isSyncNowModulo("proveedores")).toBe(true);
    const cfg = moduloConfig("proveedores");
    expect(cfg.tocaSwitch).toBe(true);
    expect(cfg.empresas).toContain("american_classic");
    expect(cfg.empresas).toContain("joystep");
    expect(cfg.empresas).not.toContain("confecciones_boston");
    expect(cfg.empresas).toHaveLength(7);
    expect(lockKeyDe("proveedores", "vistana")).toEqual({ empresaKey: "vistana", syncType: "proveedores" });
  });
});

describe("rolesSyncNow — roles por módulo", () => {
  it("vendedor puede disparar SOLO los catálogos", () => {
    expect(rolesSyncNow("catalogo-reebok")).toContain("vendedor");
    expect(rolesSyncNow("catalogo-joybees")).toContain("vendedor");
    for (const m of SYNC_NOW_MODULOS) {
      if (m === "catalogo-reebok" || m === "catalogo-joybees") continue;
      expect(rolesSyncNow(m)).not.toContain("vendedor");
    }
  });

  it("admin y secretaria siguen en TODOS los módulos", () => {
    for (const m of SYNC_NOW_MODULOS) {
      expect(rolesSyncNow(m)).toContain("admin");
      expect(rolesSyncNow(m)).toContain("secretaria");
    }
  });

  it("contabilidad puede disparar SOLO proveedores (es quien vive en /proveedores)", () => {
    expect(rolesSyncNow("proveedores")).toContain("contabilidad");
    for (const m of SYNC_NOW_MODULOS) {
      if (m === "proveedores") continue;
      expect(rolesSyncNow(m)).not.toContain("contabilidad");
    }
  });

  it("vendedor NO dispara proveedores", () => {
    expect(rolesSyncNow("proveedores")).not.toContain("vendedor");
  });

  it("refresh-vistas queda en admin+secretaria (ni vendedor ni contabilidad)", () => {
    expect(rolesSyncNow("refresh-vistas")).toEqual(["admin", "secretaria"]);
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
