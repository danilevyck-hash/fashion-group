// ─────────────────────────────────────────────────────────────────────────────
// En CELULAR y en iPAD los filtros del catálogo son DESPLEGABLES, no una fila
// que se arrastra de costado (30-jul-2026).
//
// Daniel, textual: *"en todo lo del iphone donde haya data como los filtros en
// los catalogos y hay que hacer scroll, mejor arreglarlo de otra manera, un
// drop down"*. Y al ver que a 834 px seguía igual: *"si, hazlo en ipad tambien"*.
//
// 🩸 LO MEDIDO, navegador real, build y datos de producción, en las DOS vistas
// que comparten este componente — la interna del vendedor (`/catalogo/<marca>`)
// y la pública del cliente (`/catalogo-publico/<marca>`). Px de arrastre
// horizontal de la fila de filtros, interno / público, ANTES de cada arreglo:
//
//   marca    390 (iPhone) 834 (iPad V) 1024 (iPad H) 1180 (Pro) 1280 (lap) 1366  1440
//   Tommy     779 / 813    559 / 369     369 / 179    213 / 23   113 / 0   27/0  0/0
//   Reebok    642 / 674    422 / 230     232 /  40     76 /  0     0 / 0    0/0  0/0
//   Joybees   138 / 158      0 /   0       0 /   0      0 /  0     0 / 0    0/0  0/0
//
// **DESPUÉS: 0 px en los 7 anchos, las 3 marcas y las 2 vistas.**
//
// Dos cambios, en dos PRs, con el mismo objetivo:
//   1. El corte pasó de `md` (768) a `lg` (1024) → 390 y 834 en 0.
//   2. La fila de píldoras ganó `flex-wrap` → 1024, 1180, 1280 y 1366 en 0,
//      sin tocar 1440 (ahí ya entraban en una línea).
//
// ⚠️ **Lo que NO se hizo, y por qué:** correr el corte a `xl` (1280) parecía la
// salida natural para el iPad horizontal y **no llegaba a 0** — a 1280 px las
// píldoras vuelven y Tommy interno arrastra 113 px. Se midió antes de elegir.
//
// Este archivo congela la CAUSA (jsdom no calcula layout, así que no puede
// medir un arrastre); la medición real vive en
// `scripts/_medir-filtros-catalogo.mjs` (7 anchos).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { readFileSync } from "fs";
import path from "path";

vi.mock("@/lib/tommy-supabase-server", () => ({ tommyServer: {} }));
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: {} }));

import { MARCA_THEME, type MarcaUiKey } from "@/lib/catalogo/marcas-ui";
import { BULTOS_CHIP_LABEL, type PrecioRango } from "@/lib/catalogo/filtros-extra";
import CatalogoFilters from "@/components/catalogo/CatalogoFilters";

const FUENTE = readFileSync(
  path.join(process.cwd(), "src/components/catalogo/CatalogoFilters.tsx"),
  "utf8",
);

const MARCAS: MarcaUiKey[] = ["reebok", "joybees", "tommy"];

function props(marca: MarcaUiKey, extra: Record<string, unknown> = {}) {
  return {
    marca,
    searchInput: "", onSearchChange: () => {},
    gender: "", onGenderChange: () => {},
    category: "", onCategoryChange: () => {},
    bultosFilter: false, onBultosFilterChange: () => {},
    precioRango: "" as PrecioRango, onPrecioRangoChange: () => {},
    sortBy: "relevancia", onSortByChange: () => {},
    filteredCount: 0, onClearAll: () => {},
    ...extra,
  };
}

/** La fila de píldoras de siempre (iPad/escritorio): la del `overflow-x-auto`. */
function filaPildoras(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>(".overflow-x-auto");
  if (!el) throw new Error("no encontré la fila de píldoras");
  return el;
}

/** La fila de desplegables (celular e iPad): la que se esconde de `lg` p'arriba. */
function filaMovil(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>(".lg\\:hidden");
  if (!el) throw new Error("no encontré la fila de celular/iPad");
  return el;
}

