// ─────────────────────────────────────────────────────────────────────────────
// Candado de la migración que ata las 35 líneas cuyo nombre escrito ES el del
// cliente, y de la REGLA que las hace seguras.
//
// Lo que protege no es la aritmética (eso se mide contra producción con
// `scripts/_verif-migracion-guias-nombres-exactos.ts`), sino las cuatro formas
// en que esto podría hacer daño de verdad:
//
//   1. 🔴 que la normalización se coma un NÚMERO y mezcle N2 con N3,
//   2. que TOQUE EL TEXTO escrito por bodega,
//   3. que la VISTA PREVIA diga una cosa y el UPDATE haga otra,
//   4. que empiece a parear POR PARECIDO.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  leerReglasNombresExactos,
  normalizarComoSql,
  MIGRACION_NOMBRES_EXACTOS,
} from "@/lib/guias/reglas-nombres-exactos";
import {
  digitosDe,
  esParejaSegura,
  sinSufijoLegal,
} from "@/lib/clientes/nombre-normalizado";

const SQL = readFileSync(join(process.cwd(), MIGRACION_NOMBRES_EXACTOS), "utf8");
/** El SQL sin comentarios: lo que Postgres realmente va a ejecutar. */
const SOLO_CODIGO = SQL.split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n");

/**
 * Los nombres REALES del maestro, medidos contra producción el 9-ago-2026.
 * Es la tabla contra la que se prueba la regla — sin datos reales, "el nombre
 * coincide salvo el sufijo legal" es una frase, no una propiedad verificable.
 */
const MAESTRO: Readonly<Record<string, string>> = {
  "D-68": "Grupo Hanna, S.A.",
  "D-156": "Wolf Mall Center Int",
  "D-145": "Super Centro La Competencia S.A.",
  "D-117": "Outlet Duty Free N2, S.A.",
  "D-144": "Star Shoes, S.A.",
  "D-32": "City Moda Los Andes, S.A.",
  "D-122": "Petty Shop, S.A",
  "D-118": "Outlet Duty Free N3, S.A.",
  "D-31": "City Moda Del Este, S.A.",
  "D-27": "City Moda / Calidonia",
  "D-99": "Mas Flow 21 Oeste, S.A.",
  "D-46": "Dollar Mall",
};

/** El texto TAL CUAL está escrito en `guia_items` (medido el 9-ago-2026). */
const ESCRITO_REAL: Readonly<Record<string, string>> = {
  "grupo hanna": "GRUPO HANNA",
  "wolf mall center": "Wolf Mall Center",
  "super centro la competencia": "Super Centro La Competencia",
  "outlet duty free n2": "Outlet Duty Free N2",
  "star shoes": "Star Shoes ",
  "city moda los andes": "City Moda Los Andes ",
  "petty shop": "Petty Shop",
  "outlet duty free n3": "Outlet Duty Free N3",
  "city moda del este": "City moda del este",
  "city moda calidonia": "City Moda Calidonia ",
  "mas flow 21 oeste": "Mas Flow 21 Oeste",
  "dollar mall s, a": "Dollar Mall S, A",
};

