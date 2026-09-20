/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CANDADO — DOS PUERTAS SIN UN SOLO BOTÓN, RETIRADAS (20-sep-2026, aprobado
 * por Daniel). Y la fecha de la cabecera deja de decirse dos veces.
 *
 * Es el trato que recibió el CSV de Reclamos el 17-sep: *«un export sin botón
 * no es un export: es una puerta que nadie mira»*.
 *
 * 🩸 1. `POST /api/reclamos/[id]/en-proceso` — pasaba un reclamo a «En
 *    proceso». Medido: **0 reclamos en ese estado en toda la historia**, el
 *    estado salió de la pantalla el 10-sep (0 usos en 3 meses) y la ruta no
 *    tenía un solo llamador desde `src/`. Pero su `requireRole` la abría a
 *    admin y secretaria.
 *    ⚠️ EL VALOR NO SE RETIRA de la base: «En proceso» sigue contando como por
 *    cobrar y las transiciones del PATCH no se tocaron, por si alguna fila
 *    quedara ahí algún día.
 *
 * 🩸 2. `GET`/`POST /api/reclamos/motivos` — los motivos personalizados.
 *    `reclamo_custom_motivos` tiene **0 filas en toda su historia** y los
 *    motivos son la lista cerrada de seis desde el rediseño del 10-sep.
 *
 * 🔴 LAS TABLAS NO SE BORRAN (patrón `mayor_lineas`, `cxc_favorites`,
 * `packing_lists`): `reclamo_custom_motivos` queda clasificada `retirada`,
 * fuera del respaldo —no hay una sola fila que proteger— y este candado pone el
 * build ROJO si una migración la dropea, la trunca o la vacía.
 *
 * 🩸 3. LA CABECERA DECÍA LA MISMA FECHA DOS VECES — «26 ago 2026 · … · creado
 *    el 26 ago 2026» — en **14 de los 33 reclamos vivos**. No es casualidad: la
 *    migración `20261114120000` les puso a los 29 viejos `fecha_factura` =
 *    `fecha_reclamo`. El mockup del 11-sep ya decía que «creado el» va *«solo
 *    si aporta»*, y una fecha repetida no aporta.
 * ────────────────────────────────────────────────────────────────────────── */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { seDiceCreadoEl } from "@/lib/reclamos/texto";
import { CLASIFICACION, TABLAS_PERSONAS, TABLAS_RETIRADAS } from "@/lib/backup/tablas";

const RAIZ = process.cwd();
const SRC = path.join(RAIZ, "src");
const MIGRACIONES = path.join(RAIZ, "supabase", "migrations");
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
/** El código sin comentarios: las historias nombran a propósito lo retirado. */
const sinComentarios = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, "");

/** Todo `src/`, menos los tests (que nombran lo retirado para vigilarlo). */
function fuentes(): string[] {
  const out: string[] = [];
  const caminar = (dir: string) => {
    for (const e of fs.readdirSync(dir)) {
      if (e === "__tests__" || e === "node_modules") continue;
      const full = path.join(dir, e);
      if (fs.statSync(full).isDirectory()) caminar(full);
      else if (/\.(ts|tsx)$/.test(e)) out.push(full);
    }
  };
  caminar(SRC);
  return out;
}

// ═══ 1. Las dos rutas no existen ════════════════════════════════════════════
describe("🔴 las dos puertas se fueron enteras", () => {
  it("`/api/reclamos/[id]/en-proceso` no existe", () => {
    expect(fs.existsSync(path.join(SRC, "app/api/reclamos/[id]/en-proceso"))).toBe(false);
  });

  it("`/api/reclamos/motivos` no existe", () => {
    expect(fs.existsSync(path.join(SRC, "app/api/reclamos/motivos"))).toBe(false);
  });

  it("y ninguna pantalla puede volver a pedirlas", () => {
    for (const f of fuentes()) {
      const codigo = sinComentarios(fs.readFileSync(f, "utf8"));
      const rel = path.relative(RAIZ, f);
      expect(codigo, `${rel} volvió a llamar a /en-proceso`).not.toContain("/en-proceso");
      expect(codigo, `${rel} volvió a llamar a /api/reclamos/motivos`).not.toContain("/api/reclamos/motivos");
    }
  });

  it("nadie vuelve a leer ni a escribir `reclamo_custom_motivos`", () => {
    // ⚠️ `lib/backup/tablas.ts` la nombra a propósito: es donde queda ROTULADA
    // como retirada, que es justo lo que este candado quiere que siga pasando.
    const lectores = fuentes().filter((f) =>
      !f.endsWith(path.join("lib", "backup", "tablas.ts"))
      && sinComentarios(fs.readFileSync(f, "utf8")).includes("reclamo_custom_motivos"),
    );
    expect(lectores.map((f) => path.relative(RAIZ, f))).toEqual([]);
  });

  it("⚠️ CONTROL: el barrido mira de verdad `src/` (si diera poco, pasaría solo)", () => {
    expect(fuentes().length).toBeGreaterThan(500);
    // Y sabe encontrar algo que SÍ está: la ruta hermana que no se tocó.
    expect(fuentes().some((f) => f.endsWith(path.join("reclamos", "[id]", "comprobante", "route.ts")))).toBe(true);
  });
});

