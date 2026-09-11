/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CANDADO — EL GANCHO QUE QUEDA DESENCHUFADO (y los DOS que se retiraron)
 *
 * ⚠️ ESTE CANDADO CAMBIÓ DE DIRECCIÓN EL **11-sep-2026**. NO SE BORRÓ.
 *
 * Nació el 5-sep-2026 vigilando TRES ganchos sin un solo importador en toda la
 * app —`useSessionCheck`, `useBadges` y `useKeyboardShortcuts`—, con esta
 * consecuencia medida: el chequeo de sesión cada 2 minutos no corría, los
 * contadores del 🔔 no se cargaban, y ningún atajo de teclado funcionaba salvo
 * ⌘K (que tiene su propio listener dentro de `SearchBar.tsx`).
 *
 * Lo que decía entonces, textual: *«NO SE ENCHUFARON, a propósito… esa decisión
 * es de Daniel, no está tomada»*. **El 11-sep-2026 Daniel la tomó**, textual:
 *
 *     «quita lo que no funciona»
 *
 * Así que DOS de los tres se RETIRARON —con su plomería de pantalla— y el
 * tercero, `useSessionCheck`, se queda desenchufado y vigilado igual que
 * antes: apagar el aviso de sesión es una decisión distinta y esa sigue sin
 * tomarse.
 *
 * ── LO QUE SE FUE, Y QUÉ SE PERDÍA CON CADA UNO ────────────────────────────
 *
 *   · useKeyboardShortcuts.ts  — `G+H`, `G+C`, `G+G`, `G+Q`, `G+R`, `?`, `J/K`
 *     y `E`. Su único consumidor, `KeyboardShortcutsProvider.tsx`, se borró el
 *     11-abr-2026 (`69c989da`) y NUNCA se había montado en una pantalla.
 *   · useBadges.ts             — los contadores del 🔔. Corrió de verdad en
 *     `home/page.tsx` hasta el rediseño del home del 29-abr-2026 (`5691d24f`).
 *
 * 🩸 Lo que había destapado todo sigue valiendo como lección: el **5-sep-2026**
 * alguien editó `useKeyboardShortcuts.ts` y el cambio entero fue
 * `q: "/cheques"` → `q: "/recordatorios"`. Se arregló con cuidado un atajo que
 * no estaba conectado a nada. Rotular el archivo no alcanzó: seis días después
 * seguía ahí. Lo que de verdad cierra ese agujero es que el archivo no exista.
 *
 * ⚠️ `/api/notification-badges` **NO se borró**, y no es un olvido: la nombran
 * por su RUTA tres candados vivos que son de otros módulos
 * (`reclamos-estado-pagado-unico`, `boston-no-se-mezcla`, `supabase-paginado`).
 * Es el mismo trato que `/api/cxc/contact-log` y `/api/cxc-summary`: la
 * plomería del servidor se queda, sin un solo llamador, y se dice acá.
 *
 * ── SI ALGÚN DÍA SE ENCHUFA `useSessionCheck` ───────────────────────────────
 *
 * Este test se pone rojo y te dice qué falta. El camino es: montar el
 * componente que lo use, probar el flujo entero en pantalla, QUITAR el
 * encabezado «SIN USO» del archivo, y cambiar este candado de dirección con
 * nota fechada. No se borra: se le da vuelta.
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const RAIZ = path.join(process.cwd(), "src");
const ESTE = "src/__tests__/lib/ganchos-sin-uso.test.ts";

/** El que queda: dónde vive y qué dejó de pasar por su culpa. */
const GANCHOS = [
  {
    nombre: "useSessionCheck",
    archivo: "src/lib/hooks/useSessionCheck.ts",
    ruta: "src/app/api/auth/check/route.ts",
    perdido: "el chequeo de sesión cada 2 minutos",
  },
] as const;

/** Los dos que se retiraron el 11-sep-2026, con lo que se fue con cada uno. */
const RETIRADOS = [
  "src/lib/hooks/useKeyboardShortcuts.ts",
  "src/lib/hooks/useBadges.ts",
] as const;

