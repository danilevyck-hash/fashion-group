/* ─────────────────────────────────────────────────────────────────────────────
 * LOS DÍAS AFUERA (un rango de «Trabajo de vendedor») Y «COMPENSATORIO».
 * (14-sep-2026)
 *
 * Daniel, textual:
 *  · *«a ellas cuando están afuera se les paga el día regular como si hubiesen
 *    trabajado las 8 horas, en horario de 9-6, con una hora de almuerzo»*
 *  · *«alguien va a decir cada quincena qué días estuvieron afuera, así como a
 *    Rodrigo, siempre y cuando no marquen»*
 *  · *«compensatorio es cuando por ejemplo trabajan un día domingo y se le
 *    compensa ese día por uno de la semana»* · *«al poner qué día será
 *    compensatorio, no se le descuente»*
 *
 * ── LAS REGLAS ───────────────────────────────────────────────────────────────
 * 1. Un rango de «Trabajo de vendedor» sin marcas NO descuenta: el neto es el
 *    de una quincena completa. No genera horas extra ni tardanza.
 * 2. 🔴 SOLO LOS DÍAS SIN MARCA. Si ese día marcó, manda el reloj: la tardanza
 *    y la extra de ese día se cuentan como siempre. Un día marcado no se pisa.
 * 3. 🔴 EL HORARIO 9–18 NO SE GUARDA. Son las 8 horas de un día normal, y eso
 *    es lo que el quincenal ya paga. Guardado como `hora_desde`/`hora_hasta`
 *    sería un PERMISO de horas y el día pasaría a ser una AUSENCIA (medido:
 *    Rodrigo, 14-ago-2026, dos filas así). Por eso el formulario lo DICE y no
 *    lo teclea, y `horasParaGuardar` lo vacía.
 * 4. «Compensatorio» está en la lista, al lado de Incapacidad, es de día
 *    completo y NO descuenta. Justificar significa que se paga; no existe
 *    «justificado pero no se paga» (CLAUDE.md).
 *
 * 🩸 El caso real: Rodrigo (13) tuvo UNA sola marca en la quincena 1–15 sep y
 * el sistema le puso ausencias; su contadora le pagó el período completo:
 * $296,26 de diferencia en un solo colaborador. El motivo ya existía; lo que
 * faltaba era cargarlo por rango y saber que solo cuenta sin marca.
 * Fechas fijas, nunca `new Date()`.
 * ─────────────────────────────────────────────────────────────────────────── */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import {
  MOTIVOS_JUSTIFICACION, MOTIVO_COMPENSATORIO, MOTIVO_TRABAJO_VENDEDOR, MOTIVO_TRABAJO_FUERA_ANTES,
  TEXTO_DIA_AFUERA, TEXTO_DIA_COMPENSATORIO, notaDelMotivo, motivoSeOfrece, textoDiaJustificado,
} from "@/lib/asistencia/motivos";
import { horasParaGuardar, motivoAdmiteHoras } from "@/lib/asistencia/permiso-horas";
import { armarReporte, type Justificacion, type Marcacion } from "@/lib/asistencia/reporte";
import {
  armarLinea, jornadaDiariaMin, medirHoras, MANUALES_CERO, type FichaPlanilla,
} from "@/lib/asistencia/planilla";

