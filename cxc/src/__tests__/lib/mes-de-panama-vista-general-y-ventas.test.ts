/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CANDADO — EL «HOY» DE ESTAS DOS PANTALLAS ES EL DE PANAMÁ
 *
 * 11-sep-2026. Dos pantallas seguían decidiendo su período con `new Date()`,
 * cada una con su propio reloj equivocado:
 *
 *   · **Vista General** lo tomaba del NAVEGADOR (`getFullYear`/`getMonth`): un
 *     iPhone puesto en otra zona horaria abre el mes siguiente antes de tiempo.
 *   · **Ventas** lo tomaba del SERVIDOR, que en Vercel corre en **UTC**: las
 *     últimas 5 horas de cada día —después de las 7 p.m. de Panamá— el día UTC
 *     ya es el siguiente, así que cada 31 le pedía a Multifashion el mes que
 *     viene, y la noche del 31-dic la página abría en el año nuevo, vacío.
 *
 * Es el mismo defecto que ya se corrigió en Comisiones (6-sep-2026) y en
 * `ventas_dashboard_prev_same_period_v3` (3-sep-2026). Panamá es **UTC−5 fijo**
 * y la única fuente de «hoy» de la casa es `hoyPanama()`.
 *
 * ⚠️ Ningún cálculo cambia: solo con qué período abre cada pantalla.
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { hoyPanama } from "@/lib/fecha-panama";

const leer = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, "");

describe("🔴 Vista General abre en el mes de Panamá", () => {
  const src = sinComentarios(leer("src/app/vista-general/page.tsx"));

  it("el mes sale de `hoyPanama()`", () => {
    expect(src).toContain("hoyPanama()");
    expect(src).toContain('hoyPanama().slice(0, 7)');
  });

  it("y ya no del reloj del navegador", () => {
    expect(src).not.toMatch(/const d = new Date\(\);\s*return `\$\{d\.getFullYear\(\)\}/);
    expect(src).not.toContain("d.getMonth() + 1");
  });
});

describe("🔴 Ventas abre en el año y el mes de Panamá", () => {
  const src = sinComentarios(leer("src/app/ventas/page.tsx"));

  it("el año y el mes salen de `hoyPanama()`", () => {
    expect(src).toContain("const hoy = hoyPanama();");
    expect(src).toContain("Number(hoy.slice(0, 4))");
    expect(src).toContain("Number(hoy.slice(5, 7))");
  });

  it("y ya no del reloj UTC del servidor", () => {
    expect(src).not.toContain("now.getFullYear()");
    expect(src).not.toContain("now.getMonth() + 1");
  });
});

describe("🔴 la regla: la noche de Panamá no adelanta el mes", () => {
  it("el 31-dic a las 8 p.m. de Panamá (01:00 UTC del 1-ene) sigue siendo diciembre", () => {
    // 2026-01-01T01:00Z = 2025-12-31 20:00 en Panamá.
    const noche = new Date("2026-01-01T01:00:00.000Z");
    expect(hoyPanama(noche)).toBe("2025-12-31");
    expect(hoyPanama(noche).slice(0, 7)).toBe("2025-12");
    expect(Number(hoyPanama(noche).slice(0, 4))).toBe(2025);
  });

  it("CONTROL: a las 6 a.m. de Panamá del 1-ene sí es enero", () => {
    const manana = new Date("2026-01-01T11:00:00.000Z");
    expect(hoyPanama(manana)).toBe("2026-01-01");
  });
});
