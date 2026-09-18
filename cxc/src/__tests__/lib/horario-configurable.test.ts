/* ─────────────────────────────────────────────────────────────────────────────
 * LOS DÍAS Y LOS DOS HORARIOS, CONFIGURABLES POR PERSONA (18-sep-2026) — el
 * candado.
 *
 * Daniel, textual:
 *  · *«todo eso de horario que sea configurable por si hay cambios en un futuro»*
 *  · *«multifashion sus dias laborales es de lunes a sabado»*
 *  · *«Ana · Cindy · Yeisibeth su horario es de 9-18 cuando estan afuera … al
 *    igual rodrigo … usa el celular de 10-1830»*
 *  · *«que se fije por la primera marcacion pues. la persona no deberia de
 *    marcar en ambos sistemas, o es uno o es el otro»*
 *  · *«1. Desaparece ese aviso … 2. El que no viene el sábado, falta. Con su
 *    descuento, como cualquier otro día.»*
 *
 * ── LO QUE SE EXIGE ──────────────────────────────────────────────────────────
 * 1. 🔴 SIN LA MIGRACIÓN TODO SE COMPORTA COMO HOY: lunes a viernes, un
 *    horario, para las ocho empresas. `resolverDiasLaborables` devuelve vacío
 *    con `faltaMigracion` y el motor sin mapa mide igual que ayer.
 * 2. 🔴 Multifashion trabaja lunes a SÁBADO: un sábado sin marca es AUSENCIA
 *    (8 h), un sábado con marca es un día NORMAL (tardanza, extra, sin
 *    `sabadoMin`), y el aviso «trabajó un sábado» ya no sale para ellos.
 * 3. 🔴 EL DOMINGO NO SE TOCA: nunca es laborable —ni mandándolo en la
 *    lista— y sigue yendo al recargo de domingo.
 * 4. 🔴 MANDA LA PRIMERA MARCA DEL DÍA: teléfono → horario de afuera; reloj →
 *    el de siempre. La segunda marca no decide nada.
 * 5. 🔴 VACÍO = EL MISMO DE ADENTRO, campo por campo: para quien no tiene
 *    horario de afuera, una marca del teléfono se mide con el de siempre.
 * 6. La columna de la persona le gana a la empresa; las otras tres empresas
 *    siguen de lunes a viernes; la lista se normaliza (sin domingo, sin
 *    repetidos, vacía = null).
 * 7. Las rutas y la pantalla: la fuente ÚNICA (`leerHorarios`), el
 *    `dispositivo` en el select, el aviso de migración, y el PUT que valida.
 *
 * Fechas fijas, nunca `new Date()`. Septiembre de 2026: el 5 y el 12 son
 * sábados, el 6 y el 13 domingos, el 7 lunes.
 * ─────────────────────────────────────────────────────────────────────────── */
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import {
  COLUMNAS_HORARIO_CONFIGURABLE,
  DIAS_LABORABLES_DEFAULT,
  DIAS_LABORABLES_POR_EMPRESA,
  DISPOSITIVO_DE_AFUERA,
  MIGRACION_HORARIO_CONFIGURABLE,
  avisoMigracionHorario,
  diasLaborablesDeEmpresa,
  esColumnaHorarioFaltante,
  esDiaLaborable,
  esMarcaDeAfuera,
  horarioDelDia,
  normalizarDiasLaborables,
  resolverDiasLaborables,
  validarDiasLaborables,
  validarHora,
  validarHoraOpcional,
} from "@/lib/asistencia/horario-configurable";
import { DISPOSITIVO_TELEFONO } from "@/lib/marcacion/marcacion";
import { armarReporte, esHabil, type HorarioPersona, type Marcacion } from "@/lib/asistencia/reporte";
import {
  MIN_DIA_NO_TRABAJADO, armarLinea, clasificarDia, medirHoras, MANUALES_CERO, type FichaPlanilla,
} from "@/lib/asistencia/planilla";
import { armarAntesDeCerrar, type EntradaAntesDeCerrar } from "@/lib/asistencia/antes-de-cerrar";

