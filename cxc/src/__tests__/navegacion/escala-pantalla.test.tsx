// ============================================================================
// 🔴 TODO CRECE EN PROPORCIÓN CON LA PANTALLA, NADA SE ESTIRA (2-oct-2026, v3,
// `ESCALA_PANTALLA_2026_10`).
//
// Daniel: «se ve peor así alargado, ¿no es mejor agrandarlo?» (la lista de CxC
// a todo el ancho) y «no va con el sistema» (el panel con su propia escala).
//
// Lo que este candado congela:
//   1. Apagado (el valor del commit), todo queda como hoy: el contenedor común
//      no lleva la clase.
//   2. Prendido, la clase sale de UN solo lugar (`SidebarAwareMain`) y la
//      escala va a la RAÍZ: 15/14 desde 1280 px, 16/14 desde 1600, 18/14 desde
//      1920; nada debajo de 1280 (el celular no cambia).
//   3. Lo flotante que MIDE y ESCRIBE posiciones divide entre la escala
//      (`escala-raiz.ts`): sin eso, el menú del usuario quedaba 101 px corrido
//      en 1440 y fuera de la pantalla en 1920.
//   4. El modo «tablas a todo el ancho» y las 2 columnas quedan apagados.
// ============================================================================

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { readFileSync } from "fs";
import { join } from "path";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/cxc",
  useSearchParams: () => new URLSearchParams(""),
}));

const sw = vi.hoisted(() => ({ prendido: false }));
vi.mock("@/lib/navegacion/escala-pantalla", async (original) => {
  const real = await original<typeof import("@/lib/navegacion/escala-pantalla")>();
  return { ...real, get ESCALA_PANTALLA_2026_10() { return sw.prendido; } };
});

vi.mock("@/lib/hooks/useSidebarCollapsed", () => ({
  useSidebarCollapsed: () => true,
  readSidebarCollapsed: () => true,
  writeSidebarCollapsed: () => {},
}));

import { SidebarAwareMain } from "@/components/Sidebar";
import { CLASE_ESCALA_PANTALLA } from "@/lib/navegacion/escala-pantalla";
import { aPxDeEstilo, escalaRaiz } from "@/lib/ui/escala-raiz";

const SRC = join(__dirname, "../..");
const leer = (p: string) => readFileSync(join(SRC, p), "utf8");
const CSS = leer("app/globals.css");

function envoltorio(): HTMLElement {
  const { container } = render(<SidebarAwareMain><p>contenido</p></SidebarAwareMain>);
  return container.firstElementChild as HTMLElement;
}

/** El bloque `@media screen and (min-width: N px) { html:has(.escala-pantalla) { … } }`. */
function escalaDesde(min: number): string {
  const i = CSS.indexOf(`@media screen and (min-width: ${min}px) {\n  html:has(.escala-pantalla) {`);
  if (i === -1) return "";
  return CSS.slice(i, CSS.indexOf("}", i) + 1);
}

afterEach(() => { cleanup(); sw.prendido = false; });

describe("escala de la pantalla: el interruptor", () => {
  it("se commitea APAGADO, y las versiones anteriores también", async () => {
    const e = await vi.importActual<typeof import("@/lib/navegacion/escala-pantalla")>("@/lib/navegacion/escala-pantalla");
    expect(e.ESCALA_PANTALLA_2026_10).toBe(false);
    const c = await vi.importActual<typeof import("@/lib/navegacion/contenido-ancho")>("@/lib/navegacion/contenido-ancho");
    expect(c.CONTENIDO_ANCHO_2026_10).toBe(false);
    expect(c.DOS_COLUMNAS_2026_10).toBe(false);
  });

  it("apagado: el contenedor común queda como hoy", () => {
    expect(envoltorio().className).not.toContain(CLASE_ESCALA_PANTALLA);
  });

  it("prendido: la clase sale del contenedor común", () => {
    sw.prendido = true;
    expect(envoltorio().className.split(/\s+/)).toContain(CLASE_ESCALA_PANTALLA);
  });
});

describe("escala de la pantalla: la regla de globals.css", () => {
  it("UNA escala en la raíz: 15/14 desde 1280, 16/14 desde 1600 y 18/14 desde 1920", () => {
    expect(escalaDesde(1280)).toMatch(/--escala-pantalla:\s*1\.0714;\s*zoom:\s*var\(--escala-pantalla\);/);
    expect(escalaDesde(1600)).toMatch(/--escala-pantalla:\s*1\.1429;/);
    expect(escalaDesde(1920)).toMatch(/--escala-pantalla:\s*1\.2857;/);
  });

  it("nada debajo de 1280 px ni fuera de la pantalla: el celular y el papel no cambian", () => {
    let i = CSS.indexOf(".escala-pantalla");
    expect(i).toBeGreaterThan(-1);
    const medias = [...CSS.matchAll(/@media ([^{]*)\{/g)];
    while (i !== -1) {
      const previa = medias.filter((m) => (m.index ?? 0) < i).pop();
      expect(previa?.[1]).toMatch(/^screen and \(min-width: (1280|1600|1920)px\)\s*$/);
      i = CSS.indexOf(".escala-pantalla", i + 1);
    }
  });
});

describe("escala de la pantalla: lo flotante queda en su lugar", () => {
  it("lo medido en la pantalla se divide entre la escala antes de escribirlo", () => {
    expect(aPxDeEstilo(1414, 1.0714)).toBeCloseTo(1319.77, 1);
    expect(aPxDeEstilo(300, 1)).toBe(300);
    // Fuera de una escala (jsdom, celular), la raíz vale 1.
    expect(escalaRaiz()).toBe(1);
  });

  it("los que miden y escriben posiciones pasan por escala-raiz", () => {
    const desplegable = leer("components/ui/DesplegableFlotante.tsx");
    expect(desplegable).toMatch(/const z = escalaRaiz\(\);/);
    expect(desplegable).toContain("{ top: r.top / z, bottom: r.bottom / z, left: r.left / z, width: r.width / z }");
    expect(desplegable).toContain("{ width: window.innerWidth / z, height: window.innerHeight / z }");
    const menu = leer("components/ui/OverflowMenu.tsx");
    expect(menu).toMatch(/const z = escalaRaiz\(\);/);
    expect(menu).toContain("window.innerHeight / z");
    expect(leer("lib/hooks/usePublicarAlturaEncabezado.ts")).toContain("aPxDeEstilo(el.getBoundingClientRect().height)");
    expect(leer("lib/navegacion/useBarraFijaAbajo.ts")).toContain("aPxDeEstilo(el.getBoundingClientRect().height)");
    expect(leer("components/Sidebar.tsx")).toContain("aPxDeEstilo(e.currentTarget.getBoundingClientRect().top)");
  });
});
