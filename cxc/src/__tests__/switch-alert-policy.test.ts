/**
 * Política anti-ruido de alertas Switch: clasificador 401 + streak de corridas
 * consecutivas. Mensajes de ejemplo copiados literales de switch_sync_log de
 * producción (jul-2026) — si Switch cambia el formato, estos tests lo delatan.
 */
import { describe, it, expect, vi } from "vitest";

// alert-policy importa supabase-server y telegram (vía cron-telemetry) en el
// top-level; se mockean para que el import no construya el cliente real ni
// intente enviar Telegram (mismo patrón que cron-telemetry.test.ts).
vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: { from: vi.fn() },
}));
vi.mock("@/lib/telegram", () => ({
  sendTelegramAlert: vi.fn(),
  shortError: (s: string) => s,
}));

import { isSwitch401, computeStreak401 } from "@/lib/switch-api/alert-policy";

describe("isSwitch401", () => {
  it("detecta token muerto a media paginación (caso real recibos)", () => {
    expect(
      isSwitch401("/apicliente/lista?porPagina=500&paginaActual=1 → HTTP 401: TOKEN INVALIDO"),
    ).toBe(true);
    expect(
      isSwitch401("/apireporte/recibos?desde=2026-06-01&hasta=2026-06-30&porPagina=50&paginaActual=1 → HTTP 401: TOKEN INVALIDO"),
    ).toBe(true);
  });

  it("detecta auth rechazada con 401/403 y TOKEN EXPIRADO", () => {
    expect(isSwitch401("Auth fallo: HTTP 401 — credencial rechazada")).toBe(true);
    expect(isSwitch401("/apifactura → HTTP 403: sin permiso")).toBe(true);
    expect(isSwitch401("TOKEN EXPIRADO")).toBe(true);
  });

  it("LICENCIA NO ACTIVA alerta de inmediato aunque venga con 401", () => {
    // Caso real: llega con HTTP 400, pero el guard cubre un futuro 401.
    expect(isSwitch401("Auth fallo: HTTP 400 — LICENCIA NO SE ENCUENTRA ACTIVA")).toBe(false);
    expect(isSwitch401("Auth fallo: HTTP 401 — LICENCIA NO SE ENCUENTRA ACTIVA")).toBe(false);
  });

  it("errores no-token siguen siendo inmediatos", () => {
    expect(isSwitch401("Error de red en /autenticacion: fetch failed")).toBe(false);
    expect(isSwitch401("Timeout >30000ms en /apifactura")).toBe(false);
    expect(isSwitch401("/apifactura → HTTP 500: Internal Server Error")).toBe(false);
    expect(isSwitch401("Auth respondió 200 pero sin token: <!DOCTYPE html>")).toBe(false);
    expect(isSwitch401("Run previo atascado en 'running' (probable timeout); cerrado por el siguiente run.")).toBe(false);
    expect(isSwitch401(null)).toBe(false);
    expect(isSwitch401("")).toBe(false);
  });
});

describe("computeStreak401", () => {
  const err401 = (started_at: string) => ({
    status: "error",
    started_at,
    error_message: "/apifactura → HTTP 401: TOKEN INVALIDO",
  });
  const success = (started_at: string) => ({
    status: "success",
    started_at,
    error_message: null,
  });

  it("1 solo 401 (corrida actual) → streak 1, no escala", () => {
    const r = computeStreak401([err401("2026-07-10T05:30:00Z"), success("2026-07-09T05:30:00Z")]);
    expect(r.streak).toBe(1);
  });

  it("2 corridas consecutivas 401 → streak 2 con sinceIso de la primera", () => {
    const r = computeStreak401([
      err401("2026-07-10T05:30:00Z"),
      err401("2026-07-09T05:30:00Z"),
      success("2026-07-08T05:30:00Z"),
    ]);
    expect(r.streak).toBe(2);
    expect(r.sinceIso).toBe("2026-07-09T05:30:00Z");
  });

  it("un success intermedio corta el streak", () => {
    const r = computeStreak401([
      err401("2026-07-10T05:30:00Z"),
      success("2026-07-09T05:30:00Z"),
      err401("2026-07-08T05:30:00Z"),
    ]);
    expect(r.streak).toBe(1);
  });

  it("un error NO-401 intermedio también corta el streak", () => {
    const r = computeStreak401([
      err401("2026-07-10T05:30:00Z"),
      { status: "error", started_at: "2026-07-09T05:30:00Z", error_message: "Error de red en /autenticacion: fetch failed" },
      err401("2026-07-08T05:30:00Z"),
    ]);
    expect(r.streak).toBe(1);
  });

  it("sin historial → streak 0", () => {
    expect(computeStreak401([]).streak).toBe(0);
  });
});
