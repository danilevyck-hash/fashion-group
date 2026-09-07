// ─────────────────────────────────────────────────────────────────────────────
// Administrar catálogo → los filtros salen del TEMA, no de una lista escrita
// en la pantalla.
//
// Daniel (6-ago-2026): *"en administrar catalogo tommy tambien debe de haber
// opcion de filtrar como en el catalogo en el tab catalogo completo"*.
//
// 🔄 6-sep-2026 — CAMBIÓ LA PANTALLA, NO LA REGLA, y el candado quedó más
// fuerte. Ya no hay dos pestañas ni dos dibujos de la misma lista: hay UNA
// lista, y la CATEGORÍA dejó de ser un desplegable para ser la fila de chips
// (`admin-chips.ts`). El género y el bulto siguen siendo desplegables. Lo que
// se vigila es lo de siempre: que las opciones se DERIVEN del tema.
//
// 🔑 Dos listas para la misma pregunta terminan diciendo cosas distintas:
// alguien agrega una categoría al catálogo público y el admin se queda sin
// ella. Por eso la fila de chips no puede escribir sus propias categorías.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { getMarcaTheme, MARCA_THEME } from "@/lib/catalogo/marcas-ui";
import { categoriasDeLaMarca, chipsDelCatalogo } from "@/lib/catalogos/admin-chips";

const raiz = process.cwd();
const leer = (p: string) => readFileSync(path.join(raiz, p), "utf8");
const shell = leer("src/app/catalogos/admin/[marca]/AdminCatalogoClient.tsx");
const fila = leer("src/app/catalogos/admin/[marca]/ProductoFila.tsx");
const chips = leer("src/lib/catalogos/admin-chips.ts");
const filtros = leer("src/components/catalogo/CatalogoFilters.tsx");

describe("🔴 el admin usa los MISMOS filtros que el catálogo, no una copia", () => {
  it("reusa el control del catálogo público", () => {
    expect(filtros).toContain("export function FiltroDesplegable");
    expect(shell).toContain('import { FiltroDesplegable } from "@/components/catalogo/CatalogoFilters"');
  });

  it("las opciones vienen del tema, no de una lista escrita en la pantalla", () => {
    expect(shell).toContain("opciones={theme.filtros.genderOptions}");
    // La categoría pasa por los chips, y su lista se DERIVA del mismo mapa.
    expect(shell).toContain("categoriasDeLaMarca(theme.filtros.categoryOptions)");
    // Si alguien escribiera las categorías a mano en el admin, esto lo caza.
    for (const fuente of [shell, chips]) {
      expect(fuente).not.toMatch(/value: "flip_flops"/);
      expect(fuente).not.toMatch(/value: "sneakers"/);
      expect(fuente).not.toMatch(/label: "Calzado"/);
    }
  });

  it("el género se compara con la regla de la marca, no con ===", () => {
    // `matchesTommyGenderFilter` normaliza (women/woman/womens). Un `===` pelado
    // dejaría fuera productos por cómo Switch escribió el género.
    expect(shell).toContain("theme.genero.match(p.gender, genero)");
  });

  it("Tommy tiene las 4 opciones de género y las 6 de categoría", () => {
    const t = getMarcaTheme("tommy")!;
    expect(t.filtros.genderOptions.map((o) => o.value)).toEqual(["", "women", "men", "boys", "girls"]);
    expect(t.filtros.categoryOptions.map((o) => o.value)).toEqual(
      ["", "sneakers", "flip_flops", "sandals", "shoes", "slippers", "boots"],
    );
    // Y los chips son ESAS mismas, sin el "Todos" del desplegable.
    expect(categoriasDeLaMarca(t.filtros.categoryOptions).map((o) => o.label)).toEqual(
      ["Sneakers", "Flip Flops", "Sandals", "Shoes", "Slippers", "Boots"],
    );
  });

  it("el chip «Solo sneakers» se fue porque Sneakers YA es un chip de categoría", () => {
    // Era la misma pregunta dos veces, con dos controles distintos.
    expect(shell).not.toContain("SneakersChip");
    const armados = chipsDelCatalogo(
      [{ image_url: null, category: "sneakers" }, { image_url: "x", category: "boots" }],
      categoriasDeLaMarca(getMarcaTheme("tommy")!.filtros.categoryOptions),
      (p) => p.category,
    );
    expect(armados.find((c) => c.label === "Sneakers")!.count).toBe(1);
  });
});

