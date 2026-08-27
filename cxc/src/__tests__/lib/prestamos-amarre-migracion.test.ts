/* ─────────────────────────────────────────────────────────────────────────────
 * CANDADO DE LA MIGRACIÓN QUE ATA CADA PRÉSTAMO A SU CÓDIGO.
 *
 * Lo que protege no es la aritmética —eso se midió contra producción antes de
 * correrla— sino las CUATRO formas en que este backfill podría hacer daño:
 *
 *   1. que empiece a PAREAR POR PARECIDO (LIKE, similarity, unaccent, quitar
 *      dígitos, distancia de edición). Es la lección de `Outlet Duty Free N2`
 *      vs `N3`: dos nombres parecidos pueden ser dos personas, y un descuento
 *      aplicado a la equivocada no deja ningún rastro;
 *   2. que ate SIN mirar la empresa;
 *   3. que ate cuando hay VARIOS candidatos con el mismo nombre;
 *   4. que la lista de los tres amarres a mano deje de exigir que el código
 *      tenga el nombre que se espera — o sea, que se convierta en un comentario.
 *
 * ⚠️ Se lee el SQL SIN COMENTARIOS. El archivo NOMBRA lo que prohíbe («nada de
 * parecidos», «LAURA CASIANI»), así que un barrido de texto sobre el archivo
 * entero se engañaría solo. Es el mismo error que ya se cometió en este repo.
 * ─────────────────────────────────────────────────────────────────────────── */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { MIGRACION_AMARRE_PRESTAMOS } from "@/lib/asistencia/prestamos-planilla";

const RUTA = join(process.cwd(), "supabase", "migrations", MIGRACION_AMARRE_PRESTAMOS);
const SQL = readFileSync(RUTA, "utf8");

/** Lo que Postgres realmente va a ejecutar: sin una sola línea de comentario. */
const CODIGO = SQL.split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n");

