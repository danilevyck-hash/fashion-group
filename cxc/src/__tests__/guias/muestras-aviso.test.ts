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
  it("cada empresa avisa a quien ve sus muestras: Vistana → edwin, las otras 5 → rey", () => {
    for (const e of B2B_EMPRESA_KEYS) {
      const a = avisoDeMuestras({ empresa_key: e, pedido_switch_id: 1, n: 1 })!;
      expect(empresasDeMuestrasDe(a.usuario, "vendedor")).toContain(e);
    }
    expect(avisoDeMuestras({ empresa_key: "vistana", pedido_switch_id: 1, n: 1 })!.usuario).toBe("edwin");
    expect(avisoDeMuestras({ empresa_key: "fashion_shoes", pedido_switch_id: 1, n: 1 })!.usuario).toBe("rey");
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
