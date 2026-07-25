import { describe, it, expect, vi } from "vitest";
import {
  fetchJsonWithRetry,
  isRetryableStatus,
  HttpError,
  describeFetchError,
} from "@/lib/fetch-retry";

// Respuesta mínima con la forma que consume fetchJsonWithRetry.
function res(status: number, body: unknown = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const noSleep = async () => {};

describe("isRetryableStatus", () => {
  it("reintenta 5xx, 408 y 429", () => {
    for (const s of [500, 502, 503, 504, 408, 429]) {
      expect(isRetryableStatus(s)).toBe(true);
    }
  });

  it("NO reintenta 4xx de permiso/validación (401 anti-ruido)", () => {
    for (const s of [400, 401, 403, 404, 422]) {
      expect(isRetryableStatus(s)).toBe(false);
    }
  });
});

describe("fetchJsonWithRetry", () => {
  it("devuelve el JSON al primer intento cuando todo va bien", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(200, { ok: 1 }));
    const out = await fetchJsonWithRetry<{ ok: number }>("/x", { fetchImpl, sleepImpl: noSleep });
    expect(out).toEqual({ ok: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("caso real: 500 por statement timeout en caché fría y el 2do intento pasa", async () => {
    // Reproduce lo medido en producción: la 1ra corrida de
    // ventas_dashboard_summary muere por statement timeout (500) y la 2da,
    // con la caché de Postgres caliente, responde bien.
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(res(500, { error: "canceling statement due to statement timeout" }))
      .mockResolvedValueOnce(res(200, { kpis: {} }));

    const out = await fetchJsonWithRetry<{ kpis: unknown }>("/api/ventas/resumen", {
      fetchImpl,
      sleepImpl: noSleep,
    });

    expect(out).toEqual({ kpis: {} });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("reintenta también ante fallo de red (fetch rechaza)", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(res(200, { ok: true }));
    const out = await fetchJsonWithRetry<{ ok: boolean }>("/x", { fetchImpl, sleepImpl: noSleep });
    expect(out).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("agota los 3 intentos y recién ahí lanza", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(503));
    await expect(
      fetchJsonWithRetry("/x", { fetchImpl, sleepImpl: noSleep }),
    ).rejects.toBeInstanceOf(HttpError);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("un 401 corta de inmediato: no gasta reintentos", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(401));
    await expect(
      fetchJsonWithRetry("/x", { fetchImpl, sleepImpl: noSleep }),
    ).rejects.toMatchObject({ status: 401 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("respeta el número de intentos configurado", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(500));
    await expect(
      fetchJsonWithRetry("/x", { fetchImpl, sleepImpl: noSleep, attempts: 2 }),
    ).rejects.toBeTruthy();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("aplica backoff creciente entre intentos (0, base, base×2)", async () => {
    const esperas: number[] = [];
    const fetchImpl = vi.fn().mockResolvedValue(res(500));
    await fetchJsonWithRetry("/x", {
      fetchImpl,
      baseDelayMs: 400,
      sleepImpl: async (ms) => { esperas.push(ms); },
    }).catch(() => {});
    expect(esperas).toEqual([400, 800]);
  });

  it("un abort no se reintenta", async () => {
    const abortErr = Object.assign(new Error("aborted"), { name: "AbortError" });
    const fetchImpl = vi.fn().mockRejectedValue(abortErr);
    await expect(
      fetchJsonWithRetry("/x", { fetchImpl, sleepImpl: noSleep }),
    ).rejects.toThrow("aborted");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("pide siempre no-store (gotcha de caché de fetch en Next)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(200, {}));
    await fetchJsonWithRetry("/x", { fetchImpl, sleepImpl: noSleep });
    expect(fetchImpl).toHaveBeenCalledWith("/x", expect.objectContaining({ cache: "no-store" }));
  });
});

describe("describeFetchError", () => {
  it("describe HttpError con su status", () => {
    expect(describeFetchError(new HttpError(503))).toBe("HTTP 503");
  });
  it("describe Error normal con su mensaje", () => {
    expect(describeFetchError(new Error("boom"))).toBe("boom");
  });
  it("tiene fallback para cualquier otra cosa", () => {
    expect(describeFetchError("???")).toBe("error inesperado");
  });
});
