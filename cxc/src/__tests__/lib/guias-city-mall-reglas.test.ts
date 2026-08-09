// ─────────────────────────────────────────────────────────────────────────────
// Candado de la migración que ata las líneas de City Mall y remapea D-201.
//
// Lo que protege NO es la aritmética (esa se mide contra producción con
// `scripts/_verif-migracion-guias-city-mall.ts`), sino las tres formas en que
// este backfill podría hacer daño de verdad:
//
//   1. que TOQUE EL TEXTO escrito por bodega (`cliente` / `direccion`),
//   2. que la VISTA PREVIA diga una cosa y el UPDATE haga otra,
//   3. que empiece a parear POR PARECIDO y se lleve puesta una tienda que no es.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  leerReglasDeMigracion,
  normalizarComoSql,
  MIGRACION_CITY_MALL,
} from "@/lib/guias/reglas-city-mall";

const SQL = readFileSync(join(process.cwd(), MIGRACION_CITY_MALL), "utf8");
/** El SQL sin comentarios: lo que Postgres realmente va a ejecutar. */
const SOLO_CODIGO = SQL.split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n");

describe("normalizarComoSql — el mismo criterio que fg_norm_guia_texto", () => {
  it("baja mayúsculas, saca acentos y colapsa espacios", () => {
    expect(normalizarComoSql("City Mall")).toBe("city mall");
    expect(normalizarComoSql("CITY MALL")).toBe("city mall");
    expect(normalizarComoSql("  City   Mall  ")).toBe("city mall");
    expect(normalizarComoSql("PENONOMÉ")).toBe("penonome");
    expect(normalizarComoSql("OUTLET VIA ESPAÑA")).toBe("outlet via espana");
    expect(normalizarComoSql(null)).toBe("");
  });

  it("los textos REALES de producción caen donde tienen que caer", () => {
    // Tal cual están escritos en `guia_items` (medido el 9-ago-2026).
    expect(normalizarComoSql("City Mall")).toBe("city mall");
    expect(normalizarComoSql("Paso Canoas")).toBe("paso canoas");
    expect(normalizarComoSql("Pasocanoas")).toBe("pasocanoas");
    expect(normalizarComoSql("Paso Canoa ")).toBe("paso canoa");
    expect(normalizarComoSql("America CLasic")).toBe("america clasic");
    expect(normalizarComoSql("SPORTING SHOES")).toBe("sporting shoes");
    expect(normalizarComoSql("Sporting Shoes N4")).toBe("sporting shoes n4");
    expect(normalizarComoSql("Jerusalem Panama")).toBe("jerusalem panama");
  });

  it("🩸 'Paso Canoas' y 'Paso Canoa' NO son el mismo texto — cada uno necesita su regla", () => {
    // Si se colapsaran, la tabla de reglas parecería redundante y alguien la
    // podría "limpiar", dejando 1 línea sin atar sin que nada avise.
    expect(normalizarComoSql("Paso Canoas")).not.toBe(normalizarComoSql("Paso Canoa"));
    expect(normalizarComoSql("Pasocanoas")).not.toBe(normalizarComoSql("Paso Canoas"));
  });
});

