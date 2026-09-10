/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 LOS CUATRO POLOS «CORE» DEL CATÁLOGO VAN EN PLURAL (9-sep-2026)
 *
 * 🩸 EL DATO. En Fashion Wear convivían dos descripciones para la misma prenda
 * (medido contra `switch_articulo_info` el 9-sep-2026):
 *
 *     Men-Polo  S/S Core  ·  42 artículos ·  4.280 piezas
 *     Men-Polos S/S Core  ·  81 artículos ·  2.939 piezas
 *     ──────────────────────────────────────────────────
 *                            7.219 piezas partidas en dos.
 *
 * Los estilos MW0MW32346 y MW0MW32347 estaban escritos de las DOS formas y al
 * mismo precio: 26 códigos bajo el singular y 50 bajo el plural.
 *
 * 🔑 POR QUÉ SE COLÓ: el catálogo se contradecía SOLO. Para adultos guardaba el
 * singular («Men-Polo S/S Core» en TH Menswear, «Women-Polo S/S Core» en TH
 * Womenswear) y para niños el plural («Boys-Polos S/S Core» y «Toddler
 * Boys-Polos S/S Core» en TH Kids). La regla de las dos mitades encontraba
 * «Men» en TH Menswear y «Polos S/S Core» en TH KIDS, daba la descripción por
 * buena, y la casi-gemela real —la singular, de su propia marca— no se llegaba
 * a mirar nunca. El 8-sep-2026 se acotó el alcance de las mitades a la marca;
 * esto arregla la otra mitad del mismo agujero: el catálogo.
 *
 * 🔴 DANIEL ELIGIÓ EL PLURAL, con dos razones medidas: de las 18 filas de polo
 * del catálogo 16 YA van en plural (el singular es la excepción), y en plural
 * se tocan menos artículos en Switch.
 *
 * Lo que este archivo fija, y no se puede volver a romper:
 *   a. la migración cambia las DOS filas por su VALOR EXACTO — marca y
 *      descripción completas—, jamás un `LIKE`, que se llevaría por delante las
 *      16 filas que ya están bien en seis marcas distintas;
 *   b. no borra nada: son dos `UPDATE`, sin un solo DELETE, DROP ni TRUNCATE, y
 *      con guarda `NOT EXISTS` para no duplicar contra el índice único;
 *   c. TH Kids NO se toca: sus dos filas ya venían en plural desde la semilla;
 *   d. NINGUNA migración posterior puede devolver el singular al catálogo;
 *   e. la conducta real de `veredictoDescripcion` se DA VUELTA — antes alertaba
 *      la grafía buena y pasaba la mala; ahora es al revés;
 *   f. nada se pareó por parecido: `esCasiIgual` sigue viendo el singular y el
 *      plural como dos descripciones DISTINTAS. Que sean la misma prenda lo
 *      dijo Daniel mirando los dos estilos al mismo precio, no un algoritmo.
 *
 * ⚠️ El orden importa: primero la migración, después el cambio de Daniel en
 * Switch (los 42 artículos de hombre). Al revés, esos 42 saltan la alarma de
 * descripción desconocida hasta que la migración corra.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { veredictoDescripcion, esCasiIgual } from "@/lib/depurador/veredicto";
import type { CatalogoDescripciones } from "@/lib/depurador/logic";

const raiz = process.cwd();
const CARPETA = "supabase/migrations";
const VERSION = "20261026120000";
const MIGRACION = `${CARPETA}/${VERSION}_polos_core_en_plural.sql`;
const SEMILLA = `${CARPETA}/20260722130000_depurador_descripciones.sql`;

const leer = (rel: string) => readFileSync(path.join(raiz, rel), "utf8");

/** El SQL sin comentarios: lo que de verdad corre contra la base. Los
 *  comentarios CUENTAN la historia y tienen que poder nombrar el singular. */
function sqlEjecutable(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n");
}

const migracion = leer(MIGRACION);
const ejecutable = sqlEjecutable(migracion);

/** Los dos pares que cambian: marca · lo que decía · lo que tiene que decir. */
const CAMBIAN = [
  { marca: "TH Menswear", antes: "Men-Polo S/S Core", ahora: "Men-Polos S/S Core" },
  { marca: "TH Womenswear", antes: "Women-Polo S/S Core", ahora: "Women-Polos S/S Core" },
] as const;

/** Las dos que YA estaban bien y no se tocan. */
const NO_SE_TOCAN = [
  { marca: "TH Kids", descripcion: "Boys-Polos S/S Core" },
  { marca: "TH Kids", descripcion: "Toddler Boys-Polos S/S Core" },
] as const;

