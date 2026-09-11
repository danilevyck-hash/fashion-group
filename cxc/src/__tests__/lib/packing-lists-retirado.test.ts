// ─────────────────────────────────────────────────────────────────────────────
// PACKING LISTS ESTÁ RETIRADO — Y LAS TABLAS NO SE BORRAN.
//
// Daniel, textual (10-sep-2026): *«packing list no se usa, eliminar»*.
//
// QUÉ ERA. Subías el PDF de la lista de empaque del proveedor, el sistema lo
// leía y te devolvía un PDF con casillas para que bodega marcara bulto por
// bulto al abrir el contenedor.
//
// LO MEDIDO CONTRA PRODUCCIÓN EL 10-SEP-2026, antes de tocar nada:
//   · `packing_lists`: **0 filas**.  `pl_items`: **0 filas**.
//     Vacías desde el 14-may-2026, cuando el cron viejo —que borraba de VERDAD
//     a los 7 días de CREADAS— se llevó las 28 que había, sin copia.
//   · `activity_logs`: **34 rastros** en toda la historia del módulo — 7
//     `packing_list_batch_create` y 3 `packing_list_delete`, TODOS con rol
//     `admin` y entre el 18 y el 22-abr-2026, más 24 latidos del cron. Bodega y
//     las secretarias, que lo tenían en el menú, no lo tocaron NUNCA.
//   · Storage: ningún bucket era suyo (el PDF se leía en el navegador).
//
// 🔴 EL PATRÓN DE LA CASA: el código se va, la TABLA se queda
// (`mayor_lineas`, `cxc_favorites`, `directorio_clientes`). Lo que cambia es
// que estas dos salen del RESPALDO —clase `retirada`— y eso solo se puede
// hacer porque no hay una sola fila que proteger.
//
// LO QUE VIGILA:
//   1. La ficha del módulo no existe, ni su color, ni su ruta en el menú.
//   2. La pantalla, las tres rutas API y el lector de PDF no existen.
//   3. El cron `cleanup-packing-lists` no existe: ni en vercel.json, ni en el
//      registro de código, ni como colateral de la reconciliación.
//   4. Nadie lee ni escribe `packing_lists` / `pl_items` desde `src/`.
//   5. Las dos tablas están clasificadas `retirada` y NINGUNA migración las
//      dropea.
//   6. `/packing-lists` sigue llegando: redirige a `/home` con 307.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";

// `cron-telemetry` arrastra el cliente de Supabase al importarse; acá solo se
// leen sus constantes.
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: { from: vi.fn() } }));
vi.mock("@/lib/telegram", () => ({ sendTelegramAlert: vi.fn(), shortError: (x: string) => x }));

import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import path from "path";
import { CLASIFICACION, TABLAS_PERSONAS, TABLAS_CONGELADAS } from "@/lib/backup/tablas";
import { ALL_MODULES, ALL_MODULE_KEYS } from "@/lib/modules";
import { CRONS_CONOCIDOS, CRONS_FAIL_CLOSED } from "@/lib/cron-telemetry";
import { getModuleColorByKey, getModuleKeyFromPath } from "@/lib/moduleColors";
import { NOVEDADES } from "@/lib/novedades/lista";

const RAIZ = path.resolve(__dirname, "../../..");
const SRC = path.join(RAIZ, "src");
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");

function archivosDe(dir: string, out: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    const p = path.join(dir, nombre);
    if (statSync(p).isDirectory()) archivosDe(p, out);
    else if (/\.(ts|tsx|mjs)$/.test(nombre)) out.push(p);
  }
  return out;
}

const MIGRACIONES = path.join(RAIZ, "supabase", "migrations");

