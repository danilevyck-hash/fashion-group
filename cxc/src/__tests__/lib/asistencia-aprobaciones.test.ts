/* ─────────────────────────────────────────────────────────────────────────────
 * LA APROBACIÓN DE HORAS EXTRA, POR DÍA — el candado.
 *
 * Daniel, 27-ago-2026: *«debe de ser que el usuario entre y vea por dias
 * quienes y cuantas horas, y pueda aprobar seleccionando todos o
 * individualmente, por dia, por semana»*.
 *
 * 🔴 LO QUE SE PRUEBA ACÁ, Y LO PRIMERO ES PLATA:
 *
 *   1. UN DÍA SIN APROBAR NO SE PAGA, y uno aprobado sí. Es la regla de la
 *      contadora: *«sólo se pagan las horas extras autorizadas»*.
 *   2. LA APROBACIÓN ES PARCIAL. Martes sí y miércoles no tiene que pagar
 *      exactamente el martes — un booleano por persona no sabe decir eso, y por
 *      eso el filtro vive en `medirHoras` y no al final de la línea.
 *   3. SIN LA TABLA SE PAGA TODO, como antes de que esto existiera. Cerrar por
 *      falta de un SQL dejaría a treinta personas sin sus extras el día de pago.
 *   4. LO QUE NO SE PAGÓ SE PUEDE DECIR (`extraNoAprobadaMin`). Rechazar sí,
 *      esconder no.
 *   5. LAS FECHAS NO PASAN POR `new Date()`. Una fecha pelada se interpreta
 *      como medianoche UTC, y en Panamá (UTC−5) eso todavía es el día anterior:
 *      la pantalla diría «dom 16» sobre un lunes.
 * ─────────────────────────────────────────────────────────────────────────── */
import { describe, it, expect } from "vitest";

import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import {
  armarPlanilla,
  medirHoras,
  type FichaPlanilla,
  type LineaPlanilla,
} from "@/lib/asistencia/planilla";
import type { PersonaReporte, DiaReporte } from "@/lib/asistencia/reporte";
import {
  armarDiasAprobacion,
  claveDia,
  diaDeLaSemana,
  etiquetaDia,
  indexarAprobaciones,
  lunesDe,
  resumenPendientes,
  type Aprobacion,
} from "@/lib/asistencia/aprobaciones";

// ── Andamiaje: un día que SALE TARDE, con marcas reales ──────────────────────
function dia(fecha: string, salida: string, extraMin: number): DiaReporte {
  return {
    fecha,
    marcas: ["08:00:00", "12:00:00", "12:30:00", `${salida}:00`],
    marcasIds: ["a", "b", "c", "d"],
    entrada: "08:00:00",
    salida: `${salida}:00`,
    tardeMin: 0, excesoAlmuerzoMin: 0, salidaTempranaMin: 0,
    // 🔑 `clasificarDia` lee ESTE campo: lo calcula el motor del reporte.
    extraMin, trabajadoMin: 480, revisar: false,
  } as unknown as DiaReporte;
}

function persona(codigo: string, dias: DiaReporte[]): PersonaReporte {
  return {
    codigo, nombre: `P${codigo}`, salida: "17:00", almuerzoMin: 30, dias,
    resumen: { diasTrabajados: dias.length, ausenciasSinJustificar: 0 },
  } as unknown as PersonaReporte;
}

const FICHA: FichaPlanilla = {
  codigo: "1", nombre: "KEVIN LUBO", salarioMensual: 1000,
  jornadaSemanal: 40, empresa: "fashion_wear",
};

const JORNADA = () => 480;
const fichas = new Map([["1", FICHA]]);

/** Los tres días REALES de Kevin: 18:11 · 17:22 · 18:14. */
const P = persona("1", [
  dia("2026-08-24", "18:11", 71),
  dia("2026-08-25", "17:22", 22),
  dia("2026-08-26", "18:14", 74),
]);

