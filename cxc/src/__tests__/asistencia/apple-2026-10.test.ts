// ─────────────────────────────────────────────────────────────────────────────
// CANDADO — ASISTENCIA ESTILO APPLE (1-oct-2026)
//
// 1. Apagado, la pantalla es la de hoy: mismas pestañas, mismo orden, abre en
//    Colaboradores.
// 2. Prendido, solo cambian el ORDEN y la pestaña con que abre: ninguna pestaña
//    se agrega ni se quita.
// 3. Ningún número se mueve: ni una ruta (`src/app/api`) ni el motor
//    (`lib/asistencia` fuera de este módulo) importan el interruptor, así que lo
//    que se guarda y lo que se envía no pueden cambiar.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import {
  ASISTENCIA_APPLE_2026_10,
  pestanaAlAbrir,
  pestanasEnOrdenDelTrabajo,
} from "@/lib/asistencia/apple-2026-10";
import {
  PESTANAS_HOY,
  PESTANAS_PERSONA_EN_EL_CENTRO,
  pestanaPorDefecto,
  pestanasDeAsistencia,
  pestanaQueSeAbre,
} from "@/lib/asistencia/persona-en-el-centro";

const claves = (p: readonly (readonly [string, string])[]) => p.map(([k]) => k);
const comoProduccion = () => pestanasDeAsistencia({ personaEnElCentro: true, planillaUnida: true });

describe("apagado = la pantalla de hoy", () => {
  it("el interruptor se entrega apagado hasta que Daniel diga sí", () => {
    expect(ASISTENCIA_APPLE_2026_10).toBe(false);
  });

  it("devuelve la MISMA lista, en el mismo orden", () => {
    for (const lista of [PESTANAS_HOY, PESTANAS_PERSONA_EN_EL_CENTRO, comoProduccion()]) {
      expect(pestanasEnOrdenDelTrabajo(lista, false)).toBe(lista);
    }
  });

  it("abre donde abre hoy", () => {
    expect(pestanaAlAbrir(pestanaPorDefecto(true), false)).toBe("colaboradores");
    expect(pestanaAlAbrir(pestanaPorDefecto(false), false)).toBe("reporte");
  });
});

describe("prendido = orden del trabajo", () => {
  it("Asistencia · Aprobaciones · Planilla · Préstamos · Colaboradores · Marcaciones", () => {
    const nuevas = pestanasEnOrdenDelTrabajo(PESTANAS_PERSONA_EN_EL_CENTRO, true);
    expect(claves(nuevas)).toEqual(["asistencia", "aprobaciones", "planilla", "prestamos", "colaboradores", "marcaciones"]);
  });

  it("no agrega ni quita pestañas, ni cambia un rótulo", () => {
    const hoy = comoProduccion();
    const nuevas = pestanasEnOrdenDelTrabajo(hoy, true);
    expect([...nuevas].sort()).toEqual([...hoy].sort());
    expect(nuevas).toHaveLength(hoy.length);
  });

  it("abre en Asistencia; sin pestaña en la URL cae en la primera, que es Asistencia", () => {
    expect(pestanaAlAbrir("colaboradores", true)).toBe("asistencia");
    expect(pestanaQueSeAbre("", pestanasEnOrdenDelTrabajo(comoProduccion(), true))).toBe("asistencia");
  });

  it("con el acomodo viejo (Reporte primero) no cambia con qué abre", () => {
    expect(pestanaAlAbrir("reporte", true)).toBe("reporte");
  });

  it("un enlace guardado sigue abriendo la misma pestaña", () => {
    const nuevas = pestanasEnOrdenDelTrabajo(comoProduccion(), true);
    for (const k of claves(comoProduccion())) expect(pestanaQueSeAbre(k, nuevas)).toBe(k);
  });

  it("quien solo ve Aprobaciones (bodega) sigue aterrizando ahí", () => {
    const soloAprobar = pestanasEnOrdenDelTrabajo(comoProduccion(), true).filter(([k]) => k === "aprobaciones");
    expect(pestanaQueSeAbre(pestanaAlAbrir("colaboradores", true), soloAprobar)).toBe("aprobaciones");
  });
});

describe("ningún número se mueve", () => {
  const raiz = join(__dirname, "..", "..");
  const archivos = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? archivos(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
    });

  it("ninguna ruta ni el motor importan el interruptor", () => {
    const quienes = [...archivos(join(raiz, "app")), ...archivos(join(raiz, "lib"))]
      .filter((p) => !p.endsWith("apple-2026-10.ts") && readFileSync(p, "utf8").includes("apple-2026-10"))
      .map((p) => p.slice(raiz.length + 1));
    expect(quienes.sort()).toEqual(["app/asistencia/AsistenciaClient.tsx"]);
  });
});