const RAIZ = path.resolve(__dirname, "../../..");
const leer = (p: string) => fs.readFileSync(path.join(RAIZ, p), "utf8");
const puro = (p: string) =>
  leer(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const R = REGLAS_DEFAULT;
const MF = "301";
const HORARIO_MF: HorarioPersona = { empleado_codigo: MF, entrada: "10:00", salida: "18:30", almuerzo_minutos: 60 };
const ANA = "2";
const HORARIO_ANA: HorarioPersona = {
  empleado_codigo: ANA, entrada: "10:00", salida: "18:30", almuerzo_minutos: 60,
  entrada_afuera: "09:00", salida_afuera: "18:00",
};
const LUNES_A_SABADO = [1, 2, 3, 4, 5, 6];
const SAB_5 = "2026-09-05", DOM_6 = "2026-09-06", LUN_7 = "2026-09-07", SAB_12 = "2026-09-12";

const marca = (codigo: string, fecha: string, hhmm: string, dispositivo?: string): Marcacion => ({
  empleado_codigo: codigo, empleado_nombre: null,
  ocurrio_en: `${fecha}T${hhmm}:00-05:00`, dispositivo: dispositivo ?? "reloj acs",
});
/** Un día normal de 4 marcas, 10:00 → 18:30 con una hora de almuerzo. */
const diaNormal = (codigo: string, fecha: string, disp?: string): Marcacion[] => [
  marca(codigo, fecha, "10:00", disp), marca(codigo, fecha, "13:00", disp),
  marca(codigo, fecha, "14:00", disp), marca(codigo, fecha, "18:30", disp),
];

function reporte(opts: {
  marcaciones: Marcacion[]; horarios?: HorarioPersona[]; desde: string; hasta: string;
  dias?: Map<string, readonly number[]>; incluirNoHabiles?: boolean; trabajaAfuera?: Set<string>;
}) {
  return armarReporte({
    marcaciones: opts.marcaciones, horarios: opts.horarios ?? [HORARIO_MF], justificaciones: [],
    feriados: new Map(), desde: opts.desde, hasta: opts.hasta, reglas: R,
    incluirNoHabiles: opts.incluirNoHabiles ?? true, diaEnCurso: "2026-09-30",
    diasLaborables: opts.dias, trabajaAfuera: opts.trabajaAfuera,
  });
}
const diaDe = (p: ReturnType<typeof reporte>, fecha: string) => p[0].dias.find((d) => d.fecha === fecha)!;

const FICHA_MF: FichaPlanilla = { codigo: MF, nombre: "JENIFER MIRANDA", salarioMensual: 750, jornadaSemanal: 48, empresa: "american_classic" };
function linea(p: ReturnType<typeof reporte>[number], ficha = FICHA_MF) {
  return armarLinea(ficha, medirHoras(p, R, 450), MANUALES_CERO, R);
}

// ─────────────────────────────────────────────────────────────────────────────
describe("1. 🔴 SIN LA MIGRACIÓN TODO SE COMPORTA COMO HOY", () => {
  it("con `faltaMigracion` el resolver devuelve vacío, aunque la empresa sea Multifashion", () => {
    const r = resolverDiasLaborables({
      horarios: [{ empleado_codigo: MF, dias_laborables: LUNES_A_SABADO }],
      empresaDe: new Map([[MF, "american_classic"]]),
      faltaMigracion: true,
    });
    expect(r.size).toBe(0);
  });

  it("sin mapa, el motor mide lunes a viernes: el sábado 5 sin marca NO es ausencia, y con marca va a `sabadoMin`", () => {
    const p = reporte({ marcaciones: [...diaNormal(MF, LUN_7), ...diaNormal(MF, SAB_5)], desde: SAB_5, hasta: LUN_7 });
    const sab = diaDe(p, SAB_5);
    expect(sab.habil).toBe(false);
    expect(clasificarDia(sab, R).sabadoMin).toBeGreaterThan(0);
    expect(clasificarDia(sab, R).ausenciaMin).toBe(0);
    const sinMarca = reporte({ marcaciones: diaNormal(MF, LUN_7), desde: SAB_5, hasta: LUN_7 });
    expect(diaDe(sinMarca, SAB_5).ausente).toBe(false);
    // Y `esHabil` de siempre sigue diciendo lo mismo que `esDiaLaborable` sin lista.
    for (const f of [SAB_5, DOM_6, LUN_7, SAB_12]) expect(esDiaLaborable(f)).toBe(esHabil(f));
  });

  it("sin `incluirNoHabiles` (el Reporte) y sin mapa, el sábado no se recorre", () => {
    const p = reporte({ marcaciones: diaNormal(MF, LUN_7), desde: SAB_5, hasta: LUN_7, incluirNoHabiles: false });
    expect(p[0].dias.map((d) => d.fecha)).toEqual([LUN_7]);
  });

  it("una marca del teléfono sin horario de afuera se mide con el de siempre (vacío = el mismo de adentro)", () => {
    const con = reporte({ marcaciones: diaNormal(MF, LUN_7, DISPOSITIVO_TELEFONO), desde: LUN_7, hasta: LUN_7 });
    const sin = reporte({ marcaciones: diaNormal(MF, LUN_7), desde: LUN_7, hasta: LUN_7 });
    expect(diaDe(con, LUN_7).tardeMin).toBe(diaDe(sin, LUN_7).tardeMin);
    expect(diaDe(con, LUN_7).extraMin).toBe(diaDe(sin, LUN_7).extraMin);
    expect(diaDe(con, LUN_7).horarioDeAfuera).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("2. 🔴 MULTIFASHION TRABAJA LUNES A SÁBADO", () => {
  const dias = new Map([[MF, LUNES_A_SABADO]]);

  it("el resolver da lunes a sábado por la EMPRESA (columna en NULL), y lunes a viernes a las otras tres", () => {
    const r = resolverDiasLaborables({
      horarios: [{ empleado_codigo: MF, dias_laborables: null }, { empleado_codigo: "7", dias_laborables: null }],
      empresaDe: new Map([[MF, "american_classic"], ["7", "vistana"], ["8", "fashion_wear"], ["9", "confecciones_boston"]]),
      faltaMigracion: false,
    });
    expect(r.get(MF)).toEqual(LUNES_A_SABADO);
    for (const c of ["7", "8", "9"]) expect(r.get(c)).toEqual([1, 2, 3, 4, 5]);
    expect(diasLaborablesDeEmpresa("american_classic")).toEqual(LUNES_A_SABADO);
    expect(diasLaborablesDeEmpresa("vistana")).toEqual(DIAS_LABORABLES_DEFAULT);
    expect(diasLaborablesDeEmpresa(null)).toEqual(DIAS_LABORABLES_DEFAULT);
    expect(DIAS_LABORABLES_POR_EMPRESA.american_classic).toContain(6);
  });

  it("🔴 el sábado sin marca es AUSENCIA, valuada en 8 horas como cualquier día", () => {
    const p = reporte({ marcaciones: diaNormal(MF, LUN_7), desde: SAB_5, hasta: LUN_7, dias });
    const sab = diaDe(p, SAB_5);
    expect(sab.habil).toBe(true);
    expect(sab.ausente).toBe(true);
    expect(clasificarDia(sab, R).ausenciaMin).toBe(MIN_DIA_NO_TRABAJADO);
    const l = linea(p[0]);
    expect(l.horas.ausenciaDias).toBe(1);
    expect(l.dinero!.ausencias).toBeGreaterThan(0);
  });

  it("🔴 el sábado con marca es un día NORMAL: sin `sabadoMin`, con tardanza y extra como un lunes", () => {
    const tarde = [marca(MF, SAB_5, "10:30"), marca(MF, SAB_5, "13:00"), marca(MF, SAB_5, "14:00"), marca(MF, SAB_5, "19:00")];
    const p = reporte({ marcaciones: tarde, desde: SAB_5, hasta: SAB_5, dias });
    const sab = diaDe(p, SAB_5);
    const c = clasificarDia(sab, R);
    expect(c.sabadoMin).toBe(0);
    expect(c.tardanzaMin).toBe(30);
    expect(c.extraDiurnoMin + c.extraNocturnoMin).toBe(30);
    expect(sab.extraMin).toBe(30);
  });

  it("🔴 y NO se inventa ningún recargo: el sábado vale lo mismo que el mismo día un lunes", () => {
    const sab = reporte({ marcaciones: diaNormal(MF, SAB_5), desde: SAB_5, hasta: SAB_5, dias });
    const lun = reporte({ marcaciones: diaNormal(MF, LUN_7), desde: LUN_7, hasta: LUN_7, dias });
    expect(linea(sab[0]).dinero!.netoPagar).toBe(linea(lun[0]).dinero!.netoPagar);
    expect(linea(sab[0]).horas.domingoMin).toBe(0);
    expect(linea(sab[0]).horas.sabadoMin).toBe(0);
  });

  it("🔴 el aviso «trabajó un sábado» desaparece para ellos: `conSabado` cuenta `sabadoMin > 0`, y es 0", () => {
    const p = reporte({ marcaciones: diaNormal(MF, SAB_5), desde: SAB_5, hasta: SAB_5, dias });
    expect(medirHoras(p[0], R, 450).sabadoMin).toBe(0);
    const entrada: EntradaAntesDeCerrar = {
      periodoAbierto: null, esQuincena: true, rango: null, extraSinAprobar: [], sinFicha: [], sinHorario: 0,
      corte: null, hasta: "2026-09-15", fueraPorBaja: 0, marcoDespuesDeIrse: 0, avisoRepartoRechazado: null,
      prestamoSinAtar: [], avisoPrestamo: null, avisoVacacionesNoPagadas: null, conSabado: 0, rangoLibre: false,
      factorBase: 1, diasCalendario: 15, migraciones: [], pestanaFichas: "Colaboradores",
    };
    expect(armarAntesDeCerrar(entrada).info.find((l) => l.clave === "sabado")).toBeUndefined();
    // Y para quien NO trabaja los sábados el aviso sigue (control).
    expect(armarAntesDeCerrar({ ...entrada, conSabado: 1 }).info.find((l) => l.clave === "sabado")).toBeTruthy();
  });

  it("el Reporte (sin `incluirNoHabiles`) ahora SÍ recorre el sábado de Multifashion", () => {
    const p = reporte({ marcaciones: diaNormal(MF, LUN_7), desde: SAB_5, hasta: LUN_7, incluirNoHabiles: false, dias });
    expect(p[0].dias.map((d) => d.fecha)).toEqual([SAB_5, LUN_7]);
  });

  it("quien trabaja afuera y no marcó el sábado NO es ausencia: es «Trabajo de vendedor», como cualquier día laborable", () => {
    const p = reporte({
      marcaciones: diaNormal(ANA, LUN_7), horarios: [HORARIO_ANA], desde: SAB_5, hasta: LUN_7,
      dias: new Map([[ANA, LUNES_A_SABADO]]), trabajaAfuera: new Set([ANA]),
    });
    const sab = diaDe(p, SAB_5);
    expect(sab.ausente).toBe(false);
    expect(sab.justificado).toBeTruthy();
  });

  it("la lista de la persona le gana a la empresa: un Multifashion configurado lunes a viernes no tiene sábado", () => {
    const r = resolverDiasLaborables({
      horarios: [{ empleado_codigo: MF, dias_laborables: [1, 2, 3, 4, 5] }],
      empresaDe: new Map([[MF, "american_classic"]]),
      faltaMigracion: false,
    });
    expect(r.get(MF)).toEqual([1, 2, 3, 4, 5]);
    expect(esDiaLaborable(SAB_5, r.get(MF))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("3. 🔴 EL DOMINGO NO SE TOCA", () => {
  it("nunca es laborable, ni mandándolo en la lista", () => {
    expect(esDiaLaborable(DOM_6, [0, 1, 2, 3, 4, 5, 6])).toBe(false);
    expect(esDiaLaborable(DOM_6, LUNES_A_SABADO)).toBe(false);
    expect(normalizarDiasLaborables([0, 1, 2])).toEqual([1, 2]);
    expect(normalizarDiasLaborables([0])).toBeNull();
  });

  it("el domingo trabajado de Multifashion sigue yendo al recargo de domingo, y el sin marca no es ausencia", () => {
    const dias = new Map([[MF, [0, 1, 2, 3, 4, 5, 6]]]);
    const con = reporte({ marcaciones: diaNormal(MF, DOM_6), desde: DOM_6, hasta: DOM_6, dias });
    const dom = diaDe(con, DOM_6);
    expect(dom.habil).toBe(false);
    const c = clasificarDia(dom, R);
    expect(c.domingoMin).toBeGreaterThan(0);
    expect(c.sabadoMin).toBe(0);
    expect(c.ausenciaMin).toBe(0);
    const sin = reporte({ marcaciones: diaNormal(MF, LUN_7), desde: DOM_6, hasta: LUN_7, dias });
    expect(diaDe(sin, DOM_6).ausente).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("4. 🔴 MANDA LA PRIMERA MARCA DEL DÍA", () => {
  it("primera marca del teléfono → horario de afuera (Ana 9:00–18:00): entrar 9:00 y salir 18:00 es puntual y sin extra", () => {
    const afuera = [marca(ANA, LUN_7, "09:00", DISPOSITIVO_TELEFONO), marca(ANA, LUN_7, "18:00", DISPOSITIVO_TELEFONO)];
    const p = reporte({ marcaciones: afuera, horarios: [HORARIO_ANA], desde: LUN_7, hasta: LUN_7 });
    const d = diaDe(p, LUN_7);
    expect(d.horarioDeAfuera).toBe(true);
    expect(d.tardeMin).toBe(0);
    expect(d.salidaTempranaMin).toBe(0);
    expect(d.extraMin).toBe(0);
  });

  it("las MISMAS horas del reloj → horario de la tienda (10:00–18:30): 9:00 no es tarde y 18:00 es salida temprana de 30", () => {
    const reloj = [marca(ANA, LUN_7, "09:00"), marca(ANA, LUN_7, "18:00")];
    const p = reporte({ marcaciones: reloj, horarios: [HORARIO_ANA], desde: LUN_7, hasta: LUN_7 });
    const d = diaDe(p, LUN_7);
    expect(d.horarioDeAfuera).toBe(false);
    expect(d.salidaTempranaMin).toBe(30);
    expect(d.extraMin).toBe(0);
  });

  it("la SEGUNDA marca no decide: reloj primero y teléfono después es el horario de la tienda", () => {
    const mezcla = [marca(ANA, LUN_7, "09:00"), marca(ANA, LUN_7, "18:00", DISPOSITIVO_TELEFONO)];
    const p = reporte({ marcaciones: mezcla, horarios: [HORARIO_ANA], desde: LUN_7, hasta: LUN_7 });
    expect(diaDe(p, LUN_7).horarioDeAfuera).toBe(false);
    expect(diaDe(p, LUN_7).salidaTempranaMin).toBe(30);
  });

  it("la primera es por HORA, no por orden de llegada: una marca del teléfono que llegó después sigue siendo la primera", () => {
    const desordenadas = [marca(ANA, LUN_7, "18:00"), marca(ANA, LUN_7, "09:00", DISPOSITIVO_TELEFONO)];
    const p = reporte({ marcaciones: desordenadas, horarios: [HORARIO_ANA], desde: LUN_7, hasta: LUN_7 });
    expect(diaDe(p, LUN_7).horarioDeAfuera).toBe(true);
    expect(diaDe(p, LUN_7).salidaTempranaMin).toBe(0);
  });

  it("la regla pura: `horarioDelDia`", () => {
    expect(horarioDelDia(HORARIO_ANA, DISPOSITIVO_TELEFONO)).toEqual({ entrada: "09:00", salida: "18:00", deAfuera: true });
    expect(horarioDelDia(HORARIO_ANA, "reloj acs")).toEqual({ entrada: "10:00", salida: "18:30", deAfuera: false });
    expect(horarioDelDia(HORARIO_ANA, null)).toEqual({ entrada: "10:00", salida: "18:30", deAfuera: false });
    expect(esMarcaDeAfuera(DISPOSITIVO_TELEFONO)).toBe(true);
    expect(esMarcaDeAfuera("reloj cboston")).toBe(false);
    expect(esMarcaDeAfuera(undefined)).toBe(false);
    expect(DISPOSITIVO_DE_AFUERA).toBe(DISPOSITIVO_TELEFONO);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("5. 🔴 VACÍO = EL MISMO DE ADENTRO, campo por campo", () => {
  it("sin nada de afuera, el teléfono mide con el de adentro y el día no se marca «de afuera»", () => {
    expect(horarioDelDia(HORARIO_MF, DISPOSITIVO_TELEFONO)).toEqual({ entrada: "10:00", salida: "18:30", deAfuera: false });
    expect(horarioDelDia({ ...HORARIO_MF, entrada_afuera: "", salida_afuera: null }, DISPOSITIVO_TELEFONO).deAfuera).toBe(false);
  });

  it("con SOLO la salida de afuera, la entrada es la de adentro", () => {
    const h = horarioDelDia({ ...HORARIO_MF, salida_afuera: "18:00" }, DISPOSITIVO_TELEFONO);
    expect(h).toEqual({ entrada: "10:00", salida: "18:00", deAfuera: true });
  });

  it("con SOLO la entrada de afuera, la salida es la de adentro", () => {
    const h = horarioDelDia({ ...HORARIO_MF, entrada_afuera: "09:00" }, DISPOSITIVO_TELEFONO);
    expect(h).toEqual({ entrada: "09:00", salida: "18:30", deAfuera: true });
  });

  it("CONTROL: para los ~40 sin horario de afuera, con o sin `dispositivo`, los números son idénticos", () => {
    const sinDisp = diaNormal(MF, LUN_7).map((m) => ({ ...m, dispositivo: undefined }));
    const a = reporte({ marcaciones: sinDisp, desde: LUN_7, hasta: LUN_7 });
    const b = reporte({ marcaciones: diaNormal(MF, LUN_7, DISPOSITIVO_TELEFONO), desde: LUN_7, hasta: LUN_7 });
    const { horarioDeAfuera: _a, ...da } = diaDe(a, LUN_7);
    const { horarioDeAfuera: _b, ...db } = diaDe(b, LUN_7);
    expect(da).toEqual(db);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("6. la lista de días se normaliza, y el PUT valida", () => {
  it("sin domingo, sin repetidos, ordenada; vacía o basura = null", () => {
    expect(normalizarDiasLaborables([6, 1, "3", 1])).toEqual([1, 3, 6]);
    expect(normalizarDiasLaborables([])).toBeNull();
    expect(normalizarDiasLaborables("1,2")).toBeNull();
    expect(normalizarDiasLaborables([7, 9, -1])).toBeNull();
  });

  it("`validarDiasLaborables`: ausente y vacía valen «manda la empresa»; un texto se rechaza", () => {
    expect(validarDiasLaborables(undefined)).toEqual({ ok: true, valor: null });
    expect(validarDiasLaborables([])).toEqual({ ok: true, valor: null });
    expect(validarDiasLaborables([1, 6])).toEqual({ ok: true, valor: [1, 6] });
    expect(validarDiasLaborables("lunes").ok).toBe(false);
  });

  it("las horas: obligatoria y opcional", () => {
    expect(validarHora("10:00", "entrada")).toEqual({ ok: true, valor: "10:00" });
    expect(validarHora("10:00:00", "entrada")).toEqual({ ok: true, valor: "10:00" });
    expect(validarHora("25:00", "entrada").ok).toBe(false);
    expect(validarHora("", "entrada").ok).toBe(false);
    expect(validarHoraOpcional("", "salida").valor).toBeNull();
    expect(validarHoraOpcional(null, "salida").valor).toBeNull();
    expect(validarHoraOpcional("no", "salida").ok).toBe(false);
  });

  it("el error de «columna faltante» se reconoce SOLO si nombra una de las tres columnas", () => {
    expect(esColumnaHorarioFaltante({ code: "42703", message: "column asistencia_horarios.dias_laborables does not exist" })).toBe(true);
    expect(esColumnaHorarioFaltante({ code: "PGRST204", message: "Could not find the 'entrada_afuera' column" })).toBe(true);
    expect(esColumnaHorarioFaltante({ code: "42703", message: "column trabaja_afuera does not exist" })).toBe(false);
    expect(esColumnaHorarioFaltante({ code: "57014", message: "statement timeout" })).toBe(false);
    expect(esColumnaHorarioFaltante(null)).toBe(false);
    expect(COLUMNAS_HORARIO_CONFIGURABLE).toEqual(["dias_laborables", "entrada_afuera", "salida_afuera"]);
    expect(avisoMigracionHorario()).toContain(MIGRACION_HORARIO_CONFIGURABLE);
    expect(fs.existsSync(path.join(RAIZ, "supabase/migrations", MIGRACION_HORARIO_CONFIGURABLE))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("7. 🔴 las rutas y la pantalla van por la fuente ÚNICA", () => {
  const planilla = puro("src/app/api/asistencia/planilla/route.ts");
  const reporteRuta = puro("src/app/api/asistencia/reporte/route.ts");
  const horariosRuta = puro("src/app/api/asistencia/horarios/route.ts");

  it("ninguna ruta lee `asistencia_horarios` por su cuenta: todas llaman a `leerHorarios`", () => {
    for (const [nombre, src] of [["planilla", planilla], ["reporte", reporteRuta], ["horarios", horariosRuta]] as const) {
      expect(src, nombre).toMatch(/leerHorarios\(\)/);
      expect(src, nombre).not.toMatch(/from\("asistencia_horarios"\)\s*\.select\(/);
    }
    // Y la única lectura vive en `horarios-server.ts`, tolerante a la migración.
    const server = puro("src/lib/asistencia/horarios-server.ts");
    expect(server).toMatch(/esColumnaHorarioFaltante\(conNuevas\.error\)/);
    expect(server).toMatch(/faltaMigracion: true/);
  });

  it("las dos rutas del motor piden el `dispositivo` y pasan `diasLaborables`", () => {
    for (const src of [planilla, reporteRuta]) {
      expect(src).toMatch(/"id, empleado_codigo, empleado_nombre, ocurrio_en, dispositivo"/);
      expect(src).toMatch(/resolverDiasLaborables\(\{/);
      expect(src).toMatch(/diasLaborables,\s*\}\)/);
    }
    expect(planilla).toMatch(/faltaMigracionHorario: horariosLeidos\.faltaMigracion \? avisoMigracionHorario\(\) : null/);
  });

  it("el motor: los días se recorren por persona, `habil` sale de `esDiaLaborable` y el horario del día de `horarioDelDia`", () => {
    const motor = puro("src/lib/asistencia/reporte.ts");
    expect(motor).toMatch(/const habil = esDiaLaborable\(fecha, diasDeEsta\);/);
    expect(motor).toMatch(/todosLosDias\.filter\(\(f\) => esDiaLaborable\(f, diasDeEsta\)\)/);
    expect(motor).toMatch(/p\.primera\.get\(fecha\)\?\.dispositivo/);
    expect(motor).toMatch(/if \(!prim \|\| seg < prim\.seg\)/);
    // La planilla pregunta por `d.habil`, no por el calendario.
    const pl = puro("src/lib/asistencia/planilla.ts");
    expect(pl).toMatch(/const habil = typeof d\.habil === "boolean" \? d\.habil : esHabil\(d\.fecha\);/);
    expect(pl).not.toMatch(/if \(!esHabil\(d\.fecha\)\)/);
  });

  it("la pantalla de Horarios: días, los dos horarios, y esconde lo nuevo mientras falte la migración", () => {
    const tab = puro("src/app/asistencia/HorariosTab.tsx");
    expect(tab).toMatch(/ROTULO_DIAS/);
    expect(tab).toMatch(/ROTULO_RELOJ/);
    expect(tab).toMatch(/ROTULO_TELEFONO/);
    expect(tab).toMatch(/NOTA_TELEFONO_VACIO/);
    expect(tab).toMatch(/DIAS_ELEGIBLES\.map/);
    expect(tab).toMatch(/const configurable = !faltaMigracion;/);
    expect(tab).toMatch(/\{configurable && \(/);
    // 44 px para lo que se toca; el domingo no se ofrece.
    expect(tab).toMatch(/min-h-\[44px\] min-w-\[44px\]/);
    expect(tab).not.toMatch(/DIAS_SEMANA_CORTO\[0\]/);
    expect(tab).toMatch(/type="time"/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("8. el PUT de Horarios", () => {
  const upserts: Array<Record<string, unknown>> = [];
  let faltaColumna = false;
  vi.doMock("@/lib/requireRole", () => ({
    requireRole: () => ({ role: "admin", userName: "test", userId: "1", sessionToken: "t" }),
  }));
  vi.doMock("@/lib/supabase-server", () => ({
    HAS_SERVICE_ROLE: true,
    supabaseServer: {
      from: (tabla: string) => ({
        upsert: (fila: Record<string, unknown>) => { upserts.push(fila); return Promise.resolve({ error: null }); },
        select: (cols: string) => ({
          eq: () => ({
            maybeSingle: async () => {
              if (tabla === "asistencia_personas") return { data: { empresa: "american_classic" }, error: null };
              if (faltaColumna && cols.includes("dias_laborables")) {
                return { data: null, error: { code: "42703", message: "column asistencia_horarios.dias_laborables does not exist" } };
              }
              return { data: { entrada: "10:00:00", dias_laborables: [1, 2, 3, 4, 5, 6], entrada_afuera: "09:00:00", salida_afuera: null }, error: null };
            },
          }),
        }),
      }),
    },
  }));
  const pedido = (body: unknown) => ({ json: async () => body }) as never;
  beforeEach(() => { upserts.length = 0; faltaColumna = false; });

  it("guarda entrada, salida, días y horario de afuera; el almuerzo lo pone la empresa", async () => {
    const { PUT } = await import("@/app/api/asistencia/horarios/route");
    const res = await PUT(pedido({ codigo: MF, salida: "18:30", entrada: "10:00", diasLaborables: [1, 2, 3, 4, 5, 6], entradaAfuera: "09:00", salidaAfuera: "18:00" }));
    expect(res.status).toBe(200);
    expect(upserts[0]).toMatchObject({ entrada: "10:00", salida: "18:30", almuerzo_minutos: 60, dias_laborables: [1, 2, 3, 4, 5, 6], entrada_afuera: "09:00", salida_afuera: "18:00" });
  });

  it("🔴 el domingo no entra ni por la puerta de atrás, y una lista vacía es «manda la empresa» (null)", async () => {
    const { PUT } = await import("@/app/api/asistencia/horarios/route");
    await PUT(pedido({ codigo: MF, salida: "18:30", diasLaborables: [0, 6, 6, 1] }));
    expect(upserts[0].dias_laborables).toEqual([1, 6]);
    upserts.length = 0;
    await PUT(pedido({ codigo: MF, salida: "18:30", diasLaborables: [] }));
    expect(upserts[0].dias_laborables).toBeNull();
  });

  it("lo que el cuerpo NO trae se conserva: guardar solo la salida no borra los días ni el horario de afuera", async () => {
    const { PUT } = await import("@/app/api/asistencia/horarios/route");
    await PUT(pedido({ codigo: MF, salida: "18:30" }));
    expect(upserts[0]).toMatchObject({ entrada: "10:00", dias_laborables: [1, 2, 3, 4, 5, 6], entrada_afuera: "09:00", salida_afuera: null });
  });

  it("una hora inválida se rechaza con 400 y no se escribe nada", async () => {
    const { PUT } = await import("@/app/api/asistencia/horarios/route");
    expect((await PUT(pedido({ codigo: MF, salida: "18:30", entradaAfuera: "9 am" }))).status).toBe(400);
    expect((await PUT(pedido({ codigo: MF, salida: "18:30", entrada: "x" }))).status).toBe(400);
    expect(upserts).toHaveLength(0);
  });

  it("🔴 sin la migración: guarda entrada y salida como siempre, no escribe las columnas nuevas y lo DICE", async () => {
    faltaColumna = true;
    const { PUT } = await import("@/app/api/asistencia/horarios/route");
    const res = await PUT(pedido({ codigo: MF, salida: "18:30", diasLaborables: [1, 2, 3, 4, 5, 6] }));
    const d = await res.json();
    expect(res.status).toBe(200);
    expect(upserts[0]).toMatchObject({ entrada: "10:00", salida: "18:30", almuerzo_minutos: 60 });
    expect(upserts[0]).not.toHaveProperty("dias_laborables");
    expect(d.faltaMigracion).toContain(MIGRACION_HORARIO_CONFIGURABLE);
    upserts.length = 0;
    const ok = await (await PUT(pedido({ codigo: MF, salida: "18:30" }))).json();
    expect(ok).toEqual({ ok: true });
  });
});