describe("la REGLA — igualdad exacta salvo el sufijo legal, sin tocar los números", () => {
  it("quita la coletilla jurídica y la puntuación, y deja los dígitos", () => {
    expect(sinSufijoLegal("Grupo Hanna, S.A.")).toBe("grupo hanna");
    expect(sinSufijoLegal("Wolf Mall Center Int")).toBe("wolf mall center");
    expect(sinSufijoLegal("Petty Shop, S.A")).toBe("petty shop");
    expect(sinSufijoLegal("City Moda / Calidonia")).toBe("city moda calidonia");
    expect(sinSufijoLegal("Dollar Mall S, A")).toBe("dollar mall");
    // 🔴 El número sobrevive a TODO.
    expect(sinSufijoLegal("Outlet Duty Free N2, S.A.")).toBe("outlet duty free n2");
    expect(sinSufijoLegal("Mas Flow 21 Oeste, S.A.")).toBe("mas flow 21 oeste");
  });

  it("🔴 N2, N3 y N4 NO son el mismo nombre — jamás", () => {
    const n2 = "Outlet Duty Free N2, S.A.";
    const n3 = "Outlet Duty Free N3, S.A.";
    expect(sinSufijoLegal(n2)).not.toBe(sinSufijoLegal(n3));
    expect(esParejaSegura("Outlet Duty Free N2", n3)).toBe(false);
    expect(esParejaSegura("Outlet Duty Free N3", n2)).toBe(false);
    expect(esParejaSegura("Sporting Shoes N7", "Sporting Shoes N 4")).toBe(false);
    expect(esParejaSegura("Sporting Shoes", "Sporting Shoes N 4")).toBe(false);
    expect(digitosDe("Outlet Duty Free N2")).toBe("2");
    expect(digitosDe("Outlet Duty Free N3")).toBe("3");
  });

  it("🔴 'S' y 'A' sueltas no se comen el nombre (R.J.A.S.A. → 'r j a', no 'r j')", () => {
    expect(sinSufijoLegal("R.J.A.S.A.")).toBe("r j a");
    expect(sinSufijoLegal("A-Amani, S.A.")).toBe("a amani");
  });

  it("'Inc' solo cuenta al final: 'Fashion City, Inc Ranguni' lo conserva", () => {
    expect(sinSufijoLegal("Fashion City, Inc Ranguni")).toBe("fashion city inc ranguni");
    expect(sinSufijoLegal("Pasos Yiseas, Inc")).toBe("pasos yiseas");
  });

  it("un nombre parecido NO es una pareja segura", () => {
    expect(esParejaSegura("Hanna Calzado", "Hanna Calzados")).toBe(false);
    expect(esParejaSegura("American Clasicc", "American Classics")).toBe(false);
    expect(esParejaSegura("Jerusalem Dutty Free", "Jerusalem Duty Free")).toBe(false);
    expect(esParejaSegura("City Moda Los Pueblos", "City Moda Los Andes, S.A.")).toBe(false);
    expect(esParejaSegura("", "Dollar Mall")).toBe(false);
    expect(esParejaSegura("Dollar Mall", null)).toBe(false);
  });
});

