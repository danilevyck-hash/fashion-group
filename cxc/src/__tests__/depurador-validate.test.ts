import { describe, it, expect } from "vitest";
import {
  processRows, buildAoa, OUT_COLS, titleCase, proveedorParaEmpresa,
  esDescripcionCatalogada, descripcionesDeMarca, matchEmpresaFromDestino, precioDescripcion,
  MARCA_CATALOGO, normalizeDescripcion, reclassMarca,
  type SheetRow, type MarcaRubroFormula, type CatalogoDescripciones,
} from "../lib/depurador/logic";
import { marcasQueContienen } from "../lib/depurador/tienda";

// El catálogo de descripciones ya NO es una constante: vive en la tabla
// depurador_descripciones y las funciones lo reciben como parámetro. Para los
// tests se inyecta este fixture (espejo de un pedazo del seed real).
const CATALOGO_TEST: CatalogoDescripciones = {
  "KL Footwear": ["Women-Flip Flops", "Women-Sneakers"],
  "KL Womenswear": ["Women-T-Shirts S/S"],
  "TH Menswear": ["Men-Polos S/S", "Men-T-Shirts S/S"],
};

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
  // 🔴 CAMBIÓ DE DIRECCIÓN (3-sep-2026). Este test decía «24 cols, sin
  // Composición»: era el candado de un error. La plantilla de Switch tiene 25
  // columnas y «Composición» es la 21 — bajada de las 8 empresas, MD5 idéntico.
  // Daniel: «vuelve vacía, no la quiero». La lista exacta se compara contra el
  // fixture real en depurador-plantilla-switch.test.ts.
  it("Header = las 25 columnas de Switch, CON Composición (vacía) y CON Codigo CPBS", () => {
    const aoa = buildAoa(processRows([H, ["R1", "1", "Men-Bras", "M", 10, 10, 20, "CK Menswear", "x"]] as SheetRow[], cfg).rows);
    const header = aoa[0] as string[];
    expect(header).toEqual(OUT_COLS);
    expect(header.length).toBe(25);
    expect(header[20]).toBe("Composición");
    expect(aoa[1][20]).toBe("");
    expect(header).toContain("Codigo CPBS");
    expect(header).toContain("Codigo CPBS Abrev");
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

describe("Depurador — Active Wear / Karl Lagerfeld (Tarea 4)", () => {
  const rows = processRows([H, ["R1", "1", "Women-T-Shirts S/S", "M", 10, 10, 20, "KL Womenswear", "x"]] as SheetRow[], cfg).rows;
  it("Active Wear usa LA plantilla (25 cols FOB+CIF, la misma que todas), proveedor configurable", () => {
    expect((buildAoa(rows)[0] as string[]).length).toBe(25);
    expect(buildAoa(rows)[0]).toContain("Costo FOB *");
    expect(buildAoa(rows)[0]).toContain("Costo CIF *");
    expect(proveedorParaEmpresa("active_wear")).toBeNull(); // Daniel lo llena
  });
  it("matchEmpresaFromDestino reconoce KL/Active Wear/Multifashion", () => {
    expect(matchEmpresaFromDestino("KARL LAGERFELD")).toBe("active_wear");
    expect(matchEmpresaFromDestino("MULTIFASHION S.A.")).toBe("active_wear");
  });
  it("Marcas KL conocidas para la alarma (catalogadas vs huérfanas)", () => {
    expect(esDescripcionCatalogada(CATALOGO_TEST, "KL Footwear", "Women-Sneakers")).toBe(true);
    expect(esDescripcionCatalogada(CATALOGO_TEST, "KL Footwear", "Women-Boots")).toBe(false); // dispararía alarma/bloqueo
  });
});

describe("Depurador — catálogo de descripciones inyectado (tabla, no constante)", () => {
  it("descripcionesDeMarca es insensible a caja/espacios de la marca", () => {
    expect(descripcionesDeMarca(CATALOGO_TEST, "kl  footwear")).toEqual(["Women-Flip Flops", "Women-Sneakers"]);
    expect(descripcionesDeMarca(CATALOGO_TEST, "KL FOOTWEAR")).toEqual(["Women-Flip Flops", "Women-Sneakers"]);
    expect(descripcionesDeMarca(CATALOGO_TEST, "Marca Inexistente")).toEqual([]);
  });
  it("esDescripcionCatalogada compara descripciones insensible a caja", () => {
    expect(esDescripcionCatalogada(CATALOGO_TEST, "TH Menswear", "MEN-POLOS S/S")).toBe(true);
    expect(esDescripcionCatalogada(CATALOGO_TEST, "TH Menswear", "Men-Boots")).toBe(false);
  });
  it("MARCA_CATALOGO sigue en código con las 33 marcas CK/TH/KL", () => {
    expect(MARCA_CATALOGO.length).toBe(33);
    const marcas = MARCA_CATALOGO.map((c) => c.marca);
    expect(marcas).toContain("CK Menswear");
    expect(marcas).toContain("TH Footwear");
    expect(marcas).toContain("KL Accessories");
  });

  // 26-ago-2026: Karl Lagerfeld tiene 9 líneas y el sistema conocía 4. Las que
  // faltaban caían a "Otros" y salían SIN PRECIO. Evidencia: reporte del
  // proveedor (hoja FACTURACION 2022-2026 + pedidos pendientes) y ventas reales.
  it("las 9 líneas de KL, las 12 de CK y las 12 de TH están todas", () => {
    const marcas = MARCA_CATALOGO.map((c) => c.marca);
    const kl = marcas.filter((m) => m.startsWith("KL "));
    expect(kl.sort()).toEqual([
      "KL Accessories", "KL Display & Promo", "KL Footwear", "KL Jeans",
      "KL Legwear", "KL Menswear", "KL Other", "KL Underwear", "KL Womenswear",
    ]);
    expect(marcas.filter((m) => m.startsWith("CK ")).length).toBe(12);
    expect(marcas.filter((m) => m.startsWith("TH ")).length).toBe(12);
    // Las 7 que entraron: ya no caen a "Otros".
    for (const m of ["KL Jeans", "KL Legwear", "KL Other", "KL Underwear",
                     "KL Display & Promo", "TH License", "TH Display & Promo"]) {
      expect(reclassMarca(m, "")).toBe(m);
    }
  });

  it("KL va a Active Wear, TH License y TH Display & Promo a Fashion Wear", () => {
    const emp = (m: string) => MARCA_CATALOGO.find((c) => c.marca === m)?.empresa;
    expect(emp("KL Jeans")).toBe("Active Wear");
    expect(emp("KL Display & Promo")).toBe("Active Wear");
    expect(emp("TH License")).toBe("Fashion Wear");
    expect(emp("TH Display & Promo")).toBe("Fashion Wear");
    expect(emp("TH Footwear")).toBe("Fashion Shoes"); // no se movió
  });
  it("marcasQueContienen (Facturas Tienda) deriva la marca desde el catálogo inyectado", () => {
    expect(marcasQueContienen(CATALOGO_TEST, "active_wear", "Women-Sneakers")).toEqual(["KL Footwear"]);
    expect(marcasQueContienen(CATALOGO_TEST, "active_wear", "Women-Boots")).toEqual([]); // nueva → bloquea
    expect(marcasQueContienen(CATALOGO_TEST, "fashion_wear", "Men-Polos S/S")).toEqual(["TH Menswear"]);
  });
});

// ── Marca desconocida: se DICE, no se esconde ────────────────────────────────
// Antes, una marca fuera del catálogo caía a "Otros", el producto salía sin
// precio y nadie se enteraba. Ahora processRows la devuelve con su conteo para
// que la pantalla la muestre. NO frena la carga: la fila sale igual.
describe("Depurador — marcas desconocidas (no caen en silencio)", () => {
  const fila = (ref: string, marca: string, desc = "Men-Polos S/S") =>
    [ref, "1", desc, "M", 10, 10, 20, marca, "x"] as SheetRow;

  it("una marca fuera del catálogo se reporta con el conteo de productos", () => {
    const r = processRows([H, fila("R1", "KL Sombreros"), fila("R2", "KL Sombreros"),
      fila("R3", "TH Menswear")] as SheetRow[], cfg);
    expect(r.marcasDesconocidas).toEqual([{ marca: "KL Sombreros", productos: 2 }]);
  });

  it("NO frena la carga: los productos de esa marca siguen saliendo", () => {
    const r = processRows([H, fila("R1", "KL Sombreros")] as SheetRow[], cfg);
    expect(r.rows.length).toBe(1);
    expect(r.rows[0].cols["Marca *"]).toBe("Otros");
  });

  it("las 7 marcas que entraron ya NO se reportan como desconocidas", () => {
    const nuevas = ["KL Jeans", "KL Legwear", "KL Other", "KL Underwear",
      "KL Display & Promo", "TH License", "TH Display & Promo"];
    const r = processRows([H, ...nuevas.map((m, i) => fila(`R${i}`, m))] as SheetRow[], cfg);
    expect(r.marcasDesconocidas).toEqual([]);
  });

  it("un SERVICIO no se reporta: su marca 'Otros' es a propósito", () => {
    const r = processRows([H, fila("S1", "Whatever", "AJUSTE DE PRECIO")] as SheetRow[], cfg);
    expect(r.rows[0].cols["Marca *"]).toBe("Otros");
    expect(r.marcasDesconocidas).toEqual([]);
  });

  it("la marca va CRUDA (lo que hay que buscar en el archivo) y ordenada por conteo", () => {
    const r = processRows([H, fila("R1", "  kl sombreros  "), fila("R2", "kl sombreros"),
      fila("R3", "KL Bufandas")] as SheetRow[], cfg);
    expect(r.marcasDesconocidas).toEqual([
      { marca: "kl sombreros", productos: 2 },
      { marca: "KL Bufandas", productos: 1 },
    ]);
  });

  it("un archivo sano no reporta ninguna", () => {
    const r = processRows([H, fila("R1", "TH Menswear"), fila("R2", "CK Jeans")] as SheetRow[], cfg);
    expect(r.marcasDesconocidas).toEqual([]);
  });
});

describe("Depurador — UNA plantilla para las 4 empresas (3-sep-2026)", () => {
  const rows = processRows([H, ["R1", "1", "Men-Sneakers", "M", 10, 10, 20, "TH Footwear", "x"]] as SheetRow[], cfg).rows;
  // 🔴 CAMBIÓ DE DIRECCIÓN POR SEGUNDA VEZ. Este bloque fijaba una plantilla
  // propia de Fashion Shoes: 24 columnas y UNA sola «Costo *» (= CIF desde el
  // 27-jun-2026, = FOB desde el 1-sep-2026). Esa columna no existe en Switch:
  // la plantilla real —bajada de las 8 empresas el 3-sep-2026, MD5 idéntico—
  // trae «Costo FOB *» Y «Costo CIF *», las dos obligatorias. Daniel, 3-sep:
  // Fashion Shoes con FOB y CIF separados, CIF = FOB × 1,10 como Vistana → «sí».
  // Ya no hay `outColsForEmpresa`: buildAoa no recibe empresa porque las
  // columnas no dependen de ella.
  it("Fashion Shoes: las MISMAS 25 columnas, FOB = 10 y CIF = 11 (FOB × 1,1)", () => {
    const aoa = buildAoa(rows);
    const header = aoa[0] as string[];
    expect(header).toEqual(OUT_COLS);
    expect(header).not.toContain("Costo *");
    expect(aoa[1][header.indexOf("Costo FOB *")]).toBe(10);
    expect(aoa[1][header.indexOf("Costo CIF *")]).toBe(11);
    expect(aoa[1][header.indexOf("Composición")]).toBe("");
  });

  it("⛔ el CIF de Fashion Shoes NO es igual al FOB (eso es Multifashion, no acá)", () => {
    const aoa = buildAoa(rows);
    const header = aoa[0] as string[];
    expect(aoa[1][header.indexOf("Costo CIF *")]).not.toBe(aoa[1][header.indexOf("Costo FOB *")]);
  });

  it("Vistana/Fashion Wear: igual que siempre, FOB y CIF por separado", () => {
    const aoa = buildAoa(rows);
    const header = aoa[0] as string[];
    expect(aoa[1][header.indexOf("Costo FOB *")]).toBe(10);
    expect(aoa[1][header.indexOf("Costo CIF *")]).toBe(11);
    expect(header).toContain("Codigo CPBS");
  });
});

describe("Depurador — precio fijo por descripción (jerarquía)", () => {
  const marcaF = { divisor: 0.73, extra: 2, redondeo: "int" as const }; // fórmula de la marca
  const formulaPropia: MarcaRubroFormula = { marca: "X", rubro: "Y", divisor: 0.5, extra: 0, redondeo: "int" };
  const fija: MarcaRubroFormula = { marca: "X", rubro: "Y", divisor: 0, extra: 0, redondeo: "int", precio_fijo: 19.99 };
  it("precio fijo GANA (ignora costo/fórmula)", () => {
    expect(precioDescripcion(100, fija, marcaF)).toBe(19.99);
    expect(precioDescripcion(null, fija, marcaF)).toBe(19.99); // ni siquiera necesita CIF
  });
  it("sin precio fijo → fórmula propia de la descripción", () => {
    expect(precioDescripcion(10, formulaPropia, marcaF)).toBe(20); // TECHO(10/0.5)=20
  });
  it("sin excepción → fórmula de la marca", () => {
    expect(precioDescripcion(17.6, null, marcaF)).toBe(27); // TECHO(17.6/0.73)=25 +2 = 27
  });
  it("precio_fijo 0/negativo no aplica → cae a fórmula", () => {
    const cero: MarcaRubroFormula = { marca: "X", rubro: "Y", divisor: 0.5, extra: 0, redondeo: "int", precio_fijo: 0 };
    expect(precioDescripcion(10, cero, marcaF)).toBe(20); // usa la fórmula propia (divisor 0.5)
  });
});

describe("Depurador — Codigo CPBS = número de factura (columna C)", () => {
  it("Fashion Shoes: CPBS lleva la factura detectada por header FACTURA (columna C)", () => {
    const Hf = ["REFERENCIA", "EAN", "FACTURA", "P_CATEGORY", "TALLA", "CANTIDAD", "COSTO", "PRECIO2", "MARCA", "PROVEEDOR"];
    const rows = processRows([Hf, ["R1", "1", "FAC-12345", "Men-Sneakers", "M", 10, 10, 20, "TH Footwear", "x"]] as SheetRow[], cfg).rows;
    const aoa = buildAoa(rows);
    const header = aoa[0] as string[];
    expect(aoa[1][header.indexOf("Codigo CPBS")]).toBe("FAC-12345");
  });
  it("detecta la factura por POSICIÓN columna C aunque el header no sea reconocido", () => {
    const Hpos = ["REFERENCIA", "EAN", "DOCU_X", "P_CATEGORY", "TALLA", "CANTIDAD", "COSTO", "PRECIO2", "MARCA", "PROVEEDOR"];
    const r = processRows([Hpos, ["R1", "1", "DOC-777", "Men-Sneakers", "M", 10, 10, 20, "TH Footwear", "x"]] as SheetRow[], cfg).rows[0];
    expect(r.cols["Codigo CPBS"]).toBe("DOC-777");
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

describe("Depurador — regla de talla del EAN (caso Kids, aditivo)", () => {
  // Plantilla con varias tallas por estilo. GENERO en la última columna.
  const HG = [...H, "GENERO"];
  const style = (desc: string, tallas: string[], genero = "") =>
    processRows(
      [HG, ...tallas.map((t) => ["R1", `EAN-${t}`, desc, t, 5, 10, 20, "TH Kids", "x", genero])] as SheetRow[],
      cfg
    ).rows[0];

  it("Kids con tallas Europa (8, 10, 12) → elige la 8", () => {
    const r = style("Kids Unisex-Polos S/S", ["8", "10", "12"]);
    expect(r.talla).toBe("8");
    expect(r.cols["Código Barra *"]).toBe("EAN-8");
    expect(r.fallback).toBe(false);
  });
  it("Kids por columna GENERO (tallas 10, 8, 12) → elige la 8", () => {
    const r = style("Toddler-Polos S/S", ["10", "8", "12"], "KIDS");
    expect(r.talla).toBe("8");
    expect(r.cols["Código Barra *"]).toBe("EAN-8");
  });
  it("Kids con tallas USA sin 8 → cae a M", () => {
    const r = style("Kids Unisex-Polos S/S", ["S", "M", "L"]);
    expect(r.talla).toBe("M");
    expect(r.cols["Código Barra *"]).toBe("EAN-M");
    expect(r.fallback).toBe(false);
  });
  it("Kids sin 8 ni M → fallback a la más chica con alerta", () => {
    const r = style("Kids Unisex-Polos S/S", ["10", "12", "14"]);
    expect(r.talla).toBe("10");
    expect(r.fallback).toBe(true);
  });
  // Regresión: los casos existentes NO cambian.
  it("Calzado hombre sigue en 41, dama en 37", () => {
    expect(style("Men-Sneakers", ["40", "41", "42"]).talla).toBe("41");
    expect(style("Women-Sandals", ["36", "37", "38"]).talla).toBe("37");
  });
  it("Bottoms hombre 32, dama 27, tops M", () => {
    expect(style("Men-Pant Non-Denim", ["30", "32", "34"]).talla).toBe("32");
    expect(style("Women-Denim Short", ["25", "27", "29"]).talla).toBe("27");
    expect(style("Men-T-Shirts S/S", ["S", "M", "L"]).talla).toBe("M");
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
   ARTÍCULOS SIN CANTIDAD — fuera del Excel, PERO los servicios se quedan.
   La trampa: los servicios (tipo 02) se emiten a propósito con Stock Ideal 0.
   Filtrar "todo lo que diga 0" los borraría. El criterio es la CANTIDAD del
   proveedor, no la celda.
   ══════════════════════════════════════════════════════════════════════════════ */
describe("Depurador — artículos sin cantidad (y servicios que sobreviven)", () => {
  const art = (ref: string, desc: string, cant: number) => [ref, "1", desc, "M", cant, 10, 20, "CK Menswear", "x"];

  it("artículo real con CANTIDAD 0 no sale, y se cuenta como omitido", () => {
    const r = processRows([H, art("R1", "Men-Polos S/S", 10), art("R2", "Men-T-Shirts S/S", 0)] as SheetRow[], cfg);
    expect(r.rows.map((x) => x.cols["Código *"])).toEqual(["R1"]);
    expect(r.omitidosSinCantidad).toBe(1);
    expect(r.sinColumnaCantidad).toBe(false);
  });

  it("SERVICIO con CANTIDAD 0 SÍ sale, con Stock Ideal 0 y tipo 02", () => {
    const r = processRows([H, art("R1", "Men-Polos S/S", 10), art("S1", "AJUSTE DE PRECIO", 0)] as SheetRow[], cfg);
    const codigos = r.rows.map((x) => x.cols["Código *"]);
    expect(codigos).toContain("S1");
    expect(codigos).toContain("R1");
    expect(r.omitidosSinCantidad).toBe(0); // el servicio NO se cuenta como omitido
    const s = r.rows.find((x) => x.cols["Código *"] === "S1")!.cols;
    expect(s["Código Tipo de Artículo *"]).toBe("02");
    expect(s["Stock Ideal"]).toBe(0);
  });

  it("un archivo SOLO de servicios en 0 sigue produciendo plantilla", () => {
    const r = processRows([H, art("S1", "AJUSTE DE PRECIO", 0)] as SheetRow[], cfg);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].cols["Stock Ideal"]).toBe(0);
  });

  it("varias líneas del mismo estilo: cuenta la SUMA, no cada línea", () => {
    // R1 tiene una talla en 0 y otra en 7 → suma 7 → SÍ sale.
    const r = processRows([H,
      ["R1", "1", "Men-Polos S/S", "M", 0, 10, 20, "CK Menswear", "x"],
      ["R1", "2", "Men-Polos S/S", "L", 7, 10, 20, "CK Menswear", "x"],
    ] as SheetRow[], cfg);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].cols["Stock Ideal"]).toBe(7);
    expect(r.omitidosSinCantidad).toBe(0);
  });

  it("SIN columna CANTIDAD no se filtra nada (si no, se vaciaría la plantilla)", () => {
    // Sin CANTIDAD todas las filas darían 0: filtrar dejaría el Excel sin nada.
    const Hsin = ["REFERENCIA", "EAN", "P_CATEGORY", "TALLA", "COSTO", "PRECIO2", "MARCA", "PROVEEDOR"];
    const r = processRows([Hsin,
      ["R1", "1", "Men-Polos S/S", "M", 10, 20, "CK Menswear", "x"],
      ["R2", "2", "Men-T-Shirts S/S", "L", 10, 20, "CK Menswear", "x"],
    ] as SheetRow[], cfg);
    expect(r.rows).toHaveLength(2);
    expect(r.sinColumnaCantidad).toBe(true);
    expect(r.omitidosSinCantidad).toBe(0);
  });

  it("si TODO queda afuera, corta con un mensaje en vez de entregar un Excel vacío", () => {
    expect(() => processRows([H, art("R1", "Men-Polos S/S", 0), art("R2", "Men-T-Shirts S/S", 0)] as SheetRow[], cfg))
      .toThrow(/saldría vacía/);
  });
});

describe("normalización: el blazer masculino, gemelo del femenino que ya estaba", () => {
  it("«Men-Blazers / Sports Jackets» se limpia a «Men-Blazers»", () => {
    // Switch manda las dos formas: BLAZERS (232 u. vendidas) y
    // BLAZERS - SPORTS JACKETS (28 u.). La larga es la sucia — se limpia acá,
    // no se le abre fila en el catálogo. La regla para mujer ya existía.
    expect(normalizeDescripcion("Men-Blazers / Sports Jackets")).toBe("Men-Blazers");
    expect(normalizeDescripcion("Women-Blazers / Sports Jackets")).toBe("Women-Blazers");
  });

  it("no toca la forma limpia", () => {
    expect(normalizeDescripcion("Men-Blazers")).toBe("Men-Blazers");
  });
});

describe("normalización: la corbata, gemela del blazer", () => {
  it("«Men-Ties / Neckwear» se limpia a «Men-Ties»", () => {
    // Switch pega la cola " / Neckwear". La prenda es la corbata; la cola es
    // sucia — se limpia acá y al catálogo entra "Men-Ties" (TH Menswear).
    expect(normalizeDescripcion("Men-Ties / Neckwear")).toBe("Men-Ties");
  });

  it("no toca la forma limpia ni se lleva puesto nada que diga Ties", () => {
    expect(normalizeDescripcion("Men-Ties")).toBe("Men-Ties");
    // "Panties" contiene "ties": la regla es por descripción COMPLETA, no por
    // pedazo — si fuera por substring se llevaría puesta la ropa interior.
    expect(normalizeDescripcion("Women-Panties")).toBe("Women-Panties");
    expect(normalizeDescripcion("Women-Panties 3PK")).toBe("Women-Panties 3PK");
  });
});
