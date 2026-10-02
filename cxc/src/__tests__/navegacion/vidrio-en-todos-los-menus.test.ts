// ============================================================================
// 🔴 TODOS LOS DESPLEGABLES Y MENÚS SON DE VIDRIO (2-oct-2026).
//
// Daniel, mirando el menú de los chips del catálogo («Todos / Women ✓ /
// Men…»): *«estos despliegues te dije que tienen que ser liquid glass como iOS,
// todos»*. Se veían blancos y sólidos.
//
// Lo que este candado congela:
//   1. La receta es UNA (`.vidrio` en globals.css) y se NOTA: blanco al 55 %,
//      desenfoque de 20 a 24 px con saturación al 180 %, borde blanco/40 por
//      dentro, sombra amplia y texto oscuro. Sin `backdrop-filter`, blanco/95.
//   2. UNA sola fuente en código: `lib/ui/vidrio.ts` (`vidrioSobre`, `VIDRIO`,
//      `conVidrio`). La otra rama que armó su propia `VIDRIO` usa ésta.
//   3. BARRIDO: todo archivo que dibuja un menú o una lista desplegable
//      (`role="menu"`, `role="listbox"`, `aria-haspopup="menu|listbox|true"`)
//      tiene que pasar por el vidrio, directo o a través de una pieza que ya lo
//      hace (DesplegableFlotante, OverflowMenu, el Select del sistema, las hojas
//      de la barra). Un menú nuevo sin vidrio pone el build ROJO.
//   4. Los `<select>` NATIVOS quedan como están: en el iPhone abren el menú de
//      iOS, que en iOS 26 ya es liquid glass.
// ============================================================================

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { CLASE_VIDRIO, RADIO_VIDRIO, VIDRIO, VIDRIO_2026_10, vidrioSobre } from "@/lib/ui/vidrio";

const SRC = join(__dirname, "../..");
const leer = (r: string) => readFileSync(join(SRC, r), "utf8");

function archivos(dir: string): string[] {
  const out: string[] = [];
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) {
      if (n === "__tests__" || n === "node_modules") continue;
      out.push(...archivos(p));
    } else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

/** Las piezas que ya ponen el vidrio por dentro: usarlas alcanza. */
const PIEZAS_CON_VIDRIO = /lib\/ui\/vidrio|DesplegableFlotante|OverflowMenu|components\/ui\/select|HojaCel|EnLaBarra|BarraDeControles/;

/**
 * Lo que NO necesita vidrio propio, con su porqué. Cada excepción se escribe
 * aquí con nombre; nunca se agrega una sin decir dónde ya hay vidrio.
 */
const EXCEPCIONES: Record<string, string> = {
  // Solo es el CONTENIDO del menú: lo envuelve el panel de vidrio de cxc/page,
  // CarteraBoston o la hoja del celular.
  "app/cxc/components/MenuDescargar.tsx": "contenido dentro de un panel que ya es vidrio",
};

