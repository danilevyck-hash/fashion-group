/**
 * Candados de los ajustes que habilitó el paso a Vercel PRO (jul-2026).
 *
 * Bajo Hobby el techo de `maxDuration` era 300s y el default de una función es
 * 60s. Dos rutas se habían quedado en 60 y eso las mataba:
 *
 *  - `integrity-check` es el ÚNICO cron con caller HUMANO (el botón "Correr
 *    ahora" de /admin/data-health espera la respuesta para mostrar el resumen).
 *  - `multifashion-sync` — la otra. Se RETIRÓ el 26-jul-2026 junto con la
 *    escritura de `multifashion_tickets` (tabla congelada, ver CLAUDE.md), así
 *    que sus casos salieron de acá: no queda ruta que verificar.
 *
 * Se verifica leyendo la fuente porque `maxDuration` es un export estático que
 * Next lee en build (importar el route arrastraría supabase y Switch).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const root = join(__dirname, "..", "..", "..");
const routeSrc = (...p: string[]) =>
  readFileSync(join(root, "src", "app", "api", "cron", ...p, "route.ts"), "utf8");

const maxDuration = (code: string): number | null => {
  const m = code.match(/export const maxDuration\s*=\s*(\d+)/);
  return m ? Number(m[1]) : null;
};

describe("maxDuration de las rutas que subieron con Pro", () => {
  it("integrity-check ya no muere a los 60s (caller humano)", () => {
    const code = routeSrc("integrity-check");
    expect(maxDuration(code)).toBe(300);
  });

  it("ninguna quedó en el default de 60", () => {
    for (const p of ["integrity-check", "switch-reconciliacion"]) {
      expect(maxDuration(routeSrc(p)), p).toBeGreaterThan(60);
    }
  });

  it("800 es el techo: nadie pide más", () => {
    for (const p of ["integrity-check", "switch-reconciliacion"]) {
      expect(maxDuration(routeSrc(p)) ?? 0, p).toBeLessThanOrEqual(800);
    }
  });
});

describe("next.config.js · comentario de Skew Protection", () => {
  const code = readFileSync(join(root, "next.config.js"), "utf8");

  it("sigue definiendo deploymentId (es lo que activa Skew Protection en Next 14)", () => {
    expect(code).toContain("deploymentId: process.env.VERCEL_DEPLOYMENT_ID");
  });

  it("ya no AFIRMA la ventana fija de 12h como si siguiera vigente", () => {
    expect(code).not.toMatch(/ventana 12h/);
    // Mencionarla en pasado sí vale; lo prohibido es presentarla como el límite
    // actual. Si aparece "12h", tiene que venir con el "dejó de existir".
    if (/12h/.test(code)) expect(code).toMatch(/12h dejó de existir/);
  });

  it("explica que la ventana la fija el Maximum Age del panel", () => {
    expect(code).toMatch(/Maximum Age/);
  });
});
