/**
 * CANDADO — un `sync_type` nuevo en el código sin su DDL pone el build ROJO.
 *
 * 🩸 Por qué existe: `switch_sync_log.sync_type` tiene un CHECK, y el logger de
 * corridas es DEGRADABLE (si el INSERT falla se traga el error y sigue). La
 * combinación tiene un modo de falla silencioso: un sync que estrena un tipo que
 * el CHECK no lista **no deja NINGUNA fila** —ni 'running', ni 'success', ni
 * 'error'— corra bien o corra mal. Sin filas no hay observabilidad, no hay
 * candado anti-solape y la regla de "2 fallos seguidos" no tiene qué medir.
 *
 * Pasó DOS veces, con meses de diferencia y el mismo desenlace:
 *   · `catalogo_tommy` — cero filas en toda su historia (migración 20260725230000).
 *   · `articulo_marca` — cero filas; la corrida del 7-ago-2026 escribió 2.000
 *     de 8.447 artículos, se rompió a mitad de camino y no dejó rastro.
 *
 * Los dos se descubrieron MESES después, mirando producción. Este test los
 * habría encontrado en el commit que los introdujo: compara la lista del código
 * (`SYNC_LOG_TYPES`) contra la del CHECK vigente, leída del SQL en disco.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
// Se importa del módulo PURO: `sync-log.ts` arrastra Supabase y el candado
// tiene que poder correr en CI sin credenciales.
import { SYNC_LOG_TYPES } from "@/lib/switch-api/sync-log-tipos";

const MIGRATIONS = path.resolve(process.cwd(), "supabase/migrations");

/**
 * La lista del CHECK vigente = la del archivo de migración MÁS NUEVO que
 * redefine `switch_sync_log_sync_type_check`. Un CHECK no se extiende: cada
 * migración lo reescribe entero, así que la última gana.
 */
function checkVigente(): { archivo: string; tipos: string[] } {
  const archivos = fs
    .readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => {
      const sql = fs.readFileSync(path.join(MIGRATIONS, f), "utf8");
      return /ADD\s+CONSTRAINT\s+switch_sync_log_sync_type_check/i.test(sql);
    })
    .sort();
  expect(archivos.length, "ninguna migración define switch_sync_log_sync_type_check").toBeGreaterThan(0);

  const archivo = archivos[archivos.length - 1];
  const sql = fs.readFileSync(path.join(MIGRATIONS, archivo), "utf8");
  const m = sql.match(
    /ADD\s+CONSTRAINT\s+switch_sync_log_sync_type_check\s+CHECK\s*\(\s*sync_type\s+IN\s*\(([\s\S]*?)\)\s*\)/i,
  );
  expect(m, `no pude leer la lista del CHECK en ${archivo}`).toBeTruthy();
  const tipos = [...m![1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  return { archivo, tipos };
}

describe("switch_sync_log.sync_type — el código y la base dicen lo mismo", () => {
  it("todo tipo declarado en el código está en el CHECK (si no, sus corridas son invisibles)", () => {
    const { archivo, tipos } = checkVigente();
    const faltan = SYNC_LOG_TYPES.filter((t) => !tipos.includes(t));
    expect(
      faltan,
      `estos sync_type existen en el código pero NO en el CHECK de ${archivo}: ${faltan.join(", ")}. ` +
        "Sus corridas no dejarían NI UNA fila en switch_sync_log — hay que agregar una migración que reescriba el CHECK.",
    ).toEqual([]);
  });

  it("el CHECK no admite tipos que el código ya no usa (la lista es una sola)", () => {
    const { archivo, tipos } = checkVigente();
    const sobran = tipos.filter((t) => !(SYNC_LOG_TYPES as readonly string[]).includes(t));
    expect(
      sobran,
      `el CHECK de ${archivo} admite ${sobran.join(", ")} y SYNC_LOG_TYPES no los lista`,
    ).toEqual([]);
  });

  it("'articulo_marca' está en las dos listas (la regresión concreta del 7-ago-2026)", () => {
    expect(SYNC_LOG_TYPES).toContain("articulo_marca");
    expect(checkVigente().tipos).toContain("articulo_marca");
  });

  it("'catalogo_tommy' sigue estando (la misma regresión, jul-2026)", () => {
    expect(SYNC_LOG_TYPES).toContain("catalogo_tommy");
    expect(checkVigente().tipos).toContain("catalogo_tommy");
  });

  it("no hay tipos repetidos en la lista del código", () => {
    expect(new Set(SYNC_LOG_TYPES).size).toBe(SYNC_LOG_TYPES.length);
  });
});
