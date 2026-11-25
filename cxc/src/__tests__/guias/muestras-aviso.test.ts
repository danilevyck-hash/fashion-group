// 🔴 El aviso push de Muestras (25-nov-2026, `MUESTRAS_AVISO_PUSH_2026_11`):
// le llega al MISMO vendedor que ve la lista, y nunca a otro.
import { describe, it, expect } from "vitest";
import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { empresasDeMuestrasDe } from "@/lib/guias/muestras";
import {
  MUESTRAS_AVISO_PUSH_2026_11,
  avisoDeMuestras,
  textoAvisoMuestras,
} from "@/lib/guias/muestras-aviso";

describe("aviso de muestras", () => {
  it("prendido (lo publicado)", () => {
    expect(MUESTRAS_AVISO_PUSH_2026_11).toBe(true);
  });
  it("🔴 FW, FS, AW, AS y Joystep → Angel Y Rey (Daniel, 25-nov-2026)", () => {
    for (const e of ["fashion_wear", "fashion_shoes", "active_wear", "active_shoes", "joystep"]) {
      expect([...avisoDeMuestras({ empresa_key: e, pedido_switch_id: 1, n: 1 })!.usuarios].sort()).toEqual(["angel", "rey"]);
    }
  });
  it("🔴 Vistana → SOLO Edwin", () => {
    expect(avisoDeMuestras({ empresa_key: "vistana", pedido_switch_id: 1, n: 1 })!.usuarios).toEqual(["edwin"]);
  });
  it("todas las empresas del grupo avisan a alguien que manda sus muestras", () => {
    for (const e of B2B_EMPRESA_KEYS) {
      const us = avisoDeMuestras({ empresa_key: e, pedido_switch_id: 1, n: 1 })!.usuarios;
      expect(us.some((u) => empresasDeMuestrasDe(u, "vendedor").includes(e))).toBe(true);
    }
  });
  it("el texto", () => {
    expect(textoAvisoMuestras(3, "16-1234", "Cliente X")).toBe("Bodega pidió 3 muestras · Pedido 16-1234 · Cliente X");
    expect(textoAvisoMuestras(1, null, " ")).toBe("Bodega pidió 1 muestra");
  });
  it("sin referencias no hay aviso; uno por pedido (tag)", () => {
    expect(avisoDeMuestras({ empresa_key: "vistana", pedido_switch_id: 1, n: 0 })).toBeNull();
    expect(avisoDeMuestras({ empresa_key: "vistana", pedido_switch_id: 9, n: 2 })!.tag).toBe("muestras-vistana-9");
  });
});
