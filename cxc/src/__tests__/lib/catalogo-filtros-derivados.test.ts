/**
 * Candado — las píldoras de género/categoría se DERIVAN de los productos.
 *
 * Daniel, con captura de Calvin (12-ago-2026): *"si alguna no tiene una
 * categoria como genero o categoria, no tiene que estar, como calvin veo que
 * hay filtro de boots, pero no veo ninguna con boots. cuando se agregue boots
 * ahi que salga el filtro automatico"*.
 *
 * Los dos lados importan y los dos se prueban acá: que la píldora VACÍA no se
 * dibuje, y que APAREZCA sola —en su lugar del orden configurado— en cuanto
 * entre el primer producto. Un candado que solo mirara el primero dejaría pasar
 * una implementación que borra la opción para siempre.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { opcionesConDatos, grupoTieneOpciones } from "@/lib/catalogo/filtros-derivados";
import { getMarcaTheme } from "@/lib/catalogo/marcas-ui";

const raiz = join(__dirname, "..", "..");
const leer = (rel: string) => readFileSync(join(raiz, rel), "utf8");

/** Las categorías reales de Calvin, tal cual están configuradas hoy. */
const CALVIN_CATEGORIAS = getMarcaTheme("calvin")!.filtros.categoryOptions;

type Prod = { category?: string | null; gender?: string | null };

const derivarCategorias = (productos: Prod[], elegido = "") =>
  opcionesConDatos({
    opciones: CALVIN_CATEGORIAS,
    valorElegido: elegido,
    hayProductos: productos.length > 0,
    tieneAlguno: (v) => productos.some((p) => p.category === v),
  }).map((o) => o.value);

// El catálogo que Daniel tenía en pantalla: hay de todo menos boots.
const SIN_BOTAS: Prod[] = [
  { category: "sneakers" },
  { category: "sneakers" },
  { category: "sandals" },
  { category: "slippers" },
];

describe("el caso de Daniel — Calvin sin una sola bota", () => {
  it("la píldora Boots NO se dibuja", () => {
    expect(derivarCategorias(SIN_BOTAS)).not.toContain("boots");
  });

  it("las que SÍ tienen producto se quedan, y 'Todos' también", () => {
    expect(derivarCategorias(SIN_BOTAS)).toEqual(["", "sneakers", "sandals", "slippers"]);
  });

  it("🔑 entra la primera bota y la píldora aparece sola, sin tocar código", () => {
    expect(derivarCategorias([...SIN_BOTAS, { category: "boots" }])).toContain("boots");
  });

  it("…y aparece EN SU LUGAR del orden configurado, no al final", () => {
    // En el tema, Boots va después de Slippers. Si alguien ordenara por
    // cantidad o alfabéticamente, este test lo caza.
    expect(derivarCategorias([...SIN_BOTAS, { category: "boots" }]))
      .toEqual(["", "sneakers", "sandals", "slippers", "boots"]);
  });
});

describe("lo que NO se puede romper", () => {
  it("🔴 fail-open: sin productos (todavía cargando) se muestra lo configurado", () => {
    expect(derivarCategorias([])).toEqual(CALVIN_CATEGORIAS.map((o) => o.value));
  });

  it("🩸 lo ELEGIDO se queda aunque no tenga productos", () => {
    // Un link viejo `?category=boots` o un producto que se agotó dejarían el
    // filtro activo con su píldora invisible: grilla vacía y nada que apagar.
    expect(derivarCategorias(SIN_BOTAS, "boots")).toContain("boots");
  });

  it("'Todos' nunca se va, ni con una sola categoría en el catálogo", () => {
    expect(derivarCategorias([{ category: "sneakers" }])).toEqual(["", "sneakers"]);
  });

  it("un grupo que queda con una sola opción no se dibuja", () => {
    // Sin categorías reconocibles queda solo "Todos": una píldora que no filtra.
    const solas = opcionesConDatos({
      opciones: CALVIN_CATEGORIAS,
      valorElegido: "",
      hayProductos: true,
      tieneAlguno: () => false,
    });
    expect(solas.map((o) => o.value)).toEqual([""]);
    expect(grupoTieneOpciones(solas)).toBe(false);
    expect(grupoTieneOpciones(derivarCategorias(SIN_BOTAS))).toBe(true);
  });

  it("una categoría que existe en los productos pero NO en el tema no se inventa", () => {
    // El tema es el VOCABULARIO: un valor crudo de Switch no tiene etiqueta ni
    // lugar en el orden. Se sigue viendo en la grilla bajo "Todos", igual que
    // antes de este cambio — no se pierde ningún producto.
    expect(derivarCategorias([{ category: "raincoats" }, { category: "sneakers" }]))
      .toEqual(["", "sneakers"]);
  });
});

