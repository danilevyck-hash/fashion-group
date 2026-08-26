// Marcas mal escritas DENTRO de Switch (no se pueden arreglar por API: para
// artículos la API de Switch es solo lectura). Se corrigen al leerlas, con
// MARCA_FIXES, para que el artículo caiga bajo su marca real en vez de "Otros".
//
// Este archivo CONGELA el mapa entrada → salida: si alguien mueve una fila,
// borra una corrección o "arregla" un nombre que hoy está bien, se cae el test.
import { describe, it, expect } from "vitest";
import {
  MARCA_FIXES,
  MARCA_CATALOGO,
  fixMarca,
  marcaKey,
  reclassMarca,
  processRows,
  type SheetRow,
  type CatalogoDescripciones,
} from "../../lib/depurador/logic";
import { processFactura } from "../../lib/depurador/tienda";

/* ── El mapa congelado ────────────────────────────────────────────────────────
 * Nombres REALES, tal cual están escritos en Switch (medidos contra
 * switch_factura_lineas de vistana / fashion_wear / fashion_shoes). */
const CORRECCIONES: [malEscrita: string, canonica: string][] = [
  ["TH ACCESORIES", "TH Accessories"],
  ["TH OTHER ACCESORIES", "TH Accessories"],
  ["TH ACCESORIOS", "TH Accessories"],
  ["TH-ACCESORIOS", "TH Accessories"],
  ["CK ACCESORIES", "CK Accessories"],
  ["TH WOMEN", "TH Womenswear"],
  ["TH MEN", "TH Menswear"],
  // "Unisex-Home" = juego de toallas Tommy; sus hermanas (Unisex-Home,
  // Unisex-Towels, Unisex-Home Towels) ya están catalogadas bajo TH Other.
  ["TH HOME", "TH Other"],
  // Los dos artículos son "POLO BASICO P/H COLOR ... SLIM", rubro MEN.
  ["TH SPORT MEN", "TH Menswear"],
];

describe("Marcas mal escritas en Switch — mapa congelado", () => {
  it("MARCA_FIXES tiene EXACTAMENTE estas correcciones (ni una más, ni una menos)", () => {
    expect(Object.keys(MARCA_FIXES).sort()).toEqual(
      CORRECCIONES.map(([mal]) => marcaKey(mal)).sort()
    );
  });

  it.each(CORRECCIONES)("fixMarca(%s) → %s", (mal, canonica) => {
    expect(fixMarca(mal)).toBe(canonica);
  });

  it("cada corrección apunta a una marca que EXISTE en el catálogo", () => {
    const catalogo = new Set(MARCA_CATALOGO.map((c) => marcaKey(c.marca)));
    for (const [, canonica] of CORRECCIONES) {
      expect(catalogo.has(marcaKey(canonica))).toBe(true);
    }
  });
});

describe("Marcas mal escritas — caja y espacios", () => {
  // En Switch están en MAYÚSCULA ("TH ACCESORIES"); en el Excel del proveedor
  // vienen en formato normal. marcaKey normaliza NFKC + espacios + minúsculas,
  // así que las dos formas tienen que corregirse igual.
  it.each(CORRECCIONES)("%s se corrige en MAYÚSCULA, minúscula y con espacios de más", (mal, canonica) => {
    expect(fixMarca(mal.toUpperCase())).toBe(canonica);
    expect(fixMarca(mal.toLowerCase())).toBe(canonica);
    expect(fixMarca(`  ${mal.replace(/ /g, "  ")}  `)).toBe(canonica);
  });
});

describe("Marcas mal escritas — el caso al revés: lo que NO se toca", () => {
  it("una marca bien escrita del catálogo sale idéntica", () => {
    for (const { marca } of MARCA_CATALOGO) {
      expect(fixMarca(marca)).toBe(marca);
      expect(fixMarca(marca.toUpperCase())).toBe(marca.toUpperCase()); // fixMarca no canoniza caja
    }
  });

  it.each(["OTROS", "OTHERS", "Otros", "others"])(
    "%s NO se corrige: es el cajón a propósito",
    (cajon) => {
      expect(fixMarca(cajon)).toBe(cajon);
      expect(reclassMarca(cajon, "Agua")).toBe("Otros");
    }
  );

  it("\"TH\" a secas queda FUERA del mapa: sus 2 artículos van a marcas distintas", () => {
    // 09TCR01-099 "MENS T-SHIRT S-S" iría a TH Menswear y 69J7605-410
    // "WOMEN HANDBAGS" a TH Accessories. Una corrección es una sola salida por
    // entrada, así que no puede resolverlo: se arregla en Switch, uno por uno.
    expect(MARCA_FIXES[marcaKey("TH")]).toBeUndefined();
  });

  it("las marcas que YA están bien en el catálogo no necesitan corrección", () => {
    for (const m of ["TH LICENSE", "TH DISPLAY & PROMO", "TH OTHER"]) {
      expect(MARCA_FIXES[marcaKey(m)]).toBeUndefined();
      expect(reclassMarca(m, "")).not.toBe("Otros"); // entran por el catálogo, no por el mapa
    }
  });

  it("marcas crudas sin destino claro siguen cayendo en Otros", () => {
    for (const m of ["TH MEN LEATHERS", "WOMENPOLOS", "FA24", "MEN-T-SHIRTS S-S"]) {
      expect(MARCA_FIXES[marcaKey(m)]).toBeUndefined();
      expect(reclassMarca(m, "")).toBe("Otros");
    }
  });

  it("no se toca Reebok ni Joybees", () => {
    for (const m of ["RBK FOOTWEAR", "RBK APPAREL", "RBK HARDWARE", "JOYBEES", "Reebok", "Reebok Precio A"]) {
      expect(fixMarca(m)).toBe(m);
      expect(MARCA_FIXES[marcaKey(m)]).toBeUndefined();
    }
  });
});

