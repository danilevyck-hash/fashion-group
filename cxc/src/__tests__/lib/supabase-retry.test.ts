import { describe, it, expect, vi } from "vitest";
import { withDbRetry, isTransientDbError } from "@/lib/supabase-retry";

const noSleep = async () => {};
const noLog = () => {};

describe("isTransientDbError", () => {
  it("reconoce el statement timeout de Postgres (el bug real)", () => {
    expect(isTransientDbError({ message: "canceling statement due to statement timeout" })).toBe(true);
    expect(isTransientDbError({ code: "57014" })).toBe(true);
  });

  it("reconoce cortes de red hacia Supabase", () => {
    for (const m of ["fetch failed", "socket hang up", "ECONNRESET", "ETIMEDOUT"]) {
      expect(isTransientDbError({ message: m })).toBe(true);
    }
  });

  it("NO reconoce errores que van a fallar igual al repetir", () => {
    expect(isTransientDbError({ message: "Could not find the function public.foo in the schema cache" })).toBe(false);
    expect(isTransientDbError({ message: "permission denied for table switch_facturas" })).toBe(false);
    expect(isTransientDbError({ message: "column x does not exist" })).toBe(false);
    expect(isTransientDbError(null)).toBe(false);
    expect(isTransientDbError(undefined)).toBe(false);
  });
});

describe("withDbRetry", () => {
  it("no reintenta cuando la consulta sale bien", async () => {
    const run = vi.fn().mockResolvedValue({ data: [1, 2], error: null });
    const out = await withDbRetry(run, { sleepImpl: noSleep, logger: noLog });
    expect(out.data).toEqual([1, 2]);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("caso real: timeout en frío y el 2do intento (caché caliente) pasa", async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { message: "canceling statement due to statement timeout" } })
      .mockResolvedValueOnce({ data: [{ empresa: "vistana" }], error: null });
    const out = await withDbRetry(run, { sleepImpl: noSleep, logger: noLog });
    expect(out.error).toBeNull();
    expect(out.data).toEqual([{ empresa: "vistana" }]);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("crea la consulta de cero en cada intento (los builders son de un solo uso)", async () => {
    const creados: number[] = [];
    let n = 0;
    const run = () => {
      creados.push(++n);
      return Promise.resolve(
        n < 3
          ? { data: null, error: { message: "statement timeout" } }
          : { data: "ok", error: null },
      );
    };
    const out = await withDbRetry(run, { sleepImpl: noSleep, logger: noLog });
    expect(out.data).toBe("ok");
    expect(creados).toEqual([1, 2, 3]);
  });

  it("un error NO transitorio corta al primer intento", async () => {
    const run = vi.fn().mockResolvedValue({ data: null, error: { message: "permission denied" } });
    const out = await withDbRetry(run, { sleepImpl: noSleep, logger: noLog });
    expect(out.error?.message).toBe("permission denied");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("agotados los intentos devuelve el último error (el caller lo maneja igual que antes)", async () => {
    const run = vi.fn().mockResolvedValue({ data: null, error: { message: "statement timeout" } });
    const out = await withDbRetry(run, { sleepImpl: noSleep, logger: noLog });
    expect(out.error?.message).toBe("statement timeout");
    expect(run).toHaveBeenCalledTimes(3);
  });

  it("una excepción de red también se reintenta", async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce({ data: 42, error: null });
    const out = await withDbRetry(run, { sleepImpl: noSleep, logger: noLog });
    expect(out.data).toBe(42);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("una excepción NO transitoria no se reintenta y viaja como error", async () => {
    const run = vi.fn().mockRejectedValue(new Error("boom sintáctico"));
    const out = await withDbRetry(run, { sleepImpl: noSleep, logger: noLog });
    expect(out.error?.message).toBe("boom sintáctico");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("backoff corto y creciente (0, base, base×2)", async () => {
    const esperas: number[] = [];
    const run = vi.fn().mockResolvedValue({ data: null, error: { message: "statement timeout" } });
    await withDbRetry(run, {
      baseDelayMs: 300,
      sleepImpl: async (ms) => { esperas.push(ms); },
      logger: noLog,
    });
    expect(esperas).toEqual([300, 600]);
  });
});