// ── 1. La ficha del módulo ───────────────────────────────────────────────────
describe("1 · la ficha del módulo no existe", () => {
  it("`packing-lists` no está en el catálogo de módulos", () => {
    expect(ALL_MODULE_KEYS).not.toContain("packing-lists");
    expect(ALL_MODULES.map((m) => m.href)).not.toContain("/packing-lists");
  });

  it("🔴 CONTROL · los módulos vecinos de Operación siguen ahí", () => {
    // Sin esto, borrar el catálogo entero también pasaría este archivo.
    for (const key of ["guias", "reclamos", "caja", "marketing", "cheques"]) {
      expect(ALL_MODULE_KEYS, key).toContain(key);
    }
  });

  it("no tiene color de módulo ni ruta que lo pinte", () => {
    expect(getModuleColorByKey("packing-lists")).toBeNull();
    expect(getModuleKeyFromPath("/packing-lists")).toBeNull();
    expect(getModuleKeyFromPath("/packing-lists/abc")).toBeNull();
    // CONTROL: el mecanismo sigue vivo para un módulo que sí existe.
    expect(getModuleKeyFromPath("/guias")).toBe("guias");
  });

  it("no le quedó ninguna novedad (sin módulo no hay pantalla donde mostrarla)", () => {
    expect(NOVEDADES.map((n) => n.modulo)).not.toContain("packing-lists");
    expect(NOVEDADES.map((n) => n.id)).not.toContain("packing-lists-no-se-borran-a-los-7-dias");
  });
});

// ── 2. La pantalla, las rutas y el lector ────────────────────────────────────
describe("2 · la pantalla, las rutas API y el lector de PDF no existen", () => {
  const IDOS = [
    "src/app/packing-lists",
    "src/app/api/packing-lists",
    "src/app/api/cron/cleanup-packing-lists",
    "src/lib/packing-lists",
    "src/lib/parse-packing-list.ts",
    "src/lib/cleanup-packing-lists.ts",
  ];
  for (const rel of IDOS) {
    it(`${rel} ya no existe`, () => {
      expect(existsSync(path.join(RAIZ, rel))).toBe(false);
    });
  }

  it("🔴 CONTROL · las rutas de Guías —el módulo que SÍ usa bodega— siguen ahí", () => {
    expect(existsSync(path.join(SRC, "app", "guias"))).toBe(true);
    expect(existsSync(path.join(SRC, "app", "api", "guias"))).toBe(true);
  });
});

