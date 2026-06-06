import { describe, it, expect } from "vitest";
import { chunk } from "@/lib/chunk";

// Invariante del fix (incidente 6-jun): el retrigger de switch-sync de la
// reconciliación debe ir en grupos de ≤2 empresas (RETRIGGER_BATCH_SIZE=2). Una
// sola llamada con las 6 B2B excede maxDuration y muere por timeout sin recuperar
// nada. chunk() garantiza el tamaño máximo de batch.
describe("reconciliación — batching del retrigger (chunk)", () => {
  it("parte 6 empresas en 3 grupos de 2 (caso del incidente)", () => {
    const seis = ["vistana", "active_wear", "fashion_shoes", "fashion_wear", "active_shoes", "joystep"];
    expect(chunk(seis, 2)).toEqual([
      ["vistana", "active_wear"],
      ["fashion_shoes", "fashion_wear"],
      ["active_shoes", "joystep"],
    ]);
  });

  it("nunca produce un grupo de más de 2 (impar → último grupo de 1)", () => {
    const grupos = chunk(["a", "b", "c", "d", "e"], 2);
    expect(grupos).toEqual([["a", "b"], ["c", "d"], ["e"]]);
    expect(grupos.every((g) => g.length <= 2)).toBe(true);
  });

  it("casos borde: 1 empresa → 1 grupo; 0 → ningún grupo", () => {
    expect(chunk(["solo"], 2)).toEqual([["solo"]]);
    expect(chunk([], 2)).toEqual([]);
  });
});
