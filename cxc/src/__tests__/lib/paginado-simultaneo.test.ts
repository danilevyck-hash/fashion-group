/**
 * `leerTodoPaginado(..., simultaneas)` (7-oct-2026): las páginas que faltan
 * salen de a N, llegan EN ORDEN y el COUNT sigue mandando.
 */
import { describe, it, expect } from "vitest";
import { leerTodoPaginado } from "@/lib/supabase-paginado";

function tabla(n: number, pagina: number) {
  const pedidas: number[] = [];
  let enVuelo = 0;
  let maxEnVuelo = 0;
  const ejecutar = async (pedirCount: boolean, desde: number, hasta: number) => {
    pedidas.push(desde / pagina);
    enVuelo++; maxEnVuelo = Math.max(maxEnVuelo, enVuelo);
    await new Promise((r) => setTimeout(r, 1));
    enVuelo--;
    const data = Array.from({ length: Math.max(0, Math.min(hasta, n - 1) - desde + 1) }, (_, i) => desde + i);
    return { data, error: null, count: pedirCount ? n : null };
  };
  return { ejecutar, pedidas, max: () => maxEnVuelo };
}

describe("leerTodoPaginado · páginas simultáneas", () => {
  it("de a 3: trae todo, en orden, sin pasar de 3 a la vez", async () => {
    const t = tabla(5062, 1000);
    const filas = await leerTodoPaginado<number>("x", t.ejecutar, 1000, 3);
    expect(filas).toEqual(Array.from({ length: 5062 }, (_, i) => i));
    expect(t.pedidas.sort()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(t.max()).toBeLessThanOrEqual(3);
  });

  it("por defecto sigue siendo una tras otra", async () => {
    const t = tabla(2500, 1000);
    await leerTodoPaginado<number>("x", t.ejecutar, 1000);
    expect(t.max()).toBe(1);
  });

  it("una página sola no pide más", async () => {
    const t = tabla(10, 1000);
    expect((await leerTodoPaginado<number>("x", t.ejecutar, 1000, 3)).length).toBe(10);
    expect(t.pedidas).toEqual([0]);
  });

  it("si falta una fila, lo denuncia igual", async () => {
    const t = tabla(3000, 1000);
    const corta = async (c: boolean, d: number, h: number) => {
      const r = await t.ejecutar(c, d, h);
      return d === 2000 ? { ...r, data: r.data.slice(1) } : r;
    };
    await expect(leerTodoPaginado<number>("x", corta, 1000, 3)).rejects.toThrow(/lectura incompleta/);
  });
});
