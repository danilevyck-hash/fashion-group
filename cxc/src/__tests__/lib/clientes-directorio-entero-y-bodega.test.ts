/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CANDADO — EL DIRECTORIO ENTERO CABE, Y BODEGA NO ENTRA POR LA DIRECCIÓN
 *
 * 11-sep-2026. Dos defectos del módulo Clientes, medidos contra producción.
 *
 * 🩸 1. LA COLUMNA «Compró <año>» SE APAGABA EN SILENCIO A LOS 200 CLIENTES.
 * La lista dejó de paginar el 5-sep-2026 (los 150 con scroll) y desde entonces
 * manda TODOS los códigos juntos a `/api/clientes/ytd`, que tenía un tope de
 * **200** con el comentario «el listado pagina de a 50» — una frase que hacía
 * seis días que era falsa. Hoy son **148**: funcionaba a 52 clientes de
 * romperse, y al romperse la columna se queda con «…» para siempre, sin un
 * solo mensaje (el `useSWR` tira el error y nadie lo dibuja). Ahora el tope es
 * 1.000 y la lista viaja por **POST**, en el cuerpo, porque 148 códigos en la
 * URL ya son ~1.900 caracteres.
 *
 * 🩸 2. BODEGA ENTRABA AL DIRECTORIO COMPLETO ESCRIBIENDO `/clientes`. Las dos
 * páginas lo nombraban en su `ALLOWED_ROLES` aunque el módulo `directorio` no
 * es suyo. CLAUDE.md ya decía cómo tenía que ser: *«directorio aparece solo en
 * la búsqueda global, NO como módulo navegable»*. Ahora los guards, el catálogo
 * de módulos y los `useAuth` salen de UNA lista, `ROLES_CLIENTES`.
 *
 * ⚠️ `/api/clientes/[codigo]` NO se toca: la usan superficies de otros módulos
 * y tiene su propia lista.
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { ALL_MODULES } from "@/lib/modules";
import { ROLES_CLIENTES, veClientes } from "@/lib/clientes/roles";

const leer = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, "");

describe("🔴 «Compró <año>» aguanta el directorio entero", () => {
  const ruta = sinComentarios(leer("src/app/api/clientes/ytd/route.ts"));

  it("el tope subió de 200 a 1.000", () => {
    expect(ruta).toContain("const MAX_CODIGOS = 1000;");
    expect(ruta).not.toContain("const MAX_CODIGOS = 200;");
  });

  it("hay POST, y los dos verbos calculan lo MISMO", () => {
    expect(ruta).toContain("export async function POST");
    expect(ruta).toContain("export async function GET");
    // Un solo cuerpo: `responder`. Nada de dos cálculos que se separen.
    expect((ruta.match(/comprasDelAnioPorCodigo\(/g) ?? []).length).toBe(1);
    expect(ruta).toContain("return responder(");
  });

  it("los dos verbos piden la misma sesión", () => {
    expect((ruta.match(/requireAuth\(req, ALLOWED_ROLES\)/g) ?? []).length).toBe(2);
  });

  it("la pantalla manda la lista en el CUERPO, no en la URL", () => {
    const src = sinComentarios(leer("src/app/clientes/ClientesListClient.tsx"));
    expect(src).toContain('fetch("/api/clientes/ytd"');
    expect(src).toContain('method: "POST"');
    expect(src).not.toContain("/api/clientes/ytd?codigos=");
  });
});

describe("🔴 el módulo Clientes es de admin · secretaria · vendedor", () => {
  it("la lista única no trae bodega", () => {
    expect([...ROLES_CLIENTES]).toEqual(["admin", "secretaria", "vendedor"]);
    expect(veClientes("bodega")).toBe(false);
    expect(veClientes("admin")).toBe(true);
  });

  it("el catálogo de módulos usa esa lista", () => {
    expect(ALL_MODULES.find((m) => m.key === "directorio")?.roles).toEqual([...ROLES_CLIENTES]);
    expect(sinComentarios(leer("src/lib/modules.ts"))).toContain("ROLES_CLIENTES");
  });

  it("los cuatro guards del módulo también, y ninguno escribe su copia", () => {
    for (const rel of [
      "src/app/clientes/page.tsx",
      "src/app/clientes/[codigo]/page.tsx",
      "src/app/clientes/ClientesListClient.tsx",
      "src/app/clientes/[codigo]/ClienteDetail.tsx",
    ]) {
      const src = sinComentarios(leer(rel));
      expect(src, `${rel} no usa la lista única`).toMatch(/rolesClientes\(\)/);
      expect(src, `${rel} volvió a escribir la copia con bodega`).not.toMatch(
        /\[\s*"admin",\s*"secretaria",\s*"vendedor",\s*"bodega"\s*\]/,
      );
    }
  });

  it("⚠️ CONTROL: bodega sigue encontrando clientes por la BÚSQUEDA GLOBAL", () => {
    const api = sinComentarios(leer("src/app/api/search/route.ts"));
    // El bloque de bodega le devuelve guías y directorio: es donde saca el
    // teléfono de a quién le está despachando.
    expect(api).toMatch(/role === "bodega"[\s\S]{0,220}directorio: allResults\.directorio/);
  });

  it("⚠️ CONTROL: `/api/clientes/[codigo]` no se tocó", () => {
    const src = leer("src/app/api/clientes/[codigo]/route.ts");
    expect(src).not.toContain("rolesClientes");
  });
});
