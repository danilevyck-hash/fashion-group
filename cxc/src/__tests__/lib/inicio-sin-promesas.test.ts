/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CANDADO — EL INICIO NO PROMETE LO QUE NO TIENE
 *
 * 11-sep-2026. Daniel, textual: *«quita lo que no funciona»*.
 *
 * 🩸 TRES COSAS QUE CLAUDE.md DESCRIBÍA Y NO EXISTÍAN EN NINGUNA PANTALLA:
 *
 *   · el feed **«Acciones pendientes»** con 8 fuentes ordenadas por urgencia.
 *     `GET /api/home-stats` seguía viva y consultando la base, y **no tenía un
 *     solo lector** en `src/`.
 *   · los **contadores del 🔔**. `useBadges` se quedó sin importadores en el
 *     rediseño del home del 29-abr-2026. (La campana SÍ existe y funciona: es
 *     el historial de avisos de `NotificationCenter`, que nunca usó ese gancho.)
 *   · las **💡 sugerencias proactivas**. `SuggestionCard` no se dibujaba en
 *     ninguna parte y `useSmartSuggestions` solo se llamaba en `/cxc`, donde el
 *     propio código decía «SuggestionCard removed from render» y le pasaba una
 *     lista vacía para conservar el orden de los hooks.
 *
 * Lo que se retiró es el CÓDIGO MUERTO. No se construyó nada: si alguna de las
 * tres hace falta, se hace con su pantalla y se documenta después, no antes.
 *
 * ⚠️ `/api/notification-badges` **se queda**, sin un solo llamador, porque la
 * nombran por su RUTA tres candados vivos de otros módulos. Es el mismo trato
 * que `/api/cxc/contact-log` y `/api/cxc-summary`; lo vigila
 * `ganchos-sin-uso.test.ts`.
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

const CODIGO = archivos(path.join(RAIZ, "src"))
  .map((abs) => path.relative(RAIZ, abs))
  .filter((rel) => !rel.startsWith(path.join("src", "__tests__")))
  .map((rel) => ({ rel, src: sinComentarios(leer(rel)) }));

const DOC = leer("CLAUDE.md");

describe("🔴 lo retirado no vuelve sin su pantalla", () => {
  it("los cuatro archivos siguen retirados", () => {
    for (const rel of [
      "src/app/api/home-stats/route.ts",
      "src/lib/hooks/useBadges.ts",
      "src/lib/hooks/useSmartSuggestions.ts",
      "src/components/SuggestionCard.tsx",
    ]) {
      expect(existe(rel), `${rel} volvió`).toBe(false);
    }
  });

  it("nadie los nombra en el código desplegable", () => {
    const culpables = CODIGO.filter(
      (f) => /home-stats|useBadges|useSmartSuggestions|SuggestionCard/.test(f.src),
    ).map((f) => f.rel);
    expect(
      culpables,
      `\n\nVolvió código del feed / badges / sugerencias en: ${culpables.join(", ")}\n` +
        `Si es a propósito: constrúyelo CON su pantalla, pruébalo, y da vuelta\n` +
        `este candado con nota fechada.\n`,
    ).toEqual([]);
  });
});

describe("🔴 CLAUDE.md describe lo que hay", () => {
  it("ya no promete el feed, los badges ni las sugerencias", () => {
    // Se miden los RENGLONES que lo prometían, no la palabra suelta: el bloque
    // nuevo los nombra para contar qué se retiró y por qué.
    for (const renglon of [
      "- **Dashboard feed:**",
      "- **Daily summary:**",
      "- **Smart suggestions:**",
    ]) {
      expect(DOC, `CLAUDE.md sigue prometiendo «${renglon}»`).not.toContain(renglon);
    }
    expect(DOC).toContain("inicio-sin-promesas.test.ts");
  });

  it("CONTROL: lo que SÍ existe se sigue describiendo", () => {
    // La búsqueda global, el spotlight y los smart defaults están vivos.
    expect(DOC).toContain("Búsqueda global");
    expect(DOC).toContain("Spotlight");
    expect(DOC).toContain("Smart defaults");
  });

  it("CONTROL: la campana del header sigue montada (es otra cosa)", () => {
    expect(existe("src/components/NotificationCenter.tsx")).toBe(true);
    expect(leer("src/components/AppHeader.tsx")).toContain("<NotificationCenter />");
  });
});

describe("🔴 la caja de buscar del Inicio es de los mismos roles que en todos lados", () => {
  it("el Inicio usa `SEARCH_ROLES`, no una lista escrita a mano", () => {
    const home = sinComentarios(leer("src/app/home/page.tsx"));
    expect(home).toContain("SEARCH_ROLES.includes(role)");
    expect(home).not.toMatch(/\[\s*"admin",\s*"secretaria"\s*\]\.includes\(role\)/);
  });

  it("y son los CINCO que acepta `/api/search`", () => {
    const barra = leer("src/components/SearchBar.tsx");
    expect(barra).toContain(
      'export const SEARCH_ROLES = ["admin", "secretaria", "vendedor", "bodega", "contabilidad"]',
    );
    const api = sinComentarios(leer("src/app/api/search/route.ts"));
    expect(api).toContain('["admin", "secretaria", "vendedor", "bodega", "contabilidad"]');
  });

  it("CONTROL: el header ya usaba la misma lista", () => {
    expect(sinComentarios(leer("src/components/AppHeader.tsx"))).toContain("SEARCH_ROLES.includes(userRole)");
  });
});
