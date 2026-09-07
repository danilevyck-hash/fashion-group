// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LAS CUATRO MARCAS TIENEN EL MISMO CANDADO DE FOTO (6-sep-2026)
//
// 🩸 Calvin era la ÚNICA sin él. La migración `20260725120000_foto_manual.sql`
// creó la columna en las tres marcas que existían ese día (Reebok `products`,
// Joybees y Tommy); **Calvin nació el 12-ago-2026, dieciocho días después**, y
// nadie volvió a esa lista. Verificado contra producción el 6-sep-2026 en
// `information_schema.columns`: `calvin_products` no la tiene.
//
// La consecuencia no es cosmética: sin la columna, `skusConFotoManual` devuelve
// el conjunto VACÍO, así que la subida masiva del ZIP del banco B2B **pisa sin
// avisar** la foto que alguien eligió a mano — y el manifiesto la cuenta como
// «asignada» en vez de «respetada». Medido: Tommy tiene 30 fotos protegidas
// así; Calvin, 0 — no porque nadie eligiera, sino porque no puede marcarse.
//
// ⚠️ EL CÓDIGO NO CAMBIÓ, y este candado lo exige: ya era el mismo para las
// cuatro marcas (`lib/catalogos/variantes-server.ts`, por `cfg.productsTable`) y
// ya era tolerante a que la DDL no haya corrido. Lo que faltaba era la columna.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";

const RAIZ = process.cwd();
const MIGRACIONES = path.join(RAIZ, "supabase/migrations");
const NUEVA = "20261011120000_calvin_foto_manual.sql";

const TABLAS = ["products", "joybees_products", "tommy_products", "calvin_products"] as const;

/** El texto de todas las migraciones juntas, en minúsculas. */
function todasLasMigraciones(): string {
  return readdirSync(MIGRACIONES)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(path.join(MIGRACIONES, f), "utf8"))
    .join("\n")
    .toLowerCase();
}

describe("foto_manual — las cuatro tablas de producto, sin excepciones", () => {
  const sql = todasLasMigraciones();

  for (const tabla of TABLAS) {
    it(`alguna migración le agrega foto_manual a ${tabla}`, () => {
      const re = new RegExp(`alter\\s+table\\s+${tabla}\\s+add\\s+column\\s+if\\s+not\\s+exists\\s+foto_manual`, "i");
      expect(re.test(sql), tabla).toBe(true);
    });
  }

  it("CONTROL: una tabla que NO existe no pasaría este barrido", () => {
    const re = /alter\s+table\s+bonobo_products\s+add\s+column\s+if\s+not\s+exists\s+foto_manual/i;
    expect(re.test(sql)).toBe(false);
  });
});

describe("la migración de Calvin es ADITIVA y no borra nada", () => {
  const texto = readFileSync(path.join(MIGRACIONES, NUEVA), "utf8");

  it("existe", () => {
    expect(texto.length).toBeGreaterThan(0);
  });

  it("usa `add column if not exists` con el MISMO default que las otras tres", () => {
    expect(texto).toMatch(/add column if not exists foto_manual boolean not null default false/i);
  });

  it("🔴 no tiene un solo DROP, DELETE, UPDATE ni TRUNCATE", () => {
    const sinComentarios = texto.replace(/^\s*--.*$/gm, "");
    for (const prohibido of [/\bdrop\b/i, /\bdelete\b/i, /\bupdate\b/i, /\btruncate\b/i]) {
      expect(prohibido.test(sinComentarios), prohibido.source).toBe(false);
    }
  });

  it("toca UNA sola tabla: calvin_products", () => {
    const tablas = [...texto.matchAll(/alter\s+table\s+(\w+)/gi)].map((m) => m[1]);
    expect([...new Set(tablas)]).toEqual(["calvin_products"]);
  });

  it("el default es `false` — ninguna fila cambia de comportamiento al aplicarla", () => {
    expect(texto).toMatch(/default false/i);
    expect(texto).not.toMatch(/default true/i);
  });
});

describe("el código trata a las cuatro marcas igual, y tolera que la DDL no haya corrido", () => {
  const server = readFileSync(path.join(RAIZ, "src/lib/catalogos/variantes-server.ts"), "utf8");

  it("`skusConFotoManual` y `guardarFotoElegida` usan la tabla de la marca, no una lista de marcas", () => {
    expect(server).toContain("cfg.productsTable");
    // Ninguna de las dos funciones puede nombrar una tabla concreta.
    for (const tabla of TABLAS) {
      expect(server, tabla).not.toContain(`"${tabla}"`);
    }
  });

  it("sin la columna, guardar la foto REINTENTA sin ella en vez de reventar", () => {
    expect(server).toContain('conFlag.error.message.includes("foto_manual")');
  });

  it("sin la columna, `skusConFotoManual` devuelve vacío (no rompe el ZIP)", () => {
    expect(server).toMatch(/if \(error\) return new Set\(\)/);
  });
});
