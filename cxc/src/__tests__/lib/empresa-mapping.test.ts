import { describe, it, expect, vi } from "vitest";

// empresa-mapping importa supabase-server en el top-level; lo mockeamos para que
// el import no intente construir el cliente real en el entorno de test.
vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: { from: vi.fn() },
}));

import {
  EMPRESA_KEY_TO_NAME,
  EMPRESA_KEY_TO_VENTAS_ID,
  VENTAS_ID_TO_EMPRESA_KEY,
  ALL_EMPRESA_KEYS,
  B2B_EMPRESA_KEYS,
  SWITCH_ESTADOCUENTA_EMPRESA_KEYS,
  mapEmpresaName,
  mapEmpresaKeyToVentasId,
} from "@/lib/empresa-mapping";

describe("dominio de empresas (🟢-18 / 🟢-19)", () => {
  it("ALL_EMPRESA_KEYS son exactamente las 8 del grupo, sin duplicados", () => {
    expect(ALL_EMPRESA_KEYS).toEqual([
      "vistana",
      "fashion_wear",
      "fashion_shoes",
      "active_shoes",
      "active_wear",
      "joystep",
      "confecciones_boston",
      "american_classic",
    ]);
    expect(new Set(ALL_EMPRESA_KEYS).size).toBe(8);
  });

  it("B2B son 6 y es subconjunto estricto de ALL (excluye retail)", () => {
    expect(B2B_EMPRESA_KEYS).toHaveLength(6);
    for (const k of B2B_EMPRESA_KEYS) {
      expect(ALL_EMPRESA_KEYS).toContain(k);
    }
    // Las dos retail NO son B2B.
    expect(B2B_EMPRESA_KEYS).not.toContain("confecciones_boston");
    expect(B2B_EMPRESA_KEYS).not.toContain("american_classic");
  });

  it("estadocuenta (CXC) cubre exactamente las 6 B2B", () => {
    expect([...SWITCH_ESTADOCUENTA_EMPRESA_KEYS]).toEqual([...B2B_EMPRESA_KEYS]);
  });

  it("cada empresa_key canónica tiene nombre display", () => {
    for (const k of ALL_EMPRESA_KEYS) {
      expect(EMPRESA_KEY_TO_NAME[k]).toBeTruthy();
    }
    expect(EMPRESA_KEY_TO_NAME.american_classic).toBe("Multifashion");
    expect(EMPRESA_KEY_TO_NAME.confecciones_boston).toBe("Confecciones Boston");
  });

  it("mapEmpresaName devuelve el nombre, o la key cruda si es desconocida", () => {
    expect(mapEmpresaName("vistana")).toBe("Vistana International");
    expect(mapEmpresaName("fashion_wear")).toBe("Fashion Wear");
    // Una key fantasma (typo) no revienta: devuelve la key tal cual.
    expect(mapEmpresaName("typo_inexistente")).toBe("typo_inexistente");
  });

  it("EMPRESA_KEY_TO_VENTAS_ID ↔ VENTAS_ID_TO_EMPRESA_KEY hacen round-trip", () => {
    for (const k of ALL_EMPRESA_KEYS) {
      const id = EMPRESA_KEY_TO_VENTAS_ID[k];
      expect(id).toBeTruthy();
      expect(VENTAS_ID_TO_EMPRESA_KEY[id]).toBe(k);
    }
  });

  it("los ventas_id son únicos (no colisionan dos empresas en un id)", () => {
    const ids = ALL_EMPRESA_KEYS.map((k) => EMPRESA_KEY_TO_VENTAS_ID[k]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("mapEmpresaKeyToVentasId resuelve canónicas y devuelve null para desconocidas", () => {
    expect(mapEmpresaKeyToVentasId("fashion_shoes")).toBe("fshoes");
    expect(mapEmpresaKeyToVentasId("american_classic")).toBe("multi");
    expect(mapEmpresaKeyToVentasId("no_existe")).toBeNull();
  });
});
