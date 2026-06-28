import { describe, it, expect } from "vitest";
import {
  processRows, buildAoa, OUT_COLS, titleCase, proveedorParaEmpresa, outColsForEmpresa,
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
    ["Men-T-Shirts S/S", "Men", "T-Shirts S/S"],
    ["Women-Bras", "Women", "Bras"],
    ["Men-Pant Non-Denim", "Men", "Pant Non-Denim"],
    ["Men-Shirts / Woven Tops L/S", "Men", "Shirts Woven L/S"],
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
  it("Marca NO se rompe (TH/CK/KL intactos, capitalización del catálogo)", () => {
    expect(out("Men-Polos S/S", "CK Menswear", "Marca *")).toBe("CK Menswear");
    expect(out("Men-Polos S/S", "TH Tommy Jeans", "Marca *")).toBe("TH Tommy Jeans");
    expect(out("Women-T-Shirts S/S", "KL Womenswear", "Marca *")).toBe("KL Womenswear");
  });
  it("Rubro y Subrubro (output: subrubro con / → -)", () => {
    expect(out("Men-Bras", "CK Menswear", "rubro *")).toBe("Men");
    // En el Excel el subrubro va sin "/" (Tarea 3.1): "T-Shirts S/S" → "T-Shirts S-S".
    expect(out("Men-T-Shirts S/S", "CK Menswear", "subrubro")).toBe("T-Shirts S-S");
  });
  it("titleCase preserva siglas", () => {
    expect(titleCase("Men-T-Shirts S/S")).toBe("Men-T-Shirts S/S");
    expect(titleCase("Shirts / Woven Tops L/S")).toBe("Shirts / Woven Tops L/S");
    expect(titleCase("American Fashion Wear, SA")).toBe("American Fashion Wear, SA");
  });
});

describe("Depurador — formato de salida (Tarea 3)", () => {
  it("Principios de normalización", () => {
    expect(cols("Newborn (Layette)-Bodies")["Descripción *"]).toBe("Newborn-Bodies");
    expect(cols("Men-Heavyweight Knits")["Descripción *"]).toBe("Men-Heavyweight");
    expect(cols("Men-Polo S/S DESTALLADO")["Descripción *"]).toBe("Men-Polos S/S");
    // Polo S/S Core se conserva (el proveedor lo manda así a propósito) — no se pluraliza.
    expect(cols("Men-Polo S/S Core")["Descripción *"]).toBe("Men-Polo S/S Core");
    expect(cols("Women-Polo S/S Core")["Descripción *"]).toBe("Women-Polo S/S Core");
    // "Men-T-Shirts" (sin S/S) es válido en CK Underwear — no se le agrega S/S.
    expect(cols("Men-T-Shirts")["Descripción *"]).toBe("Men-T-Shirts");
  });
  it("Rubro no-género → Otros, subrubro vacío", () => {
    const c = cols("Freezer-Grande");
    expect(c["rubro *"]).toBe("Otros");
    expect(c["subrubro"]).toBe("");
  });
  it("Código de barra vacío → usa el código del producto", () => {
    const r = processRows([H, ["REF123", "", "Men-Bras", "M", 10, 10, 20, "CK Menswear", "x"]] as SheetRow[], cfg).rows[0];
    expect(r.cols["Código Barra *"]).toBe("REF123");
  });
  it("Header default sin Composición ni Codigo CPBS (23 cols)", () => {
    const header = buildAoa(processRows([H, ["R1", "1", "Men-Bras", "M", 10, 10, 20, "CK Menswear", "x"]] as SheetRow[], cfg).rows)[0];
    expect(header).not.toContain("Composición");
    expect(header).not.toContain("Codigo CPBS");
    expect(header).toContain("Codigo CPBS Abrev");
    expect(header.length).toBe(23);
  });
});

describe("Depurador — reclasificación de marcas (Tarea 6)", () => {
  const marcaDe = (marca: string, desc: string) =>
    processRows([H, ["R1", "1", desc, "M", 10, 10, 20, marca, "x"]] as SheetRow[], cfg).rows[0].cols["Marca *"];
  it.each([
    ["TODDLER BOYS", "Boys-Polos S/S", "TH Kids"],
    ["UNISEX", "Unisex-Luggage", "TH Other"],
    ["ALBERTO", "Men-Polos S/S", "TH Menswear"],
    ["GENERAL", "Women-Panties", "TH Underwear"],
    ["APPAREL", "Men-T-Shirts S/S", "CK Jeans"],
    ["WOMEN", "Women-Bras", "CK Jeans"],
    ["TH ACCESORIES", "Men-Bags", "TH Accessories"],
    ["OTHERS", "Agua", "Otros"],
    ["FREEZER MARCA", "Freezer Grande", "Otros"],
    ["CK Menswear", "Men-Polos S/S", "CK Menswear"],
  ])("%s → %s", (marca, desc, expected) => {
    expect(marcaDe(marca, desc)).toBe(expected);
  });
});

describe("Depurador — plantilla por empresa (Tarea 5)", () => {
  const rows = processRows([H, ["R1", "1", "Men-Sneakers", "M", 10, 10, 20, "TH Footwear", "x"]] as SheetRow[], cfg).rows;
  it("Fashion Shoes: 24 cols, 'Costo *' único = CIF, con Composición/CPBS", () => {
    const aoa = buildAoa(rows, outColsForEmpresa("fashion_shoes"));
    const header = aoa[0] as string[];
    expect(header.length).toBe(24);
    expect(header).toContain("Costo *");
    expect(header).not.toContain("Costo FOB *");
    expect(header).toContain("Composición");
    expect(header).toContain("Codigo CPBS");
    // Costo * = CIF (10 × 1.1 = 11)
    expect(aoa[1][header.indexOf("Costo *")]).toBe(11);
  });
  it("Vistana/Fashion Wear: 23 cols con FOB+CIF", () => {
    expect((buildAoa(rows, outColsForEmpresa("vistana"))[0] as string[]).length).toBe(23);
    expect(buildAoa(rows, outColsForEmpresa("fashion_wear"))[0]).toContain("Costo FOB *");
  });
});

describe("Depurador — servicios (Tarea 4)", () => {
  it("AJUSTE DE PRECIO → servicio tipo 02", () => {
    const c = processRows([H, ["S1", "1", "AJUSTE DE PRECIO", "M", 10, 5, 9, "Whatever", "x"]] as SheetRow[], cfg).rows[0].cols;
    expect(c["Descripción *"]).toBe("Ajuste de Precio");
    expect(c["Código Tipo de Artículo *"]).toBe("02");
    expect(c["Marca *"]).toBe("Otros");
    expect(c["rubro *"]).toBe("Otros");
    expect(c["subrubro"]).toBe("");
    expect(c["Stock Ideal"]).toBe(0);
    expect(c["Costo FOB *"]).toBe(0);
    expect(c["Costo CIF *"]).toBe(0);
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
