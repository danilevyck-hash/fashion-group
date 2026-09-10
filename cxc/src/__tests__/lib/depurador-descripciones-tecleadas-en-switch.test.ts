/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 LAS 23 DESCRIPCIONES QUE SWITCH YA TENÍA Y EL CATÁLOGO NO CONOCÍA
 *    (9-sep-2026)
 *
 * 🔑 POR QUÉ FALTABAN — es lo que este archivo existe para dejar escrito:
 *
 *     `depurador_descripciones` SOLO se llena por la Plantilla Switch: la
 *     semilla del 22-jul-2026 y lo que la secretaria aprueba al procesar un
 *     archivo del proveedor. Estos artículos NO entraron por ahí — se tecleron
 *     DIRECTO en Switch, así que el catálogo nunca se enteró de que existían.
 *
 * Resultado: cada vez que llegaba el archivo, esas descripciones caían fuera
 * del catálogo, el producto salía SIN PRECIO y la alarma sonaba otra vez por lo
 * mismo. No es un defecto del veredicto: es el catálogo con un agujero por
 * donde entra la mercancía tecleada a mano.
 *
 * Daniel, textual: «apruébalas todas».
 *
 * 🔴 SON 23 FILAS, NO 27. El grano es (marca, descripción) y CUATRO
 * descripciones llegan en las DOS compañías —«Boys-Shorts Denim»,
 * «Boys-Short Knit», «Men-Short Knit» y «Girls-Panties»—, así que cada una
 * lleva su fila en la casa TH y otra en la CK. Esas ocho filas ya están en las
 * dos listas medidas: 13 (Fashion Wear) + 10 (Vistana) = 23 filas sobre 19
 * descripciones distintas. Sumarle 4 a 23 contaría los duplicados dos veces.
 *
 * ⚠️ LA MARCA ES UNA PROPUESTA RAZONADA, NO UN DATO MEDIDO: sale de dónde vive
 * la HERMANA de cada descripción en el catálogo de hoy. La marca de verdad la
 * manda el Excel del proveedor. Medido el 9-sep-2026: las 23 filas de
 * `switch_articulo_info` traen `marca` en NULL.
 *
 * Lo que este archivo fija, y no se puede volver a romper:
 *   a. la migración da de alta las 23 filas EXACTAS, cada una con su marca;
 *   b. las 9 marcas usadas existen en `MARCAS_CATALOGO`;
 *   c. ninguna descripción se MUEVE al pasar por `normalizeDescripcion`: lo que
 *      se da de alta es lo mismo que sale al Excel de Switch;
 *   d. ninguna crea una casi-gemela dentro de su marca (`esCasiIgual`);
 *   e. nada se borra y la migración es idempotente;
 *   f. la conducta real cambia: cada una pasa de ALERTAR a ser del catálogo;
 *   g. ninguna migración posterior las saca del catálogo.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { veredictoDescripcion, esCasiIgual } from "@/lib/depurador/veredicto";
import { normalizeDescripcion, MARCA_CATALOGO } from "@/lib/depurador/logic";
import type { CatalogoDescripciones } from "@/lib/depurador/logic";

const raiz = process.cwd();
const CARPETA = "supabase/migrations";
const VERSION = "20261027120000";
const MIGRACION = `${CARPETA}/${VERSION}_descripciones_que_switch_ya_tiene.sql`;

const leer = (rel: string) => readFileSync(path.join(raiz, rel), "utf8");

/** El SQL sin comentarios: lo que de verdad corre contra la base. Los
 *  comentarios cuentan la historia y pueden nombrar cualquier cosa. */
function sqlEjecutable(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((l) => l.replace(/--.*$/, ""))
    .join("\n");
}

const ejecutable = sqlEjecutable(leer(MIGRACION));

/** Las 23 filas, escritas a mano acá igual que en la migración. Si alguien
 *  toca una, las dos listas dejan de coincidir y el build se pone rojo. */
