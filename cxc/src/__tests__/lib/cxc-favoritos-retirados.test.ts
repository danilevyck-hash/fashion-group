/**
 * CANDADO — los favoritos ⭐ del CXC se retiraron, y la TABLA se queda.
 *
 * ─── LA DECISIÓN, dicha por Daniel (4-sep-2026), textual ────────────────────
 *   «quita favoritos»
 *
 * Por qué se fueron, medido contra producción:
 *   · `cxc_favorites` tuvo **0 filas en toda su historia**. Nadie marcó una
 *     estrella jamás, ni en la cartera del grupo ni en la de Boston.
 *   · Su endpoint (`/api/cxc/favorites`) exigía `rolesBoston()` = admin ·
 *     secretaria · gerente_boston. O sea que el **vendedor**, que SÍ ve el CXC,
 *     recibía **403** al tocar la estrella: un botón que solo podía fallar.
 *
 * ─── LO QUE ESTE ARCHIVO VIGILA ─────────────────────────────────────────────
 * 1. 🔴 La TABLA `cxc_favorites` NO se borra. Es el patrón de `mayor_lineas` y
 *    de `multifashion_tickets`: apagar la escritura se deshace en un minuto,
 *    borrar datos no. Ninguna migración puede dropearla ni truncarla.
 * 2. La estrella no vuelve por ninguna de sus cuatro puertas: la ruta, la fila
 *    del escritorio, la card de celular y la pestaña de Boston.
 * 3. La regla de orden «favoritos arriba» no vuelve a `lib/cxc-orden.ts`.
 * 4. CONTROL — el CXC se sigue dibujando y sigue ordenando. Sin esto, borrar
 *    las pantallas enteras pasaría en verde.
 *
 * 🩸 El barrido borra los COMENTARIOS antes de mirar: si no, el propio
 * comentario que explica que la estrella se fue haría fallar al candado — o,
 * peor, lo haría pasar solo.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(__dirname, "../../..");
const SRC = path.join(RAIZ, "src");
const MIGRACIONES = path.join(RAIZ, "supabase", "migrations");

const leer = (rel: string) => fs.readFileSync(path.join(SRC, rel), "utf8");

/** Fuera comentarios: el que explica por qué la estrella se fue no cuenta. */
function sinComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** Sin `{/* … *\/}` de JSX ni comentarios de código. */
const codigo = (rel: string) => sinComentarios(leer(rel));

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 la tabla `cxc_favorites` NO se borra", () => {
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
      expect(sql, `${f} no puede borrar cxc_favorites`).not.toMatch(/DROP\s+TABLE[^;]*cxc_favorites/i);
      expect(sql, `${f} no puede truncar cxc_favorites`).not.toMatch(/TRUNCATE[^;]*cxc_favorites/i);
      expect(sql, `${f} no puede vaciar cxc_favorites`).not.toMatch(/DELETE\s+FROM\s+cxc_favorites/i);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("la estrella no vuelve por ninguna de sus cuatro puertas", () => {
  it("la ruta `/api/cxc/favorites` no existe", () => {
    expect(fs.existsSync(path.join(SRC, "app/api/cxc/favorites"))).toBe(false);
  });

  it("`lib/cxc/anotaciones.ts` ya no tiene ni lectura ni toggle", () => {
    const src = codigo("lib/cxc/anotaciones.ts");
    expect(src).not.toContain("leerFavoritos");
    expect(src).not.toContain("alternarFavorito");
    // CONTROL: las anotaciones que sí se usan siguen ahí, con su cartera.
    expect(src).toContain("guardarOverride");
    expect(src).toContain("registrarContacto");
  });

  it("la fila del escritorio y la card de celular no dibujan ⭐", () => {
    for (const rel of [
      "app/admin/components/ClientRow.tsx",
      "app/admin/components/ClientTable.tsx",
      "app/admin/components/PanelCxcMobile.tsx",
      "app/admin/page.tsx",
      "components/cxc/BostonTab.tsx",
    ]) {
      const src = codigo(rel);
      for (const rastro of ["isFavorite", "onToggleFavorite", "esFavorito", "★", "☆", "/api/cxc/favorites"]) {
        expect(src.includes(rastro), `${rel} trae «${rastro}»`).toBe(false);
      }
    }
  });

  it("nadie guarda favoritos en el navegador tampoco", () => {
    // El estado vivía además en `localStorage` con esa llave; volver a
    // escribirla sería devolver la estrella por la puerta de atrás.
    expect(codigo("app/admin/page.tsx")).not.toContain('"cxc_favorites"');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("el orden del CXC ya no pone a nadie arriba", () => {
  const orden = codigo("lib/cxc-orden.ts");

  it("`compararClientes` no recibe un `esFavorito`", () => {
    expect(orden).not.toContain("esFavorito");
  });

  it("CONTROL: la regla que SÍ manda antes del orden sigue viva", () => {
    // Los saldos a favor (negativos) van al final: no son deuda por cobrar.
    expect(orden).toContain("const aNeg = a.total < 0 ? 1 : 0;");
    expect(orden).toContain("export function ordenarClientes");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("CONTROL — el CXC se sigue dibujando", () => {
  it("la fila del escritorio conserva el nombre, los tramos y el total", () => {
    const fila = codigo("app/admin/components/ClientRow.tsx");
    expect(fila).toContain("client.nombre_normalized");
    expect(fila).toContain("fmt(client.total)");
    expect(fila).toContain("{actionsMenu}");
  });

  it("la card de celular conserva el nombre y el orden por tramo", () => {
    const movil = codigo("app/admin/components/PanelCxcMobile.tsx");
    expect(movil).toContain("ordenarClientes(filtered, { orden })");
    expect(movil).toContain("{client.nombre_normalized}");
  });

  it("la pestaña de Boston conserva su cartera y su orden", () => {
    const boston = codigo("components/cxc/BostonTab.tsx");
    expect(boston).toContain("/api/cxc/boston");
    expect(boston).toContain("compararClientes(ordenable(a), ordenable(b), { orden })");
  });
});
