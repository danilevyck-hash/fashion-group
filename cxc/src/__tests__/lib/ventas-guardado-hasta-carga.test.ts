import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const h = vi.hoisted(() => ({ ultimaCarga: "2026-11-25T15:00:00Z" as string | null }));

vi.mock("@/lib/supabase-server", () => {
  const q: Record<string, unknown> = {};
  Object.assign(q, {
    select: () => q, eq: () => q, not: () => q, order: () => q,
    limit: async () => ({ data: h.ultimaCarga ? [{ finished_at: h.ultimaCarga }] : [], error: null }),
  });
  return { supabaseServer: { from: () => q } };
});
vi.mock("next/cache", () => {
  const guardado = new Map<string, unknown>();
  return {
    unstable_cache: (fn: (...a: unknown[]) => Promise<unknown>, partes: string[]) =>
      async (...args: unknown[]) => {
        const k = JSON.stringify([partes, args]);
        if (guardado.has(k)) return guardado.get(k);
        const v = await fn(...args);
        guardado.set(k, v);
        return v;
      },
  };
});

import { guardadoHastaLaProximaCarga, llaveGuardado, GUARDADO_SEGUNDOS } from "@/lib/ventas/guardado-hasta-carga";

describe("Ventas: lecturas guardadas hasta la próxima carga (25-nov-2026)", () => {
  beforeEach(() => { h.ultimaCarga = "2026-11-25T15:00:00Z"; });

  it("la segunda lectura con los mismos parámetros no vuelve a la base", async () => {
    const leer = vi.fn(async () => ({ total: 1 }));
    expect(await guardadoHastaLaProximaCarga("t-a", [2026, 11], leer)).toEqual({ total: 1 });
    expect(await guardadoHastaLaProximaCarga("t-a", [2026, 11], leer)).toEqual({ total: 1 });
    expect(leer).toHaveBeenCalledTimes(1);
  });

  it("otro parámetro u otra carga de Switch = otra lectura", async () => {
    const leer = vi.fn(async () => 1);
    await guardadoHastaLaProximaCarga("t-b", [2026, 11], leer);
    await guardadoHastaLaProximaCarga("t-b", [2025, 11], leer);
    h.ultimaCarga = "2026-11-25T16:00:00Z";
    await guardadoHastaLaProximaCarga("t-b", [2026, 11], leer);
    expect(leer).toHaveBeenCalledTimes(3);
  });

  it("un error NUNCA se guarda y sale tal cual", async () => {
    const err = { message: "timeout" };
    const leer = vi.fn().mockRejectedValueOnce(err).mockResolvedValueOnce(7);
    await expect(guardadoHastaLaProximaCarga("t-c", [1], leer)).rejects.toBe(err);
    expect(await guardadoHastaLaProximaCarga("t-c", [1], leer)).toBe(7);
  });

  it("sin saber la última carga se lee directo, sin guardar", async () => {
    h.ultimaCarga = null;
    const leer = vi.fn(async () => 1);
    await guardadoHastaLaProximaCarga("t-d", [1], leer);
    await guardadoHastaLaProximaCarga("t-d", [1], leer);
    expect(leer).toHaveBeenCalledTimes(2);
  });

  it("la llave lleva todos los parámetros, el día de Panamá, el UTC y la carga; vence a los 5 min", () => {
    expect(llaveGuardado([2026, 11], "2026-11-25", "2026-11-26", "c")).toBe("2026|11|2026-11-25|2026-11-26|c");
    expect(GUARDADO_SEGUNDOS).toBe(300);
  });

  it("Ventas sigue siendo solo admin (lo guardado no depende de quién mira)", () => {
    const page = readFileSync(join(process.cwd(), "src/app/ventas/page.tsx"), "utf8");
    expect(page).toContain('if (role !== "admin") redirect("/home")');
  });
});
