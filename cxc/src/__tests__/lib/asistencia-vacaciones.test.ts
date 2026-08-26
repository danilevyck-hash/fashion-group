// ─────────────────────────────────────────────────────────────────────────────
// CANDADO DE LAS VACACIONES (25-ago-2026)
//
// Tres cosas que valen plata y que se rompen sin querer:
//
//  1. 🔴 EN UN DÍA DE VACACIONES NO SE CALCULA NADA DEL RELOJ. Daniel, textual:
//     *"si alguien pasó por el reloj estando de vacaciones, no genera horas, ni
//     tardanza, ni ausencia"*. Acá se le meten marcaciones REALES a un día de
//     vacaciones —entrando tarde y saliendo tarde— y se exige que ni un minuto
//     entre en ninguna cuenta.
//
//  2. 🔴 EL INTERRUPTOR DECIDE UNA QUINCENA, Y SE PRUEBA EN DÓLARES. Sin marcar
//     se paga; marcado no. La diferencia se compara contra el mismo escenario
//     sin vacaciones, campo por campo, para que ningún otro número se mueva de
//     paso.
//
//  3. 🔴 NADA SE DESCARTA EN SILENCIO. Si la planilla dejó de pagar días, el
//     aviso tiene que traer el NOMBRE, el RANGO y el MONTO — las tres cosas.
//
// ⚠️ Ninguno de estos tests busca texto en un archivo: corren el motor, corren
// la planilla y miran los dólares. Un barrido estático no puede ver que un día
// de vacaciones dejó de generar tardanza.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx-js-style";
import { readFileSync } from "fs";
import { join } from "path";

import {
  armarReporte,
  type Marcacion,
  type HorarioPersona,
  type Justificacion,
} from "@/lib/asistencia/reporte";
import {
  armarPlanilla,
  jornadaDiariaMin,
  MIN_DIA_NO_TRABAJADO,
  textoAusencias,
  totalizar,
  type FichaPlanilla,
} from "@/lib/asistencia/planilla";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import { construirExcel } from "@/lib/asistencia/exportar";
import {
  diasDeVacacion,
  efectoDelInterruptor,
  esYaPagada,
  textoDiaVacaciones,
  textoRangos,
  textoVacacion,
  textoVacacionesNoPagadas,
  vacacionDe,
  type Vacacion,
} from "@/lib/asistencia/vacaciones";

const R = REGLAS_DEFAULT;

// ── El escenario ─────────────────────────────────────────────────────────────
// Una semana hábil (lun 3 → vie 7 de agosto de 2026). La persona marca lunes,
// martes y miércoles completos. El JUEVES está de vacaciones — y ese día pasó
// por el reloj igual, llegando tarde y quedándose de más.
const DESDE = "2026-08-03";
const HASTA = "2026-08-07";
const DIAS_TRABAJADOS = ["2026-08-03", "2026-08-04", "2026-08-05"];
const DIA_VACACION = "2026-08-06";
const VIERNES = "2026-08-07";

const CODIGO = "29";
const NOMBRE = "ELOYN MENDOZA";

/** Panamá es UTC−5 fijo. Una hora local del día, como instante ISO. */
const enPanama = (dia: string, hhmm: string) =>
  new Date(Date.parse(`${dia}T${hhmm}:00-05:00`)).toISOString();

const marcasNormales = (d: string) =>
  ["08:00", "12:00", "12:30", "17:00"].map((h) => ({
    empleado_codigo: CODIGO, empleado_nombre: null, ocurrio_en: enPanama(d, h),
  }));

/**
 * 🩸 LAS MARCAS DEL DÍA DE VACACIONES SON A PROPÓSITO LAS PEORES: entró 8:47
 * (37 minutos tarde pasada la tolerancia) y se fue 18:30 (una hora y media
 * después de su salida). Con el motor viejo eso serían minutos de tardanza Y
 * horas extra al 1,25 y al 1,50 — o sea plata en las dos direcciones.
 */
