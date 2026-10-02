// ============================================================================
// 🔴 EL CONTENIDO USA EL ANCHO DE LA PANTALLA, CENTRADO (2-oct-2026,
// `CONTENIDO_ANCHO_2026_10`).
//
// Daniel, 2-oct-2026: «lo prefiero centrado que a la izquierda, pero ¿se podrá
// que no exista el espacio en blanco como los ERP?».
//
// Lo que este candado congela:
//   1. Apagado (el valor del commit), todo queda como hoy: el contenedor común
//      NO lleva la clase y Nueva guía / detalle de guía no dibujan 2 columnas.
//   2. Prendido, la clase sale de UN solo lugar (`SidebarAwareMain`) y la regla
//      de `globals.css` lleva la caja de cada pantalla (de max-w-4xl para
//      arriba) a 1600 px con 24 px a cada lado; max-w-3xl o menos no se toca.
//   3. En el celular no cambia nada: la regla vive SOLO en pantalla desde
//      768 px, y las 2 columnas son SOLO clases `lg:`.
//   4. Las rutas sin barra lateral (catálogo, pedidos públicos) no la llevan.
// ============================================================================

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { readFileSync } from "fs";
import { join } from "path";

const nav = vi.hoisted(() => ({ ruta: "/guias/abc" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => nav.ruta,
  useSearchParams: () => new URLSearchParams(""),
}));

const sw = vi.hoisted(() => ({ prendido: false }));
vi.mock("@/lib/navegacion/contenido-ancho", async (original) => {
  const real = await original<typeof import("@/lib/navegacion/contenido-ancho")>();
  return { ...real, get CONTENIDO_ANCHO_2026_10() { return sw.prendido; } };
});

vi.mock("@/lib/hooks/useSidebarCollapsed", () => ({
  useSidebarCollapsed: () => true,
  readSidebarCollapsed: () => true,
  writeSidebarCollapsed: () => {},
}));

import { SidebarAwareMain } from "@/components/Sidebar";
import * as real from "@/lib/navegacion/contenido-ancho";

const SRC = join(__dirname, "../..");
const CSS = readFileSync(join(SRC, "app/globals.css"), "utf8");
const GUIA_FORM = readFileSync(join(SRC, "app/guias/components/GuiaForm.tsx"), "utf8");
const GUIA_DETALLE = readFileSync(join(SRC, "app/guias/[id]/page.tsx"), "utf8");

function envoltorio(): HTMLElement {
  const { container } = render(<SidebarAwareMain><p>contenido</p></SidebarAwareMain>);
  return container.firstElementChild as HTMLElement;
}

/** El bloque `@media … { … }` que contiene la regla. */
function bloqueDeLaRegla(): string {
  const i = CSS.indexOf(".contenido-ancho");
  const abre = CSS.lastIndexOf("@media", i);
  let nivel = 0;
  for (let j = CSS.indexOf("{", abre); j < CSS.length; j++) {
    if (CSS[j] === "{") nivel++;
    if (CSS[j] === "}" && --nivel === 0) return CSS.slice(abre, j + 1);
  }
  return "";
}

afterEach(() => { cleanup(); sw.prendido = false; nav.ruta = "/guias/abc"; });

describe("contenido ancho: el interruptor", () => {
  it("se commitea APAGADO", async () => {
    const { CONTENIDO_ANCHO_2026_10 } = await vi.importActual<typeof import("@/lib/navegacion/contenido-ancho")>("@/lib/navegacion/contenido-ancho");
    expect(CONTENIDO_ANCHO_2026_10).toBe(false);
  });

  it("apagado: el contenedor común queda como hoy, sin la clase", () => {
    const el = envoltorio();
    expect(el.className).not.toContain(real.CLASE_CONTENIDO_ANCHO);
    expect(el.className).toMatch(/md:ml-(16|56)/);
  });

  it("prendido: el contenedor común lleva la clase", () => {
    sw.prendido = true;
    expect(envoltorio().className.split(/\s+/)).toContain(real.CLASE_CONTENIDO_ANCHO);
  });

  it("prendido: una ruta sin barra lateral no la lleva", () => {
    sw.prendido = true;
    nav.ruta = "/catalogo-publico/reebok";
    expect(envoltorio().className).not.toContain(real.CLASE_CONTENIDO_ANCHO);
  });
});

