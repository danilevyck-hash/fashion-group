/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CANDADO — NO VUELVE UN ATAJO DE TECLADO QUE NO ESTÉ ENCHUFADO
 *
 * 11-sep-2026. Daniel, textual: *«quita lo que no funciona»*.
 *
 * 🩸 QUÉ HABÍA. `src/lib/hooks/useKeyboardShortcuts.ts` definía `G+H`, `G+C`,
 * `G+G`, `G+Q`, `G+R`, la ayuda `?`, el `J/K` para moverse por filas y la `E`
 * para editar… y **no tenía un solo importador desde el 11-abr-2026**: su
 * único consumidor, `KeyboardShortcutsProvider.tsx`, se borró ese día y nunca
 * se había montado en una pantalla. O sea que ninguno de esos atajos corría, y
 * CLAUDE.md los documentaba como si funcionaran — una sección entera,
 * «Keyboard Shortcuts», describiendo algo que no existía.
 *
 * 🩸 Y costó trabajo de verdad: el **5-sep-2026** alguien editó ese archivo y el
 * cambio entero fue `q: "/cheques"` → `q: "/recordatorios"`. Se corrigió con
 * cuidado un atajo que no llevaba a nadie a ninguna parte.
 *
 * 🔴 LO QUE SÍ FUNCIONA SE QUEDA, y por eso está medido acá abajo: **⌘K**
 * (y Ctrl+K), que tiene su propio listener dentro de `SearchBar.tsx` y nunca
 * dependió del gancho.
 *
 * ⚠️ **«/» tampoco existe**, y se quitó de la documentación en vez de
 * inventarlo: CLAUDE.md decía «`/` o `⌘K` — buscar» y el único listener de
 * `SearchBar.tsx` mira `metaKey || ctrlKey` con la tecla `k`. Escribir el
 * atajo nuevo era construir, no arreglar, y no estaba en el encargo.
 *
 * SI ALGÚN DÍA SE QUIEREN ATAJOS DE VERDAD: se traen CON la pantalla que los
 * monta y se prueban en el navegador; este candado cambia de dirección con
 * nota fechada. No se borra: se le da vuelta.
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
const existe = (rel: string) => fs.existsSync(path.join(RAIZ, rel));
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, "");

function archivos(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) archivos(p, acc);
    else if (/\.(ts|tsx)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

/** Todo el código desplegable (sin los tests, que hablan DE esto). */
const CODIGO = archivos(path.join(RAIZ, "src"))
  .map((abs) => path.relative(RAIZ, abs))
  .filter((rel) => !rel.startsWith(path.join("src", "__tests__")))
  .map((rel) => ({ rel, src: sinComentarios(leer(rel)) }));

describe("🔴 el gancho de atajos y su montaje no vuelven", () => {
  it("los dos archivos siguen retirados", () => {
    expect(existe("src/lib/hooks/useKeyboardShortcuts.ts")).toBe(false);
    expect(existe("src/components/KeyboardShortcutsProvider.tsx")).toBe(false);
  });

  it("nadie lo importa ni lo monta", () => {
    const culpables = CODIGO.filter(
      (f) => /useKeyboardShortcuts|useTableShortcuts|KeyboardShortcutsProvider/.test(f.src),
    ).map((f) => f.rel);
    expect(
      culpables,
      `\n\nVolvió el gancho de atajos en: ${culpables.join(", ")}\n` +
        `Si es a propósito: móntalo en una pantalla, pruébalo en el navegador,\n` +
        `documéntalo en CLAUDE.md y da vuelta este candado con nota fechada.\n`,
    ).toEqual([]);
  });

  it("CLAUDE.md ya no promete atajos que no existen", () => {
    const doc = leer("CLAUDE.md");
    // La sección entera se fue. Se mide por los RENGLONES que los prometían,
    // no por la palabra suelta: el bloque nuevo los NOMBRA para contar qué se
    // retiró, y eso es justamente lo que hay que conservar.
    expect(doc).not.toContain("## Keyboard Shortcuts");
    for (const renglon of [
      "- `?` — mostrar ayuda de atajos",
      "- `G+H` — ir a inicio",
      "- `J/K` — navegar filas",
    ]) {
      expect(doc, `CLAUDE.md sigue prometiendo «${renglon}»`).not.toContain(renglon);
    }
    // Y dice que se retiraron, con su fecha.
    expect(doc).toContain("atajos-de-teclado-retirados.test.ts");
  });
});

describe("CONTROL: lo que SÍ funciona sigue funcionando", () => {
  const barra = leer("src/components/SearchBar.tsx");

  it("⌘K (y Ctrl+K) abren la búsqueda, con su propio listener", () => {
    expect(barra).toMatch(/metaKey.*\|\|.*ctrlKey/);
    expect(barra).toMatch(/e\.key === "k"/);
  });

  it("y la doc no promete «/» como atajo vivo, que nunca se implementó", () => {
    expect(leer("CLAUDE.md")).not.toContain("- `/` o `⌘K` — buscar");
  });

  it("y CLAUDE.md los sigue describiendo", () => {
    const doc = leer("CLAUDE.md");
    expect(doc).toMatch(/⌘K/);
  });
});