describe("las reglas del SQL", () => {
  const { porDireccion, porNombre } = leerReglasDeMigracion(SQL);

  it("la vista previa y el UPDATE usan las MISMAS reglas", () => {
    // `leerReglasDeMigracion` revienta si los bloques VALUES no coinciden; que
    // llegue hasta acá con reglas en la mano ES la aserción.
    expect(porDireccion.length).toBeGreaterThan(0);
    expect(porNombre.length).toBeGreaterThan(0);
    expect(() => leerReglasDeMigracion(SQL)).not.toThrow();
  });

  it("es la tabla acordada: City Mall por dirección, los otros tres por nombre", () => {
    expect(new Set(porDireccion.map((r) => `${r.cliente}|${r.direccion}|${r.codigo}`))).toEqual(
      new Set([
        "city mall|paso canoas|D-25",
        "city mall|pasocanoas|D-25",
        "city mall|paso canoa|D-25",
        "city mall paso canoa|paso canoas|D-25",
        "city mall david|david|D-24",
        "city mall|david|D-24",
      ]),
    );
    expect(new Set(porNombre.map((r) => `${r.cliente}|${r.codigo}`))).toEqual(
      new Set([
        "sporting shoes|D-142",
        "sporting shoes n4|D-142",
        "american clasic|D-108",
        "america clasic|D-108",
        "american classic store|D-108",
        "jerusalem panama|D-80",
      ]),
    );
  });

  it("🔴 GUABITO NO ES UNA REGLA — ahí despachan los duty free", () => {
    // La línea de la GUÍA 36 sí se ata a D-25 ("era paso canoas", dijo Daniel),
    // pero como corrección PUNTUAL. Si `guabito` entrara en la tabla de
    // equivalencias, la próxima línea de La Frontera / Outlet Duty Free N2 /
    // Jerusalem Duty Free / Wolf Mall en Guabito se ataría a City Mall.
    expect(porDireccion.some((r) => r.direccion.includes("guabito"))).toBe(false);
    expect(porNombre.some((r) => r.cliente.includes("guabito"))).toBe(false);
  });

  it("🔴 la corrección puntual está acotada por NÚMERO DE GUÍA", () => {
    const paso3b = SOLO_CODIGO.slice(SOLO_CODIGO.indexOf("SET cliente_codigo = 'D-25'"));
    const sentencia = paso3b.slice(0, paso3b.indexOf(";"));
    expect(sentencia).toContain("gt.numero = 36");
    expect(sentencia).toContain("'city mall'");
    expect(sentencia).toContain("'guabito'");
    expect(sentencia).toContain("gi.cliente_codigo IS NULL");
    // Y 'guabito' aparece SOLO ahí, nunca en un bloque VALUES de reglas.
    expect((SOLO_CODIGO.toLowerCase().match(/'guabito'/g) ?? []).length).toBe(1);
  });

  it("🔴 D-200 (el 'City Mall' ambiguo, borrado) no es destino de ninguna regla", () => {
    expect([...porDireccion, ...porNombre].some((r) => r.codigo === "D-200")).toBe(false);
  });

  it("🔴 las OTRAS tiendas de Sporting Shoes no se atan a la N4", () => {
    const clientes = porNombre.map((r) => r.cliente);
    for (const otra of [
      "sporting shoes n7",
      "sporting shoes n8",
      "sporting shoes n9",
      "sporting shoes tienda 7",
      "sporting shoes tienda 8",
      "sporting shoes tienda 9",
    ]) {
      expect(clientes).not.toContain(otra);
    }
  });

  it("🔴 'american clasicc' (con tres c) tampoco — no está en la tabla acordada", () => {
    expect(porNombre.map((r) => r.cliente)).not.toContain("american clasicc");
  });

  it("solo se atan códigos D-XXX del grupo, nunca el 111380 de Boston", () => {
    for (const r of [...porDireccion, ...porNombre]) expect(r.codigo).toMatch(/^D-\d+$/);
    expect(SOLO_CODIGO).not.toContain("111380");
  });

  it("D-201 aparece SOLO como origen del remapeo, nunca como destino", () => {
    expect([...porDireccion, ...porNombre].some((r) => r.codigo === "D-201")).toBe(false);
    expect(SOLO_CODIGO).toContain("'D-201'");
    expect(SOLO_CODIGO).toContain("SET cliente_codigo = 'D-108'");
  });
});

