// ─────────────────────────────────────────────────────────────────────────────
// Paridad de las CARDS y del menú Compartir en las 3 marcas (25-jul-2026).
//
// Los ajustes de UI aprobados por Daniel viven en componentes ÚNICOS y en el
// tema, no por marca. Estos tests fijan el contrato para que nadie los
// reintroduzca por marca ni los pierda en un refactor:
//   · la card no muestra el precio del bulto (solo "Bulto de N"), y esa línea
//     es DISCRETA (10px gris) — no compite con el precio,
//   · el nombre va SIEMPRE en una sola línea de alto fijo (20px): se achica
//     14px→11px y, si ni así cabe, corta con "…" (card compacta, 25-jul-2026),
//   · la card es COMPACTA: p-2.5 y los mismos márgenes en las dos cards,
//   · el precio y el stock comparten RENGLÓN (precio a la izquierda con "Bulto
//     de N" debajo, stock a la derecha) y entre ellos no hay línea divisoria,
//   · el stock usa las palabras completas ("Disponibilidad N" / "Existencia N")
//     en dos renglones apilados — medido: en una sola línea no cabe (ver
//     CatalogoStockLine),
//   · el botón Agregar mide 38px y el control de cantidad mide lo mismo,
//   · la foto es 4:3 con object-contain en las 3 marcas,
//   · el grid sube a 5 columnas SOLO en xl (iPad y móvil intactos),
//   · el menú Compartir tiene Copiar link + Descargar PDF en las 3 marcas.
//
// ESQUELETO CANÓNICO de la card (Daniel, 25-jul-2026) — las 3 marcas comparten
// estructura y solo difieren en contenido y colores del tema:
//   foto · nombre · código (píldora) · precio · bulto · stock · botón Agregar
// Sin "/unidad" en el precio, sin el indicador "● N" de bultos junto al bulto y
// sin chips de categoría/género en la card agrupada.
//
// El último punto es la regresión reportada del PR #250 (ver PR de este
// cambio): el menú vive UNA sola vez en CatalogoVendedorPage y ninguna marca
// puede quedarse sin el PDF por config.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import path from "path";

vi.mock("@/lib/tommy-supabase-server", () => ({ tommyServer: {} }));
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: {} }));

import { MARCA_THEME } from "@/lib/catalogo/marcas-ui";
import { NOMBRE_PX_BASE, NOMBRE_PX_MIN } from "@/lib/catalogo/fit-one-line";

const MARCAS = ["reebok", "joybees", "tommy"] as const;