// ── 3. El cron ───────────────────────────────────────────────────────────────
describe("3 · el cron `cleanup-packing-lists` se retiró de las TRES puntas", () => {
  const vercel = JSON.parse(leer("vercel.json")) as { crons: { path: string; schedule: string }[] };

  it("no está en vercel.json", () => {
    expect(vercel.crons.map((c) => c.path)).not.toContain("/api/cron/cleanup-packing-lists");
  });

  it("no está en el registro de código (si quedara, health-crons daría 503 todos los días)", () => {
    expect([...CRONS_FAIL_CLOSED]).not.toContain("cleanup-packing-lists");
    expect(CRONS_CONOCIDOS.has("cleanup-packing-lists")).toBe(false);
  });

  it("no es colateral de la reconciliación", () => {
    const reco = leer("src/app/api/cron/switch-reconciliacion/route.ts");
    expect(reco).not.toContain("runCleanupPackingLists");
    expect(reco).not.toMatch(/cronName:\s*["']cleanup-packing-lists["']/);
  });

  it("🔴 la migración que barre su heartbeat huérfano existe, y borra por nombre EXACTO", () => {
    // Mismo camino que `sync-mayor` (20260914120000): una fila que nadie lee y
    // que envejece para siempre si no se barre.
    const sql = leer("supabase/migrations/20261110120000_retirar_modulo_packing_lists.sql");
    expect(sql).toMatch(/DELETE FROM cron_heartbeats\s+WHERE cron_name = 'cleanup-packing-lists'/);
    expect(sql).not.toMatch(/cron_name\s+LIKE/i);
  });

  it("🔴 la migración saca la key del menú por ROL y por USUARIO, sin tocar otras", () => {
    const sql = leer("supabase/migrations/20261110120000_retirar_modulo_packing_lists.sql");
    expect(sql).toContain("array_remove(modulos, 'packing-lists')");
    expect(sql).toContain("array_remove(modulos_override, 'packing-lists')");
  });
});

// ── 4. Nadie toca las tablas ─────────────────────────────────────────────────
describe("4 · ningún archivo de src/ lee ni escribe packing_lists / pl_items", () => {
  it("cero llamadas (los comentarios que cuentan la historia no cuentan)", () => {
    const culpables = archivosDe(SRC)
      .filter((f) => !f.includes(`${path.sep}__tests__${path.sep}`))
      .filter((f) => !f.endsWith(path.join("lib", "backup", "tablas.ts")))
      .filter((f) => !f.endsWith("database.types.ts"))
      .filter((f) => {
        const src = readFileSync(f, "utf8");
        return (
          /\.from\(\s*["'](packing_lists|pl_items)["']\s*\)/.test(src) ||
          /\.rpc\(\s*["']save_packing_list["']/.test(src)
        );
      })
      .map((f) => path.relative(RAIZ, f));
    expect(culpables).toEqual([]);
  });

  it("`pl_items` ya no está en la lista de campos obligatorios (no hay escritor que validar)", () => {
    const campos = leer("src/lib/campos-obligatorios.ts");
    expect(campos).not.toMatch(/^\s*pl_items:\s*\[/m);
  });
});

// ── 5. Las tablas se QUEDAN ──────────────────────────────────────────────────
describe("5 · las tablas no se borran: clase `retirada` y ninguna migración las dropea", () => {
  it("las dos están clasificadas `retirada`", () => {
    expect(CLASIFICACION["packing_lists"]).toBe("retirada");
    expect(CLASIFICACION["pl_items"]).toBe("retirada");
  });

  it("y por tanto salen del respaldo — se puede porque tienen 0 filas", () => {
    for (const t of ["packing_lists", "pl_items"]) {
      expect([...TABLAS_PERSONAS], t).not.toContain(t);
      expect([...TABLAS_CONGELADAS], t).not.toContain(t);
    }
    const backup = leer("src/app/api/cron/backup/route.ts");
    expect(backup).not.toMatch(/\{\s*table:\s*["'](packing_lists|pl_items)["']/);
  });

  it("🔴 NINGUNA migración las dropea", () => {
    const drops = readdirSync(MIGRACIONES)
      .filter((f) => f.endsWith(".sql"))
      .filter((f) =>
        /drop\s+table\s+(if\s+exists\s+)?["']?(packing_lists|pl_items)/i.test(
          readFileSync(path.join(MIGRACIONES, f), "utf8"),
        ),
      );
    expect(drops).toEqual([]);
  });

  it("🔴 CONTROL · el barrido de DROP sí encontraría uno si existiera", () => {
    const muestra = "DROP TABLE IF EXISTS packing_lists;";
    expect(/drop\s+table\s+(if\s+exists\s+)?["']?(packing_lists|pl_items)/i.test(muestra)).toBe(true);
  });
});

// ── 6. La dirección vieja sigue llegando ─────────────────────────────────────
describe("6 · `/packing-lists` redirige a /home, temporal (307)", () => {
  const config = leer("next.config.js");

  it("la lista y el detalle de una lista, las dos formas", () => {
    expect(config).toContain('{ source: "/packing-lists", destination: "/home", permanent: false }');
    expect(config).toContain('{ source: "/packing-lists/:path*", destination: "/home", permanent: false }');
  });

  it("🔴 temporal, nunca permanente: un 308 se quema en el caché del navegador", () => {
    const lineas = config.split("\n").filter((l) => l.includes('"/packing-lists'));
    expect(lineas.length).toBe(2);
    for (const l of lineas) expect(l).toContain("permanent: false");
  });
});