function planilla(aprobados: string[], exigir = true): LineaPlanilla[] {
  return armarPlanilla({
    personas: [P], fichas, jornadaDiariaMin: JORNADA, reglas: REGLAS_DEFAULT,
    exigirAprobacionExtra: exigir,
    diasExtraAprobados: new Set(aprobados.map((f) => claveDia("1", f))),
  });
}

const extrasDe = (l: LineaPlanilla) =>
  Math.round(((l.dinero?.extraDiurno ?? 0) + (l.dinero?.extraNocturno ?? 0)) * 100) / 100;

// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 un día sin aprobar NO se paga; uno aprobado, sí", () => {
  it("sin ninguna aprobación, las horas extra valen $0", () => {
    const [l] = planilla([]);
    expect(extrasDe(l)).toBe(0);
    // Pero los minutos NO desaparecen: se pueden decir.
    expect(l.horas.extraNoAprobadaMin).toBeGreaterThan(0);
  });

  it("con los tres días aprobados, se pagan los tres", () => {
    const [l] = planilla(["2026-08-24", "2026-08-25", "2026-08-26"]);
    expect(extrasDe(l)).toBeGreaterThan(0);
    expect(l.horas.extraNoAprobadaMin).toBe(0);
  });

  it("🔴 PARCIAL: aprobar UN día paga ESE día y nada más", () => {
    const solo24 = planilla(["2026-08-24"])[0];
    const todos = planilla(["2026-08-24", "2026-08-25", "2026-08-26"])[0];
    const nada = planilla([])[0];

    expect(extrasDe(solo24)).toBeGreaterThan(extrasDe(nada));
    expect(extrasDe(solo24)).toBeLessThan(extrasDe(todos));
    // Y lo que quedó afuera son EXACTAMENTE los otros dos días.
    const min24 = medirHoras(P, REGLAS_DEFAULT, 480, {
      exigir: true, codigo: "1", claves: new Set([claveDia("1", "2026-08-24")]),
    });
    const minTodos = medirHoras(P, REGLAS_DEFAULT, 480);
    expect(min24.extraDiurnoMin + min24.extraNocturnoMin + min24.extraNoAprobadaMin)
      .toBeCloseTo(minTodos.extraDiurnoMin + minTodos.extraNocturnoMin, 6);
  });

  it("aprobar el día EQUIVOCADO no paga nada de los que sí trabajó", () => {
    const [l] = planilla(["2026-08-31"]);
    expect(extrasDe(l)).toBe(0);
  });
});

describe("🔴 sin la tabla corrida se paga TODO, como antes", () => {
  it("`exigir:false` ignora la lista y paga los tres días", () => {
    const sinExigir = planilla([], false)[0];
    const conTodo = planilla(["2026-08-24", "2026-08-25", "2026-08-26"])[0];
    expect(extrasDe(sinExigir)).toBe(extrasDe(conTodo));
    expect(sinExigir.horas.extraNoAprobadaMin).toBe(0);
  });
});

describe("🔴 lo que NO depende de la aprobación", () => {
  it("la tardanza, la ausencia y los días trabajados se cuentan igual", () => {
    const a = medirHoras(P, REGLAS_DEFAULT, 480, { exigir: true, codigo: "1", claves: new Set() });
    const b = medirHoras(P, REGLAS_DEFAULT, 480);
    expect(a.tardanzaMin).toBe(b.tardanzaMin);
    expect(a.ausenciaMin).toBe(b.ausenciaMin);
    expect(a.diasTrabajados).toBe(b.diasTrabajados);
    // Lo único que cambia son los recargos.
    expect(a.extraDiurnoMin).toBe(0);
    expect(b.extraDiurnoMin).toBeGreaterThan(0);
  });
});

