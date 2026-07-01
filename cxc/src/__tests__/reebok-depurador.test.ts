import { describe, it, expect } from "vitest";
import {
  ceilPar, fobReebok, detectMonthCol, findHeaderRow, parseReebok,
  buildCatalogo, buildCatalogoAoa, buildSwitchRows, buildSwitchAoa,
  OUT_COLS_DEFAULT,
  type SheetRow,
} from "../lib/depurador/reebok";

// Headers reales del Book4 (fila 2; la fila 1 es basura).
const JUNK = [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 2292, 0, 2292, 2292, null, null, null];
const H = ["Order", "ClientName", "PO NAME", "New Article", "Old Article ", "SKU", "PREPACK FTW", "Name", "Department", "CAMPAÑAS", "PRIORIDAD", "OptionName", "CurveName", "CATEGORY", "AGE GROUP", "COLOR NAME", "GENDER", "SELL-IN QUARTER", "SPORTS CATEGORY", "Talla", "RRP", "WholesalePrice", "PREVENTA", "DROP", "FW26 FINAL", "JULIO", "COMENTARIOS", "DELIVERY", "UBICACIÓN"];
// Dos tallas del mismo estilo (CLUB C 85, WholesalePrice 42.9), JULIO=piezas.
const R1 = ["50", "Active Shoes - Active Wear", "VIC", 100000015, null, "4057291417068", "100000015-A", "CLUB C 85", "FOOTWEAR", null, null, "FOOTWEAR_F1", "FEMALE A", "SHOES", "Adult", "WHITE/LIGHT GREY", "Female", "Q3/Q4", "TENNIS", 5, 84.95, 42.9, 1, null, 1, 1, "OK", 46203, "CD"];
const R2 = ["50", "Active Shoes - Active Wear", "VIC", 100000015, null, "4057291421140", "100000015-A", "CLUB C 85", "FOOTWEAR", null, null, "FOOTWEAR_F1", "FEMALE A", "SHOES", "Adult", "WHITE/LIGHT GREY", "Female", "Q3/Q4", "TENNIS", 5.5, 84.95, 42.9, 2, null, 2, 2, "OK", 46203, "CD"];
const rows = () => [JUNK, H, R1, R2] as SheetRow[];
const MONTH = H.indexOf("JULIO");

describe("Reebok — ceilPar (siguiente entero PAR hacia arriba)", () => {
  it.each([
    [50.336, 52], // ceil 51 impar → 52
    [47.19, 48],  // ceil 48 par → 48
    [48.0, 48],   // exacto par
    [49.0, 50],   // impar → +1
    [50.0, 50],   // par exacto
  ])("ceilPar(%s) = %i", (x, expected) => expect(ceilPar(x)).toBe(expected));
});

describe("Reebok — Costo FOB dinámico (WholesalePrice OFF)", () => {
  it("footwear sin OFF → WP×0.8", () => expect(fobReebok("FOOTWEAR", 42.9, null)).toBeCloseTo(34.32, 5));
  it("apparel sin OFF → WP×0.7", () => expect(fobReebok("APPAREL", 100, null)).toBeCloseTo(70, 5));
  it("hardware sin OFF → WP×0.7", () => expect(fobReebok("HARDWARE", 100, null)).toBeCloseTo(70, 5));
  it("con OFF válido → usa OFF (ignora fallback)", () => expect(fobReebok("FOOTWEAR", 42.9, 30)).toBe(30));
  it("OFF 0 o negativo → cae al fallback", () => expect(fobReebok("FOOTWEAR", 42.9, 0)).toBeCloseTo(34.32, 5));
});

describe("Reebok — detección de hoja y mes", () => {
  it("findHeaderRow salta la fila basura", () => expect(findHeaderRow(rows())).toBe(1));
  it("detectMonthCol encuentra JULIO", () => expect(detectMonthCol(H)).toBe(MONTH));
  it("detectMonthCol = -1 si no hay mes", () => expect(detectMonthCol(["A", "B", "C"])).toBe(-1));
});

describe("Reebok — parseo", () => {
  it("lee 2 SKUs con piezas del mes", () => {
    const { items } = parseReebok(rows(), MONTH);
    expect(items).toHaveLength(2);
    expect(items[0].sku).toBe("4057291417068");
    expect(items[0].newArticle).toBe("100000015");
    expect(items[0].piezas).toBe(1);
    expect(items[1].piezas).toBe(2);
  });
  it("lanza error si no es el Excel de Reebok", () => {
    expect(() => parseReebok([["a", "b"], ["1", "2"]] as SheetRow[], -1)).toThrow();
  });
});