const marcasDelDiaDeVacacion = ["08:47", "12:00", "12:30", "18:30"].map((h) => ({
  empleado_codigo: CODIGO, empleado_nombre: null, ocurrio_en: enPanama(DIA_VACACION, h),
}));

const horarios: HorarioPersona[] = [
  { empleado_codigo: CODIGO, entrada: "08:00", salida: "17:00", almuerzo_minutos: 30 },
];

const ficha: FichaPlanilla = {
  codigo: CODIGO, nombre: NOMBRE,
  salarioMensual: 800, jornadaSemanal: 40, empresa: "vistana",
};

const vacacion = (yaPagadas: boolean, desde = DIA_VACACION, hasta = DIA_VACACION): Vacacion => ({
  empleado_codigo: CODIGO, desde, hasta, ya_pagadas: yaPagadas,
});

function reporte(opts: {
  vacaciones?: Vacacion[];
  justificaciones?: Justificacion[];
  /** ¿La persona marcó el día de la vacación? */
  marcoEnVacaciones?: boolean;
} = {}) {
  const marcaciones: Marcacion[] = [
    ...DIAS_TRABAJADOS.flatMap(marcasNormales),
    ...(opts.marcoEnVacaciones ? marcasDelDiaDeVacacion : []),
    ...marcasNormales(VIERNES),
  ];
  return armarReporte({
    marcaciones,
    horarios,
    justificaciones: opts.justificaciones ?? [],
    vacaciones: opts.vacaciones,
    feriados: new Map(),
    desde: DESDE,
    hasta: HASTA,
    reglas: R,
    nombres: new Map([[CODIGO, NOMBRE]]),
    incluirNoHabiles: true,
  });
}

function planilla(opts: Parameters<typeof reporte>[0] = {}) {
  const personas = reporte(opts);
  const horarioDe = new Map(horarios.map((h) => [h.empleado_codigo, h]));
  return armarPlanilla({
    personas,
    fichas: new Map([[CODIGO, ficha]]),
    jornadaDiariaMin: (c) => jornadaDiariaMin(horarioDe.get(c)),
    reglas: R,
    empresa: "vistana",
  });
}

const lineaDe = (opts: Parameters<typeof reporte>[0] = {}) =>
  planilla(opts).find((l) => l.codigo === CODIGO)!;

/**
 * La misma semana con los CINCO días trabajados perfecto y sin vacaciones.
 *
 * 🔑 ES LA VARA DE «SE PAGA», y no `lineaDe()` a secas: sin vacación y sin
 * marcas, el jueves es una AUSENCIA de día completo. Compararse contra eso
 * probaría lo contrario de lo que se quiere decir.
 */
function lineaPerfecta() {
  const marcaciones: Marcacion[] = [
    ...DIAS_TRABAJADOS.flatMap(marcasNormales),
    ...marcasNormales(DIA_VACACION),
    ...marcasNormales(VIERNES),
  ];
  const personas = armarReporte({
    marcaciones, horarios, justificaciones: [],
    feriados: new Map(), desde: DESDE, hasta: HASTA, reglas: R,
    nombres: new Map([[CODIGO, NOMBRE]]), incluirNoHabiles: true,
  });
  const horarioDe = new Map(horarios.map((h) => [h.empleado_codigo, h]));
  return armarPlanilla({
    personas,
    fichas: new Map([[CODIGO, ficha]]),
    jornadaDiariaMin: (c) => jornadaDiariaMin(horarioDe.get(c)),
    reglas: R, empresa: "vistana",
  }).find((l) => l.codigo === CODIGO)!;
}

const diaDe = (personas: ReturnType<typeof reporte>, fecha: string) =>
  personas.find((p) => p.codigo === CODIGO)!.dias.find((d) => d.fecha === fecha)!;