describe("las reglas del SQL", () => {
  const reglas = leerReglasNombresExactos(SQL);

  it("la vista previa y el UPDATE usan las MISMAS reglas", () => {
    // `leerReglasNombresExactos` revienta si los bloques VALUES no coinciden;
    // que llegue hasta acá con reglas en la mano ES la aserción.
    expect(reglas.length).toBe(12);
    expect(() => leerReglasNombresExactos(SQL)).not.toThrow();
  });

  it("es la tabla acordada — 12 nombres, 12 códigos", () => {
    expect(new Set(reglas.map((r) => `${r.cliente}|${r.codigo}`))).toEqual(
      new Set([
        "grupo hanna|D-68",
        "wolf mall center|D-156",
        "super centro la competencia|D-145",
        "outlet duty free n2|D-117",
        "star shoes|D-144",
        "city moda los andes|D-32",
        "petty shop|D-122",
        "outlet duty free n3|D-118",
        "city moda del este|D-31",
        "city moda calidonia|D-27",
        "mas flow 21 oeste|D-99",
        "dollar mall s, a|D-46",
      ]),
    );
  });

  it("🔴 CADA regla cumple la propiedad: mismos dígitos y mismas letras", () => {
    // Éste es EL test. Si alguien agrega un pareo cruzado —el N2 al código del
    // N3, `Sporting Shoes N7` a D-142— acá se pone rojo.
    for (const r of reglas) {
      const nombre = MAESTRO[r.codigo];
      expect(nombre, `falta el nombre real de ${r.codigo}`).toBeTruthy();
      expect(digitosDe(r.cliente), `dígitos de ${r.cliente} vs ${nombre}`).toBe(
        digitosDe(nombre),
      );
      expect(esParejaSegura(r.cliente, nombre), `${r.cliente} → ${r.codigo} (${nombre})`).toBe(
        true,
      );
    }
  });

  it("🔴 un pareo CRUZADO de números sería rechazado por la misma propiedad", () => {
    // La mutación que este archivo existe para cazar, escrita a mano.
    expect(esParejaSegura("outlet duty free n2", MAESTRO["D-118"])).toBe(false);
    expect(esParejaSegura("outlet duty free n3", MAESTRO["D-117"])).toBe(false);
  });

  it("el texto de las reglas es EXACTAMENTE el que produce fg_norm_guia_texto", () => {
    for (const r of reglas) {
      const escrito = ESCRITO_REAL[r.cliente];
      expect(escrito, `falta el texto real de "${r.cliente}"`).toBeTruthy();
      expect(normalizarComoSql(escrito)).toBe(r.cliente);
    }
  });

  it("solo se atan códigos D-XXX del grupo, nunca el 111380 de Boston ni D-201", () => {
    for (const r of reglas) expect(r.codigo).toMatch(/^D-\d+$/);
    expect(SOLO_CODIGO).not.toContain("111380");
    expect(SOLO_CODIGO).not.toContain("D-201");
    // D-200 "City Mall" está borrado por ambiguo: no puede reaparecer acá.
    expect(reglas.some((r) => r.codigo === "D-200")).toBe(false);
  });

  it("🔴 los nombres con error de tipeo NO entran: se atan a mano, con ojos", () => {
    const escritos = reglas.map((r) => r.cliente);
    for (const parecido of [
      "hanna calzado",
      "hanna stores",
      "nine sport",
      "nine sports",
      "american clasicc",
      "jerusalem dutty free",
      "la frontera dutty free",
      "outlet dutty free n3",
      "sporting shoes n7",
      "sporting shoes n8",
      "sporting shoes n9",
      "city moda los pueblos",
      "aidy shop",
    ]) {
      expect(escritos, parecido).not.toContain(parecido);
    }
  });
});

describe("lo que el SQL tiene PROHIBIDO hacer", () => {
  it("🔴 NUNCA escribe el texto de la línea — solo `cliente_codigo`", () => {
    const clausulas = [...SOLO_CODIGO.matchAll(/\bSET\b([\s\S]*?)\n\s*(?:FROM|WHERE)\b/gi)].map(
      (m) => m[1].trim(),
    );
    expect(clausulas.length).toBe(1);
    for (const c of clausulas) {
      // Una coma en el SET ya es una segunda columna.
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

  it("🔴 solo toca filas SIN código: nunca pisa una línea ya atada", () => {
    const updates = SOLO_CODIGO.split(/UPDATE\s+guia_items/i)
      .slice(1)
      .map((u) => u.slice(0, u.indexOf(";") === -1 ? u.length : u.indexOf(";")));
    expect(updates.length).toBe(1);
    for (const u of updates) {
      expect(u).toContain("gi.cliente_codigo IS NULL");
      expect(u).toContain("COALESCE(gi.deleted, false) = false");
      expect(u).toContain("gt.deleted = false");
      expect(u).toMatch(/clientes_master cm WHERE cm\.codigo = .+ AND cm\.deleted = false/);
    }
  });

  it("tiene una VISTA PREVIA que no escribe, antes del UPDATE", () => {
    expect(SQL.indexOf("PASO 1")).toBeGreaterThan(-1);
    expect(SQL.indexOf("PASO 1")).toBeLessThan(SQL.search(/UPDATE\s+guia_items/i));
  });

  it("NO redefine el normalizador: lo exige y para si no está", () => {
    // Dos definiciones de `fg_norm_guia_texto` son dos criterios de pareo
    // esperando a divergir. Ésta lo pide prestado a la migración de City Mall.
    expect(SOLO_CODIGO).not.toMatch(/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION/i);
    expect(SOLO_CODIGO).toContain("to_regprocedure('fg_norm_guia_texto(text)')");
    expect(SOLO_CODIGO).toMatch(/RAISE\s+EXCEPTION/i);
  });
});
