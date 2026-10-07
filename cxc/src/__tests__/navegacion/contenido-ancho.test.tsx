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
//   5. (2-oct-2026, Daniel: «no quiero dos columnas… ¿agrandar la letra?»)
//      Formularios y fichas van en UNA columna centrada que ESCALA con la
//      pantalla (16/14 desde 1280 px, 18/14 desde 1600; 820 → 960 → 1100 px).
//      Las 2 columnas quedan guardadas detrás de `DOS_COLUMNAS_2026_10`, apagado.
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
const GUIA_FORM = readFileSync(join(SRC, "app/despachos/components/GuiaForm.tsx"), "utf8");
const GUIA_DETALLE = readFileSync(join(SRC, "app/despachos/[id]/page.tsx"), "utf8");

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

describe("contenido ancho: la regla de las listas en globals.css", () => {
  const bloque = bloqueDeLaRegla();

  it("vive SOLO en pantalla desde 768 px: en el celular y en el papel no cambia nada", () => {
    expect(bloque.startsWith("@media screen and (min-width: 768px)")).toBe(true);
    // Toda regla con `.contenido-ancho` vive dentro de un `@media screen and (min-width: …)`
    // de 768 px o más.
    const medias = [...CSS.matchAll(/@media ([^{]*)\{/g)];
    let i = CSS.indexOf(".contenido-ancho");
    while (i !== -1) {
      const previa = medias.filter((m) => (m.index ?? 0) < i).pop();
      expect(previa?.[1]).toMatch(/^screen and \(min-width: (768|1280|1600)px\)\s*$/);
      i = CSS.indexOf(".contenido-ancho", i + 1);
    }
  });

  it("la caja de una lista llega a 1600 px con 24 px a cada lado, y no las de adentro, las de un modal ni las columnas que escalan", () => {
    expect(bloque).toMatch(/:not\(\.mx-auto\[class\*="max-w-"\] \*\):not\(\.fixed \*\):not\(\.columna-que-escala\)\s*\{[^}]*max-width:\s*1600px;[^}]*padding-left:\s*24px;[^}]*padding-right:\s*24px;/);
    // Centrada: la regla no toca los márgenes, así que `mx-auto` sigue centrando.
    expect(bloque).not.toMatch(/margin-(left|right)/);
  });

  it("de max-w-4xl para arriba se ensancha; max-w-3xl o menos (formularios de una columna) no", () => {
    const anchos = bloque.match(/:is\(([^)]*\])\)/)?.[1] ?? "";
    for (const w of ["max-w-4xl", "max-w-5xl", "max-w-6xl", "max-w-7xl", "max-w-[1280px]"]) expect(anchos).toContain(`"${w}"`);
    for (const w of ["max-w-3xl", "max-w-2xl", "max-w-xl", "max-w-md"]) expect(anchos).not.toContain(`"${w}"`);
  });
});

describe("contenido ancho: formularios y fichas en UNA columna que escala", () => {
  const escala = (min: number) => {
    const i = CSS.indexOf(`@media screen and (min-width: ${min}px) {\n  .contenido-ancho {`);
    expect(i).toBeGreaterThan(-1);
    return CSS.slice(i, CSS.indexOf("}", i) + 1);
  };

  it("UNA escala compartida: 1 hasta 1279 px, 16/14 desde 1280 y 18/14 desde 1600; la columna 820 → 960 → 1100", () => {
    expect(escala(768)).toMatch(/--escala-contenido:\s*1;[^}]*--ancho-columna:\s*820px;/);
    expect(escala(1280)).toMatch(/--escala-contenido:\s*1\.143;[^}]*--ancho-columna:\s*960px;/);
    expect(escala(1600)).toMatch(/--escala-contenido:\s*1\.286;[^}]*--ancho-columna:\s*1100px;/);
  });

  it("la columna se centra, mide lo que dice la escala y escala todo junto", () => {
    expect(CSS).toMatch(/\.contenido-ancho \.columna-que-escala \{[^}]*max-width:\s*calc\(var\(--ancho-columna\) \/ var\(--escala-contenido\)\);[^}]*margin-left:\s*auto;[^}]*margin-right:\s*auto;[^}]*zoom:\s*var\(--escala-contenido\);/);
    expect(CSS).toMatch(/\.contenido-ancho \.panel-que-escala \{[^}]*zoom:\s*var\(--escala-contenido\);/);
  });

  it("la llevan, solo con el interruptor, Nueva guía, detalle de guía, ficha de cliente, colaborador y Nuevo gasto", () => {
    const leer = (p: string) => readFileSync(join(SRC, p), "utf8");
    expect(GUIA_FORM).toContain("${escala ? ` ${CLASE_COLUMNA_QUE_ESCALA}` : \"\"}");
    expect(GUIA_FORM).toMatch(/const escala = CONTENIDO_ANCHO_2026_10;/);
    expect(GUIA_DETALLE).toMatch(/const escala = CONTENIDO_ANCHO_2026_10 \? ` \$\{CLASE_COLUMNA_QUE_ESCALA\}` : "";/);
    expect(leer("app/clientes/[codigo]/ClienteDetail.tsx")).toContain("${CONTENIDO_ANCHO_2026_10 ? ` ${CLASE_COLUMNA_QUE_ESCALA}` : \"\"}");
    expect(leer("app/asistencia/colaboradores/PersonaPagina.tsx")).toContain("${CONTENIDO_ANCHO_2026_10 ? ` ${CLASE_COLUMNA_QUE_ESCALA}` : \"\"}");
    expect(leer("app/caja/components/NuevoGastoDrawer.tsx")).toContain("escala={CONTENIDO_ANCHO_2026_10}");
    const drawer = leer("components/Drawer.tsx");
    expect(drawer).toContain("escala = false }: DrawerProps");
    expect(drawer).toContain("${escala ? ` ${CLASE_PANEL_QUE_ESCALA}` : \"\"}");
  });

  it("las listas (CxC) NO la llevan: siguen a todo el ancho", () => {
    expect(readFileSync(join(SRC, "app/cxc/page.tsx"), "utf8")).not.toContain("CLASE_COLUMNA_QUE_ESCALA");
  });
});