const RAIZ = path.resolve(__dirname, "../../..");
const leer = (p: string) => fs.readFileSync(path.join(RAIZ, p), "utf8");
const puro = (p: string) =>
  leer(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const R = REGLAS_DEFAULT;
const COD = "13";
const HORARIO = [{ empleado_codigo: COD, entrada: "08:00", salida: "16:30", almuerzo_minutos: 30 }];
// Lunes 7 a viernes 11 de septiembre de 2026: cinco días hábiles.
const DESDE = "2026-09-07", HASTA = "2026-09-11";
const FICHA: FichaPlanilla = {
  codigo: COD, nombre: "RODRIGO MIRANDA", salarioMensual: 800, jornadaSemanal: 40, empresa: "vistana",
};
const dia = (fecha: string, entrada: string, salida: string): Marcacion[] => [
  { empleado_codigo: COD, empleado_nombre: null, ocurrio_en: `${fecha}T${entrada}:00-05:00` },
  { empleado_codigo: COD, empleado_nombre: null, ocurrio_en: `${fecha}T12:00:00-05:00` },
  { empleado_codigo: COD, empleado_nombre: null, ocurrio_en: `${fecha}T12:30:00-05:00` },
  { empleado_codigo: COD, empleado_nombre: null, ocurrio_en: `${fecha}T${salida}:00-05:00` },
];
const just = (motivo: string, desde: string, hasta: string): Justificacion => ({
  empleado_codigo: COD, desde, hasta, motivo, hora_desde: null, hora_hasta: null,
});
function correr(marcaciones: Marcacion[], justificaciones: Justificacion[]) {
  const [p] = armarReporte({
    marcaciones, horarios: HORARIO, justificaciones, feriados: new Map(),
    desde: DESDE, hasta: HASTA, reglas: R, nombres: new Map([[COD, FICHA.nombre!]]), incluirNoHabiles: true,
  });
  const horas = medirHoras(p, R, jornadaDiariaMin(HORARIO[0]));
  return { p, horas, linea: armarLinea(FICHA, horas, MANUALES_CERO, R) };
}
// La semana entera en la oficina, a la hora: el quincenal completo, sin nada.
const SEMANA_COMPLETA = [
  ...dia("2026-09-07", "08:00", "16:30"), ...dia("2026-09-08", "08:00", "16:30"),
  ...dia("2026-09-09", "08:00", "16:30"), ...dia("2026-09-10", "08:00", "16:30"),
  ...dia("2026-09-11", "08:00", "16:30"),
];

describe("1. un rango de «Trabajo de vendedor» sin marcas paga el período completo", () => {
  it("🔴 lunes en la oficina y martes–viernes afuera: 0 ausencias, el mismo neto que la semana completa", () => {
    const completa = correr(SEMANA_COMPLETA, []);
    const afuera = correr(dia("2026-09-07", "08:00", "16:30"), [just(MOTIVO_TRABAJO_VENDEDOR, "2026-09-08", "2026-09-11")]);
    expect(afuera.horas.ausenciaDias).toBe(0);
    expect(afuera.horas.ausenciaMin).toBe(0);
    expect(afuera.linea.dinero!.ausencias).toBe(0);
    expect(afuera.linea.dinero!.netoPagar).toBe(completa.linea.dinero!.netoPagar);
    // No genera horas extra ni tardanza: no es un día trabajado en el reloj.
    expect(afuera.horas.extraDiurnoMin).toBe(0);
    expect(afuera.horas.tardanzaMin).toBe(0);
    // Y se lee como lo que es, sin la palabra «ausencia».
    expect(afuera.p.resumen.diasTrabajandoFuera).toBe(4);
    expect(afuera.p.resumen.ausenciasSinJustificar).toBe(0);
    expect(afuera.p.resumen.ausenciasJustificadas).toBe(0);
  });

  it("CONTROL: los mismos cuatro días sin justificar SÍ descuentan (4 ausencias)", () => {
    const sin = correr(dia("2026-09-07", "08:00", "16:30"), []);
    expect(sin.horas.ausenciaDias).toBe(4);
    expect(sin.linea.dinero!.ausencias).toBeGreaterThan(0);
    expect(sin.linea.dinero!.netoPagar).toBeLessThan(correr(SEMANA_COMPLETA, []).linea.dinero!.netoPagar);
  });

  it("el nombre viejo («Trabajo fuera de la oficina», la fila de Rodrigo) sigue valiendo igual", () => {
    const viejo = correr(dia("2026-09-07", "08:00", "16:30"), [just(MOTIVO_TRABAJO_FUERA_ANTES, "2026-09-08", "2026-09-11")]);
    expect(viejo.horas.ausenciaDias).toBe(0);
    expect(viejo.p.resumen.diasTrabajandoFuera).toBe(4);
  });
});

describe("2. 🔴 solo los días SIN marca: si marcó, manda el reloj", () => {
  it("el miércoles marcó (tarde y con extra) dentro del rango afuera: su tardanza y su extra se cuentan igual", () => {
    // Miércoles: llega 08:45 (35 min tarde) y sale 17:30 (60 min de extra).
    const marcas = [...dia("2026-09-07", "08:00", "16:30"), ...dia("2026-09-09", "08:45", "17:30")];
    const conRango = correr(marcas, [just(MOTIVO_TRABAJO_VENDEDOR, "2026-09-08", "2026-09-11")]);
    const sinRango = correr(marcas, []);
    const mie = conRango.p.dias.find((d) => d.fecha === "2026-09-09")!;
    expect(mie.marcas.length).toBe(4);
    expect(mie.tardeMin).toBeCloseTo(45, 6);
    expect(mie.extraMin).toBeCloseTo(60, 6);
    expect(mie.ausente).toBe(false);
    // Exactamente lo que el reloj dice sin la justificación: no se pisa.
    expect(conRango.horas.tardanzaMin).toBe(sinRango.horas.tardanzaMin);
    expect(conRango.horas.extraDiurnoMin).toBe(sinRango.horas.extraDiurnoMin);
    expect(conRango.horas.tardanzaMin).toBeCloseTo(45, 6);
    expect(conRango.horas.extraDiurnoMin).toBeCloseTo(60, 6);
    // Los otros tres días del rango, afuera y sin descuento.
    expect(conRango.horas.ausenciaDias).toBe(0);
    expect(conRango.p.resumen.diasTrabajandoFuera).toBe(3);
    expect(conRango.horas.diasTrabajados).toBe(2);
  });
});

describe("3. 🔴 el horario de 9 a 6 NO se guarda: se dice", () => {
  it("la nota lo dice con las palabras de Daniel, y que solo cuenta sin marca", () => {
    expect(notaDelMotivo(MOTIVO_TRABAJO_VENDEDOR)).toBe(TEXTO_DIA_AFUERA);
    expect(notaDelMotivo(MOTIVO_TRABAJO_FUERA_ANTES)).toBe(TEXTO_DIA_AFUERA);
    expect(TEXTO_DIA_AFUERA).toContain("9:00 a 18:00");
    expect(TEXTO_DIA_AFUERA).toContain("una hora de almuerzo");
    expect(TEXTO_DIA_AFUERA).toContain("8 horas");
    expect(TEXTO_DIA_AFUERA).toMatch(/no marcó el reloj/);
    expect(TEXTO_DIA_AFUERA).toMatch(/manda el reloj/);
  });

  it("🔴 ni Trabajo de vendedor ni Compensatorio admiten horas: `horasParaGuardar` las vacía", () => {
    expect(motivoAdmiteHoras(MOTIVO_TRABAJO_VENDEDOR)).toBe(false);
    expect(motivoAdmiteHoras(MOTIVO_COMPENSATORIO)).toBe(false);
    expect(horasParaGuardar(MOTIVO_TRABAJO_VENDEDOR, "09:00", "18:00")).toEqual({ horaDesde: "", horaHasta: "" });
    expect(horasParaGuardar(MOTIVO_COMPENSATORIO, "09:00", "18:00")).toEqual({ horaDesde: "", horaHasta: "" });
  });

  it("🩸 el porqué, medido: un «Trabajo de vendedor» CON horas es un permiso y el día sin marcas queda AUSENTE", () => {
    const conHoras: Justificacion = { ...just(MOTIVO_TRABAJO_VENDEDOR, "2026-09-08", "2026-09-08"), hora_desde: "09:00", hora_hasta: "18:00" };
    const r = correr(dia("2026-09-07", "08:00", "16:30"), [conHoras]);
    const mar = r.p.dias.find((d) => d.fecha === "2026-09-08")!;
    expect(mar.justificado).toBeNull();
    expect(mar.permiso).not.toBeNull();
    expect(mar.ausente).toBe(true);
  });

  it("el formulario muestra la nota del motivo y no teclea el horario", () => {
    const form = puro("src/app/asistencia/JustificarForm.tsx");
    expect(form).toMatch(/const notaMotivo = notaDelMotivo\(motivo\);/);
    expect(form).toMatch(/\{notaMotivo && \(/);
    expect(form).toContain("data-nota-motivo");
    // Sigue mandando `horasParaGuardar`: para estos motivos, vacías.
    expect(form).toMatch(/const horas = horasParaGuardar\(motivo, horaDesde, horaHasta\);/);
    // Ningún «9:00» escrito en el formulario: el texto vive en el módulo puro.
    expect(form).not.toContain("9:00");
  });

  it("los motivos de siempre no llevan nota (nada que explicar)", () => {
    for (const m of ["Incapacidad", "Catástrofe", "Escolares", "Constancia"]) {
      expect(notaDelMotivo(m), m).toBeNull();
    }
    expect(notaDelMotivo(null)).toBeNull();
  });
});

describe("4. «Compensatorio»: en la lista, al lado de Incapacidad, y no descuenta", () => {
  // ⚠️ CAMBIÓ DE DIRECCIÓN EL 17-sep-2026: la lista pasó a SIETE con «Día libre
  // de la empresa» al final. Lo que este caso protege sigue intacto —
  // Compensatorio se ofrece y va JUSTO DESPUÉS de Incapacidad—, y el CONTROL de
  // abajo exige que los dos no se confundan: son lo contrario uno del otro.
  it("se ofrece, justo después de Incapacidad; la lista sigue siendo cerrada y exacta", () => {
    expect([...MOTIVOS_JUSTIFICACION]).toEqual([
      "Incapacidad", MOTIVO_COMPENSATORIO, "Catástrofe", "Escolares", MOTIVO_TRABAJO_VENDEDOR, "Constancia",
      "Día libre de la empresa",
    ]);
    expect(motivoSeOfrece("Compensatorio")).toBe(true);
    expect(MOTIVO_COMPENSATORIO).toBe("Compensatorio");
  });

  // 🔑 CONTROL — el compensatorio y el día libre de la empresa NO son el mismo
  // motivo ni dicen lo mismo. Uno es un libre que se le DEBÍA (gratis) y el
  // otro un libre que la empresa REGALA (deja debiendo 8 horas): si sus textos
  // se parecieran, alguien elegiría el equivocado y eso mueve plata.
  it("🔑 CONTROL — compensatorio y día libre de la empresa no se confunden", () => {
    expect(MOTIVO_COMPENSATORIO).not.toBe("Día libre de la empresa");
    const a = notaDelMotivo(MOTIVO_COMPENSATORIO)!;
    const b = notaDelMotivo("Día libre de la empresa")!;
    expect(a).not.toBe(b);
    expect(a).toMatch(/se le debe/i);
    expect(b).toMatch(/8 horas/);
  });

  it("🔴 un jueves compensatorio sin marcas NO descuenta: mismo neto que la semana completa", () => {
    const completa = correr(SEMANA_COMPLETA, []);
    const marcas = SEMANA_COMPLETA.filter((m) => !m.ocurrio_en.startsWith("2026-09-10"));
    const comp = correr(marcas, [just(MOTIVO_COMPENSATORIO, "2026-09-10", "2026-09-10")]);
    expect(comp.horas.ausenciaDias).toBe(0);
    expect(comp.linea.dinero!.ausencias).toBe(0);
    expect(comp.linea.dinero!.netoPagar).toBe(completa.linea.dinero!.netoPagar);
    expect(comp.p.resumen.ausenciasJustificadas).toBe(1);
    expect(comp.p.resumen.ausenciasSinJustificar).toBe(0);
    // CONTROL: sin la justificación, ese jueves descuenta.
    const sin = correr(marcas, []);
    expect(sin.horas.ausenciaDias).toBe(1);
    expect(sin.linea.dinero!.netoPagar).toBeLessThan(completa.linea.dinero!.netoPagar);
  });

  it("se lee como un día libre que se le debía, sin la palabra «ausencia»", () => {
    expect(textoDiaJustificado(MOTIVO_COMPENSATORIO)).not.toMatch(/ausencia/i);
    expect(textoDiaJustificado(MOTIVO_COMPENSATORIO)).toMatch(/compensatorio/i);
    expect(notaDelMotivo(MOTIVO_COMPENSATORIO)).toBe(TEXTO_DIA_COMPENSATORIO);
    expect(TEXTO_DIA_COMPENSATORIO).toContain("No se descuenta");
    // CONTROL: Incapacidad sigue leyéndose como siempre.
    expect(textoDiaJustificado("Incapacidad")).toBe("Ausencia justificada — Incapacidad");
  });

  it("⛔ ningún motivo trae una marca de «no se paga», y la base no tiene CHECK sobre `motivo` (sin migración)", () => {
    const m = puro("src/lib/asistencia/motivos.ts");
    expect(m).not.toMatch(/noPaga|sinPago|no_paga|descuenta\s*:\s*true/);
    const migraciones = fs.readdirSync(path.join(RAIZ, "supabase/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .map((f) => leer(`supabase/migrations/${f}`).toLowerCase());
    const check = migraciones.filter((s) => /asistencia_justificaciones/.test(s) && /check\s*\([^)]*motivo/.test(s));
    expect(check).toEqual([]);
  });
});