// ═══ 2. Las tablas no se borran ═════════════════════════════════════════════
describe("🔴 la tabla `reclamo_custom_motivos` NO se borra", () => {
  const sqls = fs
    .readdirSync(MIGRACIONES)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => [f, fs.readFileSync(path.join(MIGRACIONES, f), "utf8")] as const);

  it("el barrido encuentra migraciones (si diera 0, pasaría sin mirar nada)", () => {
    expect(sqls.length).toBeGreaterThan(20);
  });

  it("ninguna migración la dropea, la trunca ni la vacía", () => {
    for (const [f, raw] of sqls) {
      const sql = raw.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
      expect(sql, `${f} no puede borrar reclamo_custom_motivos`).not.toMatch(/DROP\s+TABLE[^;]*reclamo_custom_motivos/i);
      expect(sql, `${f} no puede truncar reclamo_custom_motivos`).not.toMatch(/TRUNCATE[^;]*reclamo_custom_motivos/i);
      expect(sql, `${f} no puede vaciar reclamo_custom_motivos`).not.toMatch(/DELETE\s+FROM\s+reclamo_custom_motivos/i);
    }
  });

  it("queda ROTULADA como `retirada`, que es lo que la saca del respaldo", () => {
    expect(CLASIFICACION["reclamo_custom_motivos"]).toBe("retirada");
    // Y está en la lista de retiradas, no solo ganándole a otra por orden:
    // volver a meterla en `personas` sin sacarla de acá pasaría en verde.
    expect(TABLAS_RETIRADAS).toContain("reclamo_custom_motivos");
    expect(TABLAS_PERSONAS).not.toContain("reclamo_custom_motivos");
  });

  it("⚠️ CONTROL: las tablas VIVAS de Reclamos siguen respaldándose", () => {
    for (const t of ["reclamos", "reclamo_items", "reclamo_settlements", "reclamo_fotos", "reclamo_seguimiento"]) {
      expect(CLASIFICACION[t], t).toBe("personas");
    }
  });
});

// ═══ 3. «En proceso» sigue siendo válido en la base ═════════════════════════
describe("⚠️ el VALOR «En proceso» no se retiró: solo la ruta", () => {
  it("las transiciones del PATCH lo siguen conociendo", () => {
    expect(leer("src/app/api/reclamos/[id]/route.ts")).toContain("En proceso");
  });

  it("y sigue contando como POR COBRAR (no está Pagado)", async () => {
    const { esPendiente } = await import("@/lib/reclamos/pendientes");
    expect(esPendiente({ estado: "En proceso" })).toBe(true);
  });

  it("⚠️ CONTROL: la subida del comprobante, que era compartida, sigue entera", () => {
    expect(fs.existsSync(path.join(SRC, "lib/reclamos/comprobante-storage.ts"))).toBe(true);
    expect(fs.existsSync(path.join(SRC, "app/api/reclamos/[id]/comprobante/route.ts"))).toBe(true);
  });
});

// ═══ 4. La fecha no se dice dos veces ═══════════════════════════════════════
describe("🔴 «creado el» solo si aporta algo", () => {
  it("misma fecha → no se dice (los 14 de 33 medidos)", () => {
    expect(seDiceCreadoEl("2026-08-26", "2026-08-26T10:00:00Z")).toBe(false);
  });

  it("fechas distintas → se dice: ahí sí cuenta cuánto tardó en cargarse", () => {
    expect(seDiceCreadoEl("2026-06-19", "2026-08-26T10:00:00Z")).toBe(true);
  });

  it("⚠️ sin fecha de factura se dice: es la única fecha que hay", () => {
    expect(seDiceCreadoEl(null, "2026-08-26T10:00:00Z")).toBe(true);
    expect(seDiceCreadoEl("", "2026-08-26T10:00:00Z")).toBe(true);
  });

  it("sin fecha de creación no se inventa nada", () => {
    expect(seDiceCreadoEl("2026-08-26", null)).toBe(false);
    expect(seDiceCreadoEl(null, null)).toBe(false);
  });

  it("compara el DÍA, no la hora: la creación trae hora y la factura no", () => {
    expect(seDiceCreadoEl("2026-08-26", "2026-08-26T23:59:59.999Z")).toBe(false);
  });

  it("🔴 la pantalla lo pregunta a esta función, no lo decide por su cuenta", () => {
    const src = sinComentarios(leer("src/app/reclamos/components/ReclamoDetail.tsx"));
    expect(src).toContain("seDiceCreadoEl(current.fecha_factura, current.created_at)");
  });
});
