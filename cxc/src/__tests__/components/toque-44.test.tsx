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
    // tamaño se le pide a NotificationCenter, que es quien dibuja el botón.
    expect(src).not.toContain("[&>div>button]:min-w-[44px]");
    expect(src).toContain('<NotificationCenter size="tactil" />');
  });

  it("el botón Salir del drawer es táctil (el drawer es 100% móvil)", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(resolve(process.cwd(), "src/components/AppHeader.tsx"), "utf8");
    expect(botonDe(src, "Salir")).toMatch(/min-h-\[44px\][\s\S]*min-w-\[44px\]|min-w-\[44px\][\s\S]*min-h-\[44px\]/);
  });
});

describe("NotificationCenter — la campana decide su propio tamaño", () => {
  // La deuda que cerró esta segunda vuelta: el tamaño vivía en AppHeader como
  // `[&>div>button]:min-w-[44px]` + un reposicionamiento del punto rojo. Andaba,
  // pero cualquier cambio acá adentro lo rompía en silencio desde otro archivo.
  const leer = async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    return readFileSync(resolve(process.cwd(), "src/components/NotificationCenter.tsx"), "utf8");
  };

  it("acepta un tamaño y el táctil pide 44×44", async () => {
    const src = await leer();
    expect(src).toMatch(/size\?:\s*"compacta"\s*\|\s*"tactil"/);
    expect(src).toContain("min-w-[44px] min-h-[44px]");
  });

  it("el default sigue siendo la campana chica del escritorio", async () => {
    const src = await leer();
    expect(src).toMatch(/size = "compacta"/);
  });

  it("el punto rojo se reancla en modo táctil y no se va a la esquina", async () => {
    const src = await leer();
    // En 44×44 las esquinas quedan lejos del ícono de 16px.
    expect(src).toMatch(/tactil \? "top-2 right-2" : "-top-0\.5 -right-0\.5"/);
  });

  it("la campana tiene nombre accesible, no solo title", async () => {
    const src = await leer();
    expect(src).toContain('aria-label="Notificaciones"');
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
