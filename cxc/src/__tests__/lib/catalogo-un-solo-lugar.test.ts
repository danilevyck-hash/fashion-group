// ─────────────────────────────────────────────────────────────────────────────
// CANDADO — 🔴 UN PRODUCTO EN UN SOLO LUGAR.
//
// Daniel, textual: ***«no quiero nunca que mismos productos salgan en dos
// lados»***. Ningún artículo puede aparecer bajo dos chips de género a la vez.
//
// El test recorre un catálogo con TODAS las formas de género que la tabla
// `products` guarda de verdad (medidas contra producción el 2-sep-2026: male,
// unisex, women, female, kids — más el sentinel del cajón neutro y las formas
// históricas de Joybees) y cuenta bajo cuántos chips cae cada artículo con la
// MISMA función que usan las dos pantallas.
//
// 🔑 Se prueba la CONDUCTA (contar chips por artículo) y no la forma del mapa:
// un barrido sobre `FILTER_TO_GROUPS` se cumpliría solo mirando el objeto,
// mientras que el defecto que importa es "el usuario ve el mismo producto en
// Hombre y en Mujer".
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { matchesGenderFilter, normalizeGender, FILTER_TO_GROUPS } from "@/lib/reebok-gender";
import { MARCA_THEME } from "@/lib/catalogo/marcas-ui";
import { GENERO_SIN_CLASIFICAR } from "@/lib/reebok-clasificacion";
import { getDisplaySection, SECTION_ORDER, SECTION_LABELS, type GroupedProduct } from "@/components/catalogo/groupByModel";

/** Los chips REALES del catálogo Reebok, sin «Todos». */
const CHIPS = MARCA_THEME.reebok.filtros.genderOptions
  .map((o) => o.value)
  .filter((v) => v !== "");

/** Cada género crudo que existe hoy en la base, más el cajón neutro. */
const GENEROS_REALES = [
  "male", "unisex", "women", "female", "kids",
  GENERO_SIN_CLASIFICAR,
  // formas históricas de Joybees, que comparten este mapa de lectura
  "adults", "adults_m",
  // y las que el sync escribe desde el arreglo
  "sin_clasificar",
];

describe("🔴 ningún artículo cae bajo dos chips de género", () => {
  for (const g of GENEROS_REALES) {
    it(`gender="${g}" cae bajo 0 o 1 chip, nunca 2`, () => {
      const bajo = CHIPS.filter((chip) => matchesGenderFilter(g, chip));
      expect(
        bajo.length,
        `gender="${g}" sale bajo los chips ${JSON.stringify(bajo)} — el mismo producto en dos lados`,
      ).toBeLessThanOrEqual(1);
    });
  }

  it("un catálogo entero: cada producto aparece a lo sumo una vez sumando todos los chips", () => {
    // 3 productos por cada forma de género, con SKU distinto: si alguno se
    // contara dos veces, la suma de los chips superaría el total del catálogo.
    const catalogo = GENEROS_REALES.flatMap((g, i) =>
      [0, 1, 2].map((n) => ({ sku: `SKU-${i}-${n}`, gender: g })),
    );
    const vistos = new Map<string, string[]>();
    for (const chip of CHIPS) {
      for (const p of catalogo.filter((x) => matchesGenderFilter(x.gender, chip))) {
        vistos.set(p.sku, [...(vistos.get(p.sku) ?? []), chip]);
      }
    }
    const duplicados = [...vistos.entries()].filter(([, chips]) => chips.length > 1);
    expect(duplicados, `productos bajo más de un chip: ${JSON.stringify(duplicados)}`).toEqual([]);
    // Y la suma por chip no puede pasar del tamaño del catálogo.
    const suma = CHIPS.reduce(
      (s, chip) => s + catalogo.filter((x) => matchesGenderFilter(x.gender, chip)).length,
      0,
    );
    expect(suma).toBeLessThanOrEqual(catalogo.length);
  });
});

describe("las listas de grupos por chip son DISJUNTAS entre sí", () => {
  it("ningún grupo canónico está en dos chips", () => {
    const donde = new Map<string, string[]>();
    for (const [chip, grupos] of Object.entries(FILTER_TO_GROUPS)) {
      for (const g of grupos) donde.set(g, [...(donde.get(g) ?? []), chip]);
    }
    const compartidos = [...donde.entries()].filter(([, chips]) => chips.length > 1);
    expect(
      compartidos,
      `un grupo bajo dos chips: ${JSON.stringify(compartidos)}. Es la forma exacta de "el mismo producto en dos lados".`,
    ).toEqual([]);
  });
});