describe("género — cada marca pregunta como filtra", () => {
  const tommy = getMarcaTheme("tommy")!;

  it("Tommy usa theme.genero.match, no comparación cruda", () => {
    const productos: Prod[] = [{ gender: "women" }, { gender: "women" }];
    const vals = opcionesConDatos({
      opciones: tommy.filtros.genderOptions,
      valorElegido: "",
      hayProductos: productos.length > 0,
      tieneAlguno: (v) => productos.some((p) => tommy.genero.match(p.gender, v)),
    }).map((o) => o.value);
    expect(vals).toContain("women");
    expect(vals).not.toContain("boys");
    expect(vals).not.toContain("girls");
  });

  it("Joybees mide por SECCIÓN del grupo (agrupacionPorModelo)", () => {
    const joybees = getMarcaTheme("joybees")!;
    expect(joybees.features.agrupacionPorModelo).toBe(true);
    const secciones = ["mujer", "mujer", "kids"];
    const vals = opcionesConDatos({
      opciones: joybees.filtros.genderOptions,
      valorElegido: "",
      hayProductos: true,
      tieneAlguno: (v) => secciones.includes(v),
    }).map((o) => o.value);
    expect(vals).toEqual(["", "mujer", "kids"]);
  });
});

describe("está CABLEADO en las dos vistas, no solo escrito", () => {
  const VISTAS = [
    "components/catalogo/CatalogoPublicoPage.tsx",
    "components/catalogo/CatalogoVendedorPage.tsx",
  ];

  for (const vista of VISTAS) {
    it(`${vista} deriva las opciones y se las pasa a CatalogoFilters`, () => {
      const fuente = leer(vista);
      expect(fuente).toContain("opcionesConDatos");
      expect(fuente).toContain("genderOptions={generoOptions}");
      expect(fuente).toContain("categoryOptions={categoryOptions}");
    });

    it(`${vista} deriva sobre el catálogo COMPLETO, no sobre lo ya filtrado`, () => {
      // Atado a `filtered`, las píldoras aparecerían y desaparecerían mientras
      // se usa la pantalla. El bloque tiene que mirar `products`.
      const fuente = leer(vista);
      const bloque = fuente.slice(fuente.indexOf("const generoOptions"), fuente.indexOf("const categoryOptions"));
      expect(bloque).toContain("products.some");
      expect(bloque).not.toContain("filtered");
    });
  }

  it("CatalogoFilters cae en lo configurado si nadie le pasa opciones (fail-open)", () => {
    const fuente = leer("components/catalogo/CatalogoFilters.tsx");
    expect(fuente).toContain("genderOptions ?? f.genderOptions");
    expect(fuente).toContain("categoryOptions ?? f.categoryOptions");
  });

  it("el grupo entero se esconde cuando queda sin opciones", () => {
    const fuente = leer("components/catalogo/CatalogoFilters.tsx");
    expect(fuente).toContain("grupoTieneOpciones(generoOpts)");
    expect(fuente).toContain("grupoTieneOpciones(categoriaOpts)");
  });
});
