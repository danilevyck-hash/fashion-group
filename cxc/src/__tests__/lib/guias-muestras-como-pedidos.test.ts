/**
 * 🔴 MUESTRAS EN EL ORDEN DE PEDIDOS (25-nov-2026, Daniel: «sí, los tres»).
 * Angel (bodega) MIRA la lista de todas las empresas menos Vistana, sin
 * enviar; sigue reclamando «No llegó». El resto de bodega no ve la lista.
 */
import { describe, it, expect } from "vitest";
import {
  MUESTRAS_COMO_PEDIDOS_2026_11,
  empresasQueVenMuestras,
  ESTADOS_POR_MANDAR,
  puedeAccionMuestra,
  soloMiraMuestras,
} from "@/lib/guias/muestras";

describe("🔴 Angel manda muestras como Rey (Daniel, 25-nov-2026)", () => {
  it("el interruptor está PRENDIDO", () => expect(MUESTRAS_COMO_PEDIDOS_2026_11).toBe(true));

  it("ve y manda las 5 del grupo, sin Vistana, y ya no es solo lectura", () => {
    const e = empresasQueVenMuestras("Angel", "bodega");
    expect([...e].sort()).toEqual(["active_shoes", "active_wear", "fashion_shoes", "fashion_wear", "joystep"]);
    expect(soloMiraMuestras("angel", "bodega")).toBe(false);
  });

  const q = { role: "bodega", userName: "angel" };
  for (const e of ["fashion_wear", "fashion_shoes", "active_wear", "active_shoes", "joystep"]) {
    it(`«Enviada» en ${e} → sí`, () => {
      expect(puedeAccionMuestra("enviada", { empresa_key: e, estado: "falta" }, q).ok).toBe(true);
    });
  }
  it("«Enviada» en Vistana → NO (la manda Edwin)", () => {
    const v = puedeAccionMuestra("enviada", { empresa_key: "vistana", estado: "falta" }, q);
    expect(v).toEqual({ ok: false, error: "Esa muestra la manda Edwin" });
  });
  it("sigue siendo bodega: reclama «No llegó»", () => {
    expect(puedeAccionMuestra("no_llego", { empresa_key: "fashion_shoes", estado: "enviada" }, q).ok).toBe(true);
  });

  it("otro de bodega (Jorman) no ve ni manda", () => {
    expect(empresasQueVenMuestras("jorman", "bodega")).toEqual([]);
    expect(puedeAccionMuestra("enviada", { empresa_key: "fashion_shoes", estado: "falta" }, { role: "bodega", userName: "jorman" }).ok).toBe(false);
  });

  it("Rey y Edwin siguen igual", () => {
    expect(empresasQueVenMuestras("edwin", "vendedor")).toEqual(["vistana"]);
    expect(empresasQueVenMuestras("rey", "vendedor")).not.toContain("vistana");
    expect(soloMiraMuestras("rey", "vendedor")).toBe(false);
  });
});

describe("🔴 la lista (Angel y vendedor) lleva SOLO lo por mandar", () => {
  it("una enviada no es «por mandar»: sale de la lista y del conteo", () => {
    expect(ESTADOS_POR_MANDAR).not.toContain("enviada");
  });
  it("la lectura de la lista pide solo esos estados, para todos", async () => {
    const { vi } = await import("vitest");
    const pedidos: unknown[] = [];
    vi.doMock("@/lib/supabase-server", () => {
      const c: Record<string, unknown> = {};
      for (const m of ["select", "eq", "limit"]) c[m] = () => c;
      c.in = (col: string, v: unknown) => { if (col === "estado") pedidos.push(v); return c; };
      c.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
      return { supabaseServer: { from: () => c } };
    });
    vi.resetModules();
    const { leerPorMandar } = await import("@/lib/guias/muestras-server");
    await leerPorMandar(["fashion_shoes"]);
    expect(pedidos).toEqual([[...ESTADOS_POR_MANDAR]]);
    vi.doUnmock("@/lib/supabase-server");
  });
});
