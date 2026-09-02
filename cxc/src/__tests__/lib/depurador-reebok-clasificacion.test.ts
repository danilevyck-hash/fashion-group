// ─────────────────────────────────────────────────────────────────────────────
// CANDADO — los dos agujeros silenciosos del Depurador Reebok.
//
// El Depurador escribe HACIA Switch: `CATEGORY` sale como `rubro *` y `GENDER`
// como `subrubro`. De ahí el catálogo las lee de vuelta y arma la categoría, el
// género y —vía la categoría— **el bulto que se le cobra al cliente**.
//
// 🩸 AGUJERO 1: esas dos columnas NO eran obligatorias. Solo lo eran `New
// Article`, `SKU`, `WholesalePrice` y `Department`. Si Reebok renombraba la
// columna en su Excel, `findCol` daba −1, `val` daba `""`, y el archivo entero
// subía a Switch con el rubro y el subrubro EN BLANCO sin que nada avisara.
//
// 🩸 AGUJERO 2: no había lista de valores esperados. Un `GENDER` que dijera
// "Hombre" en vez de "MALE" pasaba entero y el catálogo no lo iba a saber
// traducir — pero eso recién se veía meses después, del otro lado.
//
// El patrón ya existía en el MISMO módulo, del lado CK/TH (`esGenero` en
// `logic.ts` + el aviso de marcas desconocidas en pantalla). Esto es lo mismo
// para Reebok. 🔴 AVISA, NO CORRIGE: el archivo sale con el valor del proveedor.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  parseReebok,
  valoresInesperados,
  REEBOK_CATEGORY_ESPERADAS,
  REEBOK_GENDER_ESPERADOS,
  REEBOK_DEPARTMENT_ESPERADOS,
  type ReebokItem,
} from "@/lib/depurador/reebok";
import { categoriaReebok, generoReebok } from "@/lib/reebok-clasificacion";
import type { SheetRow } from "@/lib/depurador/logic";

/** Un Book4 mínimo con la fila de encabezados que `findHeaderRow` busca. */
function libro(headers: string[], filas: SheetRow[] = []): SheetRow[] {
  return [["basura", "de", "arriba"], headers, ...filas];
}

const HEADERS_COMPLETOS = [
  "PO NAME", "New Article", "SKU", "Name", "Department", "CATEGORY",
  "AGE GROUP", "COLOR NAME", "GENDER", "SELL-IN QUARTER", "RRP",
  "WholesalePrice", "Talla", "JULIO",
];
const FILA_OK = ["PO-1", "ART1", "EAN1", "ZIG", "FOOTWEAR", "SHOES", "ADULT", "BLACK", "MALE", "Q3", 100, 60, "9", 12];

describe("🔴 CATEGORY y GENDER son OBLIGATORIAS", () => {
  it("un archivo completo parsea normal", () => {
    const r = parseReebok(libro(HEADERS_COMPLETOS, [FILA_OK]), 13);
    expect(r.items).toHaveLength(1);
    expect(r.items[0].category).toBe("SHOES");
    expect(r.items[0].gender).toBe("MALE");
  });

  it("sin CATEGORY el archivo se RECHAZA y lo dice por su nombre", () => {
    const headers = HEADERS_COMPLETOS.map((h) => (h === "CATEGORY" ? "CATEGORIA RENOMBRADA" : h));
    expect(() => parseReebok(libro(headers, [FILA_OK]), 13)).toThrow(/CATEGORY/);
  });

  it("sin GENDER el archivo se RECHAZA y lo dice por su nombre", () => {
    const headers = HEADERS_COMPLETOS.map((h) => (h === "GENDER" ? "GENERO" : h));
    expect(() => parseReebok(libro(headers, [FILA_OK]), 13)).toThrow(/GENDER/);
  });

  it("🩸 antes esto pasaba en silencio: sin la columna, todas las filas salían en blanco", () => {
    // La prueba de que el rechazo importa: si NO se rechazara, `val(row, -1)`
    // devuelve "" y el rubro/subrubro de TODOS los artículos iría vacío a Switch.
    const headers = HEADERS_COMPLETOS.map((h) => (h === "CATEGORY" ? "X" : h));
    let items: ReebokItem[] = [];
    try { items = parseReebok(libro(headers, [FILA_OK]), 13).items; } catch { /* esperado */ }
    expect(items).toEqual([]);
  });

  it("las columnas que YA eran obligatorias lo siguen siendo", () => {
    for (const col of ["New Article", "SKU", "WholesalePrice", "Department"]) {
      const headers = HEADERS_COMPLETOS.map((h) => (h === col ? "OTRA COSA" : h));
      expect(() => parseReebok(libro(headers, [FILA_OK]), 13)).toThrow();
    }
  });
});

