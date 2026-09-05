/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CANDADO — TRES GANCHOS QUE NO ESTÁN ENCHUFADOS, Y NADIE LO SABÍA
 *
 * 5-sep-2026. `useSessionCheck`, `useBadges` y `useKeyboardShortcuts` no tienen
 * un solo importador en toda la app. Consecuencia medida:
 *
 *   · el chequeo de sesión cada 2 minutos NO corre (la sesión se cae sin aviso),
 *   · los contadores del 🔔 NO se cargan, y
 *   · NINGÚN atajo de teclado funciona, salvo ⌘K, que tiene su propio listener
 *     dentro de `SearchBar.tsx`.
 *
 * Cuándo se desenchufaron (git, verificado):
 *   · useSessionCheck      — su único consumidor, `SessionWarning.tsx`, NUNCA se
 *                            montó; se borró el 11-abr-2026 (`69c989da`).
 *   · useKeyboardShortcuts — igual, con `KeyboardShortcutsProvider.tsx`.
 *   · useBadges            — sí corrió, en `home/page.tsx`, hasta el rediseño
 *                            del home del 29-abr-2026 (`5691d24f`).
 *
 * 🩸 Lo que destapó todo: el **5-sep-2026** alguien editó
 * `useKeyboardShortcuts.ts` y el cambio entero fue `q: "/cheques"` →
 * `q: "/recordatorios"`. Se arregló con cuidado un atajo que no está conectado
 * a nada. Ese es el costo de un archivo muerto sin rótulo: trabajo que se
 * evapora, y la falsa sensación de que quedó arreglado.
 *
 * ── QUÉ PROTEGE ESTE ARCHIVO, Y POR QUÉ ESTA REGLA Y NO OTRA ────────────────
 *
 * El encargo daba a elegir entre dos candados. Se eligió el SEGUNDO, y va la
 * razón:
 *
 *   (a) «que falle si alguien EDITA el archivo» — se implementaría con un hash
 *       del contenido. Suena más estricto y protege menos: se pone rojo con un
 *       cambio de formato o un `prettier`, y lo que enseña es a subir el hash
 *       sin leer nada. Un candado que se apaga bajando la palanca no es un
 *       candado. Contra la edición distraída lo que sirve es el rótulo enorme
 *       en la línea 1 del archivo — y de ESE rótulo sí hay caso aquí abajo.
 *
 *   (b) «que exija que si se vuelven a importar, se importen los tres» — es la
 *       regla que se puso, y dispara EXACTAMENTE cuando la conducta de la app
 *       cambia. No molesta nunca mientras nadie los enchufe.
 *
 * 🔴 LO QUE **NO** SE HIZO, A PROPÓSITO: **no se enchufaron**. Encender tres
 * funciones que nunca corrieron en producción es un cambio grande —banner de
 * sesión, consultas cada 60 s, el teclado navegando solo bajo la mano de
 * secretarias y bodegueros— y esa decisión es de Daniel, no está tomada.
 *
 * ── SI ALGÚN DÍA SE ENCHUFAN ────────────────────────────────────────────────
 *
 * Este test se pone rojo y te dice qué falta. El camino es: montar el
 * componente que los use, probar el flujo entero en pantalla, QUITAR el
 * encabezado «SIN USO» de los archivos que se enchufaron, y cambiar este
 * candado de dirección con nota fechada. No se borra: se le da vuelta.
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const RAIZ = path.join(process.cwd(), "src");
const ESTE = "src/__tests__/lib/ganchos-sin-uso.test.ts";

/** Los tres, con el archivo donde viven y lo que dejó de pasar por su culpa. */
const GANCHOS = [
  {
    nombre: "useSessionCheck",
    archivo: "src/lib/hooks/useSessionCheck.ts",
    ruta: "src/app/api/auth/check/route.ts",
    perdido: "el chequeo de sesión cada 2 minutos",
  },
  {
    nombre: "useBadges",
    archivo: "src/lib/hooks/useBadges.ts",
    ruta: "src/app/api/notification-badges/route.ts",
    perdido: "los contadores del 🔔",
  },
  {
    nombre: "useKeyboardShortcuts",
    archivo: "src/lib/hooks/useKeyboardShortcuts.ts",
    ruta: null,
    perdido: "todos los atajos de teclado salvo ⌘K",
  },
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
 * importación. Se mide el import y no la mención suelta a propósito: dos tests
 * ya citan la RUTA de `useKeyboardShortcuts.ts` para revisarle una cadena, y
 * eso no lo enchufa a nada. (De hecho es la trampa: leerlos hace creer que el
 * archivo está vivo.)
 */
function importadores(g: (typeof GANCHOS)[number]): string[] {
  const porRuta = new RegExp(`from\\s+["'][^"']*hooks/${g.nombre}["']`);
  const porNombre = new RegExp(`import\\s*\\{[^}]*\\b${g.nombre}\\b[^}]*\\}\\s*from`);
  return TODOS.filter((f) => {
    if (f.rel === g.archivo || f.rel === ESTE) return false;
    if (f.rel.startsWith("src/__tests__/")) return false;
    const codigo = soloCodigo(f.src);
    return porRuta.test(codigo) || porNombre.test(codigo);
  }).map((f) => f.rel);
}

describe("🔴 los tres ganchos siguen desenchufados (y el rótulo lo dice)", () => {
  it("el barrido llega a todo src (no se quedó mudo)", () => {
    expect(TODOS.length).toBeGreaterThan(500);
  });

  it.each(GANCHOS.map((g) => [g.nombre, g] as const))(
    "%s: cero importadores — %s",
    (_n, g) => {
      expect(
        importadores(g),
        `\n\n«${g.nombre}» volvió a tener importadores. Eso NO es una limpieza:\n` +
          `enciende ${g.perdido}, que hoy no corre.\n\n` +
          `Si es a propósito y Daniel lo aprobó:\n` +
          `  1. monta el componente que lo usa y prueba el flujo en pantalla,\n` +
          `  2. quita el encabezado «SIN USO» de ${g.archivo},\n` +
          `  3. da vuelta este candado con nota fechada (no lo borres),\n` +
          `  4. y enchufa los TRES con su componente, o di aquí por qué no.\n`,
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

  it("los componentes que los montaban ya no existen", () => {
    for (const c of ["src/components/SessionWarning.tsx", "src/components/KeyboardShortcutsProvider.tsx"]) {
      expect(fs.existsSync(path.join(process.cwd(), c)), `${c} volvió`).toBe(false);
    }
  });

  it("CONTROL: la plomería del servidor sigue viva — lo que falta es quien la llame", () => {
    // Si algún día se enchufan, no hay que reconstruir nada del lado servidor.
    for (const g of GANCHOS) {
      if (!g.ruta) continue;
      expect(fs.existsSync(path.join(process.cwd(), g.ruta)), g.ruta).toBe(true);
    }
  });

  it("CONTROL: ⌘K sí funciona, porque tiene su propio listener", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "src/components/SearchBar.tsx"), "utf-8");
    expect(src).toMatch(/metaKey.*\|\|.*ctrlKey/);
    expect(src).toMatch(/e\.key === "k"/);
  });
});
