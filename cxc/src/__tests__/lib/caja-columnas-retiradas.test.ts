/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CAJA — LO QUE SE RETIRÓ NO VUELVE, Y NO SE BORRA (7-sep-2026).
 *
 * Cinco caminos que nadie usó nunca salieron de la pantalla:
 *   · la ruta `/caja/[id]/nuevo` — 410 líneas que NADA enlazaba;
 *   · «Aprobar reposición» — 0 usos en toda la historia;
 *   · «Restaurar gasto» — 0 usos registrados;
 *   · la columna `empresa` — vacía en 61 de 77, no se mostraba ni se escribía;
 *   · `factura`/`ruc`/`dv` — vacías en 75, 75 y 77 de 77.
 * Más el responsable del gasto, que pasó a ser del PERÍODO.
 *
 * 🔴 Las COLUMNAS NO SE DROPEAN (patrón `mayor_lineas`, `cxc_favorites`, las
 * cinco de `guia_transporte`): quedan sin lectores ni escritores, con su
 * COMMENT. Este archivo pone el build ROJO si una migración las borra o si el
 * código vuelve a tocarlas.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { CAMINOS_RETIRADOS_CAJA, COLUMNAS_RETIRADAS_CAJA } from "@/lib/caja/columnas-retiradas";

const RAIZ = join(__dirname, "..", "..", "..");
const MIGRACIONES = join(RAIZ, "supabase", "migrations");
const read = (...p: string[]) => readFileSync(join(RAIZ, ...p), "utf8");

/** Todo el código de Caja: pantallas, rutas y módulos. Sin los tests. */
function archivosDeCaja(): Array<{ ruta: string; texto: string }> {
  const salida: Array<{ ruta: string; texto: string }> = [];
  const caminar = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) { caminar(p); continue; }
      if (!/\.tsx?$/.test(e.name)) continue;
      // El módulo que LISTA lo retirado los nombra por definición: es la lista,
      // no un uso. Se excluye a propósito.
      if (e.name === "columnas-retiradas.ts") continue;
      salida.push({ ruta: p.replace(RAIZ + "/", ""), texto: readFileSync(p, "utf8") });
    }
  };
  for (const d of ["src/app/caja", "src/app/api/caja", "src/lib/caja"]) {
    const abs = join(RAIZ, d);
    if (existsSync(abs)) caminar(abs);
  }
  salida.push({ ruta: "src/lib/exports/caja-excel.ts", texto: read("src", "lib", "exports", "caja-excel.ts") });
  return salida;
}

/** El texto, con los comentarios borrados: una explicación no es un uso. */
function sinComentarios(texto: string): string {
  return texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("🔴 LA LISTA DE LO RETIRADO ESTÁ COMPLETA", () => {
  it("son estas ocho columnas, medidas contra producción, y ninguna se cae de la lista", () => {
    // Sacar una de acá es sacarle cobertura al candado en silencio.
    expect(COLUMNAS_RETIRADAS_CAJA).toEqual({
      caja_gastos: ["empresa", "factura", "ruc", "dv", "responsable", "responsable_id"],
      caja_periodos: ["repuesto", "repuesto_at"],
    });
    expect(CAMINOS_RETIRADOS_CAJA).toEqual(["src/app/caja/[periodoId]/nuevo/page.tsx"]);
  });
});

describe("🔴 NINGUNA MIGRACIÓN PUEDE DROPEAR LAS COLUMNAS RETIRADAS", () => {
  const migraciones = readdirSync(MIGRACIONES)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => ({ nombre: f, sql: readFileSync(join(MIGRACIONES, f), "utf8").toLowerCase() }));

  for (const [tabla, columnas] of Object.entries(COLUMNAS_RETIRADAS_CAJA)) {
    for (const col of columnas) {
      it(`${tabla}.${col} sigue viva en la base`, () => {
        for (const m of migraciones) {
          expect(
            new RegExp(`alter\\s+table\\s+(only\\s+)?(public\\.)?${tabla}[\\s\\S]{0,200}?drop\\s+column\\s+(if\\s+exists\\s+)?${col}\\b`).test(m.sql),
            `${m.nombre} dropea ${tabla}.${col}`,
          ).toBe(false);
        }
      });
    }
  }

  it("las tablas de Caja tampoco se dropean", () => {
    for (const m of migraciones) {
      for (const tabla of ["caja_gastos", "caja_periodos", "caja_responsables"]) {
        expect(new RegExp(`drop\\s+table\\s+(if\\s+exists\\s+)?(public\\.)?${tabla}\\b`).test(m.sql),
          `${m.nombre} dropea ${tabla}`).toBe(false);
      }
    }
  });

  it("la migración del rediseño documenta cada columna retirada con su COMMENT", () => {
    const sql = read("supabase", "migrations", "20261013120000_caja_menuda_rediseno.sql").toLowerCase();
    for (const [tabla, columnas] of Object.entries(COLUMNAS_RETIRADAS_CAJA)) {
      for (const col of columnas) {
        expect(sql, `falta el COMMENT de ${tabla}.${col}`).toContain(`comment on column ${tabla}.${col} is`);
      }
    }
  });

  it("la migración es ADITIVA: ni un DELETE, ni un DROP COLUMN, ni un TRUNCATE", () => {
    const sql = read("supabase", "migrations", "20261013120000_caja_menuda_rediseno.sql").toLowerCase();
    expect(sql).not.toMatch(/\bdelete\s+from\b/);
    expect(sql).not.toMatch(/\bdrop\s+column\b/);
    expect(sql).not.toMatch(/\btruncate\b/);
    // Los responsables que sobran se APAGAN, no se borran.
    expect(sql).toContain("set activo = false");
  });
});

