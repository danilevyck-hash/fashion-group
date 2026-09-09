/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 LAS TRES GRAFÍAS DE LA LISTA DE DESTINOS (8-sep-2026)
 *
 * La lista que ofrece el campo Dirección de Guías es del EQUIPO desde el
 * 7-sep-2026 (`guias_destino_lista`, administrada en Guías › Configuración).
 * Su semilla salió del uso real, y arrastró dos typos y una calle:
 *
 *   1. «Changuinola» CON «U». Daniel: *«es changuinola»*. La lista ofrecía
 *      «Changinola» y la gente la tocaba: 26 renglones mal escritos contra 1
 *      bien, mientras los dos destinos DEFINIDOS del pueblo (D-156 y D-147) ya
 *      decían «Changuinola». El mismo pueblo contaba como DOS destinos.
 *   2. «Westland», no «Wesland». Mismo cuento: la lista sembró el typo (4 usos)
 *      cuando los destinos definidos de D-99 y D-142 ya dicen «Westland».
 *   3. «CALLE 19» sale de la lista: no es un destino, es una calle. Ya hay dos
 *      destinos definidos que la nombran bien («Calle 19 Central, al lado de la
 *      joyería Super Oro» y «Calle 19 Central»).
 *
 * Lo que este archivo fija, y no se puede volver a romper:
 *   a. la red del campo (`DESTINOS_BASE`) nunca vuelve a ofrecer una grafía
 *      mala, ni la calle pelada;
 *   b. las tres migraciones están ACOTADAS AL VALOR EXACTO — jamás un `LIKE`
 *      suelto, que pisaría «WESTLAND TIENDA 5» o «Calle 19 Central»;
 *   c. quitar de la lista es SOFT DELETE FIRMADO, nunca un `DELETE`;
 *   d. la calle NO toca el histórico: los 13 renglones viejos se quedan;
 *   e. ninguna toca `guia_transporte` — ni bultos, ni estado, ni firmas;
 *   f. nada se pareó por PARECIDO: `claveDestino` sigue viendo «Wesland» y
 *      «Westland» como dos destinos distintos, y «CALLE 19» distinta de
 *      «Calle 19 Central». Que sean el mismo lugar lo dice la lista escrita a
 *      mano de Daniel, no una distancia de edición.
 *
 * Mediciones contra producción del 8-sep-2026 (`guia_items` vivo):
 *   · «Changinola» exacto: 0 (la migración del 5-sep ya corrió).
 *   · «Wesland» exacto: 5 filas (4 vivas en 4 guías + 1 de guía borrada).
 *   · «Westland» exacto: 0 — la grafía buena sola nunca se escribió.
 *   · «CALLE 19» (las tres grafías): 13 renglones vivos.
 *   · Antes y después: 226 guías vivas · 540 renglones · 7.630 bultos.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import { DESTINOS_BASE } from "@/lib/guias/destinos-lista";
import { claveDestino } from "@/lib/guias/destinos-clientes";

const raiz = process.cwd();
const leer = (rel: string) => readFileSync(path.join(raiz, rel), "utf8");

const MIG_CHANGUINOLA = "supabase/migrations/20261005120000_guias_changuinola.sql";
const MIG_WESTLAND = "supabase/migrations/20261016120000_guias_westland.sql";
const MIG_CALLE19 = "supabase/migrations/20261017120000_guias_calle19_fuera_de_la_lista.sql";

const changuinola = leer(MIG_CHANGUINOLA);
const westland = leer(MIG_WESTLAND);
const calle19 = leer(MIG_CALLE19);

/**
 * El código sin comentarios. Los comentarios de este módulo CUENTAN la historia
 * («el histórico decía Changinola…») y tienen que poder nombrar la grafía mala;
 * lo que no puede es que un archivo la OFREZCA. Mismo criterio que el candado
 * de tuteo, que blanquea los comentarios antes de barrer.
 */
function borrarComentarios(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");
}

/** El SQL sin comentarios: lo que de verdad corre contra la base. */
function sqlEjecutable(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n");
}

// ─── a · la red del campo no vuelve a ofrecer una grafía mala ────────────────

describe("🔴 a. la lista que el campo ofrece de red está bien escrita", () => {
  it("«Changuinola» va con «u» — Daniel: «es changuinola»", () => {
    expect(DESTINOS_BASE).toContain("Changuinola");
  });

  it.each(["Changinola", "Wesland", "CALLE 19"])(
    "«%s» NO se ofrece: ofrecerla es lo que la hacía repetirse",
    (mala) => {
      expect(DESTINOS_BASE).not.toContain(mala);
    },
  );

  it("ninguna grafía mala sobrevive en el CÓDIGO de Guías (los comentarios sí: cuentan la historia)", () => {
    const malas = ["Changinola", "Wesland"];
    const dirs = ["src/lib/guias", "src/app/guias", "src/app/api/guias"];
    const hallazgos: string[] = [];

    const recorrer = (dir: string) => {
      for (const nombre of readdirSync(path.join(raiz, dir))) {
        const rel = `${dir}/${nombre}`;
        if (statSync(path.join(raiz, rel)).isDirectory()) {
          recorrer(rel);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(nombre)) continue;
        const codigo = borrarComentarios(leer(rel));
        for (const mala of malas) {
          if (codigo.includes(mala)) hallazgos.push(`${rel}: ${mala}`);
        }
      }
    };
    dirs.forEach(recorrer);
    expect(hallazgos).toEqual([]);
  });
});

