// Mínimo táctil de 44×44: los botones de solo ícono que Daniel usa desde el
// iPhone. jsdom no hace layout (todo mide 0×0), así que acá se verifica el
// CONTRATO de clases y de accesibilidad, que es lo que se rompe cuando alguien
// agrega un botón nuevo. La medición real en píxeles se hizo con el navegador
// emulando 390×844 y quedó en el PR.

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import IconButton from "@/components/IconButton";

afterEach(cleanup);

/**
 * Devuelve el `<button …>` que envuelve a `etiqueta`.
 *
 * No se puede usar /<button[^>]*>/: los handlers llevan `=>` y el `[^>]*` corta
 * ahí, dejando afuera el className que es justo lo que se quiere verificar.
 * Se recorta desde el último "<button" ANTES del texto.
 */
function botonDe(src: string, etiqueta: string): string {
  const fin = src.indexOf(etiqueta);
  if (fin < 0) return "";
  const ini = src.lastIndexOf("<button", fin);
  return ini < 0 ? "" : src.slice(ini, fin);
}

/** ¿El botón declara el mínimo táctil por clase? */
function tiene44(el: HTMLElement) {
  const cls = el.className;
  return cls.includes("min-w-[44px]") && cls.includes("min-h-[44px]");
}

describe("IconButton", () => {
  it("garantiza 44×44 aunque el consumidor no diga nada", () => {
    render(<IconButton label="Editar">·</IconButton>);
    expect(tiene44(screen.getByRole("button"))).toBe(true);
  });

  it("el className del consumidor suma, no reemplaza el mínimo táctil", () => {
    render(
      <IconButton label="Eliminar" className="text-red-600 -mr-2">
        ·
      </IconButton>,
    );
    const boton = screen.getByRole("button");
    expect(tiene44(boton)).toBe(true);
    expect(boton.className).toContain("text-red-600");
  });

  it("un botón sin texto siempre tiene nombre accesible", () => {
    render(<IconButton label="Cerrar menú">·</IconButton>);
    // getByRole con name falla si no hay aria-label: ese es el candado.
    expect(screen.getByRole("button", { name: "Cerrar menú" })).toBeTruthy();
  });

  it("no envía formularios por accidente (type=button por defecto)", () => {
    render(<IconButton label="Buscar">·</IconButton>);
    expect(screen.getByRole("button").getAttribute("type")).toBe("button");
  });
});

describe("AppHeader — botones móviles", () => {
  // El header sale en las 22 páginas: un botón chico acá se multiplica por toda
  // la app. Se lee el fuente en vez de montar el componente porque AppHeader
  // arrastra router, sessionStorage y el árbol de módulos, y lo que se quiere
  // proteger es exactamente el string de clases.
  it("la lupa, la hamburguesa y el ✕ del drawer piden 44×44 y llevan aria-label", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(resolve(process.cwd(), "src/components/AppHeader.tsx"), "utf8");

    // Ningún botón del header móvil puede volver a los 40×40 de antes.
    expect(src).not.toMatch(/className="sm:hidden w-10 h-10/);
    expect(src).not.toMatch(/<button[^>]*className="w-10 h-10/);

    for (const etiqueta of ["Buscar", "Abrir menú de módulos", "Cerrar menú"]) {
      expect(src).toContain(`aria-label="${etiqueta}"`);
    }

    // La campana ya NO se estira desde acá con selectores arbitrarios: el
    // tamaño lo decide NotificationCenter, que es quien dibuja el botón. Y
    // desde 30-jul-2026 tampoco hay que PEDÍRSELO: es 44×44 siempre.
    expect(src).not.toContain("[&>div>button]:min-w-[44px]");
    expect(src).not.toContain('size="tactil"');
    expect((src.match(/<NotificationCenter \/>/g) ?? []).length).toBe(2);
  });

  it("el botón Salir del drawer es táctil (el drawer es 100% móvil)", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(resolve(process.cwd(), "src/components/AppHeader.tsx"), "utf8");
    expect(botonDe(src, "Salir")).toMatch(/min-h-\[44px\][\s\S]*min-w-\[44px\]|min-w-\[44px\][\s\S]*min-h-\[44px\]/);
  });
});

