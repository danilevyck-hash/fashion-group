/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CANDADO — LOS ERRORES DEL SERVIDOR TIENEN QUE LLEGAR A SENTRY
 *
 * 🩸 Medido el 14-sep-2026: `sentry.server.config.ts` y `sentry.edge.config.ts`
 * existían desde siempre y NO los importaba nadie. Como desde la versión 8 del
 * SDK el servidor arranca ÚNICAMENTE desde el archivo de instrumentación de
 * Next.js, `Sentry.init` nunca corría fuera del navegador: ni las rutas de API,
 * ni las pantallas del servidor, ni las tres llamadas de `src/middleware.ts`
 * reportaban un solo error. El tablero mostraba menos errores de los que había.
 *
 * Verificado contra el SDK instalado (10.48.0): la única inyección automática
 * que hace en el build es la del navegador (`addSentryToClientEntryProperty`).
 * Para servidor y edge no existe ninguna. Y el propio build lo avisaba en cada
 * corrida: «`Sentry.init` must be called inside of an instrumentation file».
 *
 * Este candado NO mira el bulto ni el estilo: mira que el camino de arranque
 * siga completo de punta a punta.
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import path from "path";

const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

describe("🔴 Sentry: el servidor y el edge se inicializan de verdad", () => {
  it("existe el archivo de instrumentación donde Next.js lo busca", () => {
    // Next 14: la raíz del proyecto, o `src/` cuando se usa esa carpeta.
    // Este repo tiene `src/app`, así que le toca `src/`.
    expect(existsSync(path.join(process.cwd(), "src/instrumentation.ts"))).toBe(true);
  });

  const instrumentacion = leer("src/instrumentation.ts");

  it("exporta `register`, que es el nombre que Next.js llama", () => {
    expect(instrumentacion).toMatch(/export\s+async\s+function\s+register\s*\(/);
  });

  it("carga la configuración del SERVIDOR, y solo en el motor de Node", () => {
    expect(instrumentacion).toContain('process.env.NEXT_RUNTIME === "nodejs"');
    expect(instrumentacion).toContain('await import("../sentry.server.config")');
  });

  it("carga la configuración del EDGE, y solo en el motor edge", () => {
    // El middleware corre aquí: sin esto, sus `captureException` no reportan.
    expect(instrumentacion).toContain('process.env.NEXT_RUNTIME === "edge"');
    expect(instrumentacion).toContain('await import("../sentry.edge.config")');
  });

  it("los dos `import` van DENTRO de su `if`, nunca arriba del archivo", () => {
    // Arriba del archivo, el paquete de Node se cargaría también en el edge,
    // que no lo soporta. La regla se comprueba sobre las sentencias `import`
    // de primer nivel, que es la forma que rompería.
    const importsDeArriba = instrumentacion
      .split("\n")
      .filter((l) => /^\s*import\s/.test(l) && !/^\s*import\s+type\s/.test(l));
    expect(importsDeArriba).toEqual([]);
  });

  it("Next.js 14 tiene el permiso ENCENDIDO y escrito por nosotros", () => {
    // Sin esta bandera, Next 14 ni siquiera lee el archivo de instrumentación.
    expect(leer("next.config.js")).toContain("instrumentationHook: true");
  });

  // ── CONTROL ──────────────────────────────────────────────────────────────
  // Que el camino llegue no sirve de nada si al final no hay un `init` con DSN.
  it.each(["sentry.server.config.ts", "sentry.edge.config.ts"])(
    "%s sigue llamando a Sentry.init con su DSN",
    (rel) => {
      const cfg = leer(rel);
      expect(cfg).toContain("Sentry.init");
      expect(cfg).toContain("dsn: process.env.NEXT_PUBLIC_SENTRY_DSN");
    },
  );
});
