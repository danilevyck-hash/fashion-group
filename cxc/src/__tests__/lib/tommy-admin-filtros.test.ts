// ─────────────────────────────────────────────────────────────────────────────
// Administrar catálogo Tommy → "Catálogo completo" filtra como el catálogo.
//
// Daniel: *"en administrar catalogo tommy tambien debe de haber opcion de
// filtrar como en el catalogo en el tab catalogo completo"*.
//
// Tenía buscador (nombre y SKU), el chip "Solo sneakers" y Visibles/Ocultos.
// Le faltaban Género y Categoría —los del catálogo público— y el de piezas por
// bulto, para poder repasar cuáles ya quedaron en 8.
//
// 🔑 LAS OPCIONES SALEN DEL TEMA, no de una lista escrita en la pantalla. Son
// la MISMA pregunta que hace el catálogo público ("¿de qué género?"), y dos
// listas para la misma pregunta terminan diciendo cosas distintas: alguien
// agrega una categoría al público y el admin se queda sin ella.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { getMarcaTheme } from "@/lib/catalogo/marcas-ui";

const raiz = process.cwd();
const leer = (p: string) => readFileSync(path.join(raiz, p), "utf8");
const batch = leer("src/app/catalogos/admin/[marca]/ProductosBatch.tsx");
const filtros = leer("src/components/catalogo/CatalogoFilters.tsx");

describe("🔴 el admin usa los MISMOS filtros que el catálogo, no una copia", () => {
  it("reusa el control del catálogo público", () => {
    expect(filtros).toContain("export function FiltroDesplegable");
    expect(batch).toContain('import { FiltroDesplegable } from "@/components/catalogo/CatalogoFilters"');
  });

  it("las opciones vienen del tema, no de una lista escrita en la pantalla", () => {
    expect(batch).toContain("opciones={theme.filtros.genderOptions}");
    expect(batch).toContain("opciones={theme.filtros.categoryOptions}");
    // Si alguien escribiera las categorías a mano en el admin, esto lo caza.
    expect(batch).not.toMatch(/value: "flip_flops"/);
    expect(batch).not.toMatch(/value: "sneakers"/);
  });

  it("el género se compara con la regla de la marca, no con ===", () => {
    // `matchesTommyGenderFilter` normaliza (women/woman/womens). Un `===` pelado
    // dejaría fuera productos por cómo Switch escribió el género.
    expect(batch).toContain("theme.genero.match(p.gender, genero)");
  });

  it("Tommy tiene las 4 opciones de género y las 6 de categoría", () => {
    const t = getMarcaTheme("tommy")!;
    expect(t.filtros.genderOptions.map((o) => o.value)).toEqual(["", "women", "men", "boys", "girls"]);
    expect(t.filtros.categoryOptions.map((o) => o.value)).toEqual(
      ["", "sneakers", "flip_flops", "sandals", "shoes", "slippers", "boots"],
    );
  });
});

describe("🔴 el filtro de bulto mira el tamaño EFECTIVO, no la columna", () => {
  it("compara contra theme.bulto, así un producto sin marcar cuenta como 12", () => {
    // Hoy NADIE está marcado: `bulto_pzas` es null en las 490 filas. Filtrar por
    // la columna dejaría "12 piezas" en cero, que es exactamente lo contrario de
    // lo que se ve en pantalla.
    expect(batch).toContain('String(theme.bulto(p.category, p.bulto_pzas)) !== bulto');
  });

  it("solo aparece donde el bulto se marca a mano (hoy Tommy)", () => {
    expect(batch).toContain("theme.admin.bultoEditable && (");
    expect(getMarcaTheme("tommy")!.admin.bultoEditable).toBe(true);
    expect(getMarcaTheme("reebok")!.admin.bultoEditable).toBeFalsy();
    expect(getMarcaTheme("joybees")!.admin.bultoEditable).toBeFalsy();
  });

  it("ofrece los dos tamaños que existen en el negocio", () => {
    expect(batch).toContain('{ value: "12", label: "12 piezas" }');
    expect(batch).toContain('{ value: "8", label: "8 piezas" }');
  });
});

describe("🔴 no dejar al usuario mirando una pantalla vacía sin explicación", () => {
  it("cero resultados POR FILTRO se explica", () => {
    // "no hay ninguno así" y "algo se rompió" se ven igual si nadie lo dice.
    expect(batch).toContain("filtered.length === 0 && hayFiltros");
    expect(batch).toContain("Ningún producto con esos filtros");
  });

  it("hay una salida de todos los filtros a la vez", () => {
    expect(batch).toContain("Limpiar filtros");
    expect(batch).toContain('setGenero(""); setCategoria(""); setBulto(""); setSoloSneakers(false); setSearch("")');
  });

  it("el conteo dice «de N» con CUALQUIER filtro, no solo con búsqueda", () => {
    expect(batch).toContain("{hayFiltros && ` (de ${products.length})`}");
  });
});

describe("🔴 cabe en un iPhone", () => {
  it("la fila de filtros envuelve en vez de arrastrar la página", () => {
    // Verificado en el navegador: 0 px de arrastre en 390 · 834 · 1440.
    expect(batch).toContain('<div className="flex flex-wrap items-center gap-2 mb-4">');
  });
});

describe("🔴 lo que ya funcionaba sigue funcionando", () => {
  it("el buscador por nombre y SKU no se tocó", () => {
    // Daniel lo confirmó: *"no lo había visto / sí sirve"*.
    expect(batch).toContain('placeholder="Buscar por nombre o SKU…"');
    expect(batch).toContain('p.name.toLowerCase().includes(q)');
    expect(batch).toContain('(p.sku || "").toLowerCase().includes(q)');
  });

  it("siguen el chip Solo sneakers y el selector Visibles/Ocultos", () => {
    expect(batch).toContain("SneakersChip");
    expect(batch).toContain("visibilidadEfectiva");
  });
});
