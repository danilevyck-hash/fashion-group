/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CANDADO — EL CSV DE RECLAMOS SE RETIRÓ, Y NO VUELVE (17-sep-2026)
 *
 * Daniel, 8-sep-2026, textual: *«en ningún lado quiero exportar csv, solo
 * excel»*.
 *
 * 🩸 QUÉ SEGUÍA VIVO. `GET /api/reclamos/export` devolvía un CSV con TODOS los
 * reclamos de TODAS las empresas, renglón por renglón, con precios y montos.
 * Medido antes de tocarlo: **ni un solo llamador desde `src/`** — ningún botón,
 * ningún menú. Pero `requireRole` la abría a admin y secretaria, así que
 * cualquiera de los dos que supiera la dirección se bajaba el archivo entero.
 * Un export sin botón no es un export: es una puerta que nadie mira.
 *
 * ⚠️ LO QUE NO SE TOCA — los DOS Excel de Reclamos siguen enteros:
 *   · `GET /api/reclamos/[id]/excel`   — el de UN reclamo, el que se manda al
 *     proveedor adjunto al correo.
 *   · `GET /api/reclamos/export-excel` — el de la lista.
 * Son Excel, que es exactamente lo que Daniel sí quiere.
 *
 * 🔴 `src/lib/csv-export.ts` NO SE BORRA (patrón `mayor_lineas`,
 * `cxc_favorites`): ahí está escrito por qué un CSV de esta casa necesita el
 * BOM —sin él, Excel en Windows rompe las tildes y la ñ—. Se queda SIN
 * LECTORES, y este candado exige que siga así: el día que alguien vuelva a
 * importarlo, el build se pone rojo y Daniel decide.
 *
 * 🔄 Y `cxc-descargas.test.ts` cambió de dirección con nota fechada: su
 * excepción decía «lo usa Reclamos» y por eso el barrido de «en ningún lado se
 * exporta CSV» tenía un agujero con nombre. Ya no.
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import path from "path";

const RAIZ = process.cwd();
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");
/** El código sin comentarios: las historias nombran a propósito lo retirado. */
const sinComentarios = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, "");

/** Todo `src/`, menos los tests (que nombran lo retirado para vigilarlo). */
function fuentes(): string[] {
  const out: string[] = [];
  const caminar = (dir: string) => {
    for (const e of readdirSync(dir)) {
      if (e === "__tests__" || e === "node_modules") continue;
      const full = path.join(dir, e);
      if (statSync(full).isDirectory()) caminar(full);
      else if (/\.(ts|tsx)$/.test(e)) out.push(full);
    }
  };
  caminar(path.join(RAIZ, "src"));
  return out;
}

describe("🔴 la ruta del CSV no existe", () => {
  it("la carpeta se fue entera", () => {
    expect(existsSync(path.join(RAIZ, "src/app/api/reclamos/export/route.ts"))).toBe(false);
    expect(existsSync(path.join(RAIZ, "src/app/api/reclamos/export"))).toBe(false);
  });

  it("y ninguna pantalla puede volver a pedirla", () => {
    for (const f of fuentes()) {
      const codigo = sinComentarios(readFileSync(f, "utf8"));
      expect(codigo, `${path.relative(RAIZ, f)} volvió a llamar al CSV de reclamos`)
        .not.toContain("/api/reclamos/export\"");
      expect(codigo, `${path.relative(RAIZ, f)} volvió a llamar al CSV de reclamos`)
        .not.toContain("/api/reclamos/export?");
      expect(codigo, `${path.relative(RAIZ, f)} volvió a llamar al CSV de reclamos`)
        .not.toContain("/api/reclamos/export`");
    }
  });
});

describe("🔴 `csv-export` se queda, sin un solo lector", () => {
  it("el archivo sigue ahí, con su explicación del BOM", () => {
    expect(existsSync(path.join(RAIZ, "src/lib/csv-export.ts"))).toBe(true);
    const src = leer("src/lib/csv-export.ts");
    expect(src).toContain("CSV_BOM");
    expect(src).toContain("0xfeff");
  });

  it("🔴 pero NADIE lo importa desde `src/`", () => {
    const importadores = fuentes().filter((f) => {
      if (f.endsWith(path.join("lib", "csv-export.ts"))) return false;
      return sinComentarios(readFileSync(f, "utf8")).includes("csv-export");
    });
    expect(importadores.map((f) => path.relative(RAIZ, f))).toEqual([]);
  });

  it("y sus tres helpers ya no se usan en ninguna parte", () => {
    for (const helper of ["csvWithBom(", "buildCsv(", "csvBlob("]) {
      const usuarios = fuentes().filter((f) => {
        if (f.endsWith(path.join("lib", "csv-export.ts"))) return false;
        return sinComentarios(readFileSync(f, "utf8")).includes(helper);
      });
      expect(usuarios.map((f) => path.relative(RAIZ, f)), `volvió ${helper}`).toEqual([]);
    }
  });
});

describe("⚠️ CONTROL: los Excel de Reclamos no se tocaron", () => {
  it("los DOS siguen vivos", () => {
    for (const rel of [
      "src/app/api/reclamos/export-excel/route.ts",
      "src/app/api/reclamos/[id]/excel/route.ts",
    ]) {
      expect(existsSync(path.join(RAIZ, rel)), rel).toBe(true);
      // Y siguen siendo Excel de verdad, no un CSV con otro nombre.
      expect(sinComentarios(leer(rel)), rel).not.toContain("csv-export");
    }
  });

  it("CONTROL de que el barrido no mira una carpeta vacía", () => {
    // Si `fuentes()` devolviera poco, los tests de arriba pasarían solos.
    expect(fuentes().length).toBeGreaterThan(500);
    // Y el barrido sabe encontrar algo que SÍ está: el Excel de la lista.
    const conExcel = fuentes().filter((f) =>
      sinComentarios(readFileSync(f, "utf8")).includes("xlsx-js-style"),
    );
    expect(conExcel.length).toBeGreaterThan(0);
  });

  it("⚠️ el resto del módulo Reclamos sigue entero", () => {
    for (const rel of [
      "src/app/api/reclamos/route.ts",
      "src/app/reclamos/ReclamosClient.tsx",
      "src/lib/reclamos/papel.ts",
    ]) {
      expect(existsSync(path.join(RAIZ, rel)), rel).toBe(true);
    }
  });
});
