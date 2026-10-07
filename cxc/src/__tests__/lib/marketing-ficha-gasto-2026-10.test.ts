import { describe, expect, it } from "vitest";
import {
  camposDeImpuesto,
  opcionDeImpuesto,
} from "@/lib/marketing/ficha-gasto-2026-10";

describe("ficha-gasto-2026-10 › el control único de impuesto", () => {
  it("zona libre manda sobre el ITBMS", () => {
    expect(opcionDeImpuesto("0", true)).toBe("zona-libre");
    expect(opcionDeImpuesto("7", true)).toBe("zona-libre");
  });

  it("sin zona libre, queda el ITBMS elegido", () => {
    expect(opcionDeImpuesto("0", false)).toBe("0");
    expect(opcionDeImpuesto("7", false)).toBe("7");
  });

  it("zona libre vuelve a los dos campos de siempre: ITBMS 0 + tiene_importacion", () => {
    expect(camposDeImpuesto("zona-libre")).toEqual({
      itbmsOption: "0",
      tieneImportacion: true,
    });
  });

  it("0 % y 7 % vuelven con tiene_importacion apagado", () => {
    expect(camposDeImpuesto("0")).toEqual({ itbmsOption: "0", tieneImportacion: false });
    expect(camposDeImpuesto("7")).toEqual({ itbmsOption: "7", tieneImportacion: false });
  });

  it("ida y vuelta: para las cuatro combinaciones posibles no se pierde nada", () => {
    for (const itbmsOption of ["0", "7"] as const) {
      for (const tieneImportacion of [false, true]) {
        const opcion = opcionDeImpuesto(itbmsOption, tieneImportacion);
        const vuelta = camposDeImpuesto(opcion);
        if (tieneImportacion) {
          expect(vuelta).toEqual({ itbmsOption: "0", tieneImportacion: true });
        } else {
          expect(vuelta).toEqual({ itbmsOption, tieneImportacion: false });
        }
      }
    }
  });
});