function src(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

/** Clases Tailwind realmente aplicadas: solo las líneas con `className`, para
 *  que un comentario que NOMBRA una clase vieja no dispare un falso positivo. */
function clasesAplicadas(code: string): string {
  return code.split("\n").filter((l) => l.includes("className")).join("\n");
}

const PRODUCT_CARD = src("src/components/catalogo/CatalogoProductCard.tsx");
const GROUPED_CARD = src("src/components/catalogo/CatalogoGroupedCard.tsx");
const STOCK_LINE = src("src/components/catalogo/CatalogoStockLine.tsx");
const VENDEDOR = src("src/components/catalogo/CatalogoVendedorPage.tsx");
const PUBLICO = src("src/components/catalogo/CatalogoPublicoPage.tsx");

describe("card de producto — paridad en las 3 marcas", () => {
  it("ninguna card muestra el precio del bulto ($X/bulto)", () => {
    for (const [nombre, code] of [["plana", PRODUCT_CARD], ["agrupada", GROUPED_CARD]] as const) {
      expect(code, nombre).not.toContain("/bulto");
      expect(code, nombre).not.toContain("bultoTotal");
    }
  });

  it("las dos cards siguen mostrando 'Bulto de N'", () => {
    expect(PRODUCT_CARD).toContain("Bulto de {bultoSize}");
    expect(GROUPED_CARD).toContain("Bulto de {BULTO_SIZE}");
  });

  it("stock interno con el vocabulario del sistema, palabras COMPLETAS", () => {
    expect(STOCK_LINE).toContain("Disponibilidad {");
    expect(STOCK_LINE).toContain("Existencia {");
    // Los copys viejos de dos bloques quedaron fuera.
    expect(STOCK_LINE).not.toContain("Disponible: ");
    expect(STOCK_LINE).not.toContain("En bodega:");
    // Nunca abreviado: la palabra completa es el contrato (Daniel, 25-jul-2026).
    expect(STOCK_LINE).not.toMatch(/Disp\.|Exist\./);
  });

  it("el stock va en DOS renglones apilados, sin el separador '·'", () => {
    // Medido: "Disponibilidad 191 · Existencia 191" son 190.5px a 11px y el
    // contenido de la card mide 204px con el precio ya ocupando 61.2px — en una
    // sola línea NO cabe. Apilado, el renglón más ancho mide 97.2px y entra.
    expect(STOCK_LINE).toContain("whitespace-nowrap");
    expect(STOCK_LINE).not.toContain("&middot;");
    expect(STOCK_LINE).not.toContain("flex items-baseline");
    // Alineado a la derecha del precio de xl para arriba.
    expect(STOCK_LINE).toContain("xl:text-right");
    expect(STOCK_LINE).toContain("shrink-0");
  });

  it("entre el precio y el stock NO hay línea divisoria", () => {
    expect(clasesAplicadas(STOCK_LINE)).not.toContain("border-t");
    // El color del separador se retiró del tema: nadie puede reintroducirlo.
    for (const m of MARCAS) {
      expect(MARCA_THEME[m].card.stock, m).not.toHaveProperty("divider");
      expect(MARCA_THEME[m].card.stock, m).not.toHaveProperty("dot");
    }
  });

  it("precio y stock viven en el MISMO renglón en las dos cards", () => {
    const FILA = 'className="mt-1.5 flex flex-col gap-y-1 xl:flex-row xl:items-start xl:justify-between xl:gap-x-2 xl:gap-y-0"';
    for (const [nombre, code] of [["plana", PRODUCT_CARD], ["agrupada", GROUPED_CARD]] as const) {
      expect(code, nombre).toContain(FILA);
      // El <CatalogoStockLine> tiene que estar DENTRO de esa fila, no después.
      const fila = code.slice(code.indexOf(FILA));
      const stock = fila.indexOf("<CatalogoStockLine");
      const cierre = fila.indexOf("Add/Qty button") >= 0 ? fila.indexOf("Add/Qty button") : fila.indexOf("Action buttons");
      expect(stock, `${nombre}: stock dentro de la fila del precio`).toBeGreaterThan(0);
      expect(stock, `${nombre}: stock antes del bloque de acción`).toBeLessThan(cierre);
    }
  });

  it("la línea de stock es UN componente compartido, no dos copias", () => {
    for (const [nombre, code] of [["plana", PRODUCT_CARD], ["agrupada", GROUPED_CARD]] as const) {
      expect(code, nombre).toContain("import CatalogoStockLine");
      expect(code, nombre).toContain("<CatalogoStockLine");
      // El markup vive SOLO en el componente compartido.
      expect(code, nombre).not.toContain("Disponibilidad {");
    }
  });

  it("el precio no lleva sufijo '/unidad' en ninguna card", () => {
    for (const [nombre, code] of [["plana", PRODUCT_CARD], ["agrupada", GROUPED_CARD]] as const) {
      // (los comentarios sí lo nombran; lo que no puede volver es el nodo)
      expect(code, nombre).not.toMatch(/>\s*\/unidad\s*</);
    }
  });

  it("no hay indicador de bultos ('● N') junto a 'Bulto de N'", () => {
    for (const [nombre, code] of [["plana", PRODUCT_CARD], ["agrupada", GROUPED_CARD]] as const) {
      expect(code, nombre).not.toContain("BultosBadge");
    }
  });

  it("el código va en píldora del tema, pegado al nombre (mt-1)", () => {
    for (const [nombre, code] of [["plana", PRODUCT_CARD], ["agrupada", GROUPED_CARD]] as const) {
      expect(code, nombre).toContain("className={t.skuPill}");
      expect(code, nombre).toContain('flex flex-wrap items-center gap-1 mt-1');
      // Nada de color hardcodeado de Reebok fuera del tema.
      expect(code, nombre).not.toContain("bg-[#F5F0E8] text-[#1A2656]/50");
      // Ni el texto mono suelto que usaba la agrupada.
      expect(code, nombre).not.toContain("font-mono");
    }
    for (const m of MARCAS) {
      expect(MARCA_THEME[m].card.skuPill, m).toContain("px-1.5 py-0.5 rounded");
      expect(MARCA_THEME[m].card.stock.strong, m).toBeTruthy();
    }
  });

  it("el precio normal sale del tema (cada marca su color), no hardcodeado", () => {
    for (const [nombre, code] of [["plana", PRODUCT_CARD], ["agrupada", GROUPED_CARD]] as const) {
      expect(code, nombre).toContain("t.priceNormal");
    }
    // Los 3 colores de precio son los de cada marca.
    const colores = MARCAS.map(m => MARCA_THEME[m].card.priceNormal);
    expect(new Set(colores).size).toBe(3);
  });

  it("la card agrupada no muestra chips de categoría ni de género", () => {
    expect(GROUPED_CARD).not.toContain("groupedCategoryLabels");
    expect(GROUPED_CARD).not.toContain("Disponible en:");
    // El label de género/talla vive en el SELECTOR DE TALLA y en el botón
    // Agregar — nunca como chip decorativo arriba del precio, que es lo que se
    // quitó el 25-jul-2026 (la sección del grid ya dice el género).
    //
    // ⚠️ DIVERGENCIA DELIBERADA DE JOYBEES (30-jul-2026): hasta este cambio el
    // label solo podía aparecer DESPUÉS de "Action buttons". Ahora el selector de
    // talla —que va ANTES, entre el stock y el botón— también lo usa, y tiene que
    // usarlo: es el texto del botón que el vendedor toca para elegir Junior o
    // Kids. Se acota en vez de borrarse: el label sigue prohibido en el bloque de
    // arriba de la card (nombre · código · precio · bulto), que es donde estaba
    // el chip. El selector es de esta card y solo lo renderiza Joybees
    // (`features.agrupacionPorModelo`) — ver el candado
    // `joybees-selector-talla.test.ts`.
    const botones = GROUPED_CARD.slice(GROUPED_CARD.indexOf("Action buttons"));
    expect(botones).toContain("genderLabel");
    const selector = GROUPED_CARD.indexOf("Selector de talla");
    expect(selector, "el selector de talla existe y está antes del botón").toBeGreaterThan(0);
    const arriba = GROUPED_CARD.slice(0, selector);
    expect(arriba.includes("genderLabel"), "ningún chip de género arriba del precio").toBe(false);
  });

  it("el botón Agregar: 44px táctil en móvil/tablet, 38px desde xl", () => {
    for (const [nombre, code] of [["plana", PRODUCT_CARD], ["agrupada", GROUPED_CARD]] as const) {
      // 38px en escritorio (py-[9px] + leading-5 del text-sm) para que la card
      // cierre en 328px, pero 44px hasta xl: es el mínimo táctil de iOS/Android
      // y el catálogo se usa desde el celular con el cliente al frente
      // (Daniel, 25-jul-2026 — revirtió el 38 plano del mismo día).
      expect(code, nombre).toContain("py-[9px] rounded-lg text-sm leading-5 font-semibold transition min-h-[44px] xl:min-h-[38px]");
      // el 38 nunca debe quedar suelto sin el 44 táctil delante
      expect(code, nombre).not.toMatch(/transition min-h-\[38px\]/);
    }
  });

  it("el control de cantidad mide lo MISMO que el botón (la fila no crece)", () => {
    for (const [nombre, code] of [["plana", PRODUCT_CARD], ["agrupada", GROUPED_CARD]] as const) {
      // h-9 (36) + 1px de borde arriba y abajo del qtyWrap = 38, igual que el
      // botón Agregar: meter un producto al pedido no puede estirar la fila.
      //
      // `shrink-0` (auditoría iPhone, 2ª vuelta): el ALTO sigue siendo h-9, pero
      // sin esto el flex del qtyWrap achicaba el "+" de los 44px que pide w-11 a
      // 23px reales en 390×844 — el "−" no se encoge porque su contenido lo
      // sostiene, así que todo el ajuste se lo comía el "+", que es un solo
      // carácter. El arreglo es de ANCHO: la fila no crece.
      expect(code, nombre).toContain("h-9 shrink-0 flex items-center justify-center");
      expect(code, nombre).toContain("w-11 h-9 shrink-0 flex items-center justify-center");
      expect(code, nombre).not.toContain("h-11 flex items-center");
      expect(code, nombre).not.toContain("w-11 h-11");
    }
    for (const m of MARCAS) {
      expect(MARCA_THEME[m].card.qtyWrap, m).toContain("border");
    }
  });

  it("el nombre va en el componente compartido, nunca en un <h3> suelto", () => {
    for (const [nombre, code] of [["plana", PRODUCT_CARD], ["agrupada", GROUPED_CARD]] as const) {
      expect(code, nombre).toContain("import CatalogoProductName");
      expect(code, nombre).toContain("<CatalogoProductName");
      expect(code, nombre).not.toMatch(/<h3 className=\{t\.name\}/);
    }
  });

  it("el nombre es de UNA línea y de alto FIJO, idéntico en las 3 marcas", () => {
    const geometrias = new Set<string>();
    for (const m of MARCAS) {
      const name = MARCA_THEME[m].card.name;
      // Alto fijo (h-5) + una línea (truncate = nowrap + ellipsis).
      expect(name, m).toContain("leading-5");
      expect(name, m).toContain("h-5");
      expect(name, m).toContain("truncate");
      // Lo que rompía la altura de la card: 2 líneas y alto en em.
      expect(name, m).not.toContain("line-clamp");
      expect(name, m).not.toContain("min-h-[2.5em]");
      geometrias.add(name.split(" ").filter((c) => !c.startsWith("text-[#")).sort().join(" "));
    }
    // Solo el COLOR puede cambiar entre marcas.
    expect(geometrias.size, "geometría del nombre distinta entre marcas").toBe(1);
  });

  it("el ajuste de tamaño del nombre respeta el piso legible (11px)", () => {
    expect(NOMBRE_PX_BASE).toBe(14);
    expect(NOMBRE_PX_MIN).toBe(11);
  });

  it("'Bulto de N' es una línea discreta (10px gris) igual en las dos cards", () => {
    const BULTO = 'className="text-[10px] leading-[14px] text-gray-500">Bulto de ';
    for (const [nombre, code] of [["plana", PRODUCT_CARD], ["agrupada", GROUPED_CARD]] as const) {
      expect(code, nombre).toContain(BULTO);
      // Ya no usa el color de marca (competía con el precio).
      expect(code, nombre).not.toContain("${t.bultoMeta} font-medium`}>Bulto");
    }
  });

  it("la card compacta usa los MISMOS espaciados en las dos cards", () => {
    // Cada par: qué es, y el literal que debe aparecer en ambas cards.
    const ESPACIADOS: [string, string][] = [
      ["padding del bloque de info", '<div className="p-2.5">'],
      ["margen de la fila precio+stock", 'className="mt-1.5 flex flex-col'],
      ["margen del bloque de acción", "mt-1.5"],
      ["separación del bulto", 'className="flex items-baseline gap-1.5 mt-0.5"'],
    ];
    for (const [que, literal] of ESPACIADOS) {
      for (const [nombre, code] of [["plana", PRODUCT_CARD], ["agrupada", GROUPED_CARD]] as const) {
        expect(code, `${nombre}: ${que}`).toContain(literal);
      }
    }
    // Los valores viejos (más aireados) no pueden volver por una sola card.
    for (const [nombre, code] of [["plana", PRODUCT_CARD], ["agrupada", GROUPED_CARD]] as const) {
      expect(code, nombre).not.toContain('<div className="p-3">');
      expect(code, nombre).not.toContain("mt-2.5");
      // El bloque de acción ya no cuelga a mt-2 (márgenes apretados).
      expect(clasesAplicadas(code), nombre).not.toMatch(/\bmt-2\b(?![.\d])/);
    }
  });

  it("el catálogo PÚBLICO nunca pide el stock interno", () => {
    expect(PUBLICO).not.toContain("showStock");
  });

  it("foto 4:3 con object-contain (nunca recorta producto) en las 3 marcas", () => {
    for (const m of MARCAS) {
      const card = MARCA_THEME[m].card;
      expect(card.imageBg, m).toContain("aspect-[4/3]");
      expect(card.imageBg, m).not.toContain("aspect-square");
      expect(card.imageFit, m).toContain("object-contain");
      // object-cover NO: medidas 25-jul-2026 sobre las 608 fotos activas — cover
      // corta PRODUCTO (no margen) en 67/138 Reebok y 16/81 Joybees.
      expect(card.imageFit, m).not.toContain("object-cover");
    }
  });

  it("la foto llena el marco: ninguna marca mete padding al <img>", () => {
    for (const m of MARCAS) {
      // El p-3 de Reebok/Tommy encogía el producto ~14% y no existía en Joybees.
      expect(MARCA_THEME[m].card.imageFit, m).not.toMatch(/\bp-\d/);
      expect(MARCA_THEME[m].card.imageFit, m).toBe("w-full h-full object-contain");
    }
  });

  it("solo las fotos del primer viewport son eager; el resto lazy", () => {
    for (const [nombre, code] of [["plana", PRODUCT_CARD], ["agrupada", GROUPED_CARD]] as const) {
      expect(code, nombre).toContain('loading={priority ? "eager" : "lazy"}');
      expect(code, nombre).toContain('fetchPriority={priority ? "high" : "auto"}');
      // width/height explícitos en 4:3 → sin reflow al cargar.
      expect(code, nombre).toContain("width={400}");
      expect(code, nombre).toContain("height={300}");
    }
    for (const [nombre, code] of [["vendedor", VENDEDOR], ["publico", PUBLICO]] as const) {
      expect(code, nombre).toContain("FOTOS_PRIORITARIAS");
      // Las 4 grids de cada página marcan prioridad (2 planas + 2 agrupadas).
      expect(code.split("priority={").length - 1, `${nombre}: grids con priority`).toBe(4);
    }
  });
});

describe("grid del catálogo — 5 columnas SOLO en escritorio grande", () => {
  const GRID = "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5";

  it("vendedor y público usan el mismo grid en todos sus bloques", () => {
    for (const [nombre, code] of [["vendedor", VENDEDOR], ["publico", PUBLICO]] as const) {
      const conXl = code.split(GRID).length - 1;
      const total = code.split("grid-cols-2 sm:grid-cols-3 lg:grid-cols-4").length - 1;
      expect(conXl, `${nombre}: bloques con xl:grid-cols-5`).toBeGreaterThan(0);
      expect(conXl, `${nombre}: TODOS los grids llevan xl:grid-cols-5`).toBe(total);
    }
  });

  it("los breakpoints de móvil (2) y tablet (3/4) NO cambiaron", () => {
    for (const code of [VENDEDOR, PUBLICO]) {
      expect(code).not.toContain("md:grid-cols-5");
      expect(code).not.toContain("lg:grid-cols-5");
      expect(code).not.toContain("sm:grid-cols-4");
    }
  });
});

describe("menú Compartir — Copiar link + Descargar PDF en las 3 marcas", () => {
  it("el menú vive UNA sola vez y no está condicionado por marca", () => {
    expect(VENDEDOR.split("Descargar PDF").length - 1).toBe(1);
    // El ítem del PDF no puede colgar de ningún flag/feature de marca.
    const item = VENDEDOR.slice(VENDEDOR.indexOf("const shareMenu"));
    const pdfBtn = item.slice(0, item.indexOf("Descargar PDF"));
    expect(pdfBtn).not.toMatch(/theme\.features\.\w+ &&/);
  });

  it("cada marca declara su label de copiar y el dropdown completo", () => {
    for (const m of MARCAS) {
      const vs = MARCA_THEME[m].vendorShare;
      expect(vs.copyLabel, m).toMatch(/Copiar link/);
      expect(vs.panel, m).toBeTruthy();
      expect(vs.item, m).toBeTruthy();
      expect(vs.iconSize, m).toBeGreaterThan(0);
    }
  });
});

describe("taxonomía de género por marca — Tommy no arrastra la de Reebok", () => {
  it("Reebok y Joybees comparten la histórica (español, boys+girls = Niños)", () => {
    expect(MARCA_THEME.reebok.genero).toBe(MARCA_THEME.joybees.genero);
    expect(MARCA_THEME.reebok.genero.groupLabel("boys")).toBe("Ninos");
    expect(MARCA_THEME.reebok.genero.groupLabel("girls")).toBe("Ninos");
    expect(MARCA_THEME.reebok.genero.groupLabel("women")).toBe("Mujer");
  });

  it("Tommy separa Boys/Girls y etiqueta en el vocabulario de Switch", () => {
    const g = MARCA_THEME.tommy.genero;
    expect(g).not.toBe(MARCA_THEME.reebok.genero);
    expect(g.groupLabel("boys")).toBe("Boys");
    expect(g.groupLabel("girls")).toBe("Girls");
    expect(g.groupOrder("women")).toBeLessThan(g.groupOrder("men"));
    expect(g.groupOrder(null)).toBe(9);
  });

  it("ningún componente de catálogo importa un módulo de género directo", () => {
    for (const code of [VENDEDOR, PUBLICO]) {
      expect(code).not.toContain("@/lib/reebok-gender");
      expect(code).not.toContain("@/lib/tommy-gender");
    }
  });
});
