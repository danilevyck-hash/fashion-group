// ─────────────────────────────────────────────────────────────────────────────
// 🔴 OCULTAR LA PESTAÑA NO PUEDE MOVER UN CENTAVO.
//
// Daniel, 1-sep-2026: *«olvida lo de las vacaciones por ahora, quitalo del ERP
// para no enrredar»*. Se apagó la PESTAÑA (`PESTANAS_OCULTAS`), NO el motor.
//
// 🩸 Y LA DIFERENCIA ES UNA QUINCENA ENTERA DE UNA PERSONA REAL. En producción
// hay 2 vacaciones cargadas, las dos de ELOYN MENDOZA (código 29, fashion_wear,
// $566,52/mes): del 16-jul al 13-ago y el 14-ago, ninguna marcada «ya se le
// pagó». Hoy esos días NO le cuestan nada: el motor los reconoce y el quincenal
// los cubre.
//
// Si alguien, «ya que la pestaña no se ve», sacara `leerVacaciones` del camino
// de cálculo, esos días pasarían a ser AUSENCIAS —porque ella no marcó— y la
// planilla le descontaría el sueldo completo EN SILENCIO. Nadie lo vería hasta
// el día de pago.
//
// Este archivo existe para que eso rompa el build.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { clasificarDia } from "@/lib/asistencia/planilla";
import { PESTANAS_OCULTAS, vePestana } from "@/lib/asistencia/roles";

const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf-8");
/** Fuera comentarios: este archivo NOMBRA lo que vigila. */
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, "");

describe("la pestaña está apagada", () => {
  it("«vacaciones» está en la lista de ocultas", () => {
    expect([...PESTANAS_OCULTAS]).toContain("vacaciones");
  });

  it("🔴 no la ve NADIE, admin incluido: no es un permiso, es una pantalla apagada", () => {
    for (const rol of ["admin", "secretaria", "contabilidad", "bodega", "gerente_boston"]) {
      expect(vePestana(rol, "vacaciones"), rol).toBe(false);
    }
  });

  it("y las demás siguen viéndose — no se apagó de más", () => {
    expect(vePestana("admin", "planilla")).toBe(true);
    expect(vePestana("contabilidad", "reporte")).toBe(true);
    expect(vePestana("bodega", "aprobaciones")).toBe(true);
  });
});

describe("🔴 EL MOTOR SIGUE HONRANDO LO CARGADO — la plata de ELOYN", () => {
  /** Un día de su rango real: martes 21 de julio de 2026, sin una sola marca. */
  const DIA_SIN_MARCAS = {
    fecha: "2026-07-21",
    marcas: [] as string[],
    marcasIds: [] as (string | null)[],
    entrada: null, salida: null,
    tardeMin: 0, excesoAlmuerzoMin: 0, salidaTempranaMin: 0, extraMin: 0, trabajadoMin: 0,
    revisar: false, enCurso: false, ausente: true,
    justificado: null, permiso: null, permisoPerdonaMin: 0, feriado: null, habil: true,
    correcciones: [],
  };

  const REGLAS = { toleranciaTardanzaMin: 10, extraMinimoMin: 10 };

  it("SIN el registro de vacaciones, ese día es una AUSENCIA de día completo", () => {
    const r = clasificarDia(DIA_SIN_MARCAS as never, REGLAS as never);
    // Es el escenario que hay que evitar: 8 h que se le descuentan.
    expect(r.ausenciaMin).toBeGreaterThan(0);
  });

  it("🔴 CON el registro, el mismo día NO descuenta nada", () => {
    const conVacacion = {
      ...DIA_SIN_MARCAS,
      ausente: false,
      vacacion: { yaPagadas: false, desde: "2026-07-16", hasta: "2026-08-13", marcasIgnoradas: [] },
    };
    const r = clasificarDia(conVacacion as never, REGLAS as never);
    // 🔴 TODO en cero: ni ausencia, ni tardanza, ni extra, ni descuento.
    expect(r.ausenciaMin).toBe(0);
    expect(r.vacacionesYaPagadasMin).toBe(0);
    expect(r.tardanzaMin).toBe(0);
    expect(r.extraDiurnoMin).toBe(0);
  });

  it("⚠️ y con «ya se le pagó» SÍ descuenta — el interruptor sigue vivo", () => {
    const yaPagada = {
      ...DIA_SIN_MARCAS,
      ausente: false,
      vacacion: { yaPagadas: true, desde: "2026-07-16", hasta: "2026-08-13", marcasIgnoradas: [] },
    };
    const r = clasificarDia(yaPagada as never, REGLAS as never);
    expect(r.vacacionesYaPagadasMin).toBeGreaterThan(0);
  });
});

describe("BARRIDO — nadie sacó las vacaciones del camino de cálculo", () => {
  it("🔴 la ruta de la planilla sigue llamando `leerVacaciones`", () => {
    const src = sinComentarios(leer("src/app/api/asistencia/planilla/route.ts"));
    expect(src).toMatch(/leerVacaciones\s*\(/);
  });

  it("🔴 `clasificarDia` pregunta por la vacación ANTES que por nada más", () => {
    const src = sinComentarios(leer("src/lib/asistencia/planilla.ts"));
    const cuerpo = src.slice(src.indexOf("export function clasificarDia"));
    const iVac = cuerpo.indexOf("d.vacacion");
    const iFeriado = cuerpo.indexOf("d.feriado");
    expect(iVac).toBeGreaterThan(-1);
    // 🩸 Si se preguntara DESPUÉS, ya se habrían contado cosas que después hay
    // que acordarse de anular — y basta olvidar una para que un día de
    // vacaciones salga con tardanza el día de pago.
    expect(iVac).toBeLessThan(iFeriado);
  });

  it("⛔ la tabla y su lectura NO se borraron con la pestaña", () => {
    expect(() => leer("src/lib/asistencia/vacaciones.ts")).not.toThrow();
    expect(() => leer("src/lib/asistencia/saldo-vacaciones.ts")).not.toThrow();
    expect(() => leer("src/app/api/asistencia/vacaciones/route.ts")).not.toThrow();
    // Y la pantalla queda entera, muerta pero lista para reactivar.
    expect(() => leer("src/app/asistencia/VacacionesTab.tsx")).not.toThrow();
  });
});
