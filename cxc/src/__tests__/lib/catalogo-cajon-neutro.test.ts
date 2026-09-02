// ─────────────────────────────────────────────────────────────────────────────
// CANDADO — 🩸 UN CAJÓN POR DEFECTO NUNCA PUEDE SER EL PRIMERO DE LA LISTA.
//
// La regla general que salió del 2-sep-2026, y que este repo ya tenía escrita
// del otro lado (`sync-articulo-marca.ts`: *«LA MARCA NO SE ADIVINA»*): el
// valor que un sync pone cuando NO SABE tiene que ser distinguible del valor
// que pone cuando SÍ sabe. Si el default es una categoría o un género REAL, no
// hay forma —ni mirando la base, ni mirando la pantalla, ni con un centinela—
// de saber cuál de los dos casos produjo esa fila.
//
// Es exactamente lo que pasó: `defaultCategory: "footwear"` + el DEFAULT `male`
// de la columna dejaron **173 de 173 altas** clasificadas como calzado de
// hombre, con dos valores válidos, sin un solo error.
//
// Este archivo lo vigila en los TRES lugares donde puede volver:
//   1. el `defaultCategory` de cada marca, contra sus propias `categoryOptions`;
//   2. el `insertExtras.gender` de cada marca, contra sus `genderOptions`;
//   3. las migraciones: ninguna columna de clasificación puede tener un DEFAULT
//      con valor de negocio.
//
// 🔑 Es un barrido de TEXTO sobre los archivos de sync, y eso es a propósito: lo
// que se vigila es una CONFIGURACIÓN declarada, no una conducta. Importar los
// syncs de verdad arrastraría cuatro clientes de Supabase con env real. Los
// comentarios se BORRAN antes de barrer, para que el test no se cumpla con su
// propia explicación — la lección que este repo ya pagó cuatro veces.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { MARCA_THEME, type MarcaUiKey } from "@/lib/catalogo/marcas-ui";
import { CATEGORIA_SIN_CLASIFICAR, GENERO_SIN_CLASIFICAR } from "@/lib/reebok-clasificacion";

const RAIZ = path.resolve(__dirname, "../../..");

/** Quita comentarios de línea y de bloque. Un candado no puede darse por
 *  satisfecho leyendo el comentario que explica lo que debería pasar. */
function sinComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const leerCrudo = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
const leer = (rel: string) => sinComentarios(leerCrudo(rel));

const SYNCS: Array<{ marca: MarcaUiKey; archivo: string }> = [
  { marca: "reebok", archivo: "src/lib/switch-api/sync-catalogo-reebok.ts" },
  { marca: "joybees", archivo: "src/lib/switch-api/sync-catalogo-joybees.ts" },
  { marca: "tommy", archivo: "src/lib/switch-api/sync-catalogo-tommy.ts" },
  { marca: "calvin", archivo: "src/lib/switch-api/sync-catalogo-calvin.ts" },
];

/** El valor literal de `defaultCategory` en el archivo de una marca. Acepta el
 *  literal (`"otros"`) o una constante con nombre, que se resuelve contra las
 *  dos que existen. */
function defaultCategoryDe(src: string): string | null {
  const m = src.match(/defaultCategory:\s*(?:"([^"]*)"|'([^']*)'|([A-Z_][A-Z0-9_]*))/);
  if (!m) return null;
  if (m[1] !== undefined) return m[1];
  if (m[2] !== undefined) return m[2];
  if (m[3] === "CATEGORIA_SIN_CLASIFICAR") return CATEGORIA_SIN_CLASIFICAR;
  return `<${m[3]}>`; // constante desconocida: se reporta tal cual y falla abajo
}

/** El `gender` que la marca pone en `insertExtras`, si pone alguno. */
function insertGenderDe(src: string): string | null {
  const m = src.match(/insertExtras:\s*\{[^}]*\bgender:\s*(?:"([^"]*)"|'([^']*)'|([A-Z_][A-Z0-9_]*))/s);
  if (!m) return null;
  if (m[1] !== undefined) return m[1];
  if (m[2] !== undefined) return m[2];
  if (m[3] === "GENERO_SIN_CLASIFICAR") return GENERO_SIN_CLASIFICAR;
  return `<${m[3]}>`;
}

describe("🔴 el defaultCategory de una marca NO puede ser una categoría REAL de sus chips", () => {
  for (const { marca, archivo } of SYNCS) {
    it(`${marca}`, () => {
      const cat = defaultCategoryDe(leer(archivo));
      expect(cat, `${archivo} no declara defaultCategory`).not.toBeNull();
      const reales = MARCA_THEME[marca].filtros.categoryOptions
        .map((o) => o.value)
        .filter((v) => v !== ""); // "" es el chip «Todos», no una categoría
      expect(
        reales,
        `${marca}: el cajón por defecto es "${cat}", que ES una categoría real de sus filtros. ` +
          `Un producto sin clasificar quedaría indistinguible de uno clasificado.`,
      ).not.toContain(cat as string);
    });
  }

  it("Reebok, en particular, ya NO usa footwear como cajón — era la mitad del bug", () => {
    expect(defaultCategoryDe(leer("src/lib/switch-api/sync-catalogo-reebok.ts"))).not.toBe("footwear");
  });
});

