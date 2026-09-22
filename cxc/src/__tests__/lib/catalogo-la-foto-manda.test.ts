// ─────────────────────────────────────────────────────────────────────────────
// LA TARJETA DEL CATÁLOGO, LOS RÓTULOS EN ESPAÑOL Y LOS CAJONES DE JOYBEES
// (22-sep-2026)
//
// Tres cosas que Daniel aprobó, y que este archivo impide que se deshagan:
//
//   A. **Tommy y Calvin no dibujan el nombre del producto en la tarjeta.** Sus
//      nombres no dicen el modelo: medido contra producción el 22-sep-2026,
//      Tommy tiene **19 nombres distintos para 455 productos vivos**
//      («Women-Sneakers» ×97) y Calvin **6 para 82** («Women-Flip Flops» ×27),
//      y esa línea quedaba tres centímetros debajo del encabezado de sección
//      que ya decía lo mismo («SNEAKERS — WOMEN · 92»). El CÓDIGO pasa a
//      encabezar la tarjeta. Daniel, sobre cómo señala su vendedor un producto:
//      *«b) señalando la foto»*.
//      🔴 Y el error INVERSO también se caza: **Reebok y Joybees SÍ dibujan el
//      nombre** —74/220 y 70/81 nombres distintos, ahí la línea dice
//      «CLASSIC LEATHER» y «Kids Varsity Clog Black/Red»—.
//      🔴 La diferencia es un DATO DEL TEMA (`card.nombreEnLaTarjeta`), nunca
//      un `if` con el nombre de la marca escrito en el componente.
//      ⚠️ Los FILTROS y el ENCABEZADO DE SECCIÓN no cambiaron: es lo que Daniel
//      preguntó (*«Pero el nombre se vera visible para saber que categoria es y
//      sera filtrable no?»*) y lo que se le contestó.
//
//   B. **Español SOLO en Joybees y Reebok.** Daniel: *«Entonces esa tommy y ck
//      no. Joybees y reebok si.»*. Reebok decía «Ninos» sin eñe y Joybees
//      «Kids»; las dos dicen «Niños». Tommy y Calvin SE QUEDAN EN INGLÉS
//      (Women · Men · Boys · Girls · Sneakers · Flip Flops…).
//
//   C. **Los 28 de Joybees que no caían en ningún cajón**, y **los chips en
//      cero**. «Todos 81 · Clogs 35 · Sandalias 11 · Flips 7» sumaba 53.
//
// 🔑 El fixture `joybees-catalogo-22sep2026.json` son los 81 nombres REALES de
// producción ese día, no inventados: así el candado mide contra el catálogo que
// existe y no contra un ejemplo cómodo.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import path from "path";

vi.mock("@/lib/tommy-supabase-server", () => ({ tommyServer: {} }));
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: {} }));

import { MARCA_THEME, JOYBEES_CAJONES, type MarcaUiKey } from "@/lib/catalogo/marcas-ui";
import { SECTION_LABELS } from "@/components/catalogo/groupByModel";
import {
  chipsDelCatalogo,
  CHIP_SIN_FOTO,
  CHIP_TODOS,
  PREFIJO_CATEGORIA,
  type ProductoDeChip,
} from "@/lib/catalogos/admin-chips";

const LAS_CUATRO: MarcaUiKey[] = ["reebok", "joybees", "tommy", "calvin"];
/** Las que hablan español, por decisión de Daniel. */
const EN_ESPANOL: MarcaUiKey[] = ["reebok", "joybees"];
/** Las que se quedan con el vocabulario de la marca, por decisión de Daniel. */
const EN_INGLES: MarcaUiKey[] = ["tommy", "calvin"];

function src(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}
const CARD_PLANA = src("src/components/catalogo/CatalogoProductCard.tsx");
const CARD_AGRUPADA = src("src/components/catalogo/CatalogoGroupedCard.tsx");
/** El archivo SIN comentarios: un comentario que NOMBRA el texto podado (para
 *  explicar por qué se fue) no puede contar como que el texto sigue en pantalla. */
function sinComentarios(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}
const ADMIN_CLIENT = src("src/app/catalogos/admin/[marca]/AdminCatalogoClient.tsx");
const ADMIN_CLIENT_SIN_COMENTARIOS = sinComentarios(ADMIN_CLIENT);