describe("la lista de valores esperados avisa ANTES de subir el archivo", () => {
  const item = (over: Partial<ReebokItem>): ReebokItem => ({
    po: "PO-1", newArticle: "ART1", sku: "EAN1", name: "ZIG", department: "FOOTWEAR",
    category: "SHOES", ageGroup: "ADULT", colorName: "BLACK", gender: "MALE",
    sellIn: "Q3", wholesale: 60, wholesaleOff: null, talla: "9", piezas: 12, ...over,
  });

  it("un archivo con valores conocidos no dice nada", () => {
    expect(valoresInesperados([item({}), item({ category: "SOCKS", gender: "UNISEX", department: "APPAREL" })])).toEqual([]);
  });

  it("🔴 un Department que el catálogo no conoce se marca — es lo que decide la categoría", () => {
    const v = valoresInesperados([item({ newArticle: "ART9", department: "CALZADO" })]);
    expect(v).toEqual([{ columna: "Department", valor: "CALZADO", articulos: ["ART9"] }]);
  });

  it("un GENDER en español ('Hombre') se marca, aunque parezca razonable", () => {
    const v = valoresInesperados([item({ newArticle: "ART9", gender: "Hombre" })]);
    expect(v).toEqual([{ columna: "GENDER", valor: "HOMBRE", articulos: ["ART9"] }]);
  });

  it("una celda VACÍA se marca — es el caso de la columna renombrada", () => {
    const v = valoresInesperados([item({ newArticle: "ART9", category: "" })]);
    expect(v).toEqual([{ columna: "CATEGORY", valor: "(vacío)", articulos: ["ART9"] }]);
  });

  it("agrupa por valor y ordena por cuántos artículos afecta", () => {
    const v = valoresInesperados([
      item({ newArticle: "A", category: "RARO" }),
      item({ newArticle: "B", category: "RARO" }),
      item({ newArticle: "C", gender: "OTRO" }),
    ]);
    expect(v[0]).toEqual({ columna: "CATEGORY", valor: "RARO", articulos: ["A", "B"] });
    expect(v[1]).toEqual({ columna: "GENDER", valor: "OTRO", articulos: ["C"] });
  });

  it("🔴 avisa, NO corrige: el item conserva el valor que puso el proveedor", () => {
    const it1 = item({ category: "RARO" });
    valoresInesperados([it1]);
    expect(it1.category).toBe("RARO");
  });
});

describe("🔴 la lista del Depurador es ESPEJO del mapa del catálogo", () => {
  // Dos listas paralelas que se contradicen es el defecto que este repo ya pagó
  // (la lección de `empresa-capabilities`). Si el Depurador espera un valor que
  // el catálogo no sabe traducir, el aviso se calla justo cuando hace falta.
  it("🔴 todo Department esperado lo sabe traducir el catálogo — es la fuente PRIMARIA", () => {
    // Department sale a Switch como `Marca *`, y la marca es lo que manda.
    for (const d of REEBOK_DEPARTMENT_ESPERADOS) {
      expect(categoriaReebok(null, d), `Department ${d}`).not.toBeNull();
    }
  });

  it("y gana sobre el rubro, igual que en el catálogo", () => {
    expect(categoriaReebok("REEBOK CLASSICS CORE FTW MEN", "FOOTWEAR")).toBe("footwear");
  });

  it("todo CATEGORY esperado lo sabe traducir el catálogo", () => {
    for (const c of REEBOK_CATEGORY_ESPERADAS) {
      expect(categoriaReebok(c, null), `CATEGORY ${c}`).not.toBeNull();
    }
  });

  it("todo GENDER esperado lo sabe traducir el catálogo", () => {
    for (const g of REEBOK_GENDER_ESPERADOS) {
      expect(generoReebok(g), `GENDER ${g}`).not.toBeNull();
    }
  });

  it("y al revés: lo que el catálogo NO sabe traducir no está en la lista de esperados", () => {
    for (const raro of ["PROMO", "OFERTA", "GENERAL", "DISPLAY & PROMO"]) {
      expect(REEBOK_CATEGORY_ESPERADAS as readonly string[]).not.toContain(raro);
      expect(REEBOK_GENDER_ESPERADOS as readonly string[]).not.toContain(raro);
    }
  });

  it("SOCKS está en la lista: medias = ropa, y el Depurador tiene que dejarlas pasar", () => {
    expect(REEBOK_CATEGORY_ESPERADAS as readonly string[]).toContain("SOCKS");
    expect(categoriaReebok("SOCKS", "APPAREL")).toBe("apparel");
  });
});