// ── La causa del arrastre: la fila de píldoras ya no se dibuja bajo `lg` ──────
describe("la fila que se arrastraba sale de la pantalla del celular y del iPad", () => {
  it("la fila de píldoras es `hidden lg:flex` — solo escritorio", () => {
    for (const marca of MARCAS) {
      const { container, unmount } = render(createElement(CatalogoFilters, props(marca)));
      expect(filaPildoras(container).className, marca).toContain("hidden");
      expect(filaPildoras(container).className, marca).toContain("lg:flex");
      unmount();
    }
  });

  it("la fila de celular/iPad ENVUELVE y no se arrastra: `flex-wrap`, sin overflow", () => {
    for (const marca of MARCAS) {
      const { container, unmount } = render(createElement(CatalogoFilters, props(marca)));
      const fila = filaMovil(container);
      // `flex-wrap` es lo que garantiza 0 px de arrastre por CONSTRUCCIÓN: lo
      // que no entra baja de renglón en vez de esconderse a la derecha.
      expect(fila.className, marca).toContain("flex-wrap");
      expect(fila.className, marca).not.toContain("overflow-x-auto");
      unmount();
    }
  });

  it("el corte es `lg` (1024): el iPad vertical queda del lado de los desplegables", () => {
    // El primer arreglo cortó en `md` (768) y dejó el iPad con la fila vieja:
    // medido, a 834 px seguía arrastrándose 559 px en Tommy y 422 en Reebok.
    // Daniel: *"si, hazlo en ipad tambien"*. Con `lg`, 1023 es el último ancho
    // con desplegables y 1024 el primero con píldoras.
    expect(FUENTE).toContain("flex lg:hidden flex-wrap");
    expect(FUENTE).not.toMatch(/\b(sm|md|xl):hidden\b/);
  });

  it("y de `lg` para arriba las PÍLDORAS también envuelven — nada se arrastra", () => {
    // Tercer pedido de Daniel: *"y si, hazlo en ipad horizontal tambien"*.
    // La salida obvia —correr el corte a `xl` (1280)— se midió y PIERDE: a
    // 1280 px Tommy interno arrastra 113 px y a 1366 arrastra 27, o sea que
    // ahí las píldoras vuelven y vuelve el problema; encima metería el
    // desplegable en laptops que nadie pidió cambiar. `flex-wrap` sin tope da
    // 0 px en TODOS los anchos, incluidos esos dos.
    expect(filaPildoras(render(createElement(CatalogoFilters, props("tommy"))).container).className)
      .toContain("flex-wrap");
    expect(FUENTE).toContain("hidden lg:flex flex-wrap items-center gap-2 overflow-x-auto");
    // Sin tope: un `xl:flex-nowrap` devolvería el arrastre a 1280 y 1366.
    expect(FUENTE).not.toContain("flex-nowrap");
  });
});

// ── Qué grupos aparecen en cada marca ────────────────────────────────────────
describe("cada marca lleva sus grupos, ni uno más", () => {
  const ESPERADO: Record<MarcaUiKey, string[]> = {
    // Reebok: género + categoría. El grupo "Estado" (Oferta/Nuevo/
    // Próximamente) SE RETIRÓ el 14-ago-2026 — ver el bloque de abajo.
    reebok: ["Género", "Categoría"],
    // Joybees no tiene categorías (`categoryOptions` vacío).
    joybees: ["Género"],
    // Tommy: su chip de bultos es un interruptor, no una lista.
    tommy: ["Género", "Categoría"],
  };

  for (const marca of MARCAS) {
    it(`${marca}: ${ESPERADO[marca].join(" · ")}`, () => {
      const { container } = render(createElement(CatalogoFilters, props(marca)));
      const disparadores = within(filaMovil(container))
        .getAllByRole("button")
        .filter(b => b.getAttribute("aria-haspopup") === "listbox")
        .map(b => (b.textContent || "").split(":")[0].trim());
      expect(disparadores).toEqual(ESPERADO[marca]);
    });
  }

  it("en Tommy el chip de bultos sigue PRIMERO también en celular", () => {
    // Misma razón que en la fila de píldoras (26-jul-2026): corta 123 de 490
    // productos y un filtro que no se ve no existe.
    const { container } = render(createElement(CatalogoFilters, props("tommy")));
    const botones = within(filaMovil(container)).getAllByRole("button");
    expect((botones[0].textContent || "").trim()).toBe(BULTOS_CHIP_LABEL);
  });

  it("Reebok y Joybees NO muestran el chip de bultos en celular", () => {
    for (const marca of ["reebok", "joybees"] as const) {
      const { container, unmount } = render(createElement(CatalogoFilters, props(marca)));
      expect(
        within(filaMovil(container)).queryByRole("button", { name: BULTOS_CHIP_LABEL }),
        marca,
      ).toBeNull();
      unmount();
    }
  });
});