// ─── b · acotadas al VALOR EXACTO, jamás un LIKE suelto ──────────────────────

describe("🔴 b. las tres migraciones miran el valor EXACTO", () => {
  it.each([
    ["Changuinola", changuinola],
    ["Westland", westland],
    ["CALLE 19", calle19],
  ])("la migración de %s no usa LIKE, ILIKE ni comodines", (_nombre, sql) => {
    const ejecutable = sqlEjecutable(sql);
    expect(ejecutable).not.toMatch(/\bI?LIKE\b/i);
    expect(ejecutable).not.toMatch(/~\*?\s*'/);
    expect(ejecutable).not.toContain("%");
  });

  it("«Changinola» se compara con btrim y el valor entero, no un pedazo", () => {
    expect(sqlEjecutable(changuinola)).toContain("btrim(direccion) = 'Changinola'");
    expect(sqlEjecutable(changuinola)).toContain("SET direccion = 'Changuinola'");
  });

  it("«Wesland» igual: el valor entero, con o sin bordes", () => {
    expect(sqlEjecutable(westland)).toContain("btrim(direccion) = 'Wesland'");
    expect(sqlEjecutable(westland)).toContain("SET direccion = 'Westland'");
  });

  it("la calle se quita por su valor exacto — un LIKE se llevaría «Calle 19 Central»", () => {
    expect(sqlEjecutable(calle19)).toContain("destino = 'CALLE 19'");
  });
});

// ─── c · quitar de la lista es soft delete FIRMADO, nunca DELETE ─────────────

describe("🔴 c. de la lista compartida no se borra: se quita firmado", () => {
  it.each([
    ["Westland", westland],
    ["CALLE 19", calle19],
  ])("la migración de %s no tiene un solo DELETE ni un DROP", (_nombre, sql) => {
    const ejecutable = sqlEjecutable(sql);
    expect(ejecutable).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(ejecutable).not.toMatch(/\bDROP\b/i);
    expect(ejecutable).not.toMatch(/\bTRUNCATE\b/i);
  });

  it.each([
    ["Wesland", westland],
    ["CALLE 19", calle19],
  ])("quitar «%s» deja quién y cuándo", (_nombre, sql) => {
    const ejecutable = sqlEjecutable(sql);
    expect(ejecutable).toContain("activo          = false");
    expect(ejecutable).toMatch(/desactivado_por\s*=\s*'migracion-2026\d{10}'/);
    expect(ejecutable).toContain("desactivado_en  = now()");
  });

  it("y la buena entra a la lista, para que el campo la siga ofreciendo", () => {
    const ejecutable = sqlEjecutable(westland);
    expect(ejecutable).toMatch(/INSERT INTO guias_destino_lista[\s\S]*'Westland'/);
  });
});

// ─── d · la calle NO toca el histórico ───────────────────────────────────────

describe("🔴 d. los 13 renglones de «CALLE 19» son historia y se quedan", () => {
  it("la migración de la calle no escribe una sola línea de guía", () => {
    const ejecutable = sqlEjecutable(calle19);
    expect(ejecutable).not.toContain("guia_items");
    expect(ejecutable).not.toMatch(/\bUPDATE\s+guia_/i);
  });
});

// ─── e · ninguna toca la guía en sí ──────────────────────────────────────────

describe("🔴 e. ni bultos, ni estado, ni firmas", () => {
  it.each([
    ["Changuinola", changuinola],
    ["Westland", westland],
    ["CALLE 19", calle19],
  ])("la migración de %s no toca guia_transporte", (_nombre, sql) => {
    const ejecutable = sqlEjecutable(sql);
    expect(ejecutable).not.toContain("guia_transporte");
    expect(ejecutable).not.toContain("bultos");
    expect(ejecutable).not.toContain("estado");
  });
});

// ─── f · nada se parea por parecido ──────────────────────────────────────────

describe("🔴 f. que sean el mismo lugar lo dice la lista de Daniel, no un algoritmo", () => {
  it("«Wesland» y «Westland» siguen siendo dos claves distintas", () => {
    expect(claveDestino("Wesland")).not.toBe(claveDestino("Westland"));
  });

  it("«CALLE 19» no es «Calle 19 Central»: quitar una no quita la otra", () => {
    expect(claveDestino("CALLE 19")).not.toBe(claveDestino("Calle 19 Central"));
  });

  it("lo que sí se junta es la MISMA grafía escrita distinto — con o sin bordes y sin mayúsculas", () => {
    expect(claveDestino("Westland")).toBe(claveDestino("  WESTLAND "));
    expect(claveDestino("Changuinola")).toBe(claveDestino("changuinola"));
  });
});
