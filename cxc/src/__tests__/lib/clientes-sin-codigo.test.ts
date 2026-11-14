import { describe, expect, it } from "vitest";
import { tieneCodigoDeSwitch } from "@/lib/clientes/sin-codigo";

describe("n.º 104 · un cliente sin código no abre ficha", () => {
  it("«—», vacío y nulo no son código", () => {
    for (const c of ["—", "-", "", "  ", null, undefined]) expect(tieneCodigoDeSwitch(c)).toBe(false);
  });
  it("un código de Switch sí", () => {
    expect(tieneCodigoDeSwitch("D-25")).toBe(true);
    expect(tieneCodigoDeSwitch("12188")).toBe(true);
  });
});
