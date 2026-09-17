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
import {
  categoriaReebok,
  generoReebok,
  rubrosQueElCatalogoConoce,
  CATEGORIA_POR_RUBRO_BASE,
} from "@/lib/reebok-clasificacion";
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

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 ESTE BLOQUE CAMBIÓ DE DIRECCIÓN EL 17-sep-2026 — no se borró.
//
// Hasta hoy decía: «la lista del Depurador es ESPEJO del mapa del catálogo», y
// comprobaba que las dos listas escritas a mano coincidieran. Era lo correcto
// MIENTRAS hubiera dos listas. 🩸 Pero el espejo era el problema: el 2-sep-2026
// `HEADWEAR` entró en una sola y cada archivo de Reebok con gorras avisaba
// «valor inesperado» sobre un dato perfectamente bueno.
//
// Daniel dijo **«sí»** a volver el mapa administrable (`reebok_rubro_categoria`)
// y `REEBOK_CATEGORY_ESPERADAS` pasó a DERIVARSE de la misma fuente. Un test que
// compara una lista consigo misma no protege nada.
//
// Ahora exige lo que de verdad importa: que exista **UNA sola fuente** y que
// nadie vuelva a escribir la segunda a mano. La comprobación de que el catálogo
// sabe traducir todo lo esperado se queda —ahora es trivialmente cierta, y ése
// es el punto: es imposible desincronizarlas.
// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 la lista del Depurador se DERIVA del mapa del catálogo (era un espejo)", () => {
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

  it("HEADWEAR está en la lista: las gorras son 7 artículos REALES con existencia", () => {
    // 🩸 Sin esto, cada archivo de Reebok con gorras avisaba «valor inesperado»
    // por un dato perfectamente bueno. Un centinela que se equivoca se vuelve
    // ruido que se aprende a ignorar — el mismo defecto que la falsa alarma de
    // las 233, en la otra punta del sistema.
    expect(REEBOK_CATEGORY_ESPERADAS as readonly string[]).toContain("HEADWEAR");
    expect(categoriaReebok("HEADWEAR", "HARDWARE")).toBe("accessories");
  });

  it("🔴 17-sep-2026: la lista NO se escribe, se DERIVA — y son el MISMO objeto", () => {
    // Si alguien vuelve a teclear los valores acá, esto se rompe: un arreglo
    // literal nunca va a ser igual, elemento por elemento y en orden, a las
    // claves del mapa… salvo que lo copie bien, y ahí entra la mutación de
    // abajo (agregar un rubro al mapa y no a la lista).
    expect([...REEBOK_CATEGORY_ESPERADAS]).toEqual(rubrosQueElCatalogoConoce());
  });

  it("🔴 un rubro nuevo en el mapa aparece SOLO en la lista del Depurador", () => {
    // La prueba de que el espejo murió: con el mapa administrado, agregar un
    // rubro no pide tocar dos archivos. Acá se simula con el mapa por argumento,
    // que es exactamente lo que la tabla le pasa al código.
    const conRopaNueva = { ...CATEGORIA_POR_RUBRO_BASE, "T-SHIRTS": "apparel" as const };
    expect(rubrosQueElCatalogoConoce(conRopaNueva)).toContain("T-SHIRTS");
    expect(categoriaReebok("T-SHIRTS", null, conRopaNueva)).toBe("apparel");
    // Y el aviso del Depurador se calla con ese mismo mapa, sin tocar código.
    const tee: ReebokItem = {
      po: "PO-1", newArticle: "APPCL999", sku: "EAN9", name: "TEE", department: "APPAREL",
      category: "T-SHIRTS", ageGroup: "ADULT", colorName: "BLACK", gender: "MALE",
      sellIn: "Q3", wholesale: 10, wholesaleOff: null, talla: "M", piezas: 6,
    };
    expect(valoresInesperados([tee], rubrosQueElCatalogoConoce(conRopaNueva))).toEqual([]);
  });

  it("🔑 CONTROL: sin ese rubro, el aviso SÍ salta — el test de arriba prueba algo", () => {
    const tee: ReebokItem = {
      po: "PO-1", newArticle: "APPCL999", sku: "EAN9", name: "TEE", department: "APPAREL",
      category: "T-SHIRTS", ageGroup: "ADULT", colorName: "BLACK", gender: "MALE",
      sellIn: "Q3", wholesale: 10, wholesaleOff: null, talla: "M", piezas: 6,
    };
    const v = valoresInesperados([tee]);
    expect(v.some((x) => x.columna === "CATEGORY" && x.valor === "T-SHIRTS")).toBe(true);
  });

  it("un archivo con gorras no dispara ningún aviso", () => {
    const gorra: ReebokItem = {
      po: "PO-1", newArticle: "ACCC002", sku: "EAN1", name: "CAP", department: "HARDWARE",
      category: "HEADWEAR", ageGroup: "ADULT", colorName: "BLACK", gender: "UNISEX",
      sellIn: "Q3", wholesale: 20, wholesaleOff: null, talla: "OS", piezas: 6,
    };
    expect(valoresInesperados([gorra])).toEqual([]);
  });
});