const ALTAS = [
  // Fashion Wear · casa TH — 13
  { marca: "TH Accessories", desc: "Kids-Hats", piezas: 332 },
  { marca: "TH Kids", desc: "Boys-Shorts Denim", piezas: 97 },
  { marca: "TH Kids", desc: "Girls-Pant Non-Denim", piezas: 83 },
  { marca: "TH Kids", desc: "Boys-Short Knit", piezas: 72 },
  { marca: "TH Kids", desc: "Toddler Boys-Giftpacks", piezas: 32 },
  { marca: "TH Underwear", desc: "Girls-Panties", piezas: 29 },
  { marca: "TH Kids", desc: "Girls-Short Knit", piezas: 27 },
  { marca: "TH Underwear", desc: "Boys-Underwear Bottoms", piezas: 23 },
  { marca: "TH Kids", desc: "Girls-Pant Knit", piezas: 20 },
  { marca: "TH Kids", desc: "Boys-Swimshorts", piezas: 20 },
  { marca: "TH Kids", desc: "Toddler Boys-Polos S/S", piezas: 6 },
  { marca: "TH Menswear", desc: "Men-Short Knit", piezas: 2 },
  { marca: "TH Legwear", desc: "Women-Socks Dress", piezas: 1 },
  // Vistana · casa CK — 10
  { marca: "CK Underwear", desc: "Girls-Bras", piezas: 428 },
  { marca: "CK Underwear", desc: "Girls-Panties", piezas: 376 },
  { marca: "CK Underwear", desc: "Boys-Brief", piezas: 191 },
  { marca: "CK Kids", desc: "Boys-Shorts Denim", piezas: 96 },
  { marca: "CK Kids", desc: "Boys-Short Knit", piezas: 73 },
  { marca: "CK Kids", desc: "Boys-Shirts Woven S/S", piezas: 36 },
  { marca: "CK Kids", desc: "Kids Unisex-T-Shirts S/S", piezas: 10 },
  { marca: "CK Accessories", desc: "Unisex-Hats", piezas: 6 },
  { marca: "CK Performance", desc: "Men-Short Knit", piezas: 1 },
  { marca: "CK Kids", desc: "Boys-1 Piece", piezas: 1 },
] as const;

/** Las cuatro que necesitan DOS filas porque llegan en las dos compañías. */
const EN_LAS_DOS_CASAS = [
  "Boys-Shorts Denim",
  "Boys-Short Knit",
  "Men-Short Knit",
  "Girls-Panties",
] as const;

/** Los pares (marca, descripción) que la migración escribe de verdad, leídos
 *  del SQL. Se parean contra ALTAS: la lista no puede ser generada. */