// ── El desplegable: qué dice, qué muestra y qué devuelve ─────────────────────
describe("el desplegable de un grupo", () => {
  function disparador(container: HTMLElement, etiqueta: string): HTMLElement {
    const b = within(filaMovil(container))
      .getAllByRole("button")
      .find(x => (x.textContent || "").startsWith(`${etiqueta}:`));
    if (!b) throw new Error(`no encontré el disparador de ${etiqueta}`);
    return b;
  }

  it("cerrado NO existe en el DOM (por eso duplicar el control no duplica nada)", () => {
    const { container } = render(createElement(CatalogoFilters, props("tommy")));
    expect(container.ownerDocument.querySelector("[data-desplegable]")).toBeNull();
    // Y el único "Women" de la pantalla es el chip de la fila de píldoras.
    expect(screen.getAllByRole("button", { name: "Women" })).toHaveLength(1);
  });

  it("el botón dice el grupo Y lo elegido, para leer el estado sin abrirlo", () => {
    const { container } = render(
      createElement(CatalogoFilters, props("tommy", { gender: "women" })),
    );
    expect(disparador(container, "Género").textContent).toContain("Género: Women");
  });

  it("sin nada elegido dice la primera opción del tema ('Todos')", () => {
    const { container } = render(createElement(CatalogoFilters, props("tommy")));
    expect(disparador(container, "Género").textContent).toContain("Género: Todos");
    expect(MARCA_THEME.tommy.filtros.genderOptions[0].value).toBe("");
  });

  it("abierto muestra TODAS las opciones del tema, la elegida marcada", () => {
    const { container } = render(
      createElement(CatalogoFilters, props("tommy", { gender: "men" })),
    );
    fireEvent.click(disparador(container, "Género"));
    const panel = container.ownerDocument.querySelector<HTMLElement>(
      '[data-desplegable="catalogo-filtro-género"]',
    );
    expect(panel).toBeTruthy();
    const opciones = within(panel!).getAllByRole("option");
    expect(opciones.map(o => (o.textContent || "").trim())).toEqual(
      MARCA_THEME.tommy.filtros.genderOptions.map(o => o.label),
    );
    expect(opciones.find(o => o.getAttribute("aria-selected") === "true")?.textContent)
      .toContain("Men");
  });

  it("elegir una opción avisa el valor y cierra la lista", () => {
    const vistos: string[] = [];
    const { container } = render(
      createElement(CatalogoFilters, props("tommy", { onGenderChange: (v: string) => vistos.push(v) })),
    );
    fireEvent.click(disparador(container, "Género"));
    const panel = container.ownerDocument.querySelector<HTMLElement>(
      '[data-desplegable="catalogo-filtro-género"]',
    )!;
    fireEvent.click(within(panel).getByRole("option", { name: "Boys" }));
    expect(vistos).toEqual(["boys"]);
    expect(
      container.ownerDocument.querySelector('[data-desplegable="catalogo-filtro-género"]'),
    ).toBeNull();
  });

  it("'Todos' devuelve la cadena vacía: apaga el filtro, no lo pone en 'todos'", () => {
    const vistos: string[] = [];
    const { container } = render(
      createElement(CatalogoFilters, props("tommy", {
        gender: "women",
        onGenderChange: (v: string) => vistos.push(v),
      })),
    );
    fireEvent.click(disparador(container, "Género"));
    const panel = container.ownerDocument.querySelector<HTMLElement>(
      '[data-desplegable="catalogo-filtro-género"]',
    )!;
    fireEvent.click(within(panel).getByRole("option", { name: "Todos" }));
    expect(vistos).toEqual([""]);
  });

});