describe("Reebok — Salida A (catálogo clientes)", () => {
  it("agrupa por PO+New Article, suma piezas, calcula Costo/Precio A/B", () => {
    const { items } = parseReebok(rows(), MONTH);
    const cat = buildCatalogo(items);
    expect(cat).toHaveLength(1); // mismo PO+article → 1 fila
    const r = cat[0];
    expect(r.piezas).toBe(3);          // 1 + 2
    expect(r.costo).toBeCloseTo(37.75, 2); // 42.9×0.8×1.1 = 37.752 → 37.75
    expect(r.precioA).toBe(52);        // ceilPar(37.75/0.75)=ceilPar(50.33)=52
    expect(r.precioB).toBe(48);        // ceilPar(37.75/0.80)=ceilPar(47.19)=48
  });
  it("AOA rotula la columna de piezas con el mes", () => {
    const { items } = parseReebok(rows(), MONTH);
    const aoa = buildCatalogoAoa(buildCatalogo(items), "JULIO");
    expect(aoa[0][aoa[0].length - 1]).toBe("Piezas JULIO");
  });
});

describe("Reebok — Salida B (plantilla Switch)", () => {
  it("24 columnas = OUT_COLS_DEFAULT (formato Vistana, sin Composición)", () => {
    expect(OUT_COLS_DEFAULT).toHaveLength(24);
    expect(OUT_COLS_DEFAULT).not.toContain("Composición");
  });
  it("una fila por SKU con mapeo Reebok correcto", () => {
    const { items } = parseReebok(rows(), MONTH);
    const swRows = buildSwitchRows(items, { precioAB: "A", temporada: "SS26", tasa: "7" });
    expect(swRows).toHaveLength(2);
    const r = swRows[0];
    expect(r["Código *"]).toBe("100000015");
    expect(r["Código Barra *"]).toBe("4057291417068"); // SKU real por talla
    expect(r["Descripción *"]).toBe("CLUB C 85");
    expect(r["Costo FOB *"]).toBeCloseTo(34.32, 2);     // 42.9×0.8
    expect(r["Costo CIF *"]).toBeCloseTo(37.75, 2);     // ×1.1
    expect(r["Precio *"]).toBe(52);                     // Precio A
    expect(r["rubro *"]).toBe("FOOTWEAR");              // Department tal cual
    expect(r["subrubro"]).toBe("Female");              // GENDER
    expect(r["Marca *"]).toBe("REEBOK");
    expect(r["Proveedor *"]).toBe("LATIN FITNESS GROUP");
    expect(r["Código Tipo de Artículo *"]).toBe("01");
    expect(r["Unidad de medida *"]).toBe("PAR");        // footwear
    expect(r["Temporada"]).toBe("SS26");
    expect(r["Stock Ideal"]).toBe(1);                   // piezas del SKU
    expect(r["Tasa de Impuesto *"]).toBe("7");
  });
  it("toggle Precio B usa ÷0.80", () => {
    const { items } = parseReebok(rows(), MONTH);
    const swRows = buildSwitchRows(items, { precioAB: "B", temporada: "SS26", tasa: "7" });
    expect(swRows[0]["Precio *"]).toBe(48);
  });
  it("apparel → Unidad PIEZA", () => {
    const apparel = [JUNK, H, [...R1.slice(0, 8), "APPAREL", ...R1.slice(9)]] as SheetRow[];
    const { items } = parseReebok(apparel, MONTH);
    const swRows = buildSwitchRows(items, { precioAB: "A", temporada: "SS26", tasa: "7" });
    expect(swRows[0]["Unidad de medida *"]).toBe("PIEZA");
    expect(swRows[0]["Costo FOB *"]).toBeCloseTo(30.03, 2); // 42.9×0.7
  });
  it("buildSwitchAoa NO aplica Title Case (FOOTWEAR / LATIN FITNESS GROUP intactos)", () => {
    const { items } = parseReebok(rows(), MONTH);
    const aoa = buildSwitchAoa(buildSwitchRows(items, { precioAB: "A", temporada: "SS26", tasa: "7" }));
    const rubroIdx = OUT_COLS_DEFAULT.indexOf("rubro *");
    const provIdx = OUT_COLS_DEFAULT.indexOf("Proveedor *");
    expect(aoa[1][rubroIdx]).toBe("FOOTWEAR");
    expect(aoa[1][provIdx]).toBe("LATIN FITNESS GROUP");
  });
});
