/**
 * ─────────────────────────────────────────────────────────────────────────────
 * SOLO SE PAGAN LAS HORAS EXTRA AUTORIZADAS — el candado del dinero.
 *
 * Contadora, textual: *«Sólo se pagan las horas extras autorizadas y las
 * reportadas por Julio Garay. La tardanza que se perdona es hasta 10:00 minutos
 * solamente, que es período de gracia.»*
 *
 * 🔴 LO QUE SE PRUEBA ACÁ ES EN DÓLARES, no en banderas. La planilla está
 * cotejada al centavo contra el Excel de la contadora, así que lo que hay que
 * demostrar es doble y en las dos direcciones:
 *
 *   1. SIN exigir aprobación, el cuadro es IDÉNTICO al de siempre — hasta el
 *      centavo, y con `extraMedido` puesto igual (el campo nuevo no puede
 *      cambiar un número).
 *   2. Exigiendo y SIN aprobar, lo único que se mueve son las dos columnas de
 *      hora extra; y aprobar devuelve exactamente el cuadro de (1).
 *
 * 🔴 Y LA TERCERA, que es la que sostiene el diseño: si mañana cambia la base
 * de cálculo (la salida de las 17:00 a las 16:30), la aprobación NO paga el
 * número viejo — el motor recalcula y la fila lo dice.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from "vitest";

import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import {
  armarPlanilla,
  armarLinea,
  medirHoras,
  totalizar,
  HORAS_CERO,
  MANUALES_CERO,
  type FichaPlanilla,
  type LineaPlanilla,
} from "@/lib/asistencia/planilla";
import type { PersonaReporte, DiaReporte } from "@/lib/asistencia/reporte";
import {
  armarFilasAprobacion,
  claveAprobacion,
  diasConExtra,
  estaAprobado,
  extrasNoAprobadas,
  horasBonitas,
  indexarAprobaciones,
  resumenPendientes,
  textoExtraNoAprobada,
  type Aprobacion,
} from "@/lib/asistencia/aprobaciones";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures con las marcaciones REALES de BRICEIDA MONTERO (código 8), que es
// el caso con el que la contadora cotejó su planilla.
// ─────────────────────────────────────────────────────────────────────────────

const dia = (over: Partial<DiaReporte>): DiaReporte => ({
  fecha: "2026-07-20", marcas: [], marcasIds: [], entrada: null, salida: null,
  tardeMin: 0, excesoAlmuerzoMin: 0, salidaTempranaMin: 0, extraMin: 0, trabajadoMin: 0,
  revisar: false, enCurso: false, ausente: false, vacacion: null, justificado: null,
  permiso: null, permisoPerdonaMin: 0, feriado: null, habil: true, correcciones: [],
  ...over,
} as DiaReporte);

/** Un día con horas extra medidas: entró 8:00, salió `salida`. */
const diaConExtra = (fecha: string, salida: string, extraMin: number): DiaReporte =>
  dia({
    fecha,
    marcas: ["08:00", "12:00", "12:30", salida],
    entrada: "08:00",
    salida,
    extraMin,
    trabajadoMin: 510 + extraMin,
  });

const persona = (dias: DiaReporte[]): PersonaReporte => ({
  codigo: "8",
  nombre: "BRICEIDA MONTERO",
  salida: "17:00",
  almuerzoMin: 30,
  dias,
  resumen: {
    diasTrabajados: dias.length, ausenciasSinJustificar: 0, ausenciasJustificadas: 0,
    diasTrabajandoFuera: 0, diasVacaciones: 0, diasVacacionesYaPagadas: 0,
    vecesTarde: 0, minutosTarde: 0, minutosTardeDeDiasARevisar: 0,
    diasConPermiso: 0, minutosPerdonadosPorPermiso: 0,
    diasARevisar: 0, diasCorregidos: 0,
  },
} as unknown as PersonaReporte);

const FICHA: FichaPlanilla = {
  codigo: "8",
  nombre: "BRICEIDA MONTERO",
  salarioMensual: 700,
  jornadaSemanal: 48,
  empresa: "vistana",
};

