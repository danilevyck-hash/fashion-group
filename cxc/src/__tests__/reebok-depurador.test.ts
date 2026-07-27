import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ceilPar, fobReebok, detectMonthCol, findHeaderRow, parseReebok,
  buildCatalogo, buildCatalogoAoa, buildSwitchRows, buildSwitchAoa,
  filtrarConPiezas, sinPiezasDelMes,
  OUT_COLS_DEFAULT, REEBOK_FORMULA_A_DEFAULT, REEBOK_FORMULA_B_DEFAULT,
} from "../lib/depurador/reebok";
import type { SheetRow } from "../lib/depurador/logic";
import { marcaKey, type MarcaRubroFormula } from "../lib/depurador/logic";

// Headers reales del Book4 (fila 2; la fila 1 es basura).
const JUNK = [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 2292, 0, 2292, 2292, null, null, null];
const H = ["Order", "ClientName", "PO NAME", "New Article", "Old Article ", "SKU", "PREPACK FTW", "Name", "Department", "CAMPAÑAS", "PRIORIDAD", "OptionName", "CurveName", "CATEGORY", "AGE GROUP", "COLOR NAME", "GENDER", "SELL-IN QUARTER", "SPORTS CATEGORY", "Talla", "RRP", "WholesalePrice", "PREVENTA", "DROP", "FW26 FINAL", "JULIO", "COMENTARIOS", "DELIVERY", "UBICACIÓN"];
const MONTH = H.indexOf("JULIO");

interface RowOpts { po?: string; art: string; sku: string; name?: string; dept?: string; cat?: string; age?: string; gender?: string; talla: string | number; wp?: number; piezas?: number }
function row(o: RowOpts): SheetRow {
  const r: SheetRow = new Array(29).fill(null);
  r[2] = o.po ?? "VIC"; r[3] = o.art; r[5] = o.sku; r[7] = o.name ?? "CLUB C 85";
  r[8] = o.dept ?? "FOOTWEAR"; r[13] = o.cat ?? "SHOES"; r[14] = o.age ?? "Adult";
  r[16] = o.gender ?? "Female"; r[19] = o.talla; r[20] = 84.95; r[21] = o.wp ?? 42.9; r[25] = o.piezas ?? 1;
  return r;
}
// Artículo Female footwear con tallas 5..7 (incluye la talla-muestra 7).
const FEMALE = [
  row({ art: "100000015", sku: "B-5", talla: 5, piezas: 1 }),
  row({ art: "100000015", sku: "B-5.5", talla: 5.5, piezas: 2 }),
  row({ art: "100000015", sku: "B-6", talla: 6, piezas: 1 }),
  row({ art: "100000015", sku: "B-7", talla: 7, piezas: 3 }),
];
const rowsFemale = () => [JUNK, H, ...FEMALE] as SheetRow[];
const CFG = { formulaA: REEBOK_FORMULA_A_DEFAULT, formulaB: REEBOK_FORMULA_B_DEFAULT };
const SW = (items: ReturnType<typeof parseReebok>["items"]) =>
  buildSwitchRows(items, { formula: REEBOK_FORMULA_A_DEFAULT, temporada: "2026-07", tasa: "7" });

describe("Reebok — ceilPar", () => {
  it.each([[50.336, 52], [47.19, 48], [48, 48], [49, 50], [50, 50]])("ceilPar(%s)=%i", (x, e) => expect(ceilPar(x)).toBe(e));
});

describe("Reebok — Costo FOB dinámico (WholesalePrice OFF)", () => {
  it("footwear sin OFF → WP×0.8", () => expect(fobReebok("FOOTWEAR", 42.9, null)).toBeCloseTo(34.32, 5));
  it("apparel sin OFF → WP×0.7", () => expect(fobReebok("APPAREL", 100, null)).toBeCloseTo(70, 5));
  it("con OFF válido → usa OFF", () => expect(fobReebok("FOOTWEAR", 42.9, 30)).toBe(30));
  it("OFF 0 → fallback", () => expect(fobReebok("FOOTWEAR", 42.9, 0)).toBeCloseTo(34.32, 5));
});