describe("🔴 el filtro de bulto mira el tamaño EFECTIVO, no la columna", () => {
  it("compara contra theme.bulto, así un producto sin marcar cuenta como 12", () => {
    // Hoy casi nadie está marcado: filtrar por la columna dejaría "12 piezas"
    // en cero, que es exactamente lo contrario de lo que se ve en pantalla.
    expect(shell).toContain('String(theme.bulto(p.category, p.bulto_pzas)) !== bulto');
  });

  it("solo aparece donde el bulto se marca a mano (Tommy y Calvin)", () => {
    expect(shell).toContain("theme.admin.bultoEditable && (");
    expect(getMarcaTheme("tommy")!.admin.bultoEditable).toBe(true);
    // ⚠️ Calvin lo tiene aunque hoy sean 0 de 94. Daniel, textual (6-sep-2026):
    // *«algunos productos de Calvin vienen de a 8 piezas, pero actualmente
    // ninguno en existencia viene de 8, pero lo queremos para cuando venga»*.
    expect(getMarcaTheme("calvin")!.admin.bultoEditable).toBe(true);
    expect(getMarcaTheme("reebok")!.admin.bultoEditable).toBeFalsy();
    expect(getMarcaTheme("joybees")!.admin.bultoEditable).toBeFalsy();
    // Y el control de la fila cuelga del mismo interruptor.
    expect(fila).toContain("theme.admin.bultoEditable && (");
  });

  it("ofrece los dos tamaños que existen en el negocio", () => {
    expect(shell).toContain('{ value: "12", label: "12 piezas" }');
    expect(shell).toContain('{ value: "8", label: "8 piezas" }');
  });
});

describe("🔴 no dejar al usuario mirando una pantalla vacía sin explicación", () => {
  it("cero resultados POR FILTRO se explica", () => {
    // "no hay ninguno así" y "algo se rompió" se ven igual si nadie lo dice.
    expect(shell).toContain("hayFiltros");
    expect(shell).toContain("Ningún producto con esos filtros");
  });

  it("hay una salida de todos los filtros a la vez", () => {
    expect(shell).toContain("Limpiar filtros");
    expect(shell).toContain('setGenero(""); setBulto(""); setBusqueda("")');
  });

  it("el conteo ya no se escribe en prosa: vive DENTRO de cada chip", () => {
    // 🔄 6-sep-2026: «N productos (de M)» decía dos veces lo que dicen los
    // chips. El número ahora va pegado a su filtro y se calcula, no se narra.
    expect(shell).not.toContain("` (de ${products.length})`");
    expect(chips).toContain("count: visibles.length");
  });
});

describe("🔴 cabe en un iPhone", () => {
  it("la fila de filtros envuelve en vez de arrastrar la página", () => {
    // Verificado en el navegador: 0 px de arrastre en 390 · 834 · 1440.
    expect(shell).toContain('<div className="flex flex-wrap items-center gap-2 mb-4">');
    expect(shell).toContain('<div className="flex flex-wrap items-center gap-2 mb-3">');
  });
});

describe("🔴 lo que ya funcionaba sigue funcionando", () => {
  it("el buscador por nombre y código no se tocó", () => {
    // Daniel lo confirmó: *"no lo había visto / sí sirve"*.
    expect(shell).toContain('placeholder="Buscar por código o nombre…"');
    const lista = leer("src/lib/catalogos/admin-lista.ts");
    expect(lista).toContain("p.name.toLowerCase().includes(q)");
    expect(lista).toContain('(p.sku || "").toLowerCase().includes(q)');
  });

  it("Visibles/Escondidos sigue existiendo — ahora como chip", () => {
    expect(shell).toContain("chipValido");
    expect(chips).toContain("CHIP_ESCONDIDOS");
  });

  it("las 4 marcas se dibujan con la MISMA lista", () => {
    // El estilo «tarjetas» de Reebok contra «filas» de las otras tres no era
    // una decisión: era el orden en que nacieron las marcas.
    for (const t of Object.values(MARCA_THEME)) {
      expect((t.admin as Record<string, unknown>).productosStyle).toBeUndefined();
    }
  });
});