describe("las 2 columnas (tipos b y c): guardadas detrás de su propio interruptor, APAGADO", () => {
  it("DOS_COLUMNAS_2026_10 se commitea apagado", async () => {
    const { DOS_COLUMNAS_2026_10 } = await vi.importActual<typeof import("@/lib/navegacion/contenido-ancho")>("@/lib/navegacion/contenido-ancho");
    expect(DOS_COLUMNAS_2026_10).toBe(false);
  });

  it("son SOLO clases desde 1024 px (`lg:`): en el celular el orden y el aire son los de siempre", () => {
    for (const clase of `${real.DOS_COLUMNAS} ${real.EN_LA_DERECHA} ${real.CAMPOS_A_SU_ANCHO} ${real.BLOQUES_DE_A_DOS}`.split(/\s+/)) {
      expect(clase.startsWith("lg:")).toBe(true);
    }
  });

  it("cuelgan de DOS_COLUMNAS_2026_10, no del interruptor del ancho", () => {
    const leer = (p: string) => readFileSync(join(SRC, p), "utf8");
    expect(GUIA_FORM).toMatch(/const ancho = DOS_COLUMNAS_2026_10;/);
    expect(GUIA_FORM).toContain('className={ancho || escala ? undefined : `max-w-[820px]${ESCALA_PANTALLA_2026_10 ? " mx-auto" : ""}`}');
    expect(GUIA_FORM).toMatch(/ancho \? <div className=\{DOS_COLUMNAS\} data-dos-columnas>\{nodo\}<\/div> : nodo/);
    expect(GUIA_DETALLE).toMatch(/const ancho = DOS_COLUMNAS_2026_10;/);
    expect(GUIA_DETALLE).toContain('className={ancho ? `space-y-4 ${DOS_COLUMNAS}` : "space-y-4"}');
    const cliente = leer("app/clientes/[codigo]/ClienteDetail.tsx");
    expect(cliente).toMatch(/const ancho = DOS_COLUMNAS_2026_10;/);
    expect(cliente).toMatch(/ancho \? <div className=\{DETALLE_Y_PAGOS\} data-dos-columnas>\{nodo\}<\/div> : nodo/);
    expect(leer("app/asistencia/colaboradores/FichaTexto.tsx")).toContain('sm:grid-cols-3${DOS_COLUMNAS_2026_10 ? ` ${CAMPOS_A_SU_ANCHO}` : ""}');
    expect(leer("app/asistencia/colaboradores/PersonaPagina.tsx")).toMatch(/DOS_COLUMNAS_2026_10 \? <div className=\{`space-y-4 \$\{BLOQUES_DE_A_DOS\}`\} data-dos-columnas>/);
    const nuevo = leer("app/caja/components/NuevoGastoDrawer.tsx");
    expect(nuevo).toContain("ancho={DOS_COLUMNAS_2026_10}");
    expect(nuevo).toContain("dosColumnas={DOS_COLUMNAS_2026_10}");
    const drawer = leer("components/Drawer.tsx");
    expect(drawer).toContain("ancho = false, escala = false }: DrawerProps");
    expect(drawer).toContain('${ancho ? "lg:w-[min(960px,75vw)]" : "lg:w-[480px]"}');
    const form = leer("app/caja/components/GastoForm.tsx");
    expect(form).toContain("dosColumnas = false,");
    expect(form).toContain('className={dosColumnas ? "lg:grid lg:grid-cols-2 lg:gap-x-10 lg:items-start" : undefined}');
  });
});