function archivos(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) archivos(p, acc);
    else if (/\.(ts|tsx)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

const TODOS = archivos(RAIZ).map((abs) => ({
  rel: path.relative(process.cwd(), abs),
  src: fs.readFileSync(abs, "utf-8"),
}));

/** Sin comentarios: los encabezados «SIN USO» se nombran unos a otros. */
function soloCodigo(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

/**
 * Un IMPORTADOR de verdad: código desplegable (nada de `__tests__`) con un
 * `import` real del gancho — por su ruta o por su nombre en la lista de
 * importación. Se mide el import y no la mención suelta a propósito.
 */
function importadores(nombre: string, archivo: string): string[] {
  const porRuta = new RegExp(`from\\s+["'][^"']*hooks/${nombre}["']`);
  const porNombre = new RegExp(`import\\s*\\{[^}]*\\b${nombre}\\b[^}]*\\}\\s*from`);
  return TODOS.filter((f) => {
    if (f.rel === archivo || f.rel === ESTE) return false;
    if (f.rel.startsWith("src/__tests__/")) return false;
    const codigo = soloCodigo(f.src);
    return porRuta.test(codigo) || porNombre.test(codigo);
  }).map((f) => f.rel);
}

describe("🔴 el gancho que queda sigue desenchufado (y el rótulo lo dice)", () => {
  it("el barrido llega a todo src (no se quedó mudo)", () => {
    expect(TODOS.length).toBeGreaterThan(500);
  });

  it.each(GANCHOS.map((g) => [g.nombre, g] as const))(
    "%s: cero importadores — %s",
    (_n, g) => {
      expect(
        importadores(g.nombre, g.archivo),
        `\n\n«${g.nombre}» volvió a tener importadores. Eso NO es una limpieza:\n` +
          `enciende ${g.perdido}, que hoy no corre.\n\n` +
          `Si es a propósito y Daniel lo aprobó:\n` +
          `  1. monta el componente que lo usa y prueba el flujo en pantalla,\n` +
          `  2. quita el encabezado «SIN USO» de ${g.archivo},\n` +
          `  3. da vuelta este candado con nota fechada (no lo borres).\n`,
      ).toEqual([]);
    },
  );

  it.each(GANCHOS.map((g) => [g.nombre, g] as const))(
    "%s: lleva el rótulo «SIN USO … ESTO NO CORRE» en la línea 1",
    (_n, g) => {
      const src = fs.readFileSync(path.join(process.cwd(), g.archivo), "utf-8");
      const cabeza = src.slice(0, 2600);
      expect(cabeza, `${g.archivo} perdió el rótulo`).toMatch(/SIN USO desde/);
      expect(cabeza).toMatch(/ESTO NO CORRE/);
      // El caso que lo destapó tiene que seguir contado: es lo que frena a
      // quien viene a "arreglar" una línea que no cambia nada.
      expect(cabeza, `${g.archivo}: falta el caso del 5-sep-2026`).toMatch(/5-sep-2026/);
    },
  );

  it("🔴 los DOS retirados el 11-sep-2026 no volvieron", () => {
    for (const rel of RETIRADOS) {
      expect(
        fs.existsSync(path.join(process.cwd(), rel)),
        `\n\n«${rel}» volvió. Se retiró el 11-sep-2026 porque NO CORRÍA:\n` +
          `cero importadores desde abril. Daniel: «quita lo que no funciona».\n` +
          `Si hace falta de verdad, se trae CON la pantalla que lo usa y este\n` +
          `candado cambia de dirección con nota fechada.\n`,
      ).toBe(false);
    }
  });

  it("los componentes que los montaban ya no existen", () => {
    for (const c of ["src/components/SessionWarning.tsx", "src/components/KeyboardShortcutsProvider.tsx"]) {
      expect(fs.existsSync(path.join(process.cwd(), c)), `${c} volvió`).toBe(false);
    }
  });

  it("CONTROL: la plomería del servidor del que queda sigue viva", () => {
    // Si algún día se enchufa, no hay que reconstruir nada del lado servidor.
    for (const g of GANCHOS) {
      expect(fs.existsSync(path.join(process.cwd(), g.ruta)), g.ruta).toBe(true);
    }
  });

  it("CONTROL: `/api/notification-badges` se queda, sin llamadores, porque la nombran otros candados", () => {
    expect(fs.existsSync(path.join(process.cwd(), "src/app/api/notification-badges/route.ts"))).toBe(true);
    const quienes = TODOS.filter((f) => !f.rel.startsWith("src/__tests__/"))
      .filter((f) => soloCodigo(f.src).includes("/api/notification-badges"))
      .map((f) => f.rel);
    expect(quienes, `alguien volvió a llamar a /api/notification-badges: ${quienes.join(", ")}`).toEqual([]);
  });

  it("CONTROL: ⌘K sí funciona, porque tiene su propio listener", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "src/components/SearchBar.tsx"), "utf-8");
    expect(src).toMatch(/metaKey.*\|\|.*ctrlKey/);
    expect(src).toMatch(/e\.key === "k"/);
  });
});