describe("Reebok — detección de hoja y mes", () => {
  it("findHeaderRow salta la fila basura", () => expect(findHeaderRow(rowsFemale())).toBe(1));
  it("detectMonthCol encuentra JULIO", () => expect(detectMonthCol(H)).toBe(MONTH));
  it("detectMonthCol -1 si no hay mes", () => expect(detectMonthCol(["A", "B"])).toBe(-1));
  it("parseReebok lee las tallas del artículo", () => {
    const { items } = parseReebok(rowsFemale(), MONTH);
    expect(items).toHaveLength(4);
  });
});

describe("Reebok — Salida A (pedido cliente)", () => {
  it("una fila por PO+artículo, suma piezas, Precio A/B por fórmula", () => {
    const { items } = parseReebok(rowsFemale(), MONTH);
    const cat = buildCatalogo(items, CFG);
    expect(cat).toHaveLength(1);
    expect(cat[0].piezas).toBe(7);           // 1+2+1+3
    expect(cat[0].costo).toBeCloseTo(37.75, 2); // 42.9×0.8×1.1
    expect(cat[0].precioA).toBe(52);         // ceilPar(37.75/0.75)
    expect(cat[0].precioB).toBe(48);         // ceilPar(37.75/0.80)
  });
  it("ordena por PO, Name, Género", () => {
    const rows = [JUNK, H,
      row({ po: "VIC", art: "A2", sku: "s", name: "ZETA", talla: 6 }),
      row({ po: "ALEX", art: "A1", sku: "s", name: "ALFA", talla: 6 }),
    ] as SheetRow[];
    const { items } = parseReebok(rows, MONTH);
    const cat = buildCatalogo(items, CFG);
    expect(cat.map((c) => c.po)).toEqual(["ALEX", "VIC"]); // ALEX antes que VIC
  });
  it("AOA: header sin WholesalePrice/Costo/COLOR NAME, piezas rotulada con el mes", () => {
    const { items } = parseReebok(rowsFemale(), MONTH);
    const aoa = buildCatalogoAoa(buildCatalogo(items, CFG), "JULIO");
    expect(aoa[0]).toEqual([
      "PO NAME", "New Article", "Name", "Department", "CATEGORY", "AGE GROUP", "GENDER",
      "Precio A", "Precio B", "Piezas JULIO",
    ]);
    expect(aoa[0]).not.toContain("WholesalePrice");
    expect(aoa[0]).not.toContain("Costo");
    expect(aoa[0]).not.toContain("COLOR NAME");
    // La fila de datos alinea con el header (New Article en col 1, Precio A/B, piezas).
    expect(aoa[1][1]).toBe("100000015");
    expect(aoa[1][7]).toBe(52);  // Precio A
    expect(aoa[1][8]).toBe(48);  // Precio B
    expect(aoa[1][9]).toBe(7);   // piezas
  });
});

