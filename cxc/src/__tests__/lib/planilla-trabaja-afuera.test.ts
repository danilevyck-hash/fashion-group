/* ─────────────────────────────────────────────────────────────────────────────
 * «TRABAJA AFUERA» — la casilla de la ficha que da vuelta el día sin marca.
 * (14-sep-2026)
 *
 * Daniel, textual:
 *  · *«a ellas cuando están afuera se les paga el día regular como si hubiesen
 *    trabajado las 8 horas, en horario de 9-6, con una hora de almuerzo»*
 *  · *«cuando marcan, que es cuando trabajan en la tienda, trabajan de 10 a 7»*
 *
 * 🩸 Ana Trejos (2) y Cindy De Gracia (3) son impulsadoras: 1 día con marca de
 * 22 hábiles (16-ago → 15-sep-2026). Cada día sin marca era una AUSENCIA y se
 * descontaba; la contadora pagaba el mes completo a mano. Medido en la quincena
 * 1–15 sep: Ana 9 ausencias ($207,36), Cindy 9 ($190,08), Rodrigo 1 ($36,96).
 * Con 21 días afuera al mes, cargarlos a mano cada quincena es la solución
 * equivocada: 🔴 nadie carga nada, nunca. Es por FICHA y se decide solo.
 *
 * ── LAS REGLAS ───────────────────────────────────────────────────────────────
 * 1. Con la casilla, un día hábil sin marca deja de ser ausencia y se paga: es
 *    «Trabajo de vendedor» puesto solo. Sin la casilla, NADA cambia (control).
 * 2. 🔴 El día CON marca se mide EXACTAMENTE igual que hoy: tardanza, extra,
 *    salida temprana, día por día.
 * 3. Un feriado, un fin de semana, una vacación, una justificación cargada o un
 *    día en curso siguen mandando: la casilla solo decide sobre un día hábil,
 *    ya pasado, sin marca y sin ninguna otra explicación.
 * 4. `no_marca_reloj` sigue haciendo lo suyo: si alguien tiene las dos, el
 *    reloj se ignora SIEMPRE (esa casilla gana).
 * 5. Quien no marcó ni un día de la quincena no es un pendiente («no marcó ni
 *    un día»): cobra su quincenal. Sin la casilla, sigue siendo pendiente.
 * 6. El dato: solo `true` cuenta; la columna nace con la migración SIN APLICAR
 *    y por eso se lee APARTE de las fichas y falla abierta a «nadie».
 * 7. Se dice en pantalla: chip «Trabaja afuera» en la ficha y en la planilla.
 *
 * Fechas fijas, nunca `new Date()`.
 * ─────────────────────────────────────────────────────────────────────────── */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import { MOTIVO_TRABAJO_VENDEDOR, esTrabajoDeVendedor, textoDiaJustificado } from "@/lib/asistencia/motivos";
import {
  CHIP_TRABAJA_AFUERA, COLUMNA_TRABAJA_AFUERA, MIGRACION_TRABAJA_AFUERA, PREGUNTA_TRABAJA_AFUERA,
  esColumnaTrabajaAfueraFaltante, motivoAutomaticoDelDiaSinMarca, trabajaAfuera, validarTrabajaAfuera,
  avisoMigracionTrabajaAfuera,
} from "@/lib/asistencia/trabaja-afuera";
import { armarReporte, type Justificacion, type Marcacion } from "@/lib/asistencia/reporte";
import type { Vacacion } from "@/lib/asistencia/vacaciones";
import {
  FALTA, MIN_DIA_NO_TRABAJADO, armarLinea, armarPlanilla, jornadaDiariaMin, medirHoras, MANUALES_CERO,
  type FichaPlanilla,
} from "@/lib/asistencia/planilla";
import { excepcionesDeLaFicha, type PersonaFicha } from "@/lib/asistencia/ficha-persona";