const NOMBRES_JOYBEES: string[] = JSON.parse(
  src("src/__tests__/fixtures/joybees-catalogo-22sep2026.json"),
).nombres;

/** La MISMA regla que `tipoJoybees` (que es privado): recorre la lista y gana
 *  la primera palabra que aparece. Si esto y el módulo se separan, el test de
 *  la suma lo dice. */
function cajonDe(nombre: string): string | null {
  const n = nombre.toLowerCase();
  for (const c of JOYBEES_CAJONES) if (c.palabras.some((w) => n.includes(w))) return c.value;
  return null;
}

describe("A · la tarjeta: el nombre solo donde dice el modelo", () => {
  it("Tommy y Calvin NO dibujan el nombre; Reebok y Joybees SÍ", () => {
    expect(MARCA_THEME.tommy.card.nombreEnLaTarjeta, "tommy").toBe(false);
    expect(MARCA_THEME.calvin.card.nombreEnLaTarjeta, "calvin").toBe(false);
    // 🔴 El error inverso: quitarle el nombre a Reebok o a Joybees es tan
    // defecto como devolvérselo a Tommy.
    expect(MARCA_THEME.reebok.card.nombreEnLaTarjeta, "reebok").toBe(true);
    expect(MARCA_THEME.joybees.card.nombreEnLaTarjeta, "joybees").toBe(true);
  });

  it("las DOS cards le preguntan al TEMA, nunca al nombre de la marca", () => {
    for (const [quien, code] of [["plana", CARD_PLANA], ["agrupada", CARD_AGRUPADA]] as const) {
      expect(code, quien).toContain("t.nombreEnLaTarjeta");
      // Nada de `marca === "tommy"` ni de listas de marcas escritas a mano.
      expect(code, quien).not.toMatch(/marca\s*===\s*["'](tommy|calvin|reebok|joybees)["']/);
      expect(code, quien).not.toMatch(/\[\s*["']tommy["']\s*,\s*["']calvin["']\s*\]/);
    }
  });

  it("el nombre sigue existiendo: se dibuja condicionado, no se borra del dato", () => {
    for (const [quien, code] of [["plana", CARD_PLANA], ["agrupada", CARD_AGRUPADA]] as const) {
      // El componente del nombre sigue montado (bajo su condición).
      expect(code, quien).toContain("<CatalogoProductName");
      // Y sin la línea, el nombre completo sigue al alcance del mouse.
      expect(code, quien).toMatch(/title=\{(product|group)\.name\}/);
    }
  });

  it("sin nombre manda el CÓDIGO, y se lee (no es la píldora gris)", () => {
    for (const [quien, code] of [["plana", CARD_PLANA], ["agrupada", CARD_AGRUPADA]] as const) {
      expect(code, quien).toContain("t.codigoTitulo");
      // La píldora sigue existiendo para las marcas que sí llevan nombre.
      expect(code, quien).toContain("className={t.skuPill}");
    }
    for (const m of EN_INGLES) {
      const titulo = MARCA_THEME[m].card.codigoTitulo;
      // Misma geometría que el nombre: una línea de alto fijo. Si esto se
      // pierde, las tarjetas del grid dejan de alinearse.
      expect(titulo, m).toContain("leading-5");
      expect(titulo, m).toContain("h-5");
      expect(titulo, m).toContain("truncate");
      // 🩸 Lo que se arregló: el código vivía al 50 % de opacidad, en 12px.
      expect(titulo, m).not.toContain("/50");
      expect(titulo, m).toContain("text-sm");
      expect(titulo, m).toContain("font-semibold");
      // Y la píldora, que es la que sí va tenue, no se tocó.
      expect(MARCA_THEME[m].card.skuPill, m).toContain("/50");
    }
  });

  it("los FILTROS y el ENCABEZADO DE SECCIÓN de Tommy y Calvin no cambiaron", () => {
    for (const m of EN_INGLES) {
      const t = MARCA_THEME[m];
      expect(t.filtros.genderOptions.map((o) => o.label), m).toEqual([
        "Todos", "Women", "Men", "Boys", "Girls",
      ]);
      expect(t.filtros.categoryOptions.map((o) => o.label), m).toEqual([
        "Todos", "Sneakers", "Flip Flops", "Sandals", "Shoes", "Slippers", "Boots",
      ]);
      // El encabezado de sección sigue diciendo la categoría y el género.
      expect(t.genero.groupLabel("women"), m).toMatch(/WOMEN/i);
    }
  });
});

describe("B · español SOLO en Joybees y Reebok", () => {
  it("«Niños» con eñe: chip, encabezado de sección y subtítulo del PDF", () => {
    // Reebok y Joybees comparten la MISMA taxonomía, por referencia.
    expect(MARCA_THEME.reebok.genero).toBe(MARCA_THEME.joybees.genero);
    expect(MARCA_THEME.reebok.genero.groupLabel("kids")).toBe("Niños");
    expect(MARCA_THEME.reebok.genero.groupLabel("boys")).toBe("Niños");
    expect(MARCA_THEME.reebok.genero.groupLabel("girls")).toBe("Niños");
    expect(MARCA_THEME.reebok.genero.filterLabel("kids")).toBe("Niños");
    // El chip de cada una.
    expect(MARCA_THEME.reebok.filtros.genderOptions.find((o) => o.value === "kids")?.label).toBe("Niños");
    expect(MARCA_THEME.joybees.filtros.genderOptions.find((o) => o.value === "kids")?.label).toBe("Niños");
    // El encabezado de sección de la grilla agrupada (Joybees).
    expect(SECTION_LABELS.kids).toBe("Niños");
  });

  it("ni «Ninos» sin eñe ni «Kids» quedan como rótulo en esas dos marcas", () => {
    for (const m of EN_ESPANOL) {
      const rotulos = [
        ...MARCA_THEME[m].filtros.genderOptions.map((o) => o.label),
        ...MARCA_THEME[m].filtros.categoryOptions.map((o) => o.label),
        MARCA_THEME[m].genero.groupLabel("kids"),
        MARCA_THEME[m].genero.filterLabel("kids"),
        ...Object.values(SECTION_LABELS),
      ];
      expect(rotulos, m).not.toContain("Ninos");
      expect(rotulos, m).not.toContain("Kids");
    }
  });

  it("Tommy y Calvin NO se traducen al español — es decisión de Daniel", () => {
    const CASTELLANO = ["Mujer", "Hombre", "Niños", "Ninos", "Niño", "Niña", "Calzado", "Ropa", "Accesorios", "Sandalias"];
    for (const m of EN_INGLES) {
      const rotulos = [
        ...MARCA_THEME[m].filtros.genderOptions.map((o) => o.label),
        ...MARCA_THEME[m].filtros.categoryOptions.map((o) => o.label),
        ...MARCA_THEME[m].genero.pdfSections.map((s) => s.label),
      ];
      for (const palabra of CASTELLANO) expect(rotulos, `${m} · ${palabra}`).not.toContain(palabra);
    }
  });
});

describe("C · los cajones de Joybees y los chips en cero", () => {
  it("los 81 de Joybees caen en un cajón: los chips SUMAN el total", () => {
    expect(NOMBRES_JOYBEES).toHaveLength(81);
    const cuenta = new Map<string, number>();
    const sinCajon: string[] = [];
    for (const n of NOMBRES_JOYBEES) {
      const c = cajonDe(n);
      if (!c) sinCajon.push(n);
      else cuenta.set(c, (cuenta.get(c) ?? 0) + 1);
    }
    // 🩸 Acá vivían los 28 huérfanos: Trekking, Popinz y Flats.
    expect(sinCajon, `sin cajón: ${sinCajon.join(" · ")}`).toEqual([]);
    const suma = [...cuenta.values()].reduce((a, b) => a + b, 0);
    expect(suma).toBe(NOMBRES_JOYBEES.length);
    // Los tres cajones que ya existían no se movieron ni un producto.
    expect(cuenta.get("Clogs")).toBe(35);
    expect(cuenta.get("Sandalias")).toBe(11);
    expect(cuenta.get("Flips")).toBe(7);
    // Y los tres nuevos son exactamente los 28 que faltaban.
    expect(cuenta.get("Trekking")).toBe(12);
    expect(cuenta.get("Popinz")).toBe(11);
    expect(cuenta.get("Flats")).toBe(5);
  });

  it("las palabras de los cajones son DISJUNTAS: ningún producto en dos lados", () => {
    for (const n of NOMBRES_JOYBEES) {
      const s = n.toLowerCase();
      const caen = JOYBEES_CAJONES.filter((c) => c.palabras.some((w) => s.includes(w)));
      expect(caen.map((c) => c.value), n).toHaveLength(1);
    }
  });

  it("los chips de Joybees salen de la MISMA lista que clasifica", () => {
    expect(MARCA_THEME.joybees.admin.categorias?.map((c) => c.value)).toEqual(
      JOYBEES_CAJONES.map((c) => c.value),
    );
  });

  const prod = (o: Partial<ProductoDeChip> & { cat?: string }): ProductoDeChip & { cat?: string } => ({
    image_url: "https://x/f.jpg", active: true, oculto_manual: false, ...o,
  });
  const catDe = (p: ProductoDeChip & { cat?: string }) => p.cat ?? null;

  it("un chip en CERO no se dibuja — ni una categoría vacía ni «Sin foto» en 0", () => {
    const productos = [prod({ cat: "sneakers" }), prod({ cat: "sandals" })];
    const chips = chipsDelCatalogo(productos, [
      { value: "sneakers", label: "Sneakers" },
      { value: "sandals", label: "Sandals" },
      { value: "boots", label: "Boots" },
    ], catDe);
    const claves = chips.map((c) => c.key);
    // 🩸 Calvin dibujaba «Shoes 0 · Slippers 0 · Boots 0 · Sin foto 0».
    expect(claves).not.toContain(PREFIJO_CATEGORIA + "boots");
    expect(claves).not.toContain(CHIP_SIN_FOTO);
    // Lo que sí tiene productos, se queda.
    expect(claves).toContain(CHIP_TODOS);
    expect(claves).toContain(PREFIJO_CATEGORIA + "sneakers");
    expect(chips.every((c) => c.count > 0)).toBe(true);
  });

  it("«Sin foto» vuelve solo cuando hay cola de trabajo", () => {
    const chips = chipsDelCatalogo([prod({ cat: "sneakers" }), prod({ image_url: null, cat: "sneakers" })], [], catDe);
    expect(chips.find((c) => c.key === CHIP_SIN_FOTO)?.count).toBe(1);
  });

  it("lo ELEGIDO no se cae aunque valga 0 (un link viejo deja algo que apagar)", () => {
    const chips = chipsDelCatalogo([prod({ cat: "sneakers" })], [
      { value: "sneakers", label: "Sneakers" },
      { value: "boots", label: "Boots" },
    ], catDe, PREFIJO_CATEGORIA + "boots");
    expect(chips.map((c) => c.key)).toContain(PREFIJO_CATEGORIA + "boots");
    expect(chips.find((c) => c.key === PREFIJO_CATEGORIA + "boots")?.count).toBe(0);
  });

  it("FALLA ABIERTA: sin productos cargados se devuelven todos los chips", () => {
    const chips = chipsDelCatalogo([], [
      { value: "sneakers", label: "Sneakers" },
      { value: "boots", label: "Boots" },
    ], catDe);
    expect(chips.map((c) => c.key)).toEqual([
      CHIP_TODOS, PREFIJO_CATEGORIA + "sneakers", PREFIJO_CATEGORIA + "boots", CHIP_SIN_FOTO,
    ]);
  });

  it("sin cola no hay botón: «Todos tienen foto» se fue de la pantalla", () => {
    expect(ADMIN_CLIENT_SIN_COMENTARIOS).not.toContain("Todos tienen foto");
    expect(ADMIN_CLIENT_SIN_COMENTARIOS).not.toContain("Todos los productos tienen foto");
    // Y el botón apagado tampoco vuelve: sin cola no se dibuja nada.
    expect(ADMIN_CLIENT_SIN_COMENTARIOS).not.toContain("disabled={sinFoto.length === 0}");
    // El botón vivo sigue siendo el mismo, condicionado a que haya cola.
    expect(ADMIN_CLIENT).toContain("sinFoto.length > 0");
    expect(ADMIN_CLIENT).toContain("Descargar Excel sin foto");
  });
});

describe("las cuatro marcas siguen completas", () => {
  it("cada marca declara su dato de nombre y su clase de código", () => {
    for (const m of LAS_CUATRO) {
      expect(typeof MARCA_THEME[m].card.nombreEnLaTarjeta, m).toBe("boolean");
      expect(MARCA_THEME[m].card.codigoTitulo, m).toBeTruthy();
    }
  });
});