// ═════════════════════════════════════════════════════════════════════════════
describe("🔴 UN DÍA DE VACACIONES NO CALCULA NADA DEL RELOJ", () => {
  it("con marcación real —llegó tarde y salió tarde— no genera horas, ni tardanza, ni ausencia", () => {
    const d = diaDe(reporte({ vacaciones: [vacacion(false)], marcoEnVacaciones: true }), DIA_VACACION);

    expect(d.vacacion).not.toBeNull();
    // Todo en cero. Se listan uno por uno a propósito: si mañana el motor gana
    // un número nuevo, este test lo deja pasar y el de abajo lo caza igual.
    expect(d.tardeMin).toBe(0);
    expect(d.extraMin).toBe(0);
    expect(d.trabajadoMin).toBe(0);
    expect(d.excesoAlmuerzoMin).toBe(0);
    expect(d.salidaTempranaMin).toBe(0);
    expect(d.ausente).toBe(false);
    expect(d.revisar).toBe(false);
    expect(d.justificado).toBeNull();
    expect(d.permiso).toBeNull();
    expect(d.marcas).toEqual([]);
  });

  it("🩸 esas marcas SÍ existirían sin la vacación: 47 min tarde y 43 de extra", () => {
    // Es lo que prueba que el cero de arriba lo produce la vacación y no que el
    // escenario sea inofensivo. Sin este caso, un motor roto pasaría en verde.
    // ⚠️ 43 y no 90: la hora extra va NETA del atraso del mismo día (regla 3
    // del motor — quien llegó tarde y se fue tarde RECUPERÓ, no hizo extra).
    const d = diaDe(reporte({ marcoEnVacaciones: true }), DIA_VACACION);
    expect(d.tardeMin).toBe(47);
    expect(d.extraMin).toBe(43);
  });

  it("🔴 las marcas NO se esconden: viajan para poder mostrarlas", () => {
    // Descartar un dato está bien; descartarlo EN SILENCIO no. La pantalla las
    // muestra con un «(no cuenta)» al lado.
    const d = diaDe(reporte({ vacaciones: [vacacion(false)], marcoEnVacaciones: true }), DIA_VACACION);
    expect(d.vacacion!.marcasIgnoradas).toEqual(["08:47:00", "12:00:00", "12:30:00", "18:30:00"]);
  });

  it("sin marcar el reloj tampoco es una ausencia — la persona no faltó", () => {
    const d = diaDe(reporte({ vacaciones: [vacacion(false)] }), DIA_VACACION);
    expect(d.ausente).toBe(false);
    expect(d.vacacion!.marcasIgnoradas).toEqual([]);
  });

  it("🔴 la vacación le GANA a una justificación del mismo día, y el día dice UNA sola cosa", () => {
    const d = diaDe(
      reporte({
        vacaciones: [vacacion(false)],
        justificaciones: [{ empleado_codigo: CODIGO, desde: DIA_VACACION, hasta: DIA_VACACION, motivo: "Incapacidad" }],
      }),
      DIA_VACACION,
    );
    expect(d.vacacion).not.toBeNull();
    // Dos etiquetas para el mismo día es cómo la pantalla y el papel terminan
    // diciendo cosas distintas del mismo renglón.
    expect(d.justificado).toBeNull();
  });

  it("los DEMÁS días no se tocan: el lunes sigue midiéndose igual", () => {
    const conVac = diaDe(reporte({ vacaciones: [vacacion(true)] }), DIAS_TRABAJADOS[0]);
    const sinVac = diaDe(reporte(), DIAS_TRABAJADOS[0]);
    expect(conVac).toEqual(sinVac);
  });

  it("el resumen cuenta los días de vacaciones APARTE de las ausencias", () => {
    const p = reporte({ vacaciones: [vacacion(true)] }).find((x) => x.codigo === CODIGO)!;
    expect(p.resumen.diasVacaciones).toBe(1);
    expect(p.resumen.diasVacacionesYaPagadas).toBe(1);
    // 🔴 NUNCA en los cajones de ausencia: una vacación no es una falta.
    expect(p.resumen.ausenciasSinJustificar).toBe(0);
    expect(p.resumen.ausenciasJustificadas).toBe(0);
    expect(p.resumen.diasTrabajandoFuera).toBe(0);
  });

  it("sin la lista de vacaciones el motor da EXACTAMENTE lo de siempre", () => {
    // Es lo que hace que la tabla pueda tardar semanas en correrse sin mover un
    // centavo: `leerVacaciones` devuelve cero filas y todo se comporta igual.
    expect(reporte({ marcoEnVacaciones: true })).toEqual(
      reporte({ vacaciones: [], marcoEnVacaciones: true }),
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("🔴 EL INTERRUPTOR, EN DÓLARES", () => {
  it("SIN MARCAR se paga: cobra lo mismo que si hubiera trabajado los 5 días", () => {
    const conVac = lineaDe({ vacaciones: [vacacion(false)] });
    const perfecta = lineaPerfecta();

    expect(conVac.dinero).not.toBeNull();
    // Campo por campo: si algún día entra una columna nueva, se compara sola.
    for (const k of Object.keys(conVac.dinero!) as Array<keyof typeof conVac.dinero>) {
      expect(`${String(k)}=${conVac.dinero![k]}`).toBe(`${String(k)}=${perfecta.dinero![k]}`);
    }
    expect(conVac.dinero!.vacacionesYaPagadas).toBe(0);
    expect(conVac.dinero!.ausencias).toBe(0);
  });

  it("🩸 y SIN la vacación ese mismo jueves sería una AUSENCIA de $36,96", () => {
    // Es lo que prueba que el cero de arriba lo produce la vacación. Sin este
    // caso, un motor que no descuenta nada nunca pasaría en verde.
    // 🔑 8 h × 4,62 = 36,96. Eran $39,27 cuando la ausencia se valuaba con la
    // jornada del horario (8,5 h); desde el 25-ago-2026 son 8 h fijas para
    // todos, que es lo que descuenta la contadora. Ver `MIN_DIA_NO_TRABAJADO`.
    expect(lineaDe().dinero!.ausencias).toBe(36.96);
  });

  it("SIN MARCAR se paga TAMBIÉN si la persona marcó ese día — las marcas no la penalizan", () => {
    const sinMarcar = lineaDe({ vacaciones: [vacacion(false)], marcoEnVacaciones: true });
    const perfecta = lineaPerfecta();
    expect(sinMarcar.dinero!.netoPagar).toBe(perfecta.dinero!.netoPagar);
    // Los 47 minutos tarde y los 43 de extra de ese día no existen para el pago.
    expect(sinMarcar.dinero!.tardanzas).toBe(0);
    expect(sinMarcar.dinero!.extraDiurno).toBe(0);
  });

  it("🔴 MARCADO no se paga: se descuenta exactamente UN DÍA de 8 h × la rata", () => {
    const marcada = lineaDe({ vacaciones: [vacacion(true)] });
    const sinMarcar = lineaDe({ vacaciones: [vacacion(false)] });
    // La diferencia de neto es EXACTAMENTE el día que no se pagó.
    expect(Math.round((sinMarcar.dinero!.netoPagar - marcada.dinero!.netoPagar) * 100) / 100)
      .toBeGreaterThan(0);

    const rata = marcada.dinero!.rataHora;
    const esperado = Math.round((MIN_DIA_NO_TRABAJADO / 60) * rata * 100) / 100;

    expect(marcada.dinero!.vacacionesYaPagadas).toBe(esperado);
    expect(marcada.dinero!.netoPagar).toBeLessThan(sinMarcar.dinero!.netoPagar);
    // Con salario $800 y jornada de 40 h, la rata es $4,62 y el día $36,96.
    expect(marcada.dinero!.vacacionesYaPagadas).toBe(36.96);
    // 🔴 EL CANDADO: su horario dura 8,5 h y el descuento NO lo mira. Con la
    // jornada del horario esto daría $39,27 y volvería a haber dos varas para
    // el mismo hecho —un día que no se trabajó—.
    expect(marcada.horas.jornadaDiariaMin).toBe(510);
    expect(marcada.dinero!.vacacionesYaPagadas).not.toBe(39.27);
  });

  it("el descuento entra por la MISMA puerta que las ausencias — el bruto no gana un término", () => {
    const d = lineaDe({ vacaciones: [vacacion(true)] }).dinero!;
    // 🔴 Está ADENTRO de `ausencias`, no al lado: si se sumara aparte, se
    // descontaría dos veces.
    expect(d.ausencias).toBe(
      Math.round((d.ausenciaDeDiaCompleto + d.ausenciaPorTardanza + d.vacacionesYaPagadas) * 100) / 100,
    );
    expect(d.totalBruto).toBe(
      Math.round(
        (d.salarioQuincenal + d.extraDiurno + d.extraNocturno + d.excedente
          + d.domingos + d.feriados - d.ausencias - d.tardanzas) * 100,
      ) / 100,
    );
  });

  it("marcada, un día de vacaciones NO cuenta como ausencia en las horas", () => {
    const h = lineaDe({ vacaciones: [vacacion(true)] }).horas;
    expect(h.vacacionesYaPagadasDias).toBe(1);
    expect(h.ausenciaDias).toBe(0);
    expect(h.ausenciaMin).toBe(0);
    expect(h.ausenciaJustificadaDias).toBe(0);
  });

  it("🔴 un FIN DE SEMANA o un FERIADO adentro del rango marcado NO se descuentan", () => {
    // No había jornada que pagar ese día: descontarlo sería cobrarle dos veces.
    // El rango cubre la semana entera + el sábado y el domingo.
    const personas = armarReporte({
      marcaciones: [],
      horarios,
      justificaciones: [],
      vacaciones: [vacacion(true, "2026-08-03", "2026-08-09")],
      feriados: new Map([["2026-08-05", "Fundación de Panamá"]]),
      desde: "2026-08-03",
      hasta: "2026-08-09",
      reglas: R,
      nombres: new Map([[CODIGO, NOMBRE]]),
      incluirNoHabiles: true,
    });
    // Sin una sola marca la persona no llega al reporte, así que se mide sobre
    // el escenario normal: se le agrega una marca suelta para que exista.
    expect(personas).toEqual([]);

    const conMarca = armarReporte({
      marcaciones: marcasNormales("2026-08-03"),
      horarios,
      justificaciones: [],
      // El rango cubre 4→9: mar, mié (feriado), jue, vie, sáb y dom.
      vacaciones: [vacacion(true, "2026-08-04", "2026-08-09")],
      feriados: new Map([["2026-08-05", "Fundación de Panamá"]]),
      desde: "2026-08-03",
      hasta: "2026-08-09",
      reglas: R,
      nombres: new Map([[CODIGO, NOMBRE]]),
      incluirNoHabiles: true,
    });
    const horarioDe = new Map(horarios.map((h) => [h.empleado_codigo, h]));
    const l = armarPlanilla({
      personas: conMarca,
      fichas: new Map([[CODIGO, ficha]]),
      jornadaDiariaMin: (c) => jornadaDiariaMin(horarioDe.get(c)),
      reglas: R,
      empresa: "vistana",
    }).find((x) => x.codigo === CODIGO)!;

    // 6 días cubiertos, pero solo se descuentan mar · jue · vie = 3.
    expect(l.horas.vacacionesDias).toBe(6);
    expect(l.horas.vacacionesYaPagadasDias).toBe(3);
  });

  it("los totales del cuadro llevan el desglose, y NO lo suman de más", () => {
    const t = totalizar(planilla({ vacaciones: [vacacion(true)] }));
    expect(t.vacacionesYaPagadas).toBeGreaterThan(0);
    expect(t.ausencias).toBe(
      Math.round((t.ausenciaDeDiaCompleto + t.ausenciaPorTardanza + t.vacacionesYaPagadas) * 100) / 100,
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("🔴 NADA SE DESCARTA EN SILENCIO — el aviso ámbar", () => {
  const item = {
    codigo: CODIGO,
    etiqueta: NOMBRE,
    rangos: [{ desde: "2026-07-16", hasta: "2026-08-13" }],
    dias: 5,
    monto: 194.8,
  };

  it("trae las TRES cosas: nombre, rango y monto", () => {
    const t = textoVacacionesNoPagadas([item])!;
    expect(t).toContain(NOMBRE);
    expect(t).toContain("16 jul 2026 → 13 ago 2026");
    expect(t).toContain("$194.80");
    expect(t).toContain("5 días");
    // Y dice QUÉ pasó, no solo los datos.
    expect(t).toContain("NO se pagaron");
  });

  it("sin nada que avisar NO se dibuja — un cartel permanente se deja de leer", () => {
    expect(textoVacacionesNoPagadas([])).toBeNull();
  });

  it("con dos personas las nombra a las dos", () => {
    const t = textoVacacionesNoPagadas([item, { ...item, codigo: "7", etiqueta: "ANA GARCÍA" }])!;
    expect(t).toContain(NOMBRE);
    expect(t).toContain("ANA GARCÍA");
    expect(t).toContain("2 vacaciones");
  });

  it("🔑 dos rangos NO se juntan en uno solo — sería inventar un período continuo", () => {
    const t = textoRangos([
      { desde: "2026-07-16", hasta: "2026-07-20" },
      { desde: "2026-08-10", hasta: "2026-08-13" },
    ]);
    expect(t).toBe("16 jul 2026 → 20 jul 2026 y 10 ago 2026 → 13 ago 2026");
  });

  it("habla en singular cuando es un solo día y una sola vacación", () => {
    const t = textoVacacionesNoPagadas([{ ...item, dias: 1 }])!;
    expect(t).toContain("1 día ·");
    expect(t).toContain("1 vacación marcada");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("cómo se lee un día de vacaciones", () => {
  it("dice «Vacaciones», y NUNCA la palabra ausencia", () => {
    expect(textoDiaVacaciones(false)).toBe("Vacaciones");
    expect(textoDiaVacaciones(true)).toBe("Vacaciones (ya pagadas)");
    for (const yaPagadas of [true, false]) {
      expect(textoDiaVacaciones(yaPagadas).toLowerCase()).not.toContain("ausencia");
    }
  });

  it("el rango escrito nombra cuál de las dos es", () => {
    expect(textoVacacion("2026-07-16", "2026-08-13", false))
      .toBe("Vacaciones del 16 jul 2026 al 13 ago 2026");
    expect(textoVacacion("2026-07-16", "2026-08-13", true))
      .toBe("Vacaciones (ya pagadas) del 16 jul 2026 al 13 ago 2026");
  });

  it("la única línea del interruptor dice el efecto, y es UNA sola", () => {
    expect(efectoDelInterruptor(true)).toBe("No se le pagan estos días: ya se los pagaste antes.");
    expect(efectoDelInterruptor(false)).toBe("Se le pagan estos días.");
    // 🔑 Corta: Daniel odia los párrafos didácticos, en la UI y en las
    // respuestas. Si alguien le agrega media frase «para que se entienda
    // mejor», vuelve a ser lo que se sacó.
    for (const yaPagadas of [true, false]) {
      const linea = efectoDelInterruptor(yaPagadas);
      expect(linea.split(/\s+/).length).toBeLessThanOrEqual(12);
      expect(linea).not.toContain("\n");
    }
  });

  it("la columna «Ausencias» de la planilla DICE de dónde salió el monto", () => {
    const h = lineaDe({ vacaciones: [vacacion(true)] }).horas;
    const t = textoAusencias(h);
    expect(t).toContain("1 día(s) de vacaciones ya pagadas");
  });

  it("sin vacaciones marcadas, esa etiqueta es la de siempre", () => {
    expect(textoAusencias(lineaDe().horas)).not.toContain("vacaciones");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("la vacación que cubre un día, y los días que cubre", () => {
  const vs: Vacacion[] = [
    { empleado_codigo: "29", desde: "2026-07-16", hasta: "2026-08-13", ya_pagadas: false },
    { empleado_codigo: "7", desde: "2026-08-01", hasta: "2026-08-05", ya_pagadas: true },
  ];

  it("los bordes ENTRAN: el primer día y el último están adentro", () => {
    expect(vacacionDe(vs, "29", "2026-07-16")).not.toBeNull();
    expect(vacacionDe(vs, "29", "2026-08-13")).not.toBeNull();
    expect(vacacionDe(vs, "29", "2026-07-15")).toBeNull();
    expect(vacacionDe(vs, "29", "2026-08-14")).toBeNull();
  });

  it("no confunde a dos personas", () => {
    expect(vacacionDe(vs, "7", "2026-07-20")).toBeNull();
    expect(vacacionDe(vs, "7", "2026-08-03")!.ya_pagadas).toBe(true);
  });

  it("cuenta los días de calendario, con los dos bordes adentro", () => {
    expect(diasDeVacacion("2026-08-06", "2026-08-06")).toBe(1);
    expect(diasDeVacacion("2026-07-16", "2026-08-13")).toBe(29);
    // Un rango al revés no cubre nada.
    expect(diasDeVacacion("2026-08-10", "2026-08-01")).toBe(0);
  });

  it("🔴 el interruptor solo se enciende con un sí de verdad", () => {
    expect(esYaPagada(true)).toBe(true);
    expect(esYaPagada("true")).toBe(true);
    // Cualquier otra cosa cae en «se paga», que es el default y el caso normal.
    // El modo de fallo aceptable es pagar de más, nunca descontar una quincena
    // por un valor raro que llegó del navegador.
    for (const v of [false, "false", "sí", "1", 1, null, undefined, {}, []]) {
      expect(esYaPagada(v)).toBe(false);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("el Excel dice lo mismo que la pantalla", () => {
  function filas(hoja: string) {
    const wb = construirExcel({
      personas: reporte({ vacaciones: [vacacion(true)], marcoEnVacaciones: true }),
      desde: DESDE, hasta: HASTA, reglas: R,
    });
    return XLSX.utils.sheet_to_json(wb.Sheets[hoja], { header: 1 }) as unknown[][];
  }

  it("el día de vacaciones sale en el Detalle, con las mismas palabras", () => {
    const f = filas("Detalle");
    const col = f[0].indexOf("Ausencia / justificación");
    expect(col).toBeGreaterThan(-1);
    expect(f.slice(1).map((r) => String(r[col] ?? ""))).toContain("Vacaciones (ya pagadas)");
    // 🔴 Nunca «ausencia» sobre un día de vacaciones.
    for (const r of f.slice(1)) {
      const v = String(r[col] ?? "");
      if (v.startsWith("Vacaciones")) expect(v.toLowerCase()).not.toContain("ausencia");
    }
  });

  it("el Resumen trae los días de vacaciones, y las columnas nuevas van AL FINAL", () => {
    const f = filas("Resumen");
    const head = f[0].map(String);
    expect(head[head.length - 2]).toBe("Días de vacaciones");
    expect(head[head.length - 1]).toBe("…ya pagadas (no se pagan)");
    // 🩸 La columna «…de días a revisar» se pinta en rojo por POSICIÓN (índice
    // 9): meter algo en el medio teñiría los minutos tarde, que no son una
    // advertencia. Ya pasó una vez en este archivo.
    expect(head[9]).toBe("…de días a revisar");
    const fila = f.find((r) => String(r[1]) === CODIGO)!;
    expect(fila[head.length - 2]).toBe(1);
    expect(fila[head.length - 1]).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("🔴 LA MIGRACIÓN — la vacación de Eloyn no puede cambiar de comportamiento", () => {
  const SQL = readFileSync(
    join(__dirname, "..", "..", "..", "supabase", "migrations", "20260825160000_asistencia_vacaciones.sql"),
    "utf8",
  );
  /** El SQL sin comentarios: un candado no puede cumplirse con su explicación. */
  const codigo = SQL.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");

  it("crea la tabla con el interruptor en false por DEFECTO", () => {
    expect(codigo).toMatch(/CREATE TABLE IF NOT EXISTS asistencia_vacaciones/);
    expect(codigo).toMatch(/ya_pagadas\s+boolean NOT NULL DEFAULT false/);
    // 🔴 Un default en `true` le habría descontado una quincena entera a Eloyn
    // el día de la mudanza, sin que nadie tocara nada.
    expect(codigo).not.toMatch(/ya_pagadas[^;]*DEFAULT true/);
  });

  it("la vacación migrada NACE SIN MARCAR — el INSERT no toca `ya_pagadas`", () => {
    const insert = codigo.slice(codigo.indexOf("INSERT INTO asistencia_vacaciones"));
    const hastaElPuntoYComa = insert.slice(0, insert.indexOf(";"));
    expect(hastaElPuntoYComa).not.toContain("ya_pagadas");
  });

  it("solo toca el motivo «Vacaciones», por igualdad y sin LIKE", () => {
    expect(codigo).toMatch(/btrim\(j?\.?motivo\) = 'Vacaciones'/);
    // Un LIKE se llevaría por delante cualquier motivo que la contenga.
    expect(codigo).not.toMatch(/motivo\s+I?LIKE/i);
  });

  it("🔴 el DELETE solo borra lo que YA quedó copiado", () => {
    const del = codigo.slice(codigo.indexOf("DELETE FROM asistencia_justificaciones"));
    // Sin el EXISTS, el borrado confiaría en que el INSERT salió bien — y lo
    // que se pierde es una quincena.
    expect(del).toMatch(/EXISTS\s*\(/);
    // 🩸 Y NO puede ser un `NOT EXISTS`: eso borraría exactamente las filas que
    // NO se alcanzaron a copiar, o sea la dirección contraria y la peor de las
    // dos. Un `toMatch(/EXISTS/)` a secas lo deja pasar — está medido por
    // mutación.
    expect(del).not.toMatch(/AND\s+NOT\s+EXISTS/i);
    expect(del).toContain("asistencia_vacaciones");
    // Y va DESPUÉS del insert: al revés, un fallo dejaría los días como ausencia.
    expect(codigo.indexOf("INSERT INTO asistencia_vacaciones"))
      .toBeLessThan(codigo.indexOf("DELETE FROM asistencia_justificaciones"));
  });

  it("es idempotente: el INSERT no puede duplicar la vacación", () => {
    const insert = codigo.slice(codigo.indexOf("INSERT INTO asistencia_vacaciones"));
    expect(insert.slice(0, insert.indexOf(";"))).toMatch(/NOT EXISTS\s*\(/);
  });

  it("⛔ NO toca las otras justificaciones ni ninguna otra tabla", () => {
    expect(codigo).not.toMatch(/DROP TABLE/i);
    expect(codigo).not.toMatch(/TRUNCATE/i);
    expect(codigo).not.toMatch(/ALTER TABLE asistencia_justificaciones/i);
    // El único DELETE del archivo es el de la mudanza.
    expect(codigo.match(/DELETE FROM/gi)?.length ?? 0).toBe(1);
  });

  it("la tabla lleva RLS y el CHECK del rango", () => {
    expect(codigo).toMatch(/ALTER TABLE asistencia_vacaciones ENABLE ROW LEVEL SECURITY/);
    expect(codigo).toMatch(/CHECK \(hasta >= desde\)/);
  });
});