describe("armarDiasAprobacion — la pantalla", () => {
  const lineas = planilla([]);
  const dias = armarDiasAprobacion({
    lineas, personas: [P], reglas: REGLAS_DEFAULT, aprobaciones: new Map(),
  });

  it("un renglón por DÍA, en orden de calendario", () => {
    expect(dias.map((d) => d.fecha)).toEqual(["2026-08-24", "2026-08-25", "2026-08-26"]);
  });

  it("cada día trae su gente, con la hora de salida", () => {
    expect(dias[0].gente).toHaveLength(1);
    expect(dias[0].gente[0].etiqueta).toContain("KEVIN");
    expect(dias[0].gente[0].salida).toBe("18:11:00");
    expect(dias[0].gente[0].aprobado).toBe(false);
  });

  it("los tres días caen en la MISMA semana", () => {
    expect(new Set(dias.map((d) => d.semana)).size).toBe(1);
    expect(dias[0].semana).toBe("2026-08-24"); // lunes
  });

  it("una aprobación guardada se refleja", () => {
    const a: Aprobacion = {
      codigo: "1", fecha: "2026-08-25", aprobado: true,
      minutosVistos: 52, por: "Julio", cuando: "2026-08-27T15:00:00Z",
    };
    const d2 = armarDiasAprobacion({
      lineas, personas: [P], reglas: REGLAS_DEFAULT,
      aprobaciones: indexarAprobaciones([a]),
    });
    const el25 = d2.find((d) => d.fecha === "2026-08-25")!;
    expect(el25.gente[0].aprobado).toBe(true);
    expect(el25.gente[0].por).toBe("Julio");
    // 🔑 EL TESTIGO: se aprobaron 52 min y hoy son otros → la fila lo dice.
    expect(el25.gente[0].cambio).toBe(true); // 52 guardados vs 22 medidos
    // Y los otros dos siguen pendientes.
    expect(d2.filter((d) => d.gente[0].aprobado)).toHaveLength(1);
  });

  it("`resumenPendientes` cuenta persona-día, que es la unidad", () => {
    const r = resumenPendientes(dias);
    expect(r.pendientes).toBe(3);
    expect(r.claves).toEqual([
      claveDia("1", "2026-08-24"), claveDia("1", "2026-08-25"), claveDia("1", "2026-08-26"),
    ]);
    expect(r.minutos).toBeGreaterThan(0);
  });
});

describe("🔴 las fechas NO pasan por new Date()", () => {
  it("el día de la semana coincide con el calendario, incluidos los bordes", () => {
    const casos: Array<[string, number]> = [
      ["2026-08-16", 0], ["2026-08-17", 1], ["2026-08-23", 0], ["2026-08-24", 1],
      ["2026-01-01", 4], ["2024-02-29", 4], ["2000-02-29", 2], ["2100-03-01", 1],
    ];
    for (const [f, esperado] of casos) expect(diaDeLaSemana(f), f).toBe(esperado);
  });

  it("el lunes de la semana está a 0-6 días atrás y ES lunes", () => {
    for (const f of ["2026-08-16", "2026-08-17", "2026-08-23", "2026-01-01", "2024-02-29", "2026-03-01"]) {
      const l = lunesDe(f);
      expect(diaDeLaSemana(l), `${f} → ${l}`).toBe(1);
      expect(l <= f).toBe(true);
      const dias = (Date.parse(f) - Date.parse(l)) / 86_400_000;
      expect(dias, f).toBeGreaterThanOrEqual(0);
      expect(dias, f).toBeLessThanOrEqual(6);
    }
  });

  it("la etiqueta dice el día correcto", () => {
    expect(etiquetaDia("2026-08-17")).toBe("lun 17 ago");
    expect(etiquetaDia("2026-08-23")).toBe("dom 23 ago");
    expect(etiquetaDia("2026-01-01")).toBe("jue 1 ene");
  });
});

describe("la llave", () => {
  it("es persona + día, y no lleva el período adentro", () => {
    expect(claveDia("11", "2026-08-24")).toBe("11|2026-08-24");
    // 🔑 La MISMA llave para dos cortes distintos: es lo que hace que mover el
    // corte de la quincena no vuelva a preguntar todo desde cero.
    expect(claveDia(" 11 ", "2026-08-24")).toBe("11|2026-08-24");
  });
});
