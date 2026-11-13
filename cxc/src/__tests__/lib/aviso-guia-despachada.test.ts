import { describe, it, expect } from "vitest";
import { textoGuiaDespachada } from "@/lib/guias/aviso-despachada";

describe("aviso de guía despachada", () => {
  it("el total de bultos va en la primera línea y no se repite al final", () => {
    const t = textoGuiaDespachada("GT-305", "Sanjur", [
      { empresa: "Fashion Shoes", cliente: "Hafez, S.A.", bultos: 8 },
      { empresa: "Fashion Shoes", cliente: "Hafez, S.A.", bultos: 2 },
      { empresa: "Vistana", cliente: "Otro", bultos: 136 },
    ]);
    expect(t).toBe(
      "📦 GT-305 · Sanjur · 146 bultos\n\nFashion Shoes\n  Hafez, S.A. — 10\n\nVistana\n  Otro — 136",
    );
    expect(t).not.toContain("Total:");
  });

  it("un solo bulto va en singular", () => {
    expect(textoGuiaDespachada("GT-1", "—", [{ empresa: "X", cliente: "Y", bultos: 1 }]).split("\n")[0]).toBe(
      "📦 GT-1 · — · 1 bulto",
    );
  });
});