const RAIZ = path.resolve(__dirname, "../../..");
const leer = (p: string) => fs.readFileSync(path.join(RAIZ, p), "utf8");
const puro = (p: string) =>
  leer(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const R = REGLAS_DEFAULT;
const COD = "2";
// Multifashion: entra a las 10, sale a las 19, una hora de almuerzo.
const HORARIO = [{ empleado_codigo: COD, entrada: "10:00", salida: "19:00", almuerzo_minutos: 60 }];
// Lunes 7 a viernes 11 de septiembre de 2026: cinco días hábiles.
const DESDE = "2026-09-07", HASTA = "2026-09-11";
const FICHA: FichaPlanilla = {
  codigo: COD, nombre: "ANA TREJOS", salarioMensual: 800, jornadaSemanal: 40, empresa: "vistana",
};
const CON_CASILLA: FichaPlanilla = { ...FICHA, trabajaAfuera: true };

const dia = (fecha: string, entrada: string, salida: string): Marcacion[] => [
  { empleado_codigo: COD, empleado_nombre: null, ocurrio_en: `${fecha}T${entrada}:00-05:00` },
  { empleado_codigo: COD, empleado_nombre: null, ocurrio_en: `${fecha}T13:00:00-05:00` },
  { empleado_codigo: COD, empleado_nombre: null, ocurrio_en: `${fecha}T14:00:00-05:00` },
  { empleado_codigo: COD, empleado_nombre: null, ocurrio_en: `${fecha}T${salida}:00-05:00` },
];
const just = (motivo: string, desde: string, hasta: string): Justificacion => ({
  empleado_codigo: COD, desde, hasta, motivo, hora_desde: null, hora_hasta: null,
});

interface Escenario {
  casilla: boolean;
  justificaciones?: Justificacion[];
  vacaciones?: Vacacion[];
  feriados?: Map<string, string>;
  hasta?: string;
  diaEnCurso?: string;
}
function correr(marcaciones: Marcacion[], e: Escenario) {
  const ficha = e.casilla ? CON_CASILLA : FICHA;
  const [p] = armarReporte({
    marcaciones, horarios: HORARIO, justificaciones: e.justificaciones ?? [],
    vacaciones: e.vacaciones ?? [], feriados: e.feriados ?? new Map(),
    desde: DESDE, hasta: e.hasta ?? HASTA, reglas: R, nombres: new Map([[COD, FICHA.nombre!]]),
    incluirNoHabiles: true, diaEnCurso: e.diaEnCurso ?? null,
    trabajaAfuera: e.casilla ? new Set([COD]) : new Set(),
  });
  const horas = medirHoras(p, R, jornadaDiariaMin(HORARIO[0]));
  return { p, horas, linea: armarLinea(ficha, horas, MANUALES_CERO, R) };
}
const el = (p: { dias: { fecha: string }[] }, fecha: string) => p.dias.find((d) => d.fecha === fecha)!;

const SEMANA_COMPLETA = [
  ...dia("2026-09-07", "10:00", "19:00"), ...dia("2026-09-08", "10:00", "19:00"),
  ...dia("2026-09-09", "10:00", "19:00"), ...dia("2026-09-10", "10:00", "19:00"),
  ...dia("2026-09-11", "10:00", "19:00"),
];
/** Solo el lunes en la tienda; martes a viernes afuera, sin marcar. */
const SOLO_LUNES = dia("2026-09-07", "10:00", "19:00");

describe("1. con la casilla, el día hábil sin marca deja de ser ausencia y se paga", () => {
  it("🔴 lunes marcado y martes–viernes sin marca: 0 ausencias, el mismo neto que la semana completa", () => {
    const completa = correr(SEMANA_COMPLETA, { casilla: false });
    const afuera = correr(SOLO_LUNES, { casilla: true });
    expect(afuera.horas.ausenciaDias).toBe(0);
    expect(afuera.horas.ausenciaMin).toBe(0);
    expect(afuera.linea.dinero!.ausencias).toBe(0);
    expect(afuera.linea.dinero!.netoPagar).toBe(completa.linea.dinero!.netoPagar);
    expect(afuera.linea.dinero!.netoPagar).toBeGreaterThan(0);
    // Los cuatro días se leen como lo que son: trabajó, afuera. Nunca «ausencia».
    expect(afuera.p.resumen.ausenciasSinJustificar).toBe(0);
    expect(afuera.p.resumen.ausenciasJustificadas).toBe(0);
    expect(afuera.p.resumen.diasTrabajandoFuera).toBe(4);
    for (const f of ["2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11"]) {
      const d = el(afuera.p, f);
      expect(d.ausente).toBe(false);
      expect(d.justificado).toBe(MOTIVO_TRABAJO_VENDEDOR);
      expect(esTrabajoDeVendedor(d.justificado)).toBe(true);
      expect(textoDiaJustificado(d.justificado!)).not.toMatch(/ausencia/i);
    }
    // Sin marcas no hay horas que medir: ni extra ni tardanza.
    expect(afuera.horas.extraDiurnoMin).toBe(0);
    expect(afuera.horas.tardanzaMin).toBe(0);
  });

  it("CONTROL: sin la casilla, los mismos cuatro días son ausencias y el neto baja — exactamente como hoy", () => {
    const sin = correr(SOLO_LUNES, { casilla: false });
    expect(sin.horas.ausenciaDias).toBe(4);
    expect(sin.horas.ausenciaMin).toBe(4 * MIN_DIA_NO_TRABAJADO);
    expect(sin.p.resumen.ausenciasSinJustificar).toBe(4);
    expect(sin.p.resumen.diasTrabajandoFuera).toBe(0);
    expect(sin.linea.dinero!.ausencias).toBeGreaterThan(0);
    expect(sin.linea.dinero!.netoPagar).toBeLessThan(correr(SEMANA_COMPLETA, { casilla: false }).linea.dinero!.netoPagar);
    for (const f of ["2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11"]) {
      expect(el(sin.p, f).ausente).toBe(true);
      expect(el(sin.p, f).justificado).toBeNull();
    }
  });

  it("la casilla en la ficha viaja a la línea (para el chip), y sin ella es `false`", () => {
    expect(correr(SOLO_LUNES, { casilla: true }).linea.trabajaAfuera).toBe(true);
    expect(correr(SOLO_LUNES, { casilla: false }).linea.trabajaAfuera).toBe(false);
  });
});

describe("2. 🔴 el día CON marca se mide EXACTAMENTE igual que hoy", () => {
  // Martes: llega 20 tarde (10:20, pasada la tolerancia y bajo el umbral de 30
  // que la manda a la columna «Ausencia») y se queda hasta las 20:30 (extra).
  // Miércoles: se va a las 17:00 (salida temprana). Jueves y viernes afuera.
  const MARCADOS = [
    ...dia("2026-09-07", "10:00", "19:00"),
    ...dia("2026-09-08", "10:20", "20:30"),
    ...dia("2026-09-09", "10:00", "17:00"),
  ];
  it("tardanza, extra y salida temprana del día marcado: idénticos con y sin casilla, día por día", () => {
    const con = correr(MARCADOS, { casilla: true });
    const sin = correr(MARCADOS, { casilla: false });
    for (const f of ["2026-09-07", "2026-09-08", "2026-09-09"]) {
      expect(el(con.p, f)).toEqual(el(sin.p, f));
    }
    expect(el(con.p, "2026-09-08").tardeMin).toBeGreaterThan(0);
    expect(el(con.p, "2026-09-08").extraMin).toBeGreaterThan(0);
    expect(el(con.p, "2026-09-09").salidaTempranaMin).toBeGreaterThan(0);
    // Y la plata de esos días es la misma: solo cambian los dos días afuera.
    expect(con.horas.tardanzaMin).toBe(sin.horas.tardanzaMin);
    expect(con.horas.salidaTempranaMin).toBe(sin.horas.salidaTempranaMin);
    expect(con.horas.extraDiurnoMin + con.horas.extraNocturnoMin + con.horas.extraNoAprobadaMin)
      .toBe(sin.horas.extraDiurnoMin + sin.horas.extraNocturnoMin + sin.horas.extraNoAprobadaMin);
    expect(con.linea.dinero!.tardanzas).toBe(sin.linea.dinero!.tardanzas);
    expect(con.linea.dinero!.salidaTemprana).toBe(sin.linea.dinero!.salidaTemprana);
    expect(con.horas.ausenciaDias).toBe(0);
    expect(sin.horas.ausenciaDias).toBe(2);
  });

  it("con la casilla, el día marcado NO se pisa: la tardanza del martes sigue descontándose", () => {
    const con = correr(MARCADOS, { casilla: true });
    expect(con.linea.dinero!.tardanzas).toBeGreaterThan(0);
    expect(con.linea.dinero!.salidaTemprana).toBeGreaterThan(0);
  });
});

describe("3. lo que sigue mandando: feriado, fin de semana, vacación, justificación, día en curso", () => {
  it("un feriado sin marca no se toca: ni afuera ni ausencia (y trabajado, va al recargo como siempre)", () => {
    const feriados = new Map([["2026-09-09", "Feriado de prueba"]]);
    const con = correr(SOLO_LUNES, { casilla: true, feriados });
    expect(el(con.p, "2026-09-09").justificado).toBeNull();
    expect(el(con.p, "2026-09-09").ausente).toBe(false);
    expect(con.horas.feriadoMin).toBe(0);
    expect(con.p.resumen.diasTrabajandoFuera).toBe(3);
    // Trabajado, mismo recargo con y sin casilla.
    const marcado = [...SOLO_LUNES, ...dia("2026-09-09", "10:00", "19:00")];
    const a = correr(marcado, { casilla: true, feriados });
    const b = correr(marcado, { casilla: false, feriados });
    expect(a.horas.feriadoMin).toBeGreaterThan(0);
    expect(a.horas.feriadoMin).toBe(b.horas.feriadoMin);
  });

  it("sábado y domingo sin marca no son «días afuera»: no se pagan de más ni se rotulan", () => {
    const con = correr(SOLO_LUNES, { casilla: true, hasta: "2026-09-13" });
    expect(el(con.p, "2026-09-12").justificado).toBeNull();
    expect(el(con.p, "2026-09-13").justificado).toBeNull();
    expect(con.horas.sabadoMin).toBe(0);
    expect(con.horas.domingoMin).toBe(0);
    expect(con.p.resumen.diasTrabajandoFuera).toBe(4);
    // El neto es el de la semana completa, no más.
    expect(con.linea.dinero!.netoPagar).toBe(correr(SEMANA_COMPLETA, { casilla: false }).linea.dinero!.netoPagar);
  });

  it("🔴 una vacación «ya pagada» se sigue descontando aunque tenga la casilla", () => {
    const vac: Vacacion[] = [{ empleado_codigo: COD, desde: "2026-09-08", hasta: "2026-09-11", ya_pagadas: true } as Vacacion];
    const con = correr(SOLO_LUNES, { casilla: true, vacaciones: vac });
    const sin = correr(SOLO_LUNES, { casilla: false, vacaciones: vac });
    expect(con.horas.vacacionesYaPagadasMin).toBe(4 * MIN_DIA_NO_TRABAJADO);
    expect(con.horas.vacacionesYaPagadasMin).toBe(sin.horas.vacacionesYaPagadasMin);
    expect(con.linea.dinero!.netoPagar).toBe(sin.linea.dinero!.netoPagar);
    expect(con.p.resumen.diasTrabajandoFuera).toBe(0);
    expect(con.p.resumen.diasVacaciones).toBe(4);
  });

  it("una vacación sin marcar sigue siendo vacación (se paga, y no se rotula como afuera)", () => {
    const vac: Vacacion[] = [{ empleado_codigo: COD, desde: "2026-09-08", hasta: "2026-09-11", ya_pagadas: false } as Vacacion];
    const con = correr(SOLO_LUNES, { casilla: true, vacaciones: vac });
    expect(con.horas.vacacionesYaPagadasMin).toBe(0);
    expect(con.horas.ausenciaDias).toBe(0);
    expect(el(con.p, "2026-09-08").vacacion).not.toBeNull();
    expect(el(con.p, "2026-09-08").justificado).toBeNull();
    expect(con.p.resumen.diasTrabajandoFuera).toBe(0);
  });

  it("una justificación cargada manda: el día dice «Incapacidad», no «afuera»", () => {
    const con = correr(SOLO_LUNES, { casilla: true, justificaciones: [just("Incapacidad", "2026-09-08", "2026-09-09")] });
    expect(el(con.p, "2026-09-08").justificado).toBe("Incapacidad");
    expect(el(con.p, "2026-09-09").justificado).toBe("Incapacidad");
    expect(el(con.p, "2026-09-10").justificado).toBe(MOTIVO_TRABAJO_VENDEDOR);
    expect(con.p.resumen.ausenciasJustificadas).toBe(2);
    expect(con.p.resumen.diasTrabajandoFuera).toBe(2);
    expect(con.horas.ausenciaDias).toBe(0);
  });

  it("el día en curso (hoy y los que vienen) no se juzga: ni ausencia ni afuera", () => {
    const con = correr(SOLO_LUNES, { casilla: true, diaEnCurso: "2026-09-10" });
    expect(el(con.p, "2026-09-08").justificado).toBe(MOTIVO_TRABAJO_VENDEDOR);
    expect(el(con.p, "2026-09-09").justificado).toBe(MOTIVO_TRABAJO_VENDEDOR);
    expect(el(con.p, "2026-09-10").justificado).toBeNull();
    expect(el(con.p, "2026-09-11").justificado).toBeNull();
    expect(el(con.p, "2026-09-10").ausente).toBe(false);
    expect(con.p.resumen.diasTrabajandoFuera).toBe(2);
  });
});

describe("4. 🔴 `no_marca_reloj` sigue haciendo lo suyo: con las dos, el reloj se ignora siempre", () => {
  it("las dos casillas, martes con 20 de tardanza: horas en cero y neto = quincenal exacto", () => {
    const marcas = [...SOLO_LUNES, ...dia("2026-09-08", "10:20", "19:00")];
    const [p] = armarReporte({
      marcaciones: marcas, horarios: HORARIO, justificaciones: [], feriados: new Map(),
      desde: DESDE, hasta: HASTA, reglas: R, incluirNoHabiles: true, trabajaAfuera: new Set([COD]),
    });
    const horas = medirHoras(p, R, jornadaDiariaMin(HORARIO[0]));
    const ambas = armarLinea({ ...CON_CASILLA, noMarcaReloj: true }, horas, MANUALES_CERO, R);
    const soloAfuera = armarLinea(CON_CASILLA, horas, MANUALES_CERO, R);
    expect(ambas.noMarcaReloj).toBe(true);
    expect(ambas.horas.tardanzaMin).toBe(0);
    expect(ambas.dinero!.tardanzas).toBe(0);
    expect(ambas.dinero!.totalBruto).toBe(ambas.dinero!.salarioQuincenal);
    // Solo «trabaja afuera»: la tardanza del martes SÍ se descuenta.
    expect(soloAfuera.horas.tardanzaMin).toBeGreaterThan(0);
    expect(soloAfuera.dinero!.tardanzas).toBeGreaterThan(0);
  });
});

describe("5. una quincena entera sin marcar no es «no marcó ni un día»: cobra su quincenal", () => {
  const base = { personas: [], jornadaDiariaMin: () => 480, reglas: R };
  it("🔴 con la casilla: línea con dinero, sin pendiente, neto = quincenal menos seguros", () => {
    const [l] = armarPlanilla({ ...base, fichas: new Map([[COD, CON_CASILLA]]) });
    expect(l.faltaConfigurar).not.toContain(FALTA.sinMarcaciones);
    expect(l.dinero).not.toBeNull();
    expect(l.dinero!.ausencias).toBe(0);
    expect(l.dinero!.totalBruto).toBe(l.dinero!.salarioQuincenal);
    expect(l.trabajaAfuera).toBe(true);
  });
  it("CONTROL: sin la casilla sigue siendo pendiente («no marcó ni un día») y sin dinero", () => {
    const [l] = armarPlanilla({ ...base, fichas: new Map([[COD, FICHA]]) });
    expect(l.faltaConfigurar).toContain(FALTA.sinMarcaciones);
    expect(l.dinero).toBeNull();
  });
  it("lo que le falte de FICHA se conserva: sin salario, sigue diciendo que falta el salario", () => {
    const [l] = armarPlanilla({ ...base, fichas: new Map([[COD, { ...CON_CASILLA, salarioMensual: null }]]) });
    expect(l.faltaConfigurar).toContain(FALTA.salario);
    expect(l.dinero).toBeNull();
  });
});

describe("6. el dato y la regla, puros", () => {
  it("solo `true` cuenta; null, undefined, false y basura son «no»", () => {
    expect(trabajaAfuera(true)).toBe(true);
    expect(trabajaAfuera("true")).toBe(true);
    expect(trabajaAfuera(1)).toBe(true);
    for (const v of [false, null, undefined, "", "false", 0, "si", "no", {}]) expect(trabajaAfuera(v)).toBe(false);
  });
  it("el validador del PUT: ausente = no; true/false y sus textos; basura se rechaza con mensaje", () => {
    expect(validarTrabajaAfuera({})).toEqual({ ok: true, valor: false });
    expect(validarTrabajaAfuera({ trabajaAfuera: true })).toEqual({ ok: true, valor: true });
    expect(validarTrabajaAfuera({ trabajaAfuera: "false" })).toEqual({ ok: true, valor: false });
    const r = validarTrabajaAfuera({ trabajaAfuera: "quizás" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Elige/);
  });
  it("la regla: exactamente la condición que habría hecho ausencia, y nada más", () => {
    const habil = { trabajaAfuera: true, habil: true, feriado: null, enCurso: false, justificado: null };
    expect(motivoAutomaticoDelDiaSinMarca(habil)).toBe(MOTIVO_TRABAJO_VENDEDOR);
    expect(motivoAutomaticoDelDiaSinMarca({ ...habil, trabajaAfuera: false })).toBeNull();
    expect(motivoAutomaticoDelDiaSinMarca({ ...habil, habil: false })).toBeNull();
    expect(motivoAutomaticoDelDiaSinMarca({ ...habil, feriado: "Independencia" })).toBeNull();
    expect(motivoAutomaticoDelDiaSinMarca({ ...habil, enCurso: true })).toBeNull();
    expect(motivoAutomaticoDelDiaSinMarca({ ...habil, justificado: "Incapacidad" })).toBeNull();
  });
  it("el error de «columna ausente» tiene que NOMBRAR la columna; cualquier otro se propaga", () => {
    expect(esColumnaTrabajaAfueraFaltante({ code: "42703", message: `column asistencia_personas.${COLUMNA_TRABAJA_AFUERA} does not exist` })).toBe(true);
    expect(esColumnaTrabajaAfueraFaltante({ code: "PGRST204", message: `Could not find the '${COLUMNA_TRABAJA_AFUERA}' column in the schema cache` })).toBe(true);
    expect(esColumnaTrabajaAfueraFaltante({ code: "42703", message: "column foo does not exist" })).toBe(false);
    expect(esColumnaTrabajaAfueraFaltante({ code: "42501", message: `permission denied for ${COLUMNA_TRABAJA_AFUERA}` })).toBe(false);
    expect(esColumnaTrabajaAfueraFaltante(null)).toBe(false);
    expect(avisoMigracionTrabajaAfuera()).toContain(MIGRACION_TRABAJA_AFUERA);
    expect(avisoMigracionTrabajaAfuera()).not.toMatch(/PGRST|42703|schema cache/i);
  });
  it("la migración existe, es aditiva y nace en `false` para todos", () => {
    const sql = leer(`supabase/migrations/${MIGRACION_TRABAJA_AFUERA}`);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS trabaja_afuera boolean NOT NULL DEFAULT false/);
    expect(sql).not.toMatch(/\bUPDATE\b|\bDELETE\b|\bDROP\b/i);
  });
});

describe("7. se dice en pantalla, y la columna se lee APARTE de las fichas", () => {
  const ficha: PersonaFicha = {
    codigo: COD, nombre: "ANA TREJOS", empresa: "american_classic", salarioMensual: 800, jornadaSemanal: 40,
    fechaIngreso: null, noMarcaReloj: false, pagaSeguros: true, baseSeguros: null, servicioProfesional: false,
  };
  it("la ficha lleva el chip «Trabaja afuera» solo con la casilla prendida", () => {
    expect(excepcionesDeLaFicha({ ...ficha, trabajaAfuera: true }).map((e) => e.texto)).toContain(CHIP_TRABAJA_AFUERA);
    expect(excepcionesDeLaFicha(ficha).map((e) => e.texto)).not.toContain(CHIP_TRABAJA_AFUERA);
    expect(excepcionesDeLaFicha({ ...ficha, trabajaAfuera: false })).toEqual([]);
  });
  it("el formulario pregunta con las palabras del módulo, al lado de «¿Cobra horas extra?»", () => {
    const src = leer("src/app/asistencia/colaboradores/FichaEditar.tsx");
    expect(src).toContain("PREGUNTA_TRABAJA_AFUERA");
    expect(src).toContain("PREGUNTA_COBRA_HORAS_EXTRA");
    expect(src).toContain('set({ trabajaAfuera: e.target.value === "si" })');
    expect(PREGUNTA_TRABAJA_AFUERA).toBe("¿Trabaja afuera?");
    expect(leer("src/app/asistencia/colaboradores/PersonaPagina.tsx")).toContain("trabajaAfuera: b.trabajaAfuera");
    expect(leer("src/app/asistencia/PlanillaTab.tsx")).toContain("CHIP_TRABAJA_AFUERA");
  });
  it("🔴 la regla vive en el módulo puro y el reporte solo le pregunta; las dos rutas pasan la MISMA lectura", () => {
    expect(puro("src/lib/asistencia/reporte.ts")).toContain("motivoAutomaticoDelDiaSinMarca({");
    for (const ruta of ["src/app/api/asistencia/planilla/route.ts", "src/app/api/asistencia/reporte/route.ts"]) {
      const src = puro(ruta);
      expect(src).toContain("leerTrabajaAfuera()");
      expect(src).toContain("trabajaAfuera: afuera");
    }
  });
  it("🔴 la columna NO entra al `select` de las fichas (la migración está sin aplicar): se lee aparte y tolerante", () => {
    const src = puro("src/lib/asistencia/config-server.ts");
    expect(src).not.toMatch(/const COLS_[A-Z_]+ = `[^`]*TRABAJA_AFUERA/);
    expect(src).toContain("export async function leerTrabajaAfuera()");
    expect(src).toContain("if (esColumnaTrabajaAfueraFaltante(error)) return new Set();");
  });
  it("el PUT la escribe en un `update` propio, nunca dentro del upsert de la ficha", () => {
    const src = puro("src/app/api/asistencia/configuracion/route.ts");
    expect(src).toMatch(/\.update\(\{ \[COLUMNA_TRABAJA_AFUERA\]: trabajaAfueraValor \}\)/);
    expect(src).not.toMatch(/const con[A-Za-z]+ = \{[^}]*COLUMNA_TRABAJA_AFUERA/);
    expect(src).toContain("if (afueraHoy !== trabajaAfueraValor)");
  });
});
