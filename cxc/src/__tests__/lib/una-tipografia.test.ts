// 🔴 UNA SOLA TIPOGRAFÍA (AJUSTES_APPLE_6_2026_10, punto 3; Daniel, 6-oct-2026):
// los montos en monoespaciada («$174.75», «16 tickets») pasan a la letra del
// sistema con cifras tabulares. Una sola palanca: `html[data-cifras="sistema"]`
// en `globals.css`, que pone `layout.tsx` con el interruptor. Este candado:
//   1. la palanca existe y cubre `font-mono` y la cifra de Caja menuda;
//   2. ninguna pantalla trae una monoespaciada por fuera de la palanca;
//   3. `font-mono` no crece (techo que solo baja; al prender, se barre a 0).
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { describe, it, expect } from "vitest";
import { AJUSTES_APPLE_6_2026_10 } from "@/lib/ajustes-apple-6-2026-10";

const TECHO_FONT_MONO = 367;
// La única definición de monoespaciada permitida: la variable de Caja, que la palanca pisa.
const MONO_PERMITIDA = ["src/app/caja/skin.css"];
const MONO = /monospace|ui-monospace|Menlo|Consolas|Courier|font-\[[^\]]*mono/i;

function* archivos(dir: string): Generator<string> {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) { if (!p.endsWith("__tests__")) yield* archivos(p); }
    else if (/\.(tsx?|css)$/.test(n) && !n.includes(".test.")) yield p;
  }
}
const todos = [...archivos("src")];

describe("una sola tipografía", () => {
  it("la palanca de globals.css cubre font-mono y la cifra de Caja", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toMatch(/html\[data-cifras="sistema"\] \.font-mono \{\s*font-family: inherit;\s*font-variant-numeric: tabular-nums;/);
    expect(css).toMatch(/html\[data-cifras="sistema"\] \.skin-caja \{\s*--caja-font-mono: var\(--caja-font-sans\);/);
  });

  it("layout.tsx pone la palanca con el interruptor", () => {
    expect(readFileSync("src/app/layout.tsx", "utf8")).toContain('data-cifras={AJUSTES_APPLE_6_2026_10 ? "sistema" : undefined}');
    expect(typeof AJUSTES_APPLE_6_2026_10).toBe("boolean");
  });

  it("ninguna pantalla define una monoespaciada por fuera de la palanca", () => {
    const sucios = todos.filter((f) => !MONO_PERMITIDA.includes(f) && MONO.test(readFileSync(f, "utf8").replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, "")));
    expect(sucios).toEqual([]);
  });

  it(`font-mono no crece (techo ${TECHO_FONT_MONO}, solo baja)`, () => {
    const n = todos.reduce((s, f) => s + (readFileSync(f, "utf8").match(/\bfont-mono\b/g) ?? []).length, 0);
    expect(n).toBeLessThanOrEqual(TECHO_FONT_MONO);
  });
});
