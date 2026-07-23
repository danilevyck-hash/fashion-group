// Tests del recovery una-sola-vez para ChunkLoadError (chunk-recovery.ts).
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { isChunkError, attemptChunkRecovery } from "@/lib/chunk-recovery";

describe("isChunkError", () => {
  it("detecta los mensajes típicos de chunk fallido", () => {
    expect(isChunkError("ChunkLoadError: Loading chunk 4523 failed.")).toBe(true);
    expect(isChunkError("Loading chunk 123 failed (missing: https://x/_next/static/chunks/123.js)")).toBe(true);
    expect(isChunkError("Failed to fetch dynamically imported module: https://x/chunk.js")).toBe(true);
    expect(isChunkError("Importing a module script failed.")).toBe(true);
    expect(isChunkError("error loading dynamically imported module")).toBe(true);
  });

  it("NO detecta errores normales", () => {
    expect(isChunkError("Cannot read properties of undefined")).toBe(false);
    expect(isChunkError("NetworkError when attempting to fetch resource")).toBe(false);
    expect(isChunkError("")).toBe(false);
    expect(isChunkError(null)).toBe(false);
    expect(isChunkError(undefined)).toBe(false);
  });
});

describe("attemptChunkRecovery — guard una-sola-vez", () => {
  const reloadMock = vi.fn();

  beforeEach(() => {
    sessionStorage.clear();
    reloadMock.mockClear();
    // jsdom no permite reasignar location.reload directamente — se reemplaza location.
    Object.defineProperty(window, "location", {
      value: { ...window.location, reload: reloadMock },
      writable: true,
      configurable: true,
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-23T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("primera vez: inicia recovery (reload) y devuelve true", async () => {
    expect(attemptChunkRecovery()).toBe(true);
    await vi.runAllTimersAsync(); // resuelve el async interno (sin SW → reload)
    expect(reloadMock).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem("fg_chunk_recovery")).not.toBeNull();
  });

  it("segunda vez en <1 min: bloquea (devuelve false, sin reload)", async () => {
    expect(attemptChunkRecovery()).toBe(true);
    await vi.runAllTimersAsync();
    reloadMock.mockClear();

    vi.setSystemTime(new Date("2026-07-23T12:00:30Z")); // +30s
    expect(attemptChunkRecovery()).toBe(false);
    await vi.runAllTimersAsync();
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it("pasada la ventana de 1 min: vuelve a permitir recovery", async () => {
    expect(attemptChunkRecovery()).toBe(true);
    await vi.runAllTimersAsync();
    reloadMock.mockClear();

    vi.setSystemTime(new Date("2026-07-23T12:02:00Z")); // +2 min
    expect(attemptChunkRecovery()).toBe(true);
    await vi.runAllTimersAsync();
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it("si hay SW en waiting: le manda SKIP_WAITING en vez de reload", async () => {
    const postMessage = vi.fn();
    Object.defineProperty(navigator, "serviceWorker", {
      value: { getRegistration: () => Promise.resolve({ waiting: { postMessage } }) },
      writable: true,
      configurable: true,
    });

    expect(attemptChunkRecovery()).toBe(true);
    await vi.runAllTimersAsync();
    expect(postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    expect(reloadMock).not.toHaveBeenCalled();

    // limpiar el mock de serviceWorker para otros tests
    Object.defineProperty(navigator, "serviceWorker", { value: undefined, writable: true, configurable: true });
  });
});