describe("la receta del vidrio se nota", () => {
  const css = leer("app/globals.css");
  const bloque = css.slice(css.indexOf("\n.vidrio {"), css.indexOf("}", css.indexOf("\n.vidrio {")) + 1);

  it("blanco al 55 %, desenfoque 20–24 px con saturate(180 %)", () => {
    expect(bloque).toMatch(/background-color: rgb\(255 255 255 \/ 0\.55\)/);
    const blur = Number(bloque.match(/backdrop-filter: blur\((\d+)px\) saturate\(180%\)/)?.[1]);
    expect(blur).toBeGreaterThanOrEqual(20);
    expect(blur).toBeLessThanOrEqual(24);
    expect(bloque).toMatch(/-webkit-backdrop-filter: blur\(\d+px\) saturate\(180%\)/);
  });

  it("borde blanco/40 por dentro, sombra amplia y texto oscuro (legible)", () => {
    expect(bloque).toMatch(/inset 0 0 0 1px rgb\(255 255 255 \/ 0\.4\)/);
    expect(bloque).toMatch(/0 16px 48px/);
    expect(bloque).toMatch(/color: rgb\(17 24 39\)/);
  });

  it("sin backdrop-filter cae a blanco/95, nunca a un fondo que deje leer lo de atrás", () => {
    expect(css).toMatch(/@supports not \(\(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\)\) \{\s*\.vidrio \{\s*background-color: rgb\(255 255 255 \/ 0\.95\);/);
  });

  it("la clase existe UNA sola vez", () => {
    expect(css.match(/^\.vidrio \{/gm)?.length).toBe(1);
  });
});

describe("una sola fuente en código", () => {
  it("VIDRIO (el nombre de la otra rama) apunta a la MISMA clase, con 16 px", () => {
    expect(VIDRIO).toBe(`${CLASE_VIDRIO} ${RADIO_VIDRIO}`);
    expect(RADIO_VIDRIO).toBe("rounded-2xl");
  });

  it("vidrioSobre: apagado devuelve la clase de hoy; prendido quita fondo, borde, sombra y radio", () => {
    const antes = "absolute right-0 z-20 mt-1 w-52 rounded-lg border border-gray-200 bg-white py-1 shadow-lg";
    expect(vidrioSobre(antes)).toBe(VIDRIO_2026_10 ? vidrioSobre(antes, true) : antes);
    expect(vidrioSobre(antes, false)).toBe(antes);
    expect(vidrioSobre(antes, true)).toBe("absolute right-0 z-20 mt-1 w-52 py-1 vidrio rounded-2xl");
    expect(vidrioSobre("bg-white rounded-xl border border-black/10 shadow-lg py-1", true)).toBe("py-1 vidrio rounded-2xl");
  });

  it("el desplegable genérico (DesplegableFlotante) pasa TODO por el vidrio", () => {
    expect(leer("components/ui/DesplegableFlotante.tsx")).toMatch(/vidrioSobre\(className\)/);
  });

  it("nadie arma otra receta de vidrio a mano (backdrop-blur + bg-white/NN fuera de lib/ui/vidrio)", () => {
    const culpables: string[] = [];
    for (const f of archivos(SRC)) {
      const s = readFileSync(f, "utf8");
      if (/supports-\[backdrop-filter/.test(s)) culpables.push(relative(SRC, f));
    }
    expect(culpables).toEqual([]);
  });
});

describe("BARRIDO: todo menú o desplegable usa vidrio", () => {
  it("ningún archivo con un menú o una lista desplegable se queda sin vidrio", () => {
    const sinVidrio: string[] = [];
    for (const f of archivos(SRC)) {
      const s = readFileSync(f, "utf8");
      const r = relative(SRC, f);
      if (r === "components/ui/DesplegableFlotante.tsx") continue;
      const esMenu = /role="(menu|listbox)"|aria-haspopup="(menu|listbox|true)"|aria-haspopup=\{true\}/.test(s);
      if (!esMenu) continue;
      if (PIEZAS_CON_VIDRIO.test(s)) continue;
      if (EXCEPCIONES[r]) continue;
      sinVidrio.push(r);
    }
    expect(sinVidrio, `Estos menús no usan vidrio: ${sinVidrio.join(", ")}`).toEqual([]);
  });

  it("los paneles de Radix (Select y HoverCard) y el «···» de las filas también", () => {
    expect(leer("components/ui/select.tsx")).toMatch(/conVidrio\(/);
    expect(leer("components/ui/hover-card.tsx")).toMatch(/vidrioSobre\(/);
    expect(leer("components/ui/OverflowMenu.tsx")).toMatch(/conVidrio\(/);
  });

  it("los chips del catálogo («Todos / Women / Men») son de vidrio", () => {
    expect(leer("components/catalogo/CatalogoFilters.tsx")).toMatch(/className=\{vidrioSobre\("bg-white rounded-xl border border-black\/10 shadow-lg py-1"\)\}/);
  });
});
