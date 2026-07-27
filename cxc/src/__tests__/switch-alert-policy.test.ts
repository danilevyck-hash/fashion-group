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

import { isSwitch401, isSwitchTransitorio, isSwitchSilenciable, computeStreakSilenciable } from "@/lib/switch-api/alert-policy";

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

  it("errores no-token no son 401 (pero red/5xx ahora son silenciables aparte)", () => {
    expect(isSwitch401("Error de red en /autenticacion: fetch failed")).toBe(false);
    expect(isSwitch401("Timeout >30000ms en /apifactura")).toBe(false);
    expect(isSwitch401("/apifactura → HTTP 500: Internal Server Error")).toBe(false);
    expect(isSwitch401("Auth respondió 200 pero sin token: <!DOCTYPE html>")).toBe(false);
    expect(isSwitch401("Run previo atascado en 'running' (probable timeout); cerrado por el siguiente run.")).toBe(false);
    expect(isSwitch401(null)).toBe(false);
    expect(isSwitch401("")).toBe(false);
  });
});

describe("isSwitchTransitorio (anti-ruido red, 17-jul-2026)", () => {
  it("detecta errores de red reales del incidente 17-jul", () => {
    expect(isSwitchTransitorio("Error de red en /autenticacion: fetch failed (ECONNREFUSED)")).toBe(true);
    expect(isSwitchTransitorio("Error de red en /autenticacion: fetch failed (UND_ERR_CONNECT_TIMEOUT)")).toBe(true);
    expect(isSwitchTransitorio("Timeout >30000ms en /apifactura")).toBe(true);
    expect(isSwitchTransitorio("/apifactura → HTTP 502: Bad Gateway")).toBe(true);
  });

  it("LICENCIA y errores de negocio siguen siendo inmediatos", () => {
    expect(isSwitchTransitorio("Error de red en /x: LICENCIA NO SE ENCUENTRA ACTIVA")).toBe(false);
    expect(isSwitchTransitorio("Auth fallo: HTTP 400 — LICENCIA NO SE ENCUENTRA ACTIVA")).toBe(false);
    expect(isSwitchTransitorio("Run previo atascado en 'running' (probable timeout); cerrado por el siguiente run.")).toBe(false);
    expect(isSwitchTransitorio(null)).toBe(false);
  });

  /**
   * CAMBIO DELIBERADO (27-jul-2026, auditoría de alertas).
   *
   * Este caso afirmaba lo CONTRARIO: que la página de excepción de Switch
   * alertara de inmediato. Era el bug. `outage-resumen.ts` ya clasificaba el
   * mismo mensaje como "Switch estuvo caído… sin impacto" mientras alert-policy
   * lo trataba como emergencia y le mandaba 200 caracteres de HTML crudo al
   * celular de Daniel. Medido en producción: 5 ocurrencias en 30 días, las 5
   * recuperadas solas en ≤12h, 0 sostenidas.
   *
   * Ahora es un transitorio como cualquier otro: se calla en la 1ª corrida y
   * escala por streak si de verdad no se recupera. Ver alertas-canal.test.ts.
   */
  it("la página de excepción de Switch es un transitorio (se recupera sola)", () => {
    expect(isSwitchTransitorio("Auth respondió 200 pero sin token: <!DOCTYPE html>")).toBe(true);
    // …pero una LICENCIA vencida envuelta en HTML NO se silencia.
    expect(
      isSwitchTransitorio("LICENCIA NO SE ENCUENTRA ACTIVA <!DOCTYPE html>"),
    ).toBe(false);
  });

  it("isSwitchSilenciable = 401 o transitorio", () => {
    expect(isSwitchSilenciable("/apifactura → HTTP 401: TOKEN INVALIDO")).toBe(true);
    expect(isSwitchSilenciable("Error de red en /autenticacion: fetch failed (ECONNREFUSED)")).toBe(true);
    expect(isSwitchSilenciable("Auth fallo: HTTP 400 — LICENCIA NO SE ENCUENTRA ACTIVA")).toBe(false);
  });
});

describe("computeStreakSilenciable", () => {
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
    const r = computeStreakSilenciable([err401("2026-07-10T05:30:00Z"), success("2026-07-09T05:30:00Z")]);
    expect(r.streak).toBe(1);
  });

  it("2 corridas consecutivas 401 → streak 2 con sinceIso de la primera", () => {
    const r = computeStreakSilenciable([
      err401("2026-07-10T05:30:00Z"),
      err401("2026-07-09T05:30:00Z"),
      success("2026-07-08T05:30:00Z"),
    ]);
    expect(r.streak).toBe(2);
    expect(r.sinceIso).toBe("2026-07-09T05:30:00Z");
  });

  it("un success intermedio corta el streak", () => {
    const r = computeStreakSilenciable([
      err401("2026-07-10T05:30:00Z"),
      success("2026-07-09T05:30:00Z"),
      err401("2026-07-08T05:30:00Z"),
    ]);
    expect(r.streak).toBe(1);
  });

  it("un error de RED intermedio NO corta el streak (mismo Switch caído)", () => {
    const r = computeStreakSilenciable([
      err401("2026-07-10T05:30:00Z"),
      { status: "error", started_at: "2026-07-09T05:30:00Z", error_message: "Error de red en /autenticacion: fetch failed (ECONNREFUSED)" },
      err401("2026-07-08T05:30:00Z"),
    ]);
    expect(r.streak).toBe(3);
    expect(r.sinceIso).toBe("2026-07-08T05:30:00Z");
  });

  it("un error NO silenciable (LICENCIA) sí corta el streak", () => {
    const r = computeStreakSilenciable([
      err401("2026-07-10T05:30:00Z"),
      { status: "error", started_at: "2026-07-09T05:30:00Z", error_message: "Auth fallo: HTTP 400 — LICENCIA NO SE ENCUENTRA ACTIVA" },
      err401("2026-07-08T05:30:00Z"),
    ]);
    expect(r.streak).toBe(1);
  });

  it("sin historial → streak 0", () => {
    expect(computeStreakSilenciable([]).streak).toBe(0);
  });
});