describe("contenido ancho: la regla de globals.css", () => {
  const bloque = bloqueDeLaRegla();

  it("vive SOLO en pantalla desde 768 px: en el celular y en el papel no cambia nada", () => {
    expect(bloque.startsWith("@media screen and (min-width: 768px)")).toBe(true);
    expect(CSS.replace(bloque, "")).not.toContain(".contenido-ancho");
  });

  it("la caja de la pantalla llega a 1600 px con 24 px a cada lado, y no las de adentro ni las de un modal", () => {
    expect(bloque).toMatch(/:not\(\.mx-auto\[class\*="max-w-"\] \*\):not\(\.fixed \*\)\s*\{[^}]*max-width:\s*1600px;[^}]*padding-left:\s*24px;[^}]*padding-right:\s*24px;/);
    // Centrada: la regla no toca los márgenes, así que `mx-auto` sigue centrando.
    expect(bloque).not.toMatch(/margin-(left|right)/);
  });

  it("de max-w-4xl para arriba se ensancha; max-w-3xl o menos (formularios de una columna) no", () => {
    const anchos = bloque.match(/:is\(([^)]*\])\)/)?.[1] ?? "";
    for (const w of ["max-w-4xl", "max-w-5xl", "max-w-6xl", "max-w-7xl", "max-w-[1280px]"]) expect(anchos).toContain(`"${w}"`);
    for (const w of ["max-w-3xl", "max-w-2xl", "max-w-xl", "max-w-md"]) expect(anchos).not.toContain(`"${w}"`);
  });
});

describe("contenido ancho: las 2 columnas de Nueva guía y del detalle de guía", () => {
  it("son SOLO clases desde 1024 px (`lg:`): en el celular el orden y el aire son los de siempre", () => {
    for (const clase of `${real.DOS_COLUMNAS} ${real.EN_LA_DERECHA}`.split(/\s+/)) {
      expect(clase.startsWith("lg:")).toBe(true);
    }
  });

  it("apagado, Nueva guía conserva su formulario de 820 px y no envuelve nada", () => {
    expect(GUIA_FORM).toContain('className={ancho ? undefined : "max-w-[820px]"}');
    expect(GUIA_FORM).toMatch(/ancho \? <div className=\{DOS_COLUMNAS\} data-dos-columnas>\{nodo\}<\/div> : nodo/);
    expect(GUIA_FORM).toMatch(/ancho \? <div className=\{`\$\{EN_LA_DERECHA\} lg:pt-4`\}>\{nodo\}<\/div> : nodo/);
    expect(GUIA_FORM).toMatch(/const ancho = CONTENIDO_ANCHO_2026_10;/);
  });

  it("tipo c (fichas y formularios): también SOLO clases desde 1024 px", () => {
    for (const clase of `${real.CAMPOS_A_SU_ANCHO} ${real.BLOQUES_DE_A_DOS}`.split(/\s+/)) {
      expect(clase.startsWith("lg:")).toBe(true);
    }
  });

  it("tipo c, apagado: ficha de cliente, ficha de colaborador y Nuevo gasto quedan como hoy", () => {
    const leer = (p: string) => readFileSync(join(SRC, p), "utf8");
    const cliente = leer("app/clientes/[codigo]/ClienteDetail.tsx");
    expect(cliente).toMatch(/ancho \? <div className=\{DETALLE_Y_PAGOS\} data-dos-columnas>\{nodo\}<\/div> : nodo/);
    expect(cliente).toContain('sm:grid-cols-3 gap-y-3 gap-x-6 text-sm${ancho ? " lg:grid-cols-');
    expect(cliente).toMatch(/const ancho = CONTENIDO_ANCHO_2026_10;/);
    const ficha = leer("app/asistencia/colaboradores/FichaTexto.tsx");
    expect(ficha).toContain('sm:grid-cols-3${CONTENIDO_ANCHO_2026_10 ? ` ${CAMPOS_A_SU_ANCHO}` : ""}');
    const persona = leer("app/asistencia/colaboradores/PersonaPagina.tsx");
    expect(persona).toMatch(/CONTENIDO_ANCHO_2026_10 \? <div className=\{`space-y-4 \$\{BLOQUES_DE_A_DOS\}`\} data-dos-columnas>\{nodo\}<\/div> : nodo/);
    const drawer = leer("components/Drawer.tsx");
    expect(drawer).toContain("ancho = false }: DrawerProps");
    expect(drawer).toContain('${ancho ? "lg:w-[min(960px,75vw)]" : "lg:w-[480px]"}');
    const form = leer("app/caja/components/GastoForm.tsx");
    expect(form).toContain("dosColumnas = false,");
    expect(form).toContain('className={dosColumnas ? "lg:grid lg:grid-cols-2 lg:gap-x-10 lg:items-start" : undefined}');
    const nuevo = leer("app/caja/components/NuevoGastoDrawer.tsx");
    expect(nuevo).toContain("ancho={CONTENIDO_ANCHO_2026_10}");
    expect(nuevo).toContain("dosColumnas={CONTENIDO_ANCHO_2026_10}");
  });

  it("apagado, el detalle de guía conserva su caja de una columna", () => {
    expect(GUIA_DETALLE).toContain('className={ancho ? `space-y-4 ${DOS_COLUMNAS}` : "space-y-4"}');
    expect(GUIA_DETALLE).toMatch(/ancho \? <div className=\{EN_LA_DERECHA\}>\{nodo\}<\/div> : nodo/);
    expect(GUIA_DETALLE).toMatch(/const ancho = CONTENIDO_ANCHO_2026_10;/);
  });
});