describe("🔴 nada se ata por parecido", () => {
  it("el SQL no usa NINGUNA herramienta de pareo aproximado", () => {
    // `LIKE`/`ILIKE` con comodines, similitud, quitar acentos o dígitos,
    // distancia de edición, expresiones regulares sobre el nombre. Cualquiera
    // de las seis convierte esta migración en la que reparte plata al azar.
    for (const prohibida of [
      /\bi?like\b/i,
      /similarity/i,
      /unaccent/i,
      /levenshtein/i,
      /soundex/i,
      /metaphone/i,
      /word_similarity/i,
      /\bposition\s*\(/i,
      /\bstrpos\s*\(/i,
      /\bsubstring\s*\(/i,
      /\bleft\s*\(/i,
      /\bregexp_/i,
      /\btranslate\s*\(/i,
      /~\*/,
    ]) {
      expect(CODIGO).not.toMatch(prohibida);
    }
  });

  it("la única normalización es upper(btrim(...)), sobre los dos lados", () => {
    // 🔑 Ni más ni menos. `upper` y `btrim` no pueden comerse un dígito ni una
    // letra: `LAURA CASIANI` sigue siendo distinto de `LAURA CASIANO`.
    expect(CODIGO).toMatch(/upper\(btrim\(e\.nombre\)\)/);
    expect(CODIGO).toMatch(/upper\(btrim\(p\.nombre\)\)/);
  });

  it("🩸 el caso que lo prueba: CASIANI y CASIANO no colapsan", () => {
    const norm = (s: string) => s.trim().toUpperCase();
    expect(norm("LAURA CASIANI")).not.toBe(norm("Laura Lismari Casiano Vega"));
    // Y ni siquiera el apellido solo.
    expect(norm("CASIANI")).not.toBe(norm("CASIANO"));
  });
});

describe("🔴 la empresa también tiene que coincidir", () => {
  it("los dos UPDATE comparan la empresa", () => {
    // Dos personas con el mismo nombre en dos empresas distintas es justo el
    // caso donde atar la primera que aparezca es inventar.
    const updates = CODIGO.split(/UPDATE\s+prestamos_empleados/i).slice(1);
    expect(updates).toHaveLength(2);
    for (const u of updates) expect(u).toMatch(/empresa/i);
  });

  it("la traducción de empresa es una lista CERRADA — una empresa desconocida no ata", () => {
    // El `ELSE NULL` es lo que hace que una empresa que no está en la lista
    // simplemente no cruce, en vez de cruzar «de más».
    expect(CODIGO).toMatch(/ELSE\s+NULL/i);
    for (const par of [
      ["Confecciones Boston", "confecciones_boston"],
      ["Vistana International", "vistana"],
      ["Fashion Wear", "fashion_wear"],
    ]) {
      expect(CODIGO).toContain(par[0]);
      expect(CODIGO).toContain(par[1]);
    }
  });
});

describe("🔴 con dos candidatos no se ata ninguno", () => {
  it("el paso automático exige un único candidato", () => {
    expect(CODIGO).toMatch(/cuantos\s*=\s*1/);
  });
});

describe("🔴 los tres amarres a mano son una lista explícita CON guard", () => {
  const ESPERADOS: Array<[string, string, string, string]> = [
    ["GABRIELA A. JARAMILLO P.", "Confecciones Boston", "53", "GABRIELA JARAMILLO"],
    ["LUIS ADRIAN ARROYO", "Vistana International", "9", "LUIS ARROYO"],
    ["MARIA BETHANCOURTH", "Confecciones Boston", "49", "MARIA V. BETHANCOURTH G."],
  ];

  it("están los tres, con su código y con el nombre que ese código tiene que tener", () => {
    for (const [nombre, empresa, codigo, nombrePlanilla] of ESPERADOS) {
      // El renglón entero, en una línea: nombre, empresa, código y el nombre
      // esperado en la planilla. Si alguien saca el último, este test lo caza.
      const fila = new RegExp(
        `'${nombre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}'\\s*,\\s*`
        + `'${empresa}'\\s*,\\s*'${codigo}'\\s*,\\s*`
        + `'${nombrePlanilla.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}'`,
      );
      expect(CODIGO).toMatch(fila);
    }
  });

  it("🔑 el UPDATE EXIGE que el código tenga ese nombre — no es un comentario", () => {
    // Sin este EXISTS, renombrar al código 53 mañana ataría el préstamo de
    // Gabriela a quien haya quedado en ese código.
    expect(CODIGO).toMatch(/EXISTS\s*\(/i);
    expect(CODIGO).toMatch(/p\.empleado_codigo\s*=\s*l\.codigo/);
    expect(CODIGO).toMatch(/upper\(btrim\(p\.nombre\)\)\s*=\s*l\.nombre_planilla/);
  });

  it("no hay un CUARTO amarre a mano que se haya colado", () => {
    const filas = CODIGO.match(/\(\s*'[^']+'\s*,\s*'[^']+'\s*,\s*'[^']+'\s*,\s*'[^']+'\s*\)/g) ?? [];
    expect(filas).toHaveLength(ESPERADOS.length);
  });

  it("⚠️ JOHANA VALLEJO no se ata a nadie: ya no trabaja acá", () => {
    // Su baja es otra migración. Acá lo único que importa es que no aparezca en
    // ninguna lista de amarre.
    const enLista = /\(\s*'JOHANA VALLEJO'/i.test(CODIGO);
    expect(enLista).toBe(false);
  });
});

describe("la migración es aditiva y no pisa nada", () => {
  it("solo AGREGA la columna: no borra, no renombra, no cambia tipos", () => {
    expect(CODIGO).toMatch(/ADD COLUMN IF NOT EXISTS empleado_codigo text/i);
    expect(CODIGO).not.toMatch(/\bDROP\b/i);
    expect(CODIGO).not.toMatch(/\bDELETE\b/i);
    expect(CODIGO).not.toMatch(/RENAME/i);
    expect(CODIGO).not.toMatch(/ALTER COLUMN/i);
    expect(CODIGO).not.toMatch(/\bTRUNCATE\b/i);
  });

  it("🔴 no toca NINGUNA otra tabla ni ninguna otra columna", () => {
    // Solo escribe `prestamos_empleados`, y de esa tabla SOLO la columna nueva.
    const escrituras = CODIGO.match(/UPDATE\s+(\w+)/gi) ?? [];
    expect(escrituras.length).toBeGreaterThan(0);
    for (const e of escrituras) expect(e.toLowerCase()).toContain("prestamos_empleados");

    // 🔑 Se mira el SET ENTERO, no solo su primera palabra: un
    // `SET empleado_codigo = …, nombre = …` reescribiría el nombre que tecleó
    // una persona, y un `SET nombre = …` a secas es solo la forma obvia de ese
    // mismo daño. La lista de columnas escritas tiene que ser exactamente una.
    const sets = [...CODIGO.matchAll(/\bSET\b([\s\S]*?)\b(?:FROM|WHERE)\b/gi)];
    expect(sets).toHaveLength(2);
    for (const s of sets) {
      const columnas = s[1]
        .split(",")
        .map((c) => c.trim().split(/\s*=/)[0].trim())
        .filter(Boolean);
      expect(columnas).toEqual(["empleado_codigo"]);
    }
  });

  it("🔑 nunca pisa un amarre que ya existe", () => {
    // Los dos UPDATE exigen `empleado_codigo IS NULL`. Sin eso, volver a correr
    // la migración después de una corrección a mano la desharía.
    const updates = CODIGO.split(/UPDATE\s+prestamos_empleados/i).slice(1);
    for (const u of updates) expect(u).toMatch(/e\.empleado_codigo IS NULL/i);
  });
});
