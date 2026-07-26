// Mínimo táctil de 44×44: los botones de solo ícono que Daniel usa desde el
// iPhone. jsdom no hace layout (todo mide 0×0), así que acá se verifica el
// CONTRATO de clases y de accesibilidad, que es lo que se rompe cuando alguien
// agrega un botón nuevo. La medición real en píxeles se hizo con el navegador
// emulando 390×844 y quedó en el PR.

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import IconButton from "@/components/IconButton";

afterEach(cleanup);

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

    // Y la campana (que vive en NotificationCenter) se estira desde acá.
    expect(src).toContain("[&>div>button]:min-w-[44px]");
    expect(src).toContain("[&>div>button]:min-h-[44px]");
  });
});