// ─── a · el valor EXACTO, jamás un LIKE ──────────────────────────────────────

describe("🔴 a. la migración cambia dos filas por su valor exacto", () => {
  it.each(CAMBIAN)("«$antes» pasa a «$ahora», nombrando la marca $marca", ({ marca, antes, ahora }) => {
    expect(ejecutable).toContain(`SET descripcion = '${ahora}'`);
    expect(ejecutable).toContain(`d.marca = '${marca}'`);
    expect(ejecutable).toContain(`d.descripcion = '${antes}'`);
  });

  it("ni LIKE, ni ILIKE, ni comodines, ni expresión regular", () => {
    expect(ejecutable).not.toMatch(/\bI?LIKE\b/i);
    expect(ejecutable).not.toMatch(/~\*?\s*'/);
    expect(ejecutable).not.toContain("%");
  });

  it("solo toca el catálogo de descripciones — ninguna otra tabla", () => {
    const tablas = [...ejecutable.matchAll(/\b(?:UPDATE|INSERT INTO|DELETE FROM)\s+(\w+)/gi)].map(
      (m) => m[1],
    );
    expect(tablas.length).toBeGreaterThan(0);
    expect(new Set(tablas)).toEqual(new Set(["depurador_descripciones"]));
  });
});

// ─── b · no se borra nada, y no se duplica ───────────────────────────────────

describe("🔴 b. nada se borra, y el índice único no se rompe", () => {
  it("ni un DELETE, ni un DROP, ni un TRUNCATE", () => {
    expect(ejecutable).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(ejecutable).not.toMatch(/\bDROP\b/i);
    expect(ejecutable).not.toMatch(/\bTRUNCATE\b/i);
  });

  it("los dos UPDATE llevan su guarda NOT EXISTS: si el plural ya está, no se duplica", () => {
    const guardas = ejecutable.match(/NOT EXISTS/gi) ?? [];
    expect(guardas).toHaveLength(CAMBIAN.length);
  });

  it.each(CAMBIAN)("la guarda de $marca compara sin distinguir mayúsculas, como el índice", ({ marca, ahora }) => {
    expect(ejecutable).toContain(`lower(x.marca) = lower('${marca}')`);
    expect(ejecutable).toContain(`lower(x.descripcion) = lower('${ahora}')`);
  });
});

// ─── c · TH Kids no se toca ──────────────────────────────────────────────────

describe("🔴 c. TH Kids ya venía en plural y se queda como está", () => {
  it("la migración no nombra a TH Kids ni a sus dos filas", () => {
    expect(ejecutable).not.toContain("TH Kids");
    for (const { descripcion } of NO_SE_TOCAN) expect(ejecutable).not.toContain(descripcion);
  });
});

// ─── d · ninguna migración posterior devuelve el singular ────────────────────

describe("🔴 d. el singular no puede volver por una migración nueva", () => {
  const singulares = CAMBIAN.map((c) => c.antes);

  /** Todas las migraciones del repo, con su versión. */
  const todas = readdirSync(path.join(raiz, CARPETA))
    .filter((n) => n.endsWith(".sql"))
    .map((n) => ({ nombre: n, version: (n.match(/^(\d{14})/) ?? [])[1] ?? "" }));

  it("solo la SEMILLA del 22-jul-2026 ESCRIBE el singular — por eso el UPDATE alcanza", () => {
    // Se mira el SQL EJECUTABLE: la migración de Multifashion del 9-ago-2026
    // nombra el par singular/plural en un COMENTARIO (ya se veía entonces que
    // 69 códigos traían dos descripciones) y eso no escribe nada.
    const anteriores = todas.filter(
      (m) =>
        m.version &&
        m.version < VERSION &&
        singulares.some((s) => sqlEjecutable(leer(`${CARPETA}/${m.nombre}`)).includes(s)),
    );
    expect(anteriores.map((m) => m.nombre)).toEqual([path.basename(SEMILLA)]);
    for (const s of singulares) expect(sqlEjecutable(leer(SEMILLA))).toContain(s);
  });

  it("ninguna migración posterior escribe el singular en el catálogo", () => {
    const culpables: string[] = [];
    for (const m of todas) {
      if (!m.version || m.version <= VERSION) continue;
      const sql = sqlEjecutable(leer(`${CARPETA}/${m.nombre}`));
      if (!/depurador_descripciones/i.test(sql)) continue;
      for (const s of singulares) if (sql.includes(s)) culpables.push(`${m.nombre}: ${s}`);
    }
    expect(culpables).toEqual([]);
  });
});

// ─── e · la conducta real se da vuelta ───────────────────────────────────────

/** El catálogo tal como quedará: los cuatro polos «Core» en plural. Las otras
 *  filas de polo de TH son las medidas en producción el 9-sep-2026. */
const CATALOGO_AHORA: CatalogoDescripciones = {
  "TH Menswear": ["Men-Polos S/S Core", "Men-Polos L/S", "Men-Polos S/S"],
  "TH Womenswear": ["Women-Polos S/S Core", "Women-Polos S/S"],
  "TH Kids": [
    "Boys-Polos S/S Core",
    "Toddler Boys-Polos S/S Core",
    "Boys-Polos L/S",
    "Boys-Polos S/S",
    "Girls-Polos S/S",
  ],
};

/** El mismo catálogo ANTES: los adultos en singular. Es el CONTROL de que el
 *  cambio hace algo — y de que lo que hacía era al revés. */
const CATALOGO_ANTES: CatalogoDescripciones = {
  ...CATALOGO_AHORA,
  "TH Menswear": ["Men-Polo S/S Core", "Men-Polos L/S", "Men-Polos S/S"],
  "TH Womenswear": ["Women-Polo S/S Core", "Women-Polos S/S"],
};

describe("🔴 e. lo que el Depurador dice de cada grafía se dio vuelta", () => {
  it.each(CAMBIAN)("con el catálogo arreglado, «$ahora» ya es del catálogo ($marca)", ({ marca, ahora }) => {
    expect(veredictoDescripcion(ahora, CATALOGO_AHORA, marca).veredicto).toBe("ya-existe");
  });

  it.each(CAMBIAN)("y «$antes» ALERTA, mostrando «$ahora» como su gemela", ({ marca, antes, ahora }) => {
    const v = veredictoDescripcion(antes, CATALOGO_AHORA, marca);
    expect(v.veredicto).toBe("alerta");
    expect(v.motivo).toBe("casi-igual");
    expect(v.gemela).toBe(ahora);
  });

  it("CONTROL — antes era exactamente al revés: la grafía buena era la que alertaba", () => {
    for (const { marca, antes, ahora } of CAMBIAN) {
      expect(veredictoDescripcion(antes, CATALOGO_ANTES, marca).veredicto).toBe("ya-existe");
      const v = veredictoDescripcion(ahora, CATALOGO_ANTES, marca);
      expect(v.veredicto).toBe("alerta");
      expect(v.gemela).toBe(antes);
    }
  });

  it("los 22 artículos de mujer que Switch manda en plural dejan de caer fuera del catálogo", () => {
    expect(veredictoDescripcion("Women-Polos S/S Core", CATALOGO_ANTES, "TH Womenswear").veredicto).toBe("alerta");
    expect(veredictoDescripcion("Women-Polos S/S Core", CATALOGO_AHORA, "TH Womenswear").veredicto).toBe("ya-existe");
  });

  it.each(NO_SE_TOCAN)("$descripcion sigue siendo del catálogo en $marca, antes y después", ({ marca, descripcion }) => {
    expect(veredictoDescripcion(descripcion, CATALOGO_ANTES, marca).veredicto).toBe("ya-existe");
    expect(veredictoDescripcion(descripcion, CATALOGO_AHORA, marca).veredicto).toBe("ya-existe");
  });

  it("las CUATRO filas de polo «Core» del catálogo terminan en plural", () => {
    const core = Object.values(CATALOGO_AHORA)
      .flat()
      .filter((d) => d.endsWith("S/S Core"));
    expect(core).toHaveLength(4);
    for (const d of core) expect(d).toMatch(/Polos S\/S Core$/);
  });
});

// ─── f · nada se parea por parecido ──────────────────────────────────────────

describe("🔴 f. que sean la misma prenda lo dijo Daniel, no una distancia", () => {
  it.each(CAMBIAN)("«$antes» y «$ahora» siguen siendo dos descripciones distintas", ({ antes, ahora }) => {
    expect(antes).not.toBe(ahora);
    expect(esCasiIgual(antes.toLowerCase(), ahora.toLowerCase())).toBe(true);
  });

  it("el parecido solo sirve para ALERTAR: no junta ni reescribe nada solo", () => {
    // Manga larga y manga corta se parecen y NO son la misma prenda: por eso el
    // sistema alerta y espera, en vez de unir por su cuenta.
    const v = veredictoDescripcion("Men-Polos L/S Core", CATALOGO_AHORA, "TH Menswear");
    expect(v.veredicto).toBe("alerta");
    expect(v.normalizada).toBe("Men-Polos L/S Core");
  });
});