describe("el cajón neutro se ve en «Todos» y bajo NINGÚN chip", () => {
  it("«Todos» («») muestra todo, incluido lo sin clasificar", () => {
    expect(matchesGenderFilter(GENERO_SIN_CLASIFICAR, "")).toBe(true);
    expect(matchesGenderFilter(null, "")).toBe(true);
  });

  it("ningún chip lo muestra", () => {
    for (const chip of CHIPS) {
      expect(matchesGenderFilter(GENERO_SIN_CLASIFICAR, chip)).toBe(false);
    }
    expect(normalizeGender(GENERO_SIN_CLASIFICAR)).toBeNull();
  });
});

describe("unisex sigue viéndose en Hombre, y en ningún otro lado", () => {
  // Se revisó al arreglar el sync (2-sep-2026): la regla de CLASIFICACIÓN ya
  // resuelve el UNISEX de Switch a `male` antes de guardarlo, pero la tabla
  // arrastra 91 filas con ese valor y Joybees lo usa vivo. La red de lectura
  // se queda; lo que no puede es duplicar.
  it("unisex → chip Hombre", () => {
    expect(matchesGenderFilter("unisex", "male")).toBe(true);
  });
  it("unisex NO → chip Mujer ni chip Niños", () => {
    expect(matchesGenderFilter("unisex", "female")).toBe(false);
    expect(matchesGenderFilter("unisex", "kids")).toBe(false);
  });
});

describe("las formas históricas de Joybees dejaron de ser invisibles", () => {
  it("adults y adults_m tienen grupo (antes daban null y caían en «Otros»)", () => {
    expect(normalizeGender("adults")).not.toBeNull();
    expect(normalizeGender("adults_m")).not.toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// La MISMA regla en la vista AGRUPADA (Joybees): el fallback no puede ser una
// sección real. Son DOS pipelines distintos —la lista plana y los GRUPOS— y
// arreglar uno solo deja el otro adivinando.
// ─────────────────────────────────────────────────────────────────────────────


/** Un modelo agrupado con los géneros que se le pasen. */
const grupo = (...genders: string[]): GroupedProduct =>
  ({ variants: genders.map((g, i) => ({ product: { gender: g, sku: `S${i}` } })) }) as unknown as GroupedProduct;

describe("🩸 la vista agrupada tampoco adivina un género", () => {
  it("un modelo con el género SIN CLASIFICAR no se dibuja en «Adultos»", () => {
    const s = getDisplaySection(grupo(GENERO_SIN_CLASIFICAR));
    expect(s).not.toBe("adultos");
    expect(s).toBe("otros");
  });

  it("un género que Switch estrene tampoco", () => {
    expect(getDisplaySection(grupo("algo_que_nadie_vio"))).toBe("otros");
  });

  it("la sección neutra NO es uno de los chips de Joybees", () => {
    const chips = MARCA_THEME.joybees.filtros.genderOptions.map((o) => o.value).filter((v) => v !== "");
    expect(chips).not.toContain("otros");
  });

  it("y va al final, con un nombre que dice la verdad", () => {
    expect(SECTION_ORDER.otros).toBeGreaterThan(SECTION_ORDER.accesorios);
    expect(SECTION_LABELS.otros).toMatch(/sin clasificar/i);
  });

  it("lo que YA se sabía dibujar se sigue dibujando igual", () => {
    expect(getDisplaySection(grupo("women"))).toBe("mujer");
    expect(getDisplaySection(grupo("adults_m"))).toBe("hombre");
    expect(getDisplaySection(grupo("adults"))).toBe("adultos");
    expect(getDisplaySection(grupo("kids"))).toBe("kids");
    expect(getDisplaySection(grupo("accessories"))).toBe("accesorios");
    // el par unisex de Joybees
    expect(getDisplaySection(grupo("adults_m", "women"))).toBe("adultos");
    // una mezcla con kids manda a kids
    expect(getDisplaySection(grupo("kids", "women"))).toBe("kids");
    // dos géneros de adulto siguen siendo "adultos"
    expect(getDisplaySection(grupo("women", "unisex"))).toBe("adultos");
  });
});