describe("Reebok — Salida B (Switch, fila por ARTÍCULO)", () => {
  it("24 columnas OUT_COLS_DEFAULT (sin Composición)", () => {
    expect(OUT_COLS_DEFAULT).toHaveLength(24);
    expect(OUT_COLS_DEFAULT).not.toContain("Composición");
  });
  it("una fila por artículo con cantidad sumada y mapeo correcto", () => {
    const { items } = parseReebok(rowsFemale(), MONTH);
    const rows = SW(items);
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.cols["Código *"]).toBe("100000015");
    expect(r.cols["Stock Ideal"]).toBe(7);            // suma de tallas
    expect(r.cols["Costo FOB *"]).toBeCloseTo(34.32, 2);
    expect(r.cols["Costo CIF *"]).toBeCloseTo(37.75, 2);
    expect(r.cols["Precio *"]).toBe(52);              // fórmula A default
    expect(r.cols["Marca *"]).toBe("FOOTWEAR");       // Department
    expect(r.cols["rubro *"]).toBe("SHOES");          // CATEGORY
    expect(r.cols["subrubro"]).toBe("Female");        // GENDER
    expect(r.cols["Proveedor *"]).toBe("LATIN FITNESS GROUP");
    expect(r.cols["Unidad de medida *"]).toBe("PAR");
    expect(r.cols["Temporada"]).toBe("2026-07");
    expect(r.cols["Código Tipo de Artículo *"]).toBe("01");
  });
  it("talla-muestra: Female → 7 (exacta, sin ámbar)", () => {
    const { items } = parseReebok(rowsFemale(), MONTH);
    const r = SW(items)[0];
    expect(r.talla).toBe("7");
    expect(r.fallback).toBe(false);
    expect(r.cols["Código Barra *"]).toBe("B-7");
  });
  it("talla-muestra: Male → 9", () => {
    const rows = [JUNK, H,
      row({ art: "M1", sku: "m8", gender: "Male", talla: 8 }),
      row({ art: "M1", sku: "m9", gender: "Male", talla: 9 }),
      row({ art: "M1", sku: "m10", gender: "Male", talla: 10 }),
    ] as SheetRow[];
    const r = SW(parseReebok(rows, MONTH).items)[0];
    expect(r.talla).toBe("9");
    expect(r.cols["Código Barra *"]).toBe("m9");
    expect(r.fallback).toBe(false);
  });
  it("talla-muestra: Female sin 7 → más cercana (6) + ámbar", () => {
    const rows = [JUNK, H,
      row({ art: "F1", sku: "f5", talla: 5 }),
      row({ art: "F1", sku: "f5.5", talla: 5.5 }),
      row({ art: "F1", sku: "f6", talla: 6 }),
    ] as SheetRow[];
    const r = SW(parseReebok(rows, MONTH).items)[0];
    expect(r.talla).toBe("6");
    expect(r.fallback).toBe(true);
  });
  it("talla-muestra: Unisex → mediana", () => {
    const rows = [JUNK, H,
      row({ art: "U1", sku: "u6", gender: "Unisex", talla: 6 }),
      row({ art: "U1", sku: "u7", gender: "Unisex", talla: 7 }),
      row({ art: "U1", sku: "u8", gender: "Unisex", talla: 8 }),
    ] as SheetRow[];
    const r = SW(parseReebok(rows, MONTH).items)[0];
    expect(r.talla).toBe("7");        // mediana de 6,7,8
    expect(r.fallback).toBe(false);
  });
  it("talla-muestra: Kids (AGE GROUP≠Adult) → mediana aunque sea Male", () => {
    const rows = [JUNK, H,
      row({ art: "K1", sku: "k1", gender: "Male", age: "Kids", talla: 1 }),
      row({ art: "K1", sku: "k2", gender: "Male", age: "Kids", talla: 2 }),
      row({ art: "K1", sku: "k3", gender: "Male", age: "Kids", talla: 3 }),
    ] as SheetRow[];
    const r = SW(parseReebok(rows, MONTH).items)[0];
    expect(r.talla).toBe("2");        // mediana, no 9
  });
  it("apparel → talla M, Unidad PIEZA, FOB WP×0.7", () => {
    const rows = [JUNK, H,
      row({ art: "AP1", sku: "s", dept: "APPAREL", cat: "T-SHIRTS", talla: "S" }),
      row({ art: "AP1", sku: "m", dept: "APPAREL", cat: "T-SHIRTS", talla: "M" }),
      row({ art: "AP1", sku: "l", dept: "APPAREL", cat: "T-SHIRTS", talla: "L" }),
    ] as SheetRow[];
    const r = SW(parseReebok(rows, MONTH).items)[0];
    expect(r.talla).toBe("M");
    expect(r.cols["Código Barra *"]).toBe("m");
    expect(r.cols["Unidad de medida *"]).toBe("PIEZA");
    expect(r.cols["Costo FOB *"]).toBeCloseTo(30.03, 2); // 42.9×0.7
  });
  it("fórmula editable cambia el precio", () => {
    const { items } = parseReebok(rowsFemale(), MONTH);
    const rows = buildSwitchRows(items, { formula: { divisor: 0.5, extra: 1, redondeo: "par" }, temporada: "2026-07", tasa: "7" });
    // ceilPar(37.75/0.5)=ceilPar(75.5)=76 → +1 extra = 77
    expect(rows[0].cols["Precio *"]).toBe(77);
  });
  it("buildSwitchAoa NO aplica Title Case", () => {
    const { items } = parseReebok(rowsFemale(), MONTH);
    const aoa = buildSwitchAoa(SW(items));
    const marcaIdx = OUT_COLS_DEFAULT.indexOf("Marca *");
    const provIdx = OUT_COLS_DEFAULT.indexOf("Proveedor *");
    expect(aoa[1][marcaIdx]).toBe("FOOTWEAR");
    expect(aoa[1][provIdx]).toBe("LATIN FITNESS GROUP");
  });
});