describe("🔴 EL CÓDIGO NO VUELVE A TOCAR LO RETIRADO", () => {
  const archivos = archivosDeCaja();

  it("la ruta `/caja/[id]/nuevo` no existe y nada la enlaza", () => {
    for (const camino of CAMINOS_RETIRADOS_CAJA) {
      expect(existsSync(join(RAIZ, camino)), `${camino} volvió`).toBe(false);
    }
    for (const a of archivos) {
      expect(sinComentarios(a.texto), `${a.ruta} enlaza la ruta retirada`).not.toMatch(/\/nuevo["'`]/);
    }
  });

  it("«Aprobar reposición» y «Restaurar» no están en ninguna pantalla", () => {
    for (const a of archivos) {
      const t = sinComentarios(a.texto);
      expect(t, `${a.ruta}`).not.toContain("Aprobar reposición");
      expect(t, `${a.ruta}`).not.toContain("Restaurar");
      expect(t, `${a.ruta}`).not.toContain('action: "restore"');
      expect(t, `${a.ruta}`).not.toContain('"repuesto"');
    }
  });

  it("las columnas retiradas no se leen ni se escriben", () => {
    for (const a of archivos) {
      const t = sinComentarios(a.texto);
      // `nro_factura` es la columna VIVA; `factura` a secas es la retirada.
      expect(t, `${a.ruta} toca .empresa`).not.toMatch(/\bempresa:\s|\.empresa\b/);
      expect(t, `${a.ruta} toca responsable_id`).not.toContain("responsable_id");
      expect(t, `${a.ruta} toca repuesto_at`).not.toContain("repuesto_at");
      expect(t, `${a.ruta} toca ruc`).not.toMatch(/\bruc\b/);
      expect(t, `${a.ruta} toca dv`).not.toMatch(/\bdv\b\s*[:.]/);
    }
  });

  it("🔴 CONTROL: lo que SÍ sigue vivo, sigue vivo", () => {
    const juntos = archivos.map((a) => a.texto).join("\n");
    // Estas columnas son las de verdad y tienen que seguir usándose.
    expect(juntos).toContain("nro_factura");
    expect(juntos).toContain("saldo_cierre");
    expect(juntos).toContain("fondo_inicial");
    // El módulo sigue teniendo su alta, su cierre y su papel.
    expect(existsSync(join(RAIZ, "src/app/caja/components/NuevoGastoDrawer.tsx"))).toBe(true);
    expect(existsSync(join(RAIZ, "src/app/caja/components/PrintView.tsx"))).toBe(true);
  });
});

describe("🔴 EL CATÁLOGO DE RESPONSABLES DE CAJA QUEDA SOLO CON ANGELA", () => {
  const sql = readFileSync(join(MIGRACIONES, "20261013120000_caja_menuda_rediseno.sql"), "utf8");

  it("los seis que nunca se usaron se apagan por NOMBRE EXACTO, nunca con un LIKE", () => {
    for (const n of ["andrea", "Jennifer", "Julio", "Otro", "Rey", "Rodrigo"]) {
      expect(sql).toContain(`'${n}'`);
    }
    expect(sql).not.toMatch(/nombre\s+i?like/i);
  });

  it("solo se apaga al que tiene CERO gastos: la guarda está escrita", () => {
    expect(sql).toContain("not exists (select 1 from caja_gastos g where g.responsable_id = r.id)");
  });

  it("Angela se amarra por su identificador exacto y con su código de Asistencia (7)", () => {
    expect(sql).toContain("6295099b-0e10-4966-9c9e-a55a016fdf82");
    expect(sql).toContain("set empleado_codigo = '7'");
  });
});