/** 45 min el lunes + 70 el martes (60 diurnos + 10 después de las 18:00) = 115. */
const DIAS = [
  diaConExtra("2026-07-20", "17:45", 45),
  diaConExtra("2026-07-21", "18:10", 70),
];

const horasDe = (dias: DiaReporte[]) => medirHoras(persona(dias), REGLAS_DEFAULT, 510);

function planilla(opts: { exigir?: boolean; aprobados?: string[] } = {}): LineaPlanilla[] {
  return armarPlanilla({
    personas: [persona(DIAS)],
    fichas: new Map([["8", FICHA]]),
    jornadaDiariaMin: () => 510,
    reglas: REGLAS_DEFAULT,
    exigirAprobacionExtra: opts.exigir === true,
    extrasAprobadas: new Set(opts.aprobados ?? []),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 1. sin exigir aprobación, el cuadro es EL DE SIEMPRE", () => {
  it("paga las horas extra hasta el centavo, como antes de que esto existiera", () => {
    const [l] = planilla();
    expect(l.dinero).not.toBeNull();
    expect(l.horas.extraDiurnoMin).toBe(105);
    expect(l.horas.extraNocturnoMin).toBe(10);
    expect(l.dinero!.extraDiurno).toBeGreaterThan(0);
    expect(l.dinero!.extraNocturno).toBeGreaterThan(0);
  });

  it("`armarLinea` sin el objeto de aprobación da EXACTAMENTE lo mismo", () => {
    const h = horasDe(DIAS);
    const vieja = armarLinea(FICHA, h, MANUALES_CERO, REGLAS_DEFAULT, 1, null);
    const nueva = armarLinea(FICHA, h, MANUALES_CERO, REGLAS_DEFAULT, 1, null, {});
    expect(nueva.dinero).toEqual(vieja.dinero);
    expect(nueva.horas).toEqual(vieja.horas);
  });

  it("`extraAprobada` es true cuando no se exige — el chip no puede mentir", () => {
    expect(planilla()[0].extraAprobada).toBe(true);
  });

  it("`extraMedido` trae los minutos aunque no se exija nada", () => {
    const m = planilla()[0].extraMedido!;
    expect(m.minutos).toBe(115);
    expect(m.diurnoMin).toBe(105);
    expect(m.nocturnoMin).toBe(10);
    expect(m.monto).toBeGreaterThan(0);
  });

  it("quien no hizo horas extra tiene `extraMedido` en null, no un cero", () => {
    const lineas = armarPlanilla({
      personas: [persona([dia({ marcas: ["08:00", "17:00"], entrada: "08:00", salida: "17:00" })])],
      fichas: new Map([["8", FICHA]]),
      jornadaDiariaMin: () => 510,
      reglas: REGLAS_DEFAULT,
    });
    expect(lineas[0].extraMedido).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 2. exigiendo y sin aprobar: NO se pagan, y lo único que se mueve son las extras", () => {
  it("las dos columnas de hora extra quedan en $0,00", () => {
    const [l] = planilla({ exigir: true });
    expect(l.dinero!.extraDiurno).toBe(0);
    expect(l.dinero!.extraNocturno).toBe(0);
    expect(l.horas.extraDiurnoMin).toBe(0);
    expect(l.horas.extraNocturnoMin).toBe(0);
  });

  it("el bruto baja EXACTAMENTE lo que valían las extras, ni un centavo más", () => {
    const pagado = planilla()[0].dinero!;
    const gateado = planilla({ exigir: true })[0].dinero!;
    const extras = pagado.extraDiurno + pagado.extraNocturno;
    expect(Math.round((pagado.totalBruto - gateado.totalBruto) * 100) / 100)
      .toBe(Math.round(extras * 100) / 100);
  });

  it("el quincenal, las ausencias y las tardanzas NO se mueven", () => {
    const pagado = planilla()[0].dinero!;
    const gateado = planilla({ exigir: true })[0].dinero!;
    expect(gateado.salarioQuincenal).toBe(pagado.salarioQuincenal);
    expect(gateado.ausencias).toBe(pagado.ausencias);
    expect(gateado.tardanzas).toBe(pagado.tardanzas);
    expect(gateado.rataHora).toBe(pagado.rataHora);
  });

  it("🔴 lo que midió el reloj NO desaparece: `extraMedido` sigue con los 115 minutos", () => {
    const l = planilla({ exigir: true })[0];
    expect(l.extraAprobada).toBe(false);
    expect(l.extraMedido!.minutos).toBe(115);
    expect(l.extraMedido!.monto).toBeGreaterThan(0);
  });

  it("aprobar devuelve EXACTAMENTE el cuadro de siempre", () => {
    const pagado = planilla()[0];
    const aprobado = planilla({ exigir: true, aprobados: ["8"] })[0];
    expect(aprobado.dinero).toEqual(pagado.dinero);
    expect(aprobado.horas).toEqual(pagado.horas);
    expect(aprobado.extraAprobada).toBe(true);
  });

  it("aprobar a OTRA persona no le paga a ésta", () => {
    const l = planilla({ exigir: true, aprobados: ["99"] })[0];
    expect(l.dinero!.extraDiurno).toBe(0);
  });

  it("los totales del cuadro también bajan solo por las extras", () => {
    const a = totalizar(planilla());
    const b = totalizar(planilla({ exigir: true }));
    expect(b.extraDiurno).toBe(0);
    expect(b.extraNocturno).toBe(0);
    expect(b.salarioQuincenal).toBe(a.salarioQuincenal);
    expect(b.personas).toBe(a.personas);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 3. se aprueba un PERMISO, nunca un número", () => {
  it("si cambia la base de cálculo, se paga lo NUEVO — la aprobación no ata un número viejo", () => {
    // La contadora cuenta desde las 16:30: la misma salida produce 30 minutos
    // más de extra. La aprobación es la misma fila (persona + período).
    const masExtra = [
      diaConExtra("2026-07-20", "17:45", 75),
      diaConExtra("2026-07-21", "18:10", 100),
    ];
    const conBaseNueva = armarPlanilla({
      personas: [persona(masExtra)],
      fichas: new Map([["8", FICHA]]),
      jornadaDiariaMin: () => 510,
      reglas: REGLAS_DEFAULT,
      exigirAprobacionExtra: true,
      extrasAprobadas: new Set(["8"]),
    })[0];

    expect(conBaseNueva.extraMedido!.minutos).toBe(175);
    expect(conBaseNueva.horas.extraDiurnoMin + conBaseNueva.horas.extraNocturnoMin).toBe(175);
    // Se pagó MÁS que con la base vieja: el motor recalculó.
    expect(conBaseNueva.dinero!.extraDiurno + conBaseNueva.dinero!.extraNocturno)
      .toBeGreaterThan(planilla()[0].dinero!.extraDiurno + planilla()[0].dinero!.extraNocturno);
  });

  it("la llave lleva las FECHAS: otro período es otra aprobación", () => {
    expect(claveAprobacion("8", "2026-07-16", "2026-07-31"))
      .not.toBe(claveAprobacion("8", "2026-07-13", "2026-07-27"));
    expect(claveAprobacion(" 8 ", "2026-07-16", "2026-07-31"))
      .toBe(claveAprobacion("8", "2026-07-16", "2026-07-31"));
  });

  it("el testigo que no coincide con lo medido HOY se marca como cambio", () => {
    const filas = armarFilasAprobacion({
      lineas: planilla({ exigir: true, aprobados: ["8"] }),
      personas: [persona(DIAS)],
      reglas: REGLAS_DEFAULT,
      aprobaciones: indexarAprobaciones([{
        codigo: "8", desde: "2026-07-16", hasta: "2026-07-31",
        aprobado: true, minutosVistos: 110, por: "daniel", cuando: "2026-08-26T15:00:00Z",
      }]),
    });
    expect(filas[0].cambio).toBe(true);
    expect(filas[0].minutosVistos).toBe(110);
    expect(filas[0].minutos).toBe(115);
  });

  it("el testigo igual a lo medido NO marca cambio", () => {
    const filas = armarFilasAprobacion({
      lineas: planilla({ exigir: true, aprobados: ["8"] }),
      personas: [persona(DIAS)],
      reglas: REGLAS_DEFAULT,
      aprobaciones: indexarAprobaciones([{
        codigo: "8", desde: "2026-07-16", hasta: "2026-07-31",
        aprobado: true, minutosVistos: 115, por: "daniel", cuando: null,
      }]),
    });
    expect(filas[0].cambio).toBe(false);
  });

  it("una fila DESAPROBADA no se marca como cambio aunque el testigo difiera", () => {
    const filas = armarFilasAprobacion({
      lineas: planilla({ exigir: true }),
      personas: [persona(DIAS)],
      reglas: REGLAS_DEFAULT,
      aprobaciones: indexarAprobaciones([{
        codigo: "8", desde: "2026-07-16", hasta: "2026-07-31",
        aprobado: false, minutosVistos: 999, por: "daniel", cuando: null,
      }]),
    });
    expect(filas[0].aprobado).toBe(false);
    expect(filas[0].cambio).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("la unidad de aprobación es la persona-y-período", () => {
  it("sin fila guardada, NO está aprobado — el default es no pagar", () => {
    expect(estaAprobado(undefined)).toBe(false);
    expect(estaAprobado(null)).toBe(false);
    expect(estaAprobado({ aprobado: false } as Aprobacion)).toBe(false);
    expect(estaAprobado({ aprobado: true } as Aprobacion)).toBe(true);
  });

  it("el detalle por día se puede ver, y sale del MISMO motor que paga", () => {
    const dias = diasConExtra(persona(DIAS), REGLAS_DEFAULT);
    expect(dias).toHaveLength(2);
    expect(dias[0]).toMatchObject({ fecha: "2026-07-20", minutos: 45, diurnoMin: 45, nocturnoMin: 0 });
    expect(dias[1]).toMatchObject({ fecha: "2026-07-21", minutos: 70, diurnoMin: 60, nocturnoMin: 10 });
    // La suma del detalle es EXACTAMENTE lo que se aprueba: no hay dos cuentas.
    expect(dias.reduce((a, d) => a + d.minutos, 0)).toBe(115);
  });

  it("un día sin horas extra no aparece en el detalle", () => {
    const dias = diasConExtra(
      persona([dia({ marcas: ["08:00", "17:00"], entrada: "08:00", salida: "17:00" })]),
      REGLAS_DEFAULT,
    );
    expect(dias).toHaveLength(0);
  });

  it("las filas listan también a los YA APROBADOS — sin eso no se podría desaprobar", () => {
    const filas = armarFilasAprobacion({
      lineas: planilla({ exigir: true, aprobados: ["8"] }),
      personas: [persona(DIAS)],
      reglas: REGLAS_DEFAULT,
      aprobaciones: indexarAprobaciones([{
        codigo: "8", desde: "2026-07-16", hasta: "2026-07-31",
        aprobado: true, minutosVistos: 115, por: "daniel", cuando: "2026-08-26T15:00:00Z",
      }]),
    });
    expect(filas).toHaveLength(1);
    expect(filas[0].aprobado).toBe(true);
    expect(filas[0].por).toBe("daniel");
  });

  it("primero lo que falta aprobar, y adentro más horas arriba", () => {
    const lineas: LineaPlanilla[] = [
      { ...planilla({ exigir: true })[0], codigo: "1", etiqueta: "APROBADA", extraAprobada: true,
        extraMedido: { minutos: 500, diurnoMin: 500, nocturnoMin: 0, monto: 1 } },
      { ...planilla({ exigir: true })[0], codigo: "2", etiqueta: "CHICA",
        extraMedido: { minutos: 10, diurnoMin: 10, nocturnoMin: 0, monto: 1 } },
      { ...planilla({ exigir: true })[0], codigo: "3", etiqueta: "GRANDE",
        extraMedido: { minutos: 300, diurnoMin: 300, nocturnoMin: 0, monto: 1 } },
    ];
    // 🔑 Quién está aprobado sale del MAPA, no de `extraAprobada` de la línea:
    // ese campo también es `true` cuando NO se exige aprobación, así que leerlo
    // acá mandaría al fondo a todo el mundo el día que la tabla no exista.
    const filas = armarFilasAprobacion({
      lineas, personas: [], reglas: REGLAS_DEFAULT,
      aprobaciones: indexarAprobaciones([{
        codigo: "1", desde: "a", hasta: "b", aprobado: true, minutosVistos: 500, por: null, cuando: null,
      }]),
    });
    expect(filas.map((f) => f.codigo)).toEqual(["3", "2", "1"]);
  });

  it("«Aprobar todas» junta solo lo pendiente", () => {
    const filas = armarFilasAprobacion({
      lineas: [
        { ...planilla({ exigir: true })[0], codigo: "1", extraAprobada: true,
          extraMedido: { minutos: 60, diurnoMin: 60, nocturnoMin: 0, monto: 1 } },
        { ...planilla({ exigir: true })[0], codigo: "2",
          extraMedido: { minutos: 90, diurnoMin: 90, nocturnoMin: 0, monto: 1 } },
      ],
      personas: [], reglas: REGLAS_DEFAULT,
      aprobaciones: indexarAprobaciones([{
        codigo: "1", desde: "a", hasta: "b", aprobado: true, minutosVistos: 60, por: null, cuando: null,
      }]),
    });
    const r = resumenPendientes(filas);
    expect(r.personas).toBe(1);
    expect(r.minutos).toBe(90);
    expect(r.codigos).toEqual(["2"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 lo que no se paga SE DICE, con nombre y cantidad", () => {
  it("el aviso trae el nombre, las horas y el monto", () => {
    const items = extrasNoAprobadas(planilla({ exigir: true }));
    expect(items).toHaveLength(1);
    expect(items[0].etiqueta).toBe("BRICEIDA MONTERO");
    expect(items[0].minutos).toBe(115);

    const t = textoExtraNoAprobada(items)!;
    expect(t).toContain("BRICEIDA MONTERO");
    expect(t).toContain("1,92 h");
    expect(t).toContain("NO se pagaron");
    expect(t).toContain("Aprobaciones");
  });

  it("sin nada pendiente NO hay aviso — un cartel permanente se deja de leer", () => {
    expect(textoExtraNoAprobada([])).toBeNull();
    expect(extrasNoAprobadas(planilla({ exigir: true, aprobados: ["8"] }))).toHaveLength(0);
    expect(extrasNoAprobadas(planilla())).toHaveLength(0);
  });

  it("con varias personas dice cuántas son y las lista", () => {
    const t = textoExtraNoAprobada([
      { codigo: "8", etiqueta: "BRICEIDA MONTERO", minutos: 333, monto: 21.5 },
      { codigo: "11", etiqueta: "JULIO GARAY", minutos: 120, monto: 8.1 },
    ])!;
    expect(t).toContain("2 personas");
    expect(t).toContain("BRICEIDA MONTERO");
    expect(t).toContain("JULIO GARAY");
    expect(t).toContain("$21.50");
  });

  it("sin monto calculable se dicen igual los minutos", () => {
    const t = textoExtraNoAprobada([
      { codigo: "8", etiqueta: "BRICEIDA MONTERO", minutos: 333, monto: null },
    ])!;
    expect(t).toContain("5,55 h");
    expect(t).not.toContain("$");
  });

  it("los minutos se escriben con coma decimal, como el resto del módulo", () => {
    expect(horasBonitas(333)).toBe("5,55 h");
    expect(horasBonitas(330)).toBe("5,50 h");
    expect(horasBonitas(0)).toBe("0,00 h");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("la tolerancia de los 10 minutos NO se tocó", () => {
  it("sigue siendo 10 en las reglas por defecto", () => {
    expect(REGLAS_DEFAULT.toleranciaTardanzaMin).toBe(10);
  });

  it("la tardanza se cobra igual esté o no aprobada la hora extra", () => {
    const tarde = [
      dia({ fecha: "2026-07-20", marcas: ["08:15", "12:00", "12:30", "17:45"],
        entrada: "08:15", salida: "17:45", tardeMin: 5, extraMin: 45, trabajadoMin: 555 }),
    ];
    const conArmar = (exigir: boolean) => armarPlanilla({
      personas: [persona(tarde)],
      fichas: new Map([["8", FICHA]]),
      jornadaDiariaMin: () => 510,
      reglas: REGLAS_DEFAULT,
      exigirAprobacionExtra: exigir,
      extrasAprobadas: new Set<string>(),
    })[0];
    expect(conArmar(true).dinero!.tardanzas).toBe(conArmar(false).dinero!.tardanzas);
  });
});
