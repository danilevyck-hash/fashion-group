// ─────────────────────────────────────────────────────────────────────────────
// LA LIBRETA VIEJA DE CLIENTES ESTÁ RETIRADA — Y LA TABLA NO SE BORRA.
//
// 🔁 Este archivo se llamaba `directorio-codigo-cliente.test.ts` y vigilaba lo
// contrario: que `/api/directorio` guardara bien las 33 fichas de
// `directorio_clientes`. Cambió de dirección el 5-sep-2026.
//
// QUÉ ERA. La libreta de contactos que se escribió A MANO antes de que el
// directorio viniera de Switch (jun-2026). Medido el 5-sep-2026: 33 fichas, la
// última del 28-may, 8 sin código, correos distintos a los reales (DE MODA:
// «Joseca28castillo@…» en la libreta, «josue24castillo@…» en Switch), y de los
// 10 clientes que más deben, 3 no existían ahí. Su ÚNICO lector que quedaba era
// la sugerencia de nombre al abrir un pedido de catálogo; la búsqueda global la
// mezclaba con los resultados.
//
// Daniel, textual: *«Supuestamente debe de haber uno y amarrado por código»* y
// *«si ningún módulo toca esa lista, bórralo»*.
//
// LO QUE VIGILA:
//   1. Nadie lee ni escribe `directorio_clientes` desde `src/` (salvo la
//      clasificación del respaldo).
//   2. `/api/directorio` no existe.
//   3. Las sugerencias del catálogo y el bloque «Directorio» de la búsqueda
//      global leen `clientes_master` — por CÓDIGO, sin ausentes.
//   4. La tabla sigue clasificada `congelada` en el respaldo: son datos que
//      tecleó una persona. Ninguna migración la dropea.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import path from "path";
import { CLASIFICACION } from "@/lib/backup/tablas";

const RAIZ = path.resolve(__dirname, "../../..");
const SRC = path.join(RAIZ, "src");

function archivosDe(dir: string, out: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    const p = path.join(dir, nombre);
    if (statSync(p).isDirectory()) archivosDe(p, out);
    else if (/\.(ts|tsx)$/.test(nombre)) out.push(p);
  }
  return out;
}

const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");

describe("la libreta vieja de clientes (directorio_clientes) está retirada", () => {
  it("1 · ningún archivo de src/ la lee ni la escribe (salvo la clasificación del respaldo)", () => {
    const culpables = archivosDe(SRC)
      .filter((f) => !f.includes(`${path.sep}__tests__${path.sep}`))
      .filter((f) => !f.endsWith(path.join("lib", "backup", "tablas.ts")))
      .filter((f) => !f.endsWith("database.types.ts"))
      .filter((f) => {
        const src = readFileSync(f, "utf8");
        // Se busca la LLAMADA, no el nombre: los comentarios que cuentan la
        // historia pueden nombrarla.
        return /\.from\(\s*["']directorio_clientes["']\s*\)/.test(src);
      })
      .map((f) => path.relative(RAIZ, f));
    expect(culpables).toEqual([]);
  });

  it("2 · /api/directorio ya no existe", () => {
    expect(existsSync(path.join(SRC, "app", "api", "directorio"))).toBe(false);
  });

  it("3a · las sugerencias del pedido de catálogo leen clientes_master, por código y sin ausentes", () => {
    const ruta = leer("src/app/api/catalogo/[marca]/clientes-search/route.ts");
    expect(ruta).toContain('.from("clientes_master")');
    expect(ruta).toContain('.eq("deleted", false)');
    expect(ruta).toContain('.is("ausente_desde", null)');
    expect(ruta).toMatch(/codigo\.ilike/);
    // La respuesta conserva `nombre`, que es lo único que pinta PedidoDetalleClient.
    expect(ruta).toMatch(/nombre:\s*r\.nombre/);
  });

  it("3b · el bloque «Directorio» de la búsqueda global lee clientes_master", () => {
    const ruta = leer("src/app/api/search/route.ts");
    expect(ruta).toContain('.from("clientes_master")');
    expect(ruta).not.toContain('.from("directorio_clientes")');
  });

  it("4a · la tabla queda clasificada `congelada` en el respaldo (datos tecleados por una persona)", () => {
    expect(CLASIFICACION["directorio_clientes"]).toBe("congelada");
  });

  it("4b · ninguna migración la dropea", () => {
    const dir = path.join(RAIZ, "supabase", "migrations");
    const drops = readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .filter((f) => /drop\s+table\s+(if\s+exists\s+)?["']?directorio_clientes/i.test(readFileSync(path.join(dir, f), "utf8")));
    expect(drops).toEqual([]);
  });
});