/* ── Camino 1: el Depurador (Excel del proveedor → processRows) ─────────────── */
describe("Marcas mal escritas — camino Depurador (processRows)", () => {
  const H = ["REFERENCIA", "EAN", "P_CATEGORY", "TALLA", "CANTIDAD", "COSTO", "PRECIO2", "MARCA", "PROVEEDOR"];
  const cfg = { factor: 1.1, tasa: "7", mesIdx: 5, anio: "2026" };
  const marcaDe = (marca: string, desc: string) =>
    processRows([H, ["R1", "1", desc, "M", 10, 10, 20, marca, "x"]] as SheetRow[], cfg).rows[0].cols["Marca *"];

  it.each([
    ["TH ACCESORIES", "Men-Bags", "TH Accessories"],
    ["TH OTHER ACCESORIES", "Men-Bags", "TH Accessories"],
    ["TH ACCESORIOS", "Women-Handbags", "TH Accessories"],
    ["TH-ACCESORIOS", "Women-Handbags", "TH Accessories"],
    ["CK ACCESORIES", "Women-Handbags", "CK Accessories"],
    ["TH WOMEN", "Women-T-Shirts S/S", "TH Womenswear"],
    ["TH MEN", "Men-Polos S/S", "TH Menswear"],
    ["TH HOME", "Unisex-Home", "TH Other"],
    ["TH SPORT MEN", "Men-Polos S/S", "TH Menswear"],
  ])("%s (%s) → %s", (marca, desc, esperada) => {
    expect(marcaDe(marca, desc)).toBe(esperada);
  });

  it("\"TH\" a secas sigue cayendo en Otros (no se inventó una marca)", () => {
    expect(marcaDe("TH", "Men-T-Shirts S/S")).toBe("Otros");
    expect(marcaDe("TH", "Women-Handbags")).toBe("Otros");
  });
});

/* ── Camino 2: Facturas de Tienda (processFactura, formato A) ───────────────── */
describe("Marcas mal escritas — camino Facturas Tienda (processFactura)", () => {
  const CAT: CatalogoDescripciones = {
    "TH Accessories": ["Men-Bags"],
    "CK Accessories": ["Women-Handbags"],
    "TH Womenswear": ["Women-T-Shirts S/S"],
    "TH Menswear": ["Men-Polos S/S"],
    "TH Other": ["Unisex-Home"],
  };
  const HEAD = ["CODIGO", "CODIGO BARRA", "REFERENCIA", "DESCRIPCION", "MARCA", "RUBRO", "SUB RUBRO",
    "UNIDAD DE MEDIDA", "PROVEEDOR", "CANTIDAD", "PRECIO"];
  const marcaDe = (marca: string, desc: string, prov = "American Fashion Wear, SA") =>
    processFactura(
      [HEAD, ["C1", "7501234567890", "R1", desc, marca, "MEN", "BAGS", "PIEZA", prov, 5, 10]] as SheetRow[],
      { temporadaFallback: "2026-08", catalogo: CAT }
    ).rows[0].cols["Marca *"];

  // La plantilla de tienda escribe la marca en MAYÚSCULAS (convención existente).
  it.each([
    ["TH ACCESORIES", "Men-Bags", "TH ACCESSORIES"],
    ["TH OTHER ACCESORIES", "Men-Bags", "TH ACCESSORIES"],
    ["TH ACCESORIOS", "Women-Handbags", "TH ACCESSORIES"],
    ["TH-ACCESORIOS", "Women-Handbags", "TH ACCESSORIES"],
    ["CK ACCESORIES", "Women-Handbags", "CK ACCESSORIES"],
    ["TH WOMEN", "Women-T-Shirts S/S", "TH WOMENSWEAR"],
    ["TH MEN", "Men-Polos S/S", "TH MENSWEAR"],
    ["TH HOME", "Unisex-Home", "TH OTHER"],
    ["TH SPORT MEN", "Men-Polos S/S", "TH MENSWEAR"],
  ])("%s (%s) → %s", (marca, desc, esperada) => {
    expect(marcaDe(marca, desc)).toBe(esperada);
  });

  it("Reebok NO pasa por MARCA_FIXES: entra por su propia puerta", () => {
    expect(marcaDe("FOOTWEAR", "REEBOK RELORA", "Latin Fitness Group")).toBe("RBK FOOTWEAR");
    expect(marcaDe("APPAREL", "REEBOK TEE", "Latin Fitness Group")).toBe("RBK APPAREL");
  });

  it("Joybees NO pasa por MARCA_FIXES", () => {
    expect(marcaDe("TH ACCESORIES", "Adult Casual Flip", "JCBBrands Corp")).toBe("JOYBEES");
  });
});
