/**
 * CANDADO — `multifashion_tickets` está CONGELADA (26-jul-2026).
 *
 * Qué pasó: la tabla era una COPIA derivada de las facturas de american_classic
 * que ya viven en `switch_facturas`. El módulo Multifashion lee de
 * `_multifashion_sf_vw`, que es una vista sobre `switch_facturas` — nunca sobre
 * esta tabla. Se auditó todo (código TS, los 57 RPCs y las 15 vistas expuestas
 * por PostgREST, migraciones, scripts, vercel.json, backup y el módulo entero) y
 * no apareció UN SOLO lector. Su cron reescribía 183 filas/día con un request
 * HTTP por fila para 0-6 cambios reales.
 *
 * Decisión: se apagó la ESCRITURA; los datos NO se borraron (15.819 filas desde
 * 2025-05-02, candidatas a borrar si en unos meses nadie las extraña).
 *
 * Este archivo falla si alguien vuelve a escribirla sin querer. Si de verdad hay
 * que reencenderla, la vuelta es revertir el PR "retirar multifashion_tickets" y
 * borrar este test — no parchear los greps de abajo.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const CXC = path.resolve(__dirname, "..", "..", "..");
const SRC = path.join(CXC, "src");

/** Todos los .ts/.tsx bajo src/, menos los tests. */
function archivosFuente(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "__tests__" || e.name === "node_modules") continue;
      archivosFuente(p, out);
    } else if (/\.tsx?$/.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

const FUENTES = archivosFuente(SRC);

/** Comentarios fuera: solo interesa el código que corre. */
function sinComentarios(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

const rel = (p: string) => path.relative(CXC, p);

describe("multifashion_tickets — tabla congelada, nadie la escribe", () => {
  it("ningún archivo de src/ hace .from(\"multifashion_tickets\") salvo el backup", () => {
    const culpables = FUENTES.filter((f) => {
      if (rel(f) === "src/app/api/cron/backup/route.ts") return false;
      return /multifashion_tickets/.test(sinComentarios(fs.readFileSync(f, "utf8")));
    }).map(rel);
    expect(culpables).toEqual([]);
  });

  it("el backup la menciona SOLO como dataset a respaldar (lectura), nunca en un write", () => {
    const code = sinComentarios(
      fs.readFileSync(path.join(SRC, "app/api/cron/backup/route.ts"), "utf8"),
    );
    const usos = code.match(/multifashion_tickets/g) ?? [];
    expect(usos.length).toBe(1);
    expect(code).toContain('{ table: "multifashion_tickets" }');
    for (const verbo of ["insert", "update", "upsert", "delete"]) {
      expect(
        new RegExp(`multifashion_tickets[\\s\\S]{0,200}\\.${verbo}\\(`).test(code),
        verbo,
      ).toBe(false);
    }
  });

  it("el cron multifashion-sync y su librería de sync ya no existen", () => {
    expect(fs.existsSync(path.join(SRC, "app/api/cron/multifashion-sync"))).toBe(false);
    expect(fs.existsSync(path.join(SRC, "lib/switch-api/sync.ts"))).toBe(false);
    expect(fs.existsSync(path.join(CXC, "scripts/multifashion-backfill.ts"))).toBe(false);
  });

  it("vercel.json no tiene entrada de cron para multifashion-sync", () => {
    const vercel = JSON.parse(fs.readFileSync(path.join(CXC, "vercel.json"), "utf8")) as {
      crons: Array<{ path: string }>;
    };
    expect(vercel.crons.filter((c) => c.path.includes("multifashion-sync"))).toEqual([]);
  });

  it("ningún vigía de crons sigue esperando el heartbeat de multifashion-sync", () => {
    // Si quedara en estas listas, health-crons daría 503 todos los días y la
    // reconciliación lo re-ejecutaría 3×/día — o sea, volvería a escribir la
    // tabla por la puerta de atrás.
    const vigias = [
      "src/app/api/health-crons/route.ts",
      "src/lib/cron-telemetry.ts",
      "src/lib/switch-api/outage-resumen.ts",
      "src/app/api/cron/switch-reconciliacion/route.ts",
    ];
    for (const f of vigias) {
      const code = sinComentarios(fs.readFileSync(path.join(CXC, f), "utf8"));
      expect(code.includes("multifashion-sync"), f).toBe(false);
    }
  });

  it("el módulo Multifashion sigue leyendo de switch_facturas (vía _multifashion_sf_vw)", () => {
    // La vista, no la tabla: es la razón por la que congelarla no mueve un solo
    // número en pantalla.
    const vista = fs
      .readdirSync(path.join(CXC, "supabase/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => fs.readFileSync(path.join(CXC, "supabase/migrations", f), "utf8"))
      .filter((sql) => /CREATE\s+(OR\s+REPLACE\s+)?VIEW\s+_multifashion_sf_vw/i.test(sql))
      .pop();
    expect(vista, "no encontré la definición de _multifashion_sf_vw").toBeDefined();
    expect(vista as string).toMatch(/FROM\s+switch_facturas/i);
    expect(vista as string).not.toMatch(/multifashion_tickets/);
  });
});
