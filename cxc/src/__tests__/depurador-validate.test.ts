import { describe, it, expect } from "vitest";
import {
  processRows, buildAoa, OUT_COLS, titleCase, proveedorParaEmpresa,
  type SheetRow,
} from "../lib/depurador/logic";

const H = ["REFERENCIA", "EAN", "P_CATEGORY", "TALLA", "CANTIDAD", "COSTO", "PRECIO2", "MARCA", "PROVEEDOR"];
const cfg = { factor: 1.1, tasa: "7", mesIdx: 5, anio: "2026" }; // Junio 2026

const cols = (desc: string, marca = "CK Menswear") =>
  processRows([H, ["R1", "1", desc, "M", 10, 10, 20, marca, "Proveedor X"]] as SheetRow[], cfg).rows[0].cols;

// Devuelve un valor de columna en el Excel de salida (pasa por buildAoa = Title Case).
const out = (desc: string, marca: string, col: string) => {
  const aoa = buildAoa(processRows([H, ["R1", "1", desc, "M", 10, 10, 20, marca, "x"]] as SheetRow[], cfg).rows);
  return aoa[1][OUT_COLS.indexOf(col)];
};

describe("Depurador — rubro/subrubro (CAMBIO 1)", () => {
  it.each([
    ["Men-T-Shirts S/S", "Men", "T/Shirts S/S"],
    ["Women-Bras", "Women", "Bras"],
    ["Men-Pant Non-Denim", "Men", "Pant Non/Denim"],
    ["Men-Shirts / Woven Tops L/S", "Men", "Shirts / Woven Tops L/S"],
    ["Boys-Flip Flops", "Boys", "Flip Flops"],
    ["Kids Unisex-Polos S/S", "Kids Unisex", "Polos S/S"],
  ])("%s → rubro/subrubro", (desc, rubro, sub) => {
    const c = cols(desc);
    expect(c["rubro *"]).toBe(rubro);
    expect(c["subrubro"]).toBe(sub);
  });
});

describe("Depurador — Title Case en el Excel (CAMBIO 5)", () => {
  it("Descripción conserva S/S en mayúscula", () => {
    expect(out("Men-T-Shirts S/S", "CK Menswear", "Descripción *")).toBe("Men-T-Shirts S/S");
  });
  it("Marca NO se rompe (TH/CK intactos, capitalización del catálogo)", () => {
    expect(out("Men-Polos S/S", "CK Menswear", "Marca *")).toBe("CK Menswear");
    expect(out("Men-Sneakers", "TH Footwear", "Marca *")).toBe("TH Footwear");
  });
  it("Rubro y Subrubro (L/S en mayúscula)", () => {
    expect(out("Men-Bras", "CK Menswear", "rubro *")).toBe("Men");
    expect(out("Men-Shirts / Woven Tops L/S", "CK Menswear", "subrubro")).toBe("Shirts / Woven Tops L/S");
  });
  it("titleCase preserva siglas", () => {
    expect(titleCase("Men-T-Shirts S/S")).toBe("Men-T-Shirts S/S");
    expect(titleCase("Shirts / Woven Tops L/S")).toBe("Shirts / Woven Tops L/S");
    expect(titleCase("American Fashion Wear, SA")).toBe("American Fashion Wear, SA");
  });
});

describe("Depurador — proveedor (CAMBIO 2) y temporada (CAMBIO 3)", () => {
  it("Proveedor fijo por empresa", () => {
    expect(proveedorParaEmpresa("vistana")).toBe("American Designer Fashion");
    expect(proveedorParaEmpresa("fashion_wear")).toBe("American Fashion Wear, SA");
    expect(proveedorParaEmpresa("fashion_shoes")).toBe("American Fashion Wear, SA");
  });
  it("Temporada AAAA-MM (Junio 2026 → 2026-06)", () => {
    expect(cols("Men-Bras")["Temporada"]).toBe("2026-06");
  });
});