function paresDelSql(): { marca: string; desc: string }[] {
  const pares: { marca: string; desc: string }[] = [];
  const re = /\(\s*'([^']+)'\s*,\s*'((?:[^']|'')+)'\s*,\s*true\s*,/g;
  for (const m of ejecutable.matchAll(re)) {
    pares.push({ marca: m[1], desc: m[2].replace(/''/g, "'") });
  }
  return pares;
}

// ─── a · las 23 filas exactas, cada una con su marca ─────────────────────────

describe("🔴 a. la migración da de alta las 23 filas, una por una", () => {
  it("son 23 filas y no 27: cuatro descripciones van en las dos casas", () => {
    expect(ALTAS).toHaveLength(23);
    const distintas = new Set(ALTAS.map((a) => a.desc));
    expect(distintas.size).toBe(19);
    const repetidas = [...distintas].filter(
      (d) => ALTAS.filter((a) => a.desc === d).length === 2,
    );
    expect(new Set(repetidas)).toEqual(new Set(EN_LAS_DOS_CASAS));
  });

  it("el SQL escribe exactamente esos 23 pares, ni uno más ni uno menos", () => {
    const enSql = paresDelSql().map((p) => `${p.marca} | ${p.desc}`).sort();
    const esperados = ALTAS.map((a) => `${a.marca} | ${a.desc}`).sort();
    expect(enSql).toEqual(esperados);
  });

  it.each(ALTAS)("«$desc» entra bajo $marca ($piezas piezas medidas)", ({ marca, desc }) => {
    expect(paresDelSql()).toContainEqual({ marca, desc });
  });

  it("las cuatro repetidas llevan una fila en la casa TH y otra en la CK", () => {
    for (const desc of EN_LAS_DOS_CASAS) {
      const casas = ALTAS.filter((a) => a.desc === desc).map((a) => a.marca.slice(0, 2));
      expect(new Set(casas)).toEqual(new Set(["TH", "CK"]));
    }
  });

  it("la lista es EXPLÍCITA: nada sale de un SELECT contra otra tabla", () => {
    expect(ejecutable).not.toMatch(/INSERT\s+INTO[\s\S]*?\bSELECT\b/i);
    expect(ejecutable).not.toMatch(/\bI?LIKE\b/i);
    expect(ejecutable).not.toContain("%");
  });

  it("solo toca el catálogo de descripciones — ninguna otra tabla", () => {
    const tablas = [...ejecutable.matchAll(/\b(?:UPDATE|INSERT INTO|DELETE FROM)\s+(\w+)/gi)].map(
      (m) => m[1],
    );
    expect(tablas.length).toBeGreaterThan(0);
    expect(new Set(tablas)).toEqual(new Set(["depurador_descripciones"]));
  });

  it("son aprobaciones de Daniel, no semilla: origen 'aprobada'", () => {
    expect(ejecutable).toContain("'aprobada'");
    expect(ejecutable).toContain("'daniel'");
    expect(ejecutable).not.toContain("'seed'");
  });
});

// ─── b · las marcas existen ──────────────────────────────────────────────────

describe("🔴 b. las nueve marcas existen en el catálogo de marcas", () => {
  const marcasOk = new Set(MARCA_CATALOGO.map((m) => m.marca));

  it("son nueve marcas distintas", () => {
    expect(new Set(ALTAS.map((a) => a.marca)).size).toBe(9);
  });

  it.each([...new Set(ALTAS.map((a) => a.marca))])("%s está en MARCAS_CATALOGO", (marca) => {
    expect(marcasOk.has(marca)).toBe(true);
  });

  it("CONTROL — una marca inventada NO está, así que el barrido sirve de algo", () => {
    expect(marcasOk.has("TH Kidswear")).toBe(false);
  });
});

// ─── c · ninguna se mueve al normalizarse ────────────────────────────────────

describe("🔴 c. lo que se da de alta es lo mismo que sale al Excel de Switch", () => {
  it.each(ALTAS)("«$desc» sobrevive intacta a normalizeDescripcion", ({ desc }) => {
    expect(normalizeDescripcion(desc)).toBe(desc);
  });

  it("CONTROL — las tres que SÍ se mueven quedaron fuera de la lista", () => {
    // Se descartaron a propósito: el mapa las limpia a algo que YA existe en el
    // catálogo, así que darlas de alta sucias crearía una gemela.
    const sucias = ["Men-Ties / Neckwear", "Men-Shirts Woven Tops L/S", "Men-Shirts Woven Tops S/S"];
    for (const s of sucias) {
      expect(normalizeDescripcion(s)).not.toBe(s);
      expect(ALTAS.map((a) => a.desc)).not.toContain(s);
    }
  });
});

// ─── d · ninguna crea una casi-gemela en su marca ────────────────────────────

/** El catálogo COMO QUEDA: las 23 nuevas más las hermanas medidas que ya
 *  estaban el 9-sep-2026 y que podrían parecerse a alguna de ellas. */
const HERMANAS: CatalogoDescripciones = {
  "TH Accessories": ["Men-Hats", "Women-Hats", "Men-Giftpacks", "Women-Giftpacks"],
  "TH Kids": [
    "Boys-Giftpacks", "Girls-Giftpacks", "Newborn-Giftpacks", "Boys-Pant Non-Denim",
    "Newborn-Pant Knit", "Boys-Polos S/S", "Girls-Polos S/S", "Toddler Boys-Polos S/S Core",
    "Boys-T-Shirts S/S", "Girls-1 Piece",
  ],
  "TH Underwear": [
    "Girls-Panties 7PK", "Women-Panties 3PK", "Women-Coordinate Panties",
    "Men-Underwear Bottoms", "Men-Underwear Bottoms 2PK", "Women-Bras",
  ],
  "TH Menswear": ["Men-Pant Non-Denim", "Men-Polos S/S", "Men-Swimshorts", "Men-T-Shirts S/S"],
  "TH Legwear": ["Men-Socks Dress", "Men-Socks Sport", "Women-Socks Sport", "Kids-Socks Sport"],
  "CK Underwear": ["Women-Bras", "Women-Panties", "Women-Panties 3PK", "Men-Brief", "Boys-Boxer Brief"],
  "CK Kids": ["Boys-Pant Knit", "Boys-Polos S/S", "Boys-T-Shirts S/S", "Kids Unisex-1 Piece"],
  "CK Accessories": ["Men-Hats", "Women-Hats"],
  "CK Performance": ["Men-Pant Knit", "Women-Short Knit", "Men-T-Shirts S/S", "Women-T-Shirts S/S"],
};

const CATALOGO_ANTES: CatalogoDescripciones = JSON.parse(JSON.stringify(HERMANAS));
const CATALOGO_AHORA: CatalogoDescripciones = JSON.parse(JSON.stringify(HERMANAS));
for (const { marca, desc } of ALTAS) (CATALOGO_AHORA[marca] ??= []).push(desc);

describe("🔴 d. ninguna es la gemela por una «s» de algo que ya estaba", () => {
  it.each(ALTAS)("«$desc» no tiene casi-gemela dentro de $marca", ({ marca, desc }) => {
    const gemelas = (CATALOGO_ANTES[marca] ?? []).filter((d) =>
      esCasiIgual(desc.toLowerCase(), d.toLowerCase()),
    );
    expect(gemelas).toEqual([]);
  });

  it.each(ALTAS)("«$desc» tampoco es gemela de nada en ninguna otra marca", ({ desc }) => {
    const todas = Object.values(CATALOGO_ANTES).flat();
    expect(todas.filter((d) => esCasiIgual(desc.toLowerCase(), d.toLowerCase()))).toEqual([]);
  });

  it("CONTROL — el detector de gemelas sigue vivo: «Girls-Bra» sí lo dispara", () => {
    expect(esCasiIgual("girls-bra", "girls-bras")).toBe(true);
  });
});

// ─── e · nada se borra, y corre dos veces sin daño ───────────────────────────

describe("🔴 e. es un alta: nada se borra y se puede repetir", () => {
  it("ni un DELETE, ni un DROP, ni un TRUNCATE, ni un UPDATE", () => {
    expect(ejecutable).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(ejecutable).not.toMatch(/\bDROP\b/i);
    expect(ejecutable).not.toMatch(/\bTRUNCATE\b/i);
    expect(ejecutable).not.toMatch(/\bUPDATE\b/i);
  });

  it("lleva ON CONFLICT DO NOTHING: corrida dos veces, la segunda no escribe", () => {
    expect(ejecutable).toMatch(/ON\s+CONFLICT\s+DO\s+NOTHING/i);
    // Y jamás DO UPDATE: pisaría una fila que alguien ya aprobó a mano.
    expect(ejecutable).not.toMatch(/ON\s+CONFLICT[\s\S]*?DO\s+UPDATE/i);
  });

  it("las 23 nacen activas", () => {
    expect((ejecutable.match(/,\s*true\s*,\s*'aprobada'/g) ?? [])).toHaveLength(23);
  });

  it("su número no choca con ninguna migración ya escrita", () => {
    const versiones = readdirSync(path.join(raiz, CARPETA))
      .filter((n) => n.endsWith(".sql"))
      .map((n) => (n.match(/^(\d{14})/) ?? [])[1])
      .filter(Boolean);
    expect(versiones.filter((v) => v === VERSION)).toHaveLength(1);
  });
});

// ─── f · la conducta real cambia ─────────────────────────────────────────────

describe("🔴 f. cada una pasa de ALERTAR a ser del catálogo", () => {
  it.each(ALTAS)("con el catálogo al día, «$desc» ya es de $marca", ({ marca, desc }) => {
    expect(veredictoDescripcion(desc, CATALOGO_AHORA, marca).veredicto).toBe("ya-existe");
  });

  it("CONTROL — antes NINGUNA era del catálogo, y por eso salía sin precio", () => {
    for (const { marca, desc } of ALTAS) {
      expect(veredictoDescripcion(desc, CATALOGO_ANTES, marca).veredicto).not.toBe("ya-existe");
    }
  });

  it("una descripción de verdad desconocida SIGUE alertando", () => {
    expect(veredictoDescripcion("Boys-Kilts", CATALOGO_AHORA, "TH Kids").veredicto).toBe("alerta");
  });
});

// ─── g · nadie las saca después ──────────────────────────────────────────────

describe("🔴 g. ninguna migración posterior las saca del catálogo", () => {
  const todas = readdirSync(path.join(raiz, CARPETA))
    .filter((n) => n.endsWith(".sql"))
    .map((n) => ({ nombre: n, version: (n.match(/^(\d{14})/) ?? [])[1] ?? "" }));

  it("nadie las borra ni las apaga en una migración más nueva", () => {
    const culpables: string[] = [];
    for (const m of todas) {
      if (!m.version || m.version <= VERSION) continue;
      const sql = sqlEjecutable(leer(`${CARPETA}/${m.nombre}`));
      if (!/depurador_descripciones/i.test(sql)) continue;
      const borra = /\bDELETE\s+FROM\b/i.test(sql) || /activa\s*=\s*false/i.test(sql);
      if (!borra) continue;
      for (const { desc } of ALTAS) if (sql.includes(desc)) culpables.push(`${m.nombre}: ${desc}`);
    }
    expect(culpables).toEqual([]);
  });

  it("y la tabla del catálogo no se dropea nunca", () => {
    for (const m of todas) {
      if (!m.version || m.version <= VERSION) continue;
      const sql = sqlEjecutable(leer(`${CARPETA}/${m.nombre}`));
      expect(sql).not.toMatch(/DROP\s+TABLE[^;]*depurador_descripciones/i);
    }
  });
});