describe("Reebok — excepciones por Name (jerarquía precio fijo > fórmula Name > marca)", () => {
  // Excepción keyed por marcaKey(Name), como la arma ReebokClient (rubro = Name).
  const excMap = (name: string, f: Partial<MarcaRubroFormula>): Map<string, MarcaRubroFormula> =>
    new Map([[marcaKey(name), { marca: "Reebok", rubro: name, divisor: 0, extra: 0, redondeo: "par", ...f } as MarcaRubroFormula]]);

  it("precio fijo por Name gana en catálogo (A y B) y en Switch", () => {
    const { items } = parseReebok(rowsFemale(), MONTH);
    const exc = excMap("CLUB C 85", { precio_fijo: 99 });
    const cat = buildCatalogo(items, { formulaA: REEBOK_FORMULA_A_DEFAULT, formulaB: REEBOK_FORMULA_B_DEFAULT, excByName: exc });
    expect(cat[0].precioA).toBe(99);
    expect(cat[0].precioB).toBe(99); // un override único para A y B
    const sw = buildSwitchRows(items, { formula: REEBOK_FORMULA_A_DEFAULT, temporada: "2026-07", tasa: "7", excByName: exc });
    expect(sw[0].cols["Precio *"]).toBe(99);
  });

  it("fórmula propia del Name gana a la de marca (A y B iguales)", () => {
    const { items } = parseReebok(rowsFemale(), MONTH);
    // costo catálogo = 37.75 → ÷0.5 = 75.5 → ceilPar = 76
    const exc = excMap("CLUB C 85", { divisor: 0.5, extra: 0, redondeo: "par" });
    const cat = buildCatalogo(items, { formulaA: REEBOK_FORMULA_A_DEFAULT, formulaB: REEBOK_FORMULA_B_DEFAULT, excByName: exc });
    expect(cat[0].precioA).toBe(76);
    expect(cat[0].precioB).toBe(76);
  });

  it("Name sin excepción usa la fórmula de marca (A≠B normal)", () => {
    const { items } = parseReebok(rowsFemale(), MONTH);
    const exc = excMap("OTRO MODELO", { precio_fijo: 99 }); // no matchea CLUB C 85
    const cat = buildCatalogo(items, { formulaA: REEBOK_FORMULA_A_DEFAULT, formulaB: REEBOK_FORMULA_B_DEFAULT, excByName: exc });
    expect(cat[0].precioA).toBe(52); // fórmula A
    expect(cat[0].precioB).toBe(48); // fórmula B
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
   ARTÍCULOS SIN PIEZAS DEL MES — no van al Excel (pedido de Daniel)
   "en depurador de reebok, no deberia de aparecerme en el excel los que tengan stock 0"
   La columna STOCK de la vista previa ES "Stock Ideal" = suma de piezas del mes.
   ══════════════════════════════════════════════════════════════════════════════ */

// Artículo Male footwear con TODAS sus tallas en 0 → el proveedor no pidió nada.
const CERO = [
  row({ art: "200000001", sku: "Z-8", talla: 8, gender: "Male", piezas: 0 }),
  row({ art: "200000001", sku: "Z-9", talla: 9, gender: "Male", piezas: 0 }),
];
// Artículo MIXTO: algunas tallas en 0 y otras con piezas → SÍ debe salir (suma 4).
const MIXTO = [
  row({ art: "300000003", sku: "M-8", talla: 8, gender: "Male", piezas: 0 }),
  row({ art: "300000003", sku: "M-9", talla: 9, gender: "Male", piezas: 4 }),
  row({ art: "300000003", sku: "M-10", talla: 10, gender: "Male", piezas: 0 }),
];

describe("Reebok — artículo con 0 piezas del mes no va al Excel", () => {
  const parse = () => parseReebok([JUNK, H, ...FEMALE, ...CERO] as SheetRow[], MONTH);

  it("Plantilla Switch: el artículo en 0 se cuenta como omitido y no queda en las filas", () => {
    const { items } = parse();
    const todas = SW(items);
    expect(todas.map((r) => r.cols["Código *"])).toContain("200000001"); // hoy sale
    const { rows, omitidos } = filtrarConPiezas(todas);
    expect(omitidos).toBe(1);
    expect(rows.map((r) => r.cols["Código *"])).not.toContain("200000001");
    expect(rows.map((r) => r.cols["Código *"])).toContain("100000015");
  });

  it("Pedido para cliente: mismo filtro, mismo criterio", () => {
    const { items } = parse();
    const todas = buildCatalogo(items, CFG);
    const { rows, omitidos } = filtrarConPiezas(todas);
    expect(omitidos).toBe(1);
    expect(rows.map((r) => r.newArticle)).not.toContain("200000001");
    expect(rows.map((r) => r.newArticle)).toContain("100000015");
  });

  it("una TALLA en 0 no saca al artículo: lo que cuenta es la SUMA", () => {
    const { items } = parseReebok([JUNK, H, ...MIXTO] as SheetRow[], MONTH);
    const { rows, omitidos } = filtrarConPiezas(SW(items));
    expect(omitidos).toBe(0);
    expect(rows).toHaveLength(1);
    expect(rows[0].cols["Stock Ideal"]).toBe(4);   // 0 + 4 + 0
    expect(rows[0].piezas).toBe(4);                 // espejo tipado de Stock Ideal
    expect(rows[0].skus).toBe(3);                   // las 3 tallas siguen contadas
  });

  it("sinPiezasDelMes distingue el artículo vacío del que tiene una talla en 0", () => {
    expect(sinPiezasDelMes({ piezas: 0 })).toBe(true);
    expect(sinPiezasDelMes({ piezas: 4 })).toBe(false);
  });
});

describe("Reebok — el mismo New Article en dos PO distintas", () => {
  // Es lo que hace que el pedido (agrupa PO+Article) traiga más filas que Switch
  // (agrupa solo Article): en el archivo real de JULIO son 526 contra 383.
  const DOS_PO = [
    row({ po: "VIC", art: "400000004", sku: "P1-9", talla: 9, gender: "Male", piezas: 2 }),
    row({ po: "ALB", art: "400000004", sku: "P2-9", talla: 9, gender: "Male", piezas: 3 }),
  ];

  it("Switch lo junta en UNA fila con la suma de las dos PO", () => {
    const { items } = parseReebok([JUNK, H, ...DOS_PO] as SheetRow[], MONTH);
    const rows = SW(items);
    expect(rows).toHaveLength(1);
    expect(rows[0].cols["Stock Ideal"]).toBe(5); // 2 + 3
    expect(rows[0].skus).toBe(2);
  });

  it("el pedido lo deja en DOS filas, una por PO", () => {
    const { items } = parseReebok([JUNK, H, ...DOS_PO] as SheetRow[], MONTH);
    const cat = buildCatalogo(items, CFG);
    expect(cat).toHaveLength(2);
    expect(cat.map((r) => r.piezas).sort()).toEqual([2, 3]);
  });

  it("una PO en 0 y la otra con piezas: el artículo SIGUE saliendo en Switch", () => {
    const MIXTO_PO = [
      row({ po: "VIC", art: "500000005", sku: "Q1-9", talla: 9, gender: "Male", piezas: 0 }),
      row({ po: "ALB", art: "500000005", sku: "Q2-9", talla: 9, gender: "Male", piezas: 6 }),
    ];
    const { items } = parseReebok([JUNK, H, ...MIXTO_PO] as SheetRow[], MONTH);
    const sw = filtrarConPiezas(SW(items));
    expect(sw.omitidos).toBe(0);
    expect(sw.rows[0].cols["Stock Ideal"]).toBe(6);
    // …pero en el PEDIDO la PO vacía sí se va, porque ahí la fila ES la PO.
    const cat = filtrarConPiezas(buildCatalogo(items, CFG));
    expect(cat.omitidos).toBe(1);
    expect(cat.rows).toHaveLength(1);
    expect(cat.rows[0].po).toBe("ALB");
  });
});

describe("Reebok — sin columna de mes NO se entrega un Excel vacío", () => {
  it("monthColIdx = -1 deja TODO en 0: filtrar acá vaciaría el archivo", () => {
    const { items } = parseReebok([JUNK, H, ...FEMALE, ...CERO] as SheetRow[], -1);
    expect(items.every((i) => i.piezas === 0)).toBe(true);
    // Si alguien aplicara el filtro igual, no quedaría NADA: por eso el cliente
    // solo filtra cuando monthColIdx !== -1 (y avisa en ámbar).
    expect(filtrarConPiezas(SW(items)).rows).toHaveLength(0);
    // Sin filtrar, los 2 artículos siguen ahí.
    expect(SW(items)).toHaveLength(2);
  });

  it("el cliente ata el filtro a que exista columna de mes, y bloquea el archivo vacío", () => {
    const src = readFileSync(join(__dirname, "../app/productos/cargar/ReebokClient.tsx"), "utf8");
    expect(src).toMatch(/const filtrarSinPiezas = monthColIdx !== -1;/);
    // Sin resultados tras filtrar → no se puede descargar.
    expect(src).toMatch(/const quedoVacio = filtrarSinPiezas && vista\.articulos === 0;/);
    expect(src).toMatch(/disabled=\{!!downloading \|\| quedoVacio\}/);
    expect(src).toMatch(/if \(!items \|\| downloading \|\| quedoVacio\) return;/);
  });
});

describe("Reebok — la vista previa y el Excel traen las MISMAS filas", () => {
  it("el AOA tiene exactamente 1 fila por artículo (+ encabezado)", () => {
    const { items } = parseReebok([JUNK, H, ...FEMALE, ...CERO, ...MIXTO] as SheetRow[], MONTH);
    const sw = filtrarConPiezas(SW(items)).rows;
    expect(buildSwitchAoa(sw)).toHaveLength(sw.length + 1);
    const cat = filtrarConPiezas(buildCatalogo(items, CFG)).rows;
    expect(buildCatalogoAoa(cat, "JULIO")).toHaveLength(cat.length + 1);
  });

  it("CANDADO: el cliente nunca pasa las filas SIN filtrar ni a la preview ni al Excel", () => {
    const src = readFileSync(join(__dirname, "../app/productos/cargar/ReebokClient.tsx"), "utf8");
    // Los arrays crudos existen, pero solo para alimentar el filtro.
    for (const crudo of ["catalogoTodo", "switchRowsTodo"]) {
      const usos = src.match(new RegExp(crudo, "g")) ?? [];
      expect(usos.length).toBeGreaterThan(0);
      expect(src).not.toMatch(new RegExp(`buildCatalogoAoa\\(${crudo}`));
      expect(src).not.toMatch(new RegExp(`buildSwitchAoa\\(${crudo}`));
      expect(src).not.toMatch(new RegExp(`${crudo}\\.map\\(`));   // preview
      expect(src).not.toMatch(new RegExp(`${crudo}\\.length`));   // contadores
    }
    // Los que SÍ se usan son los filtrados.
    expect(src).toMatch(/buildCatalogoAoa\(catalogo, monthLabel\)/);
    expect(src).toMatch(/buildSwitchAoa\(switchRows\)/);
  });

  it("CANDADO: los contadores de la barra salen de la salida elegida, no del catálogo", () => {
    const src = readFileSync(join(__dirname, "../app/productos/cargar/ReebokClient.tsx"), "utf8");
    expect(src).toMatch(/salida === "catalogo" \? catalogo : switchRows/);
    expect(src).toMatch(/\{vista\.articulos\}<\/b> artículos/);
  });
});

describe("Reebok — Plantilla Switch es la opción por defecto", () => {
  it("el estado inicial de la salida es switch", () => {
    const src = readFileSync(join(__dirname, "../app/productos/cargar/ReebokClient.tsx"), "utf8");
    expect(src).toMatch(/useState<Salida>\("switch"\)/);
    expect(src).not.toMatch(/useState<Salida>\("catalogo"\)/);
  });
});