describe("🔴 el gender de los productos nuevos NO puede ser un género REAL de sus chips", () => {
  for (const { marca, archivo } of SYNCS) {
    it(`${marca}`, () => {
      const gen = insertGenderDe(leer(archivo));
      if (gen === null) return; // la marca no fija género en el INSERT: lo pone derive
      const reales = MARCA_THEME[marca].filtros.genderOptions
        .map((o) => o.value)
        .filter((v) => v !== "");
      expect(
        reales,
        `${marca}: los productos nuevos entran con gender="${gen}", que ES un género real de sus filtros.`,
      ).not.toContain(gen as string);
    });
  }

  it("🔴 Reebok escribe el gender EXPLÍCITAMENTE en el INSERT — sin eso manda el DEFAULT de la columna", () => {
    // Ésta es la mitad del bug que NO necesita migración: mientras el INSERT no
    // nombre la columna, el DEFAULT de Postgres decide, y decidía `male`.
    const src = leer("src/lib/switch-api/sync-catalogo-reebok.ts");
    expect(src).toMatch(/insertExtras:\s*\{[^}]*gender:/s);
  });

  it("Joybees ya no entra con adults_m (o sea, hombre) por placeholder", () => {
    expect(leer("src/lib/switch-api/sync-catalogo-joybees.ts")).not.toContain("adults_m");
  });
});

describe("🔴 el cajón neutro no puede coincidir con NINGÚN chip de NINGUNA marca", () => {
  it("ni como categoría ni como género", () => {
    for (const marca of Object.keys(MARCA_THEME) as MarcaUiKey[]) {
      const cats = MARCA_THEME[marca].filtros.categoryOptions.map((o) => o.value);
      const gens = MARCA_THEME[marca].filtros.genderOptions.map((o) => o.value);
      expect(cats, `${marca}`).not.toContain(CATEGORIA_SIN_CLASIFICAR);
      expect(gens, `${marca}`).not.toContain(GENERO_SIN_CLASIFICAR);
    }
  });
});

describe("🔴 ninguna migración deja un DEFAULT con valor de negocio en una columna de clasificación", () => {
  // El default `male` de `products.gender` no está en ninguna migración del
  // repo (esa tabla nació antes), pero la regla vale hacia adelante: la próxima
  // tabla de catálogo no puede repetirlo.
  const COLUMNAS = ["gender", "category", "genero", "categoria", "rubro", "subrubro"];

  it("barrido sobre supabase/migrations", () => {
    const dir = path.join(RAIZ, "supabase/migrations");
    const ofensas: string[] = [];
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".sql"))) {
      const sql = fs
        .readFileSync(path.join(dir, f), "utf8")
        .replace(/^\s*--.*$/gm, "") // los comentarios SQL no cuentan
        .replace(/\/\*[\s\S]*?\*\//g, " ");
      for (const linea of sql.split("\n")) {
        const m = linea.match(
          new RegExp(`\\b(${COLUMNAS.join("|")})\\b[^,;]*?\\bDEFAULT\\s+('([^']*)'|"([^"]*)")`, "i"),
        );
        if (!m) continue;
        const valor = m[3] ?? m[4] ?? "";
        // Un DEFAULT '' o el sentinel son cajones neutros y están permitidos:
        // lo prohibido es un valor de negocio.
        if (valor === "" || valor === CATEGORIA_SIN_CLASIFICAR || valor === GENERO_SIN_CLASIFICAR) continue;
        ofensas.push(`${f}: ${linea.trim()}`);
      }
    }
    expect(
      ofensas,
      "una columna de clasificación con DEFAULT de negocio: el día que el sync se olvide de escribirla, " +
        "ese valor va a mentir en el 100% de las filas y nada lo va a decir.",
    ).toEqual([]);
  });
});

describe("🔴 el script de backfill es SOLO LECTURA", () => {
  // Daniel lo pidió explícitamente: primero se REPORTA qué cambiaría, y recién
  // después —y con su OK— se escribe. Un script que puede escribir "por si
  // acaso" no es un reporte, es un backfill con otro nombre.
  it("no hay un solo update/upsert/insert/delete en _verif-clasificacion-reebok.ts", () => {
    const src = sinComentarios(leerCrudo("scripts/_verif-clasificacion-reebok.ts"));
    for (const op of [".update(", ".upsert(", ".insert(", ".delete(", ".rpc("]) {
      expect(src, `el script llama a ${op}`).not.toContain(op);
    }
  });

  it("y lo dice en su propio encabezado, para quien lo abra", () => {
    const src = fs.readFileSync(path.join(RAIZ, "scripts/_verif-clasificacion-reebok.ts"), "utf8");
    expect(src).toMatch(/SOLO LECTURA/);
  });
});