// ── LOS CHIPS «OFERTA / NUEVO / PRÓXIMAMENTE» SE FUERON ──────────────────────
//
// Daniel, 14-ago-2026: *"eliminas filtros de reebok desde la raíz los de
// oferta/nuevo/proximamente"*. Medido contra producción: `badge` está en NULL
// en los 944 productos de las 4 marcas, o sea que los 3 chips nunca
// devolvieron un solo resultado.
//
// 🔴 Candados de CONDUCTA: PINTAN la pantalla y leen el DOM. Un barrido de
// texto sobre el archivo pasaría estando mutado — y encima se cumpliría solo
// con el comentario que explica el retiro, que es el defecto que este repo ya
// pagó cuatro veces.
describe("los chips de Oferta/Nuevo/Próximamente no vuelven", () => {
  const PROHIBIDOS = ["Oferta", "Nuevo", "Próximamente"];

  for (const marca of MARCAS) {
    it(`${marca}: ninguno de los 3 se pinta, ni en celular ni en escritorio`, () => {
      const { container } = render(createElement(CatalogoFilters, props(marca)));
      const textos = Array.from(container.querySelectorAll("button, [role='option']"))
        .map(e => (e.textContent || "").trim());
      for (const p of PROHIBIDOS) expect(textos).not.toContain(p);
    });
  }

  it("Reebok ya no tiene el grupo 'Estado' en la fila de celular", () => {
    const { container } = render(createElement(CatalogoFilters, props("reebok")));
    const disparadores = within(filaMovil(container))
      .getAllByRole("button")
      .map(b => (b.textContent || "").trim());
    expect(disparadores.some(d => d.startsWith("Estado"))).toBe(false);
  });

  it("pasarle saleFilter/onSaleFilterChange ya no pinta nada (props muertas)", () => {
    // Si alguien deja el prop viejo en un llamador, no debe reaparecer el chip.
    const { container } = render(
      createElement(CatalogoFilters, props("reebok", {
        saleFilter: "oferta", onSaleFilterChange: () => {},
      })),
    );
    const textos = Array.from(container.querySelectorAll("button, [role='option']"))
      .map(e => (e.textContent || "").trim());
    for (const p of PROHIBIDOS) expect(textos).not.toContain(p);
  });

  it("el tipo SaleFilter y SALE_OPTIONS ya no se exportan", () => {
    const sinComentarios = FUENTE
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n").filter(l => !l.trim().startsWith("//")).join("\n");
    expect(sinComentarios).not.toContain("SaleFilter");
    expect(sinComentarios).not.toContain("SALE_OPTIONS");
  });
});

// ── Alto táctil ──────────────────────────────────────────────────────────────
describe("todo lo que se toca mide 44 px de alto", () => {
  it("los disparadores y las opciones llevan min-h-[44px]", () => {
    const { container } = render(createElement(CatalogoFilters, props("tommy")));
    for (const b of within(filaMovil(container)).getAllByRole("button")) {
      expect(b.className, b.textContent ?? "").toContain("min-h-[44px]");
    }
    fireEvent.click(
      within(filaMovil(container))
        .getAllByRole("button")
        .find(x => (x.textContent || "").startsWith("Género:"))!,
    );
    const panel = container.ownerDocument.querySelector<HTMLElement>(
      '[data-desplegable="catalogo-filtro-género"]',
    )!;
    for (const o of within(panel).getAllByRole("option")) {
      expect(o.className).toContain("min-h-[44px]");
    }
  });
});

// ── El panel usa EL desplegable de la casa ───────────────────────────────────
describe("el panel flota de verdad", () => {
  it("usa <DesplegableFlotante>, no un `absolute` que un ancestro recorta", () => {
    expect(FUENTE).toContain('from "@/components/ui/DesplegableFlotante"');
    expect(FUENTE).not.toMatch(/absolute[^"]*top-full/);
  });

  it("se dibuja en <body>, fuera del contenedor de los filtros", () => {
    const { container } = render(createElement(CatalogoFilters, props("tommy")));
    fireEvent.click(
      within(filaMovil(container))
        .getAllByRole("button")
        .find(x => (x.textContent || "").startsWith("Género:"))!,
    );
    const panel = container.ownerDocument.querySelector<HTMLElement>(
      '[data-desplegable="catalogo-filtro-género"]',
    )!;
    expect(panel.parentElement).toBe(container.ownerDocument.body);
    expect(container.contains(panel)).toBe(false);
  });
});