describe("NotificationCenter — la campana decide su propio tamaño", () => {
  // La deuda que cerró la segunda vuelta: el tamaño vivía en AppHeader como
  // `[&>div>button]:min-w-[44px]` + un reposicionamiento del punto rojo. Andaba,
  // pero cualquier cambio acá adentro lo rompía en silencio desde otro archivo.
  // Eso sigue igual: el tamaño lo decide este componente.
  //
  // 🩸 30-jul-2026 — LO QUE CAMBIÓ: ya no hay DOS tamaños, hay uno solo de
  // 44×44. El "compacto" de 24×24 existía para el header de escritorio, con el
  // argumento de que ahí se apunta con el mouse. El argumento se cae con la
  // medición: ese header aparece desde `sm` (640 px), así que **el iPad lo
  // muestra y la campana se toca con el dedo** — medida en el navegador daba
  // 24×24 a 834 y a 1024. "Escritorio" no es una pantalla grande, es un
  // puntero fino, y a 834 no hay ninguno.
  //
  // Y no costó layout: la fila del header ya mide `h-11` = 44 px, así que el
  // botón entra exacto. Verificado en el navegador: la barra de migas y la
  // fila del header conservan su alto a los 4 anchos.
  const leer = async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    return readFileSync(resolve(process.cwd(), "src/components/NotificationCenter.tsx"), "utf8");
  };

  it("la campana pide 44×44 SIEMPRE, sin tamaño que negociar", async () => {
    const src = await leer();
    expect(src).toContain("min-w-[44px] min-h-[44px]");
    // ya no hay una variante chica que alguien pueda volver a elegir
    expect(src).not.toMatch(/size\?:\s*"compacta"/);
    expect(src).not.toMatch(/size = "compacta"/);
    expect(src).not.toContain("const tactil =");
  });

  it("no queda ninguna campana de 24×24 (el `p-1` del header de escritorio)", async () => {
    const src = await leer();
    expect(src).not.toMatch(/hover:bg-gray-50[\s\S]{0,40}"p-1"/);
  });

  it("el punto rojo se ancla al ÍCONO y no se va a la esquina del botón", async () => {
    const src = await leer();
    // En 44×44 las esquinas quedan lejos del ícono de 16px.
    expect(src).toContain("absolute top-2 right-2 w-2.5 h-2.5 bg-red-500");
    expect(src).not.toContain("-top-0.5 -right-0.5");
  });

  it("la campana tiene nombre accesible, no solo title", async () => {
    const src = await leer();
    expect(src).toContain('aria-label="Notificaciones"');
  });
});

describe("Encabezado global — los controles que salen en las 54 pantallas", () => {
  // 🩸 POR QUÉ ACÁ Y NO EN CADA MÓDULO. Cada censo de módulo terminaba con los
  // mismos hallazgos que NO eran del módulo: viven en el encabezado y salen en
  // todas las pantallas. Medido a 834 px (iPad, dedo) antes de esto:
  //
  //   buscador ⌘K        59×28
  //   campana            24×24
  //   cerrar sesión      22×22
  //   miga "Inicio"      33×18
  //
  // Los 4 se esconden por debajo de `sm` (640), o sea que el ancho donde se
  // ven es exactamente el ancho donde se tocan con el dedo.
  const leerSrc = async (rel: string) => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    return readFileSync(resolve(process.cwd(), rel), "utf8");
  };

  it("el buscador ⌘K del header llega a 44 de alto (medía 28)", async () => {
    const src = await leerSrc("src/components/SearchBar.tsx");
    expect(src).toContain('className="text-gray-400 hover:text-black transition min-h-[44px] px-2 rounded-lg');
    expect(src).not.toContain("hover:text-black transition p-1 rounded-lg");
    // y tiene nombre accesible, no solo title
    expect(src).toContain('aria-label="Buscar"');
  });

  it("el Cerrar sesión del header de escritorio llega a 44×44 (medía 22×22)", async () => {
    const src = await leerSrc("src/components/AppHeader.tsx");
    expect(src).toContain('title="Cerrar sesión" aria-label="Cerrar sesión" className="inline-flex h-11 w-11 items-center justify-center');
    expect(src).not.toContain('title="Cerrar sesión" className="text-gray-300 hover:text-gray-600 transition p-1"');
  });

  it("las migas llegan a 44 de alto SIN estirar la barra (el -my-3 la devuelve)", async () => {
    const src = await leerSrc("src/components/AppHeader.tsx");
    // El área táctil crece hacia afuera y el margen negativo la reabsorbe: la
    // barra conserva su `py-1` de siempre y el escritorio no cambia de alto.
    expect(src).toContain('className="-my-[13px] inline-flex min-h-[44px] min-w-[44px] items-center justify-center hover:text-gray-700 hover:underline transition cursor-pointer"');
    expect(src).not.toContain('className="hover:text-gray-700 hover:underline transition cursor-pointer"');
    expect(src).toContain('className="hidden sm:flex flex-wrap px-6 py-1');
  });
});

describe("/home — el encabezado propio, que no pasa por AppHeader", () => {
  // /home NO usa AppHeader: tiene su propio encabezado, así que los 44×44 de la
  // primera vuelta nunca llegaron acá. Medido en 390×844: "Modo oscuro" 22×21 y
  // "Salir" 29×21 — los dos targets más chicos de toda la app, en la primera
  // pantalla que ve todo el mundo al entrar.
  const leer = async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    return readFileSync(resolve(process.cwd(), "src/app/home/page.tsx"), "utf8");
  };

  it("el botón de modo oscuro usa IconButton (44×44 garantizados)", async () => {
    const src = await leer();
    expect(src).toContain('import IconButton from "@/components/IconButton"');
    expect(src).toMatch(/<IconButton[\s\S]*?label=\{darkMode \? "Modo claro" : "Modo oscuro"\}/);
  });

  it("el botón Salir del home pide 44×44", async () => {
    const src = await leer();
    expect(botonDe(src, "Salir")).toMatch(/min-h-\[44px\][\s\S]*min-w-\[44px\]|min-w-\[44px\][\s\S]*min-h-\[44px\]/);
  });

  it("ninguno de los dos vuelve al px-1 suelto de antes", async () => {
    const src = await leer();
    expect(src).not.toContain('className="text-sm text-gray-400 hover:text-black transition px-1"');
  });
});
