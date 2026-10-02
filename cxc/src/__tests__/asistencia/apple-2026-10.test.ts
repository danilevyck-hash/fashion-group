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
  aprobacionesConNombres,
  nombreDePersona,
  pestanaAlAbrir,
  pestanasEnOrdenDelTrabajo,
  selectorDeSeccionEnCelular,
} from "@/lib/asistencia/apple-2026-10";
import type { DiaAprobacion } from "@/lib/asistencia/aprobaciones";
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
    // 2-oct-2026: se suman las tres pantallas que muestran nombres. Ninguna ruta
    // (`app/api`) ni el motor (planilla · reporte · aprobaciones · corte).
    expect(quienes.sort()).toEqual([
      "app/asistencia/AprobacionesTab.tsx",
      "app/asistencia/AsistenciaClient.tsx",
      "app/asistencia/HorariosTab.tsx",
      "lib/asistencia/exportar.ts",
    ]);
    expect(quienes.some((q) => q.startsWith("app/api/"))).toBe(false);
  });
});

// ── 2-oct-2026: el selector de sección del celular y los nombres ─────────────

describe("en el celular la sección es el título", () => {
  it("solo con el interruptor prendido y solo en el celular", () => {
    expect(selectorDeSeccionEnCelular(true, false)).toBe(false);
    expect(selectorDeSeccionEnCelular(false, true)).toBe(false);
    expect(selectorDeSeccionEnCelular(true, true)).toBe(true);
  });

  it("cambia de pestaña por la MISMA puerta de la tira (push en el celular)", () => {
    const src = readFileSync(join(__dirname, "..", "..", "app", "asistencia", "AsistenciaClient.tsx"), "utf8");
    expect(src).toMatch(/aria-label="Sección"[\s\S]{0,200}onChange=\{\(e\) => irAPestana\(/);
  });
});

describe("nombres como se escriben, solo en pantalla", () => {
  it("apagado, el nombre sale tal cual", () => {
    expect(nombreDePersona("KEVIN LUBO", false)).toBe("KEVIN LUBO");
  });

  it("prendido, el gritado se capitaliza y el bien escrito no se toca", () => {
    expect(nombreDePersona("KEVIN LUBO", true)).toBe("Kevin Lubo");
    expect(nombreDePersona("YERITZA YANETH SOLIS CASTRO", true)).toBe("Yeritza Yaneth Solis Castro");
    expect(nombreDePersona("Luz López", true)).toBe("Luz López");
  });

  const dias = (): DiaAprobacion[] => [{
    fecha: "2026-09-17", etiqueta: "jue 17 sep", semana: "2026-09-14", minutos: 90,
    gente: [
      { codigo: "6", etiqueta: "KEVIN LUBO", empresa: "fashion_wear", empresaEtiqueta: "Fashion Wear", salida: "18:30" },
      { codigo: "V-EG", etiqueta: "V-EG", empresa: "vistana", empresaEtiqueta: "Vistana", salida: null },
    ] as unknown as DiaAprobacion["gente"],
  }];

  it("Aprobaciones apagado devuelve la MISMA lista", () => {
    const d = dias();
    expect(aprobacionesConNombres(d, false)).toBe(d);
  });

  it("Aprobaciones prendido: cambia solo la etiqueta; el código sin nombre se queda", () => {
    const [d] = aprobacionesConNombres(dias(), true);
    expect(d.gente.map((g) => g.etiqueta)).toEqual(["Kevin Lubo", "V-EG"]);
    expect(d.gente.map((g) => g.codigo)).toEqual(["6", "V-EG"]);
  });

  it("🔴 lo que se ENVÍA al aprobar no cambia: código, fecha y minutos", () => {
    const toques = (ds: DiaAprobacion[]) =>
      ds.flatMap((d) => d.gente.map((g) => ({ codigo: g.codigo, fecha: d.fecha, minutos: d.minutos })));
    expect(toques(aprobacionesConNombres(dias(), true))).toEqual(toques(dias()));
    // Y el POST de Aprobaciones solo manda la decisión y esos toques.
    const src = readFileSync(join(__dirname, "..", "..", "app", "asistencia", "AprobacionesTab.tsx"), "utf8");
    expect(src).toContain("body: JSON.stringify({ decision, dias: items })");
  });
});
