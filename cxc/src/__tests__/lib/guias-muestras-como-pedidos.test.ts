/**
 * 🔴 MUESTRAS EN EL ORDEN DE PEDIDOS (25-nov-2026, Daniel: «sí, los tres»).
 * Angel (bodega) MIRA la lista de todas las empresas menos Vistana, sin
 * enviar; sigue reclamando «No llegó». El resto de bodega no ve la lista.
 */
import { describe, it, expect } from "vitest";
import {
  MUESTRAS_COMO_PEDIDOS_2026_11,
  empresasQueVenMuestras,
  enviadaALaVista,
  puedeAccionMuestra,
  soloMiraMuestras,
} from "@/lib/guias/muestras";

describe("🔴 quién ve la lista de Muestras", () => {
  it("el interruptor está PRENDIDO", () => expect(MUESTRAS_COMO_PEDIDOS_2026_11).toBe(true));

  it("Angel: las 5 del grupo, sin Vistana, y solo mira", () => {
    const e = empresasQueVenMuestras("Angel", "bodega");
    expect(e).not.toContain("vistana");
    expect([...e].sort()).toEqual(["active_shoes", "active_wear", "fashion_shoes", "fashion_wear", "joystep"]);
    expect(soloMiraMuestras("angel", "bodega")).toBe(true);
  });

  it("otro de bodega (Jorman) no ve la lista", () => {
    expect(empresasQueVenMuestras("jorman", "bodega")).toEqual([]);
    expect(soloMiraMuestras("jorman", "bodega")).toBe(false);
  });

  it("el vendedor y admin siguen igual: ven y mandan", () => {
    expect(empresasQueVenMuestras("edwin", "vendedor")).toEqual(["vistana"]);
    expect(empresasQueVenMuestras("daniel", "admin")).toContain("vistana");
    expect(soloMiraMuestras("rey", "vendedor")).toBe(false);
  });
});

describe("🔴 Angel NO envía; sí reclama «No llegó»", () => {
  const q = { role: "bodega", userName: "angel" };
  it("«Enviada» → no", () => {
    expect(puedeAccionMuestra("enviada", { empresa_key: "fashion_shoes", estado: "falta" }, q).ok).toBe(false);
  });
  it("«No llegó» de una enviada → sí", () => {
    expect(puedeAccionMuestra("no_llego", { empresa_key: "fashion_shoes", estado: "enviada" }, q).ok).toBe(true);
  });
});

describe("lo enviado se le ve 7 días, para reclamarlo", () => {
  const ahora = "2026-11-25T15:00:00.000Z";
  it("hace 2 días sí, hace 8 no, sin fecha no", () => {
    expect(enviadaALaVista("2026-11-23T15:00:00.000Z", ahora)).toBe(true);
    expect(enviadaALaVista("2026-11-17T15:00:00.000Z", ahora)).toBe(false);
    expect(enviadaALaVista(null, ahora)).toBe(false);
  });
});