describe("lo que el SQL tiene PROHIBIDO hacer", () => {
  it("🔴 NUNCA escribe el texto de la línea — solo `cliente_codigo`", () => {
    // El texto es la prueba de lo que se anotó ese día, y la guía tiene que
    // seguir imprimiendo "City Mall | Paso Canoas" tal cual.
    // Se mira la CLÁUSULA SET ENTERA (hasta FROM/WHERE), no solo su primera
    // asignación: `SET cliente_codigo = x, cliente = 'y'` empieza igual de bien
    // y pisaría el texto. Una coma ahí adentro ya es una segunda columna.
    const clausulas = [...SOLO_CODIGO.matchAll(/\bSET\b([\s\S]*?)\n\s*(?:FROM|WHERE)\b/gi)].map(
      (m) => m[1].trim(),
    );
    expect(clausulas.length).toBe(4); // dirección · nombre · puntual · remapeo
    for (const c of clausulas) {
      expect(c).not.toContain(",");
      expect(c).toMatch(/^cliente_codigo\s*=/);
      expect(c).not.toMatch(/\bcliente\s*=/);
      expect(c).not.toMatch(/\bdireccion\s*=/);
    }
  });

  it("🔴 no borra nada: sin DROP, sin DELETE, sin TRUNCATE", () => {
    expect(SOLO_CODIGO).not.toMatch(/\bDROP\b/i);
    expect(SOLO_CODIGO).not.toMatch(/\bDELETE\b/i);
    expect(SOLO_CODIGO).not.toMatch(/\bTRUNCATE\b/i);
  });

  it("🔴 no parea por parecido: nada de LIKE, ILIKE ni similarity", () => {
    expect(SOLO_CODIGO).not.toMatch(/\bI?LIKE\b/i);
    expect(SOLO_CODIGO).not.toMatch(/similarity|levenshtein|soundex|%>|<->/i);
  });

  /** Cada UPDATE, acotado a su propia sentencia (hasta el `;`). */
  const updates = SOLO_CODIGO.split(/UPDATE\s+guia_items/i)
    .slice(1)
    .map((u) => u.slice(0, u.indexOf(";") === -1 ? u.length : u.indexOf(";")));

  it("los UPDATE de pareo solo tocan filas SIN código (y el remapeo es el único que reescribe)", () => {
    expect(updates.length).toBe(4); // dirección · nombre · puntual · remapeo
    const [porDir, porNom, puntual, remapeo] = updates;
    for (const u of [porDir, porNom, puntual]) expect(u).toContain("gi.cliente_codigo IS NULL");
    // El remapeo es la ÚNICA excepción, y está acotado a D-201.
    expect(remapeo).not.toContain("cliente_codigo IS NULL");
    expect(remapeo).toMatch(/cliente_codigo\)+\s*=\s*'D-201'/);
  });

  it("no escribe en filas borradas ni de guías borradas", () => {
    for (const u of updates) {
      expect(u).toContain("COALESCE(gi.deleted, false) = false");
      expect(u).toContain("gt.deleted = false");
    }
  });

  it("no ata a un cliente que no exista VIVO en el maestro", () => {
    for (const u of updates) {
      expect(u).toMatch(/clientes_master cm WHERE cm\.codigo = .+ AND cm\.deleted = false/);
    }
  });

  it("tiene un paso de VISTA PREVIA que no escribe, antes del primer UPDATE", () => {
    const iPreview = SQL.indexOf("PASO 1");
    const iUpdate = SOLO_CODIGO.search(/UPDATE\s+guia_items/i);
    expect(iPreview).toBeGreaterThan(-1);
    expect(iUpdate).toBeGreaterThan(-1);
    expect(SQL.indexOf("PASO 1")).toBeLessThan(SQL.search(/UPDATE\s+guia_items/i));
  });

  it("el normalizador de Postgres traduce tantos caracteres como recibe", () => {
    // Un `translate` con las dos cadenas de largo distinto BORRA caracteres en
    // silencio: "penonomé" podría quedar "penonom" y no parear nunca.
    const m = SOLO_CODIGO.match(/translate\(coalesce\(t, ''\),\s*'([^']+)',\s*'([^']+)'\)/);
    expect(m).not.toBeNull();
    expect([...m![1]].length).toBe([...m![2]].length);
  });
});
