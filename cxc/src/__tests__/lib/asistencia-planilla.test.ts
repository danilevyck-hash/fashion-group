// ─────────────────────────────────────────────────────────────────────────────
// LA PLANILLA QUINCENAL.
//
// 🔴 EL BLOQUE QUE IMPORTA es el primero: los cuatro casos REALES de la planilla
// del 30 de julio de 2026 de Confecciones Boston, tal como la contable los
// escribió a mano. Si el motor no reproduce esos números al centavo, no sirve —
// no importa cuántos otros tests estén en verde.
//
// Horas FIJAS, nunca `new Date()`.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  centavos, aHoras, quincena, quincenaDesdeClave, quincenasHasta, ultimoDiaDelMes,
  clasificarDia, medirHoras, calcularDinero, armarLinea, totalizar, ordenarLineas,
  faltantesDe, normalizarManuales, jornadaDiariaMin, FALTA, FORMULA_NETO,
  HORAS_CERO, JORNADA_DIARIA_DEFAULT_MIN, MANUALES_CERO,
  type FichaPlanilla, type HorasPersona, type ManualesLinea,
} from "@/lib/asistencia/planilla";
import { REGLAS_DEFAULT, type ReglasAsistencia } from "@/lib/asistencia/config";
import { armarReporte, type Marcacion, type HorarioPersona } from "@/lib/asistencia/reporte";

const R = REGLAS_DEFAULT;

/** Las horas de la persona, en HORAS decimales como las escribe la contable. */
function horas(over: Partial<Record<
  "extra125" | "extra150" | "excedente" | "domingo" | "feriado" | "ausencia", number
>> & { tardanzaMin?: number } = {}): HorasPersona {
  const h = (v = 0) => Math.round(v * 60);
  return {
    ...HORAS_CERO,
    extraDiurnoMin: h(over.extra125),
    extraNocturnoMin: h(over.extra150),
    excedenteMin: h(over.excedente),
    domingoMin: h(over.domingo),
    feriadoMin: h(over.feriado),
    ausenciaMin: h(over.ausencia),
    tardanzaMin: over.tardanzaMin ?? 0,
  };
}

const manuales = (over: Partial<ManualesLinea> = {}): ManualesLinea => ({
  ...MANUALES_CERO, ...over,
});

// ═════════════════════════════════════════════════════════════════════════════
describe("🔴 LOS CASOS REALES — planilla del 30-jul-2026, Confecciones Boston", () => {
  // 🩸 Los números de la izquierda los escribió la contable a mano en su Excel.
  // Este bloque es el único que demuestra que el módulo sirve para algo.

  it("BRICEIDA MONTERO — $566.52, 40 h, 5,5 h extra al 1.25", () => {
    const d = calcularDinero(566.52, 40, horas({ extra125: 5.5 }), manuales(), R)!;

    expect(d.rataHora).toBe(3.27);            // 566,52 ÷ 173,33
    expect(d.salarioQuincenal).toBe(283.26);  // 566,52 ÷ 2
    expect(d.extraDiurno).toBe(22.48);        // 5,5 × 1,25 × 3,27
    expect(d.totalBruto).toBe(305.74);        // 283,26 + 22,48
    expect(d.seguroSocial).toBe(29.81);       // 9,75 %
    expect(d.seguroEducativo).toBe(3.82);     // 1,25 %
    expect(d.totalDeducciones).toBe(33.63);
    expect(d.netoPagar).toBe(272.11);
  });

  it("KENER HERNÁNDEZ — $600, 40 h, extras diurnas y nocturnas, domingo y tardanza", () => {
    const d = calcularDinero(
      600, 40,
      horas({ extra125: 3.25, extra150: 2.5, domingo: 3.25, tardanzaMin: 18 }),
      manuales(), R,
    )!;

    expect(d.rataHora).toBe(3.46);            // 600 ÷ 173,33
    expect(d.salarioQuincenal).toBe(300);
    expect(d.extraDiurno).toBe(14.06);        // 3,25 × 1,25 × 3,46
    expect(d.extraNocturno).toBe(12.98);      // 2,5  × 1,50 × 3,46
    expect(d.domingos).toBe(16.87);           // 3,25 × 1,50 × 3,46
    expect(d.tardanzas).toBe(1.04);           // 18 × (3,46 ÷ 60)
    expect(d.totalBruto).toBe(342.87);
    expect(d.seguroSocial).toBe(33.43);
    expect(d.seguroEducativo).toBe(4.29);
    expect(d.netoPagar).toBe(305.15);
  });

  it("ALEJANDRA CAMAÑO — $523.47, 40 h, 1,5 h extra, 11 min tarde y $10 de préstamo", () => {
    const d = calcularDinero(
      523.47, 40,
      horas({ extra125: 1.5, tardanzaMin: 11 }),
      manuales({ prestamo: 10 }), R,
    )!;

    expect(d.rataHora).toBe(3.02);            // 523,47 ÷ 173,33
    // 🩸 523,47 ÷ 2 = 261,735 EXACTO. `Math.round(261.735 * 100)` daría 261,73
    // por el punto flotante. Son siete personas de Boston con este salario.
    expect(d.salarioQuincenal).toBe(261.74);
    expect(d.extraDiurno).toBe(5.66);         // 1,5 × 1,25 × 3,02
    expect(d.tardanzas).toBe(0.55);           // 11 × (3,02 ÷ 60)
    expect(d.totalBruto).toBe(266.85);
    expect(d.prestamo).toBe(10);
    // El préstamo entra al total de deducciones, no al bruto.
    expect(d.totalDeducciones).toBe(centavos(d.seguroSocial + d.seguroEducativo + 10));
    expect(d.netoPagar).toBe(227.49);
  });

  it("DOMINGO HENRÍQUEZ — $523.47, 40 h, 69 min de tardanza y sin extras", () => {
    const d = calcularDinero(523.47, 40, horas({ tardanzaMin: 69 }), manuales(), R)!;

    expect(d.rataHora).toBe(3.02);
    expect(d.salarioQuincenal).toBe(261.74);
    expect(d.extraDiurno).toBe(0);
    expect(d.tardanzas).toBe(3.47);           // 69 × (3,02 ÷ 60)
    expect(d.totalBruto).toBe(258.27);        // 261,74 − 3,47
    expect(d.netoPagar).toBe(229.86);
  });

  it("la fila cuadra sumando a ojo: cada columna ya viene en centavos", () => {
    // La contable revisa el cuadro sumando la fila con la vista. Si el total
    // saliera de los números largos, no le cuadraría — y tendría razón.
    const d = calcularDinero(
      600, 40,
      horas({ extra125: 3.25, extra150: 2.5, domingo: 3.25, tardanzaMin: 18 }),
      manuales(), R,
    )!;
    const aMano =
      d.salarioQuincenal + d.extraDiurno + d.extraNocturno + d.excedente
      + d.domingos + d.feriados - d.ausencias - d.tardanzas;
    expect(centavos(aMano)).toBe(d.totalBruto);
    expect(centavos(d.totalBruto - d.totalDeducciones + d.otrosServicios)).toBe(d.netoPagar);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("🔴 «Otros servicios» SUMA — es un pago extra, no un descuento", () => {
  // 🩸 LA FÓRMULA DE LA CONTABLE, copiada de su Excel:
  //
  //     U7 = =+L7-S7+T7
  //
  //   L = total bruto · S = total deducciones · T = otros servicios
  //
  // Verificada en Confecciones Boston y en Vistana, en TODAS las filas.
  // Acá se restaba. Con eso, a cualquiera con algo en esa columna le salía el
  // neto al DOBLE de mal: le faltaba dos veces el monto.
  //
  // ⛔ Si algún día este bloque falla, la respuesta NO es cambiar el test.

  it("la fórmula =+L-S+T, con números redondos para poder verla a ojo", () => {
    const d = calcularDinero(600, 40, horas(), manuales({ otrosServicios: 20 }), R)!;

    const L = d.totalBruto;          // 300.00
    const S = d.totalDeducciones;    //  33.00  (9,75 % + 1,25 %)
    const T = d.otrosServicios;      //  20.00

    expect(L).toBe(300);
    expect(S).toBe(33);
    expect(T).toBe(20);
    expect(d.netoPagar).toBe(centavos(L - S + T));
    expect(d.netoPagar).toBe(287);   // 300 − 33 + 20 — restándolo daban 247
  });

  it("«otros servicios» NO entra al total de deducciones: va en su propia columna", () => {
    const d = calcularDinero(600, 40, horas(), manuales({ otrosServicios: 20 }), R)!;
    expect(d.totalDeducciones).toBe(centavos(d.seguroSocial + d.seguroEducativo));
  });

  it("los otros cuatro sí restan — el signo no es el mismo para todos", () => {
    const base = calcularDinero(600, 40, horas(), manuales(), R)!.netoPagar;
    for (const campo of ["isr", "prestamo", "terceros", "mercancia"] as const) {
      const d = calcularDinero(600, 40, horas(), manuales({ [campo]: 25 }), R)!;
      expect(d.netoPagar, `${campo} tiene que RESTAR`).toBe(centavos(base - 25));
    }
    const sumado = calcularDinero(600, 40, horas(), manuales({ otrosServicios: 25 }), R)!;
    expect(sumado.netoPagar, "otros servicios tiene que SUMAR").toBe(centavos(base + 25));
  });

  it("no toca el bruto ni los seguros: entra recién al final", () => {
    const sin = calcularDinero(600, 40, horas(), manuales(), R)!;
    const con = calcularDinero(600, 40, horas(), manuales({ otrosServicios: 500 }), R)!;
    expect(con.totalBruto).toBe(sin.totalBruto);
    expect(con.seguroSocial).toBe(sin.seguroSocial);
    expect(con.seguroEducativo).toBe(sin.seguroEducativo);
  });

  it("la frase que se imprime dice que SUMA, en la pantalla y en los archivos", () => {
    expect(FORMULA_NETO).toContain("+ otros servicios");
    expect(FORMULA_NETO).not.toContain("- otros servicios");
  });

  it("el total del pie suma en el mismo sentido que las filas", () => {
    const ficha: FichaPlanilla = {
      codigo: "8", nombre: "BRICEIDA MONTERO", salarioMensual: 566.52,
      jornadaSemanal: 40, empresa: "confecciones_boston",
    };
    const t = totalizar([armarLinea(ficha, horas(), manuales({ otrosServicios: 20 }), R)]);
    expect(t.netoPagar).toBe(centavos(t.totalBruto - t.totalDeducciones + t.otrosServicios));
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("🔴 Un día de ausencia son OCHO horas", () => {
  // 🩸 De las fórmulas de la columna de ausencias del Excel de la contable:
  //     María Bethancourt   =8*2.88            → un día
  //     Samir Polo Arrieta  =16*3.02           → dos días
  //     Cristian Blanco     =(0*24.16)+(0*3.02)   ← 24,16 = 8 × 3,02
  // Antes se derivaba del horario POR DEFECTO (08:00-17:00 menos 30) y daban
  // 8,5 h: un 6 % de más en cada día ausente, aplicado a TODO el mundo, porque
  // solo una persona de las 32 tiene horario propio.

  it("sin horario confirmado, el día vale 8 horas y no 8,5", () => {
    expect(JORNADA_DIARIA_DEFAULT_MIN).toBe(480);
    expect(jornadaDiariaMin(null)).toBe(480);
    expect(jornadaDiariaMin(undefined)).toBe(480);
    // Lo que daba antes, y que NO debe volver.
    expect(jornadaDiariaMin(null)).not.toBe(510);
  });

  it("el caso de María Bethancourt: un día a $2.88 la hora = 8 × 2,88", () => {
    const h = { ...horas(), ausenciaMin: jornadaDiariaMin(null), ausenciaDias: 1 };
    // 600 ÷ 208 (jornada de 48 h) = 2,88
    const d = calcularDinero(600, 48, h, manuales(), R)!;
    expect(d.rataHora).toBe(2.88);
    expect(d.ausencias).toBe(centavos(8 * 2.88));   // 23.04
  });

  it("el caso de Samir Polo Arrieta: dos días a $3.02 = 16 × 3,02", () => {
    const h = { ...horas(), ausenciaMin: 2 * jornadaDiariaMin(null), ausenciaDias: 2 };
    const d = calcularDinero(523.47, 40, h, manuales(), R)!;
    expect(d.rataHora).toBe(3.02);
    expect(d.ausencias).toBe(centavos(16 * 3.02));  // 48.32
  });

  it("el «valor del día» de Cristian Blanco: 8 × 3,02 = 24,16", () => {
    const h = { ...horas(), ausenciaMin: jornadaDiariaMin(null), ausenciaDias: 1 };
    expect(calcularDinero(523.47, 40, h, manuales(), R)!.ausencias).toBe(24.16);
  });

  it("con horario CONFIRMADO manda el suyo, no el default", () => {
    // El código 37 sale 16:30 y almuerza 30 → 8 horas justas.
    expect(jornadaDiariaMin({ entrada: "08:00", salida: "16:30", almuerzo_minutos: 30 })).toBe(480);
    // Y uno de jornada más larga vale más, como corresponde.
    expect(jornadaDiariaMin({ entrada: "07:00", salida: "17:00", almuerzo_minutos: 60 })).toBe(540);
  });

  it("un horario guardado que dé 0 o menos NO produce una ausencia de $0", () => {
    // El cero silencioso otra vez, esta vez a favor de la empresa.
    expect(jornadaDiariaMin({ entrada: "17:00", salida: "08:00", almuerzo_minutos: 30 })).toBe(480);
    expect(jornadaDiariaMin({ entrada: "08:00", salida: "08:00", almuerzo_minutos: 0 })).toBe(480);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("🔴 Nadie sin configurar produce un número", () => {
  const ficha = (over: Partial<FichaPlanilla> = {}): FichaPlanilla => ({
    codigo: "8", nombre: "BRICEIDA MONTERO", salarioMensual: 566.52,
    jornadaSemanal: 40, empresa: "confecciones_boston", ...over,
  });

  it("un código con marcaciones y sin ficha sale listado, no calculado", () => {
    // Los 6 códigos de 48 a 53 entraron después del archivo que teníamos.
    const l = armarLinea(
      { codigo: "51", nombre: null, salarioMensual: null, jornadaSemanal: null, empresa: null },
      horas({ extra125: 4 }), manuales(), R,
    );
    expect(l.faltaConfigurar).toEqual([FALTA.ficha]);
    expect(l.dinero).toBeNull();
    // Y se ve: la etiqueta cae al código, nunca a un blanco.
    expect(l.etiqueta).toBe("51");
  });

  it("con nombre pero SIN salario tampoco: no vale $0", () => {
    const l = armarLinea(ficha({ salarioMensual: null }), horas(), manuales(), R);
    expect(l.faltaConfigurar).toContain(FALTA.salario);
    expect(l.dinero).toBeNull();
  });

  it("un salario 0 es lo mismo que no tenerlo — con 0 la planilla sale en cero sin avisar", () => {
    expect(faltantesDe(ficha({ salarioMensual: 0 }), R)).toContain(FALTA.salario);
  });

  it("una jornada que no es 40 ni 48 no tiene divisor, así que no tiene rata", () => {
    expect(faltantesDe(ficha({ jornadaSemanal: 44 }), R)).toContain(FALTA.jornada);
    expect(calcularDinero(566.52, 44, horas(), manuales(), R)).toBeNull();
  });

  it("un divisor inservible en la base tampoco produce Infinity", () => {
    const rotas: ReglasAsistencia = { ...R, divisor40: 0 };
    expect(faltantesDe(ficha(), rotas)).toContain(FALTA.divisor);
    expect(calcularDinero(566.52, 40, horas(), manuales(), rotas)).toBeNull();
  });

  it("🩸 los que no se pudieron calcular NO suman cero: quedan FUERA del total", () => {
    const buena = armarLinea(ficha(), horas({ extra125: 5.5 }), manuales(), R);
    const rota = armarLinea(ficha({ codigo: "51", nombre: null, salarioMensual: null, jornadaSemanal: null, empresa: null }), horas(), manuales(), R);
    const t = totalizar([buena, rota]);

    expect(t.personas).toBe(1);
    expect(t.sinConfigurar).toBe(1);
    expect(t.totalBruto).toBe(305.74);        // el de Briceida, solo
    expect(t.netoPagar).toBe(272.11);
  });

  it("los pendientes se ordenan al final y por número de verdad (5 antes que 49)", () => {
    const sinFicha = (c: string) => armarLinea(
      { codigo: c, nombre: null, salarioMensual: null, jornadaSemanal: null, empresa: null },
      horas(), manuales(), R,
    );
    const orden = ordenarLineas([
      sinFicha("49"), armarLinea(ficha({ nombre: "ZULEMA" }), horas(), manuales(), R),
      sinFicha("5"), armarLinea(ficha({ nombre: "ANDREA" }), horas(), manuales(), R),
    ]).map((l) => l.etiqueta);
    expect(orden).toEqual(["ANDREA", "ZULEMA", "5", "49"]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("🔴 La frontera de las 18:00 es UNA sola y decide las tres cosas", () => {
  const marca = (fecha: string, hhmm: string): Marcacion => ({
    empleado_codigo: "17", empleado_nombre: null,
    ocurrio_en: new Date(`${fecha}T${hhmm}:00-05:00`).toISOString(),
  });
  const horario: HorarioPersona = {
    empleado_codigo: "17", entrada: "08:00", salida: "17:00", almuerzo_minutos: 30,
  };
  /** Un día de trabajo, del reloj al cuadro. */
  const dia = (marcas: string[], reglas = R) => {
    const f = "2026-07-23";
    const p = armarReporte({
      marcaciones: marcas.map((m) => marca(f, m)),
      horarios: [horario], justificaciones: [], feriados: new Map(),
      desde: f, hasta: f, reglas, incluirNoHabiles: true,
    })[0];
    return clasificarDia(p.dias[0], reglas, 8 * 60);
  };

  it("todo antes del corte va al 1.25", () => {
    const c = dia(["08:00", "12:00", "12:30", "17:45"]);
    expect(c.extraDiurnoMin).toBe(45);
    expect(c.extraNocturnoMin).toBe(0);
    expect(c.excedenteMin).toBe(0);
  });

  it("el caso real de Kener el 23-jul: entra 7:43 y sale 20:32", () => {
    // Ventana de extra: 17:00 → 20:32. Una hora antes del corte, 152 minutos
    // después. Y la contable escribió 2,5 h al 1.50 — son esos 152 minutos.
    const c = dia(["07:43", "13:35", "14:05", "20:32"]);
    expect(c.extraDiurnoMin).toBe(60);
    expect(c.extraNocturnoMin + c.excedenteMin).toBe(152);
  });

  it("las 18:00 en punto todavía son del 1.25; el 1.50 arranca en la 18:01", () => {
    const c = dia(["08:00", "12:00", "12:30", "18:00"]);
    expect(c.extraDiurnoMin).toBe(60);
    expect(c.extraNocturnoMin).toBe(0);

    const c2 = dia(["08:00", "12:00", "12:30", "18:01"]);
    expect(c2.extraDiurnoMin).toBe(60);
    expect(c2.extraNocturnoMin).toBe(1);
  });

  it("mover la hora de corte mueve las tres columnas juntas — es un solo dato", () => {
    const c = dia(["08:00", "12:00", "12:30", "19:00"], { ...R, horaCorteNocturno: "19:00" });
    expect(c.extraDiurnoMin).toBe(120);
    expect(c.extraNocturnoMin).toBe(0);
    expect(c.excedenteMin).toBe(0);
  });

  it("🩸 más de 3 horas extra pero TODAS antes del corte NO es excedente", () => {
    // 17:00 → 17:59 no llega al corte… pero tampoco pasa 3 horas. El caso que
    // importa es este: salida 21:00 con corte movido a 22:00.
    const c = dia(["08:00", "12:00", "12:30", "21:00"], { ...R, horaCorteNocturno: "22:00" });
    expect(c.extraDiurnoMin).toBe(240);       // 4 horas, todas "de día"
    expect(c.extraNocturnoMin).toBe(0);
    expect(c.excedenteMin).toBe(0);           // ⬅️ la condición (b) no se cumple
  });

  it("🔴 4 h extra con 3 de noche: TODO lo nocturno va al 1,50 y el excedente queda en 0", () => {
    // 17:00 → 21:00. Diurno 17:00-18:00 = 60. Nocturno = 180.
    // Antes se apartaban 60 al 2,625 por pasar el tope de 3 h. Ya no: la
    // contadora manda esos minutos al 1,50. Ver `clasificarDia`.
    const c = dia(["08:00", "12:00", "12:30", "21:00"]);
    expect(c.extraDiurnoMin).toBe(60);
    expect(c.extraNocturnoMin).toBe(180);
    expect(c.excedenteMin).toBe(0);
    expect(c.extraDiurnoMin + c.extraNocturnoMin + c.excedenteMin).toBe(240);
  });

  it("🔴 mover el tope del excedente en Configuración YA NO mueve un solo minuto", () => {
    // El parámetro sigue guardado y validado, pero no calcula nada: con el tope
    // en 1 hora el reparto tiene que salir IDÉNTICO al de arriba.
    const c = dia(["08:00", "12:00", "12:30", "21:00"], { ...R, excedenteHorasDia: 1 });
    expect(c.excedenteMin).toBe(0);
    expect(c.extraNocturnoMin).toBe(180);
    expect(c.extraDiurnoMin).toBe(60);
  });

  it("la recuperación se come el ARRANQUE de la ventana, no el final", () => {
    // Llega 8:40 (40 tarde) y sale 19:00 (120 de bruto) → 80 minutos de extra,
    // y son los ÚLTIMOS: 17:40 → 19:00. Diurno 20, nocturno 60.
    const c = dia(["08:40", "12:00", "12:30", "19:00"]);
    expect(c.tardanzaMin).toBe(40);
    expect(c.extraDiurnoMin).toBe(20);
    expect(c.extraNocturnoMin).toBe(60);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("🔴 Tolerancia, domingos, feriados y ausencias", () => {
  const marca = (fecha: string, hhmm: string): Marcacion => ({
    empleado_codigo: "8", empleado_nombre: null,
    ocurrio_en: new Date(`${fecha}T${hhmm}:00-05:00`).toISOString(),
  });
  const horario: HorarioPersona = {
    empleado_codigo: "8", entrada: "08:00", salida: "17:00", almuerzo_minutos: 30,
  };
  const correr = (
    marcas: Array<[string, string]>,
    desde: string, hasta: string,
    feriados = new Map<string, string>(),
  ) => armarReporte({
    marcaciones: marcas.map(([f, h]) => marca(f, h)),
    horarios: [horario], justificaciones: [], feriados,
    desde, hasta, reglas: R, incluirNoHabiles: true,
  })[0];

  it("la tolerancia de 10 minutos exactos no descuenta un centavo", () => {
    const p = correr([["2026-07-23", "08:10"], ["2026-07-23", "17:00"]], "2026-07-23", "2026-07-23");
    const h = medirHoras(p, R, 8 * 60);
    expect(h.tardanzaMin).toBe(0);
    expect(calcularDinero(523.47, 40, h, manuales(), R)!.tardanzas).toBe(0);
  });

  it("8:11 son ONCE minutos, y a $3.02 la hora son 55 centavos", () => {
    const p = correr([["2026-07-23", "08:11"], ["2026-07-23", "17:00"]], "2026-07-23", "2026-07-23");
    const h = medirHoras(p, R, 8 * 60);
    expect(h.tardanzaMin).toBe(11);
    expect(calcularDinero(523.47, 40, h, manuales(), R)!.tardanzas).toBe(0.55);
  });

  it("🩸 el domingo trabajado se paga al 1.50 — y sin él esas horas no existían", () => {
    // El caso real: el domingo 26-jul de 2026 hay cinco personas con marcas.
    const p = correr([["2026-07-26", "08:19"], ["2026-07-26", "11:25"]], "2026-07-26", "2026-07-26");
    const h = medirHoras(p, R, 8 * 60);
    expect(h.domingoMin).toBe(186);           // 3 h 06
    expect(h.tardanzaMin).toBe(0);            // el domingo no tiene hora de entrada
    expect(h.ausenciaMin).toBe(0);
    expect(h.extraDiurnoMin).toBe(0);
    expect(calcularDinero(600, 40, h, manuales(), R)!.domingos).toBe(16.09); // 3,1 × 1,5 × 3,46
  });

  it("un domingo SIN marcas no es una ausencia — nadie faltó, es domingo", () => {
    const p = correr([["2026-07-27", "08:00"], ["2026-07-27", "17:00"]], "2026-07-26", "2026-07-27");
    const h = medirHoras(p, R, 8 * 60);
    expect(h.ausenciaDias).toBe(0);
    expect(h.ausenciaMin).toBe(0);
  });

  it("el feriado trabajado va a su propia columna, también al 1.50", () => {
    const p = correr(
      [["2026-05-01", "08:00"], ["2026-05-01", "12:00"]],
      "2026-05-01", "2026-05-01",
      new Map([["2026-05-01", "Día del Trabajador"]]),
    );
    const h = medirHoras(p, R, 8 * 60);
    expect(h.feriadoMin).toBe(240);
    expect(h.domingoMin).toBe(0);
    expect(h.tardanzaMin).toBe(0);
  });

  it("la ausencia se descuenta en HORAS × rata, sin recargo", () => {
    // Un solo día hábil en el rango, sin ninguna marca.
    const p = armarReporte({
      marcaciones: [marca("2026-07-22", "08:00"), marca("2026-07-22", "17:00")],
      horarios: [horario], justificaciones: [], feriados: new Map(),
      desde: "2026-07-22", hasta: "2026-07-23", reglas: R, incluirNoHabiles: true,
    })[0];
    const h = medirHoras(p, R, 8 * 60);
    expect(h.ausenciaDias).toBe(1);
    expect(h.ausenciaMin).toBe(480);
    // 8 h × 3,02 = 24,16
    expect(calcularDinero(523.47, 40, h, manuales(), R)!.ausencias).toBe(24.16);
  });

  it("el sábado trabajado se MIDE aparte y no se cuela en ninguna columna pagada", () => {
    const p = correr([["2026-07-25", "08:00"], ["2026-07-25", "12:00"]], "2026-07-25", "2026-07-25");
    const h = medirHoras(p, R, 8 * 60);
    expect(h.sabadoMin).toBe(240);
    expect(h.domingoMin).toBe(0);
    expect(h.extraDiurnoMin).toBe(0);
    expect(h.ausenciaMin).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("🔴 La quincena — y el día 31", () => {
  it("la primera va del 1 al 15", () => {
    const q = quincena(2026, 7, 1);
    expect([q.desde, q.hasta]).toEqual(["2026-07-01", "2026-07-15"]);
  });

  it("🩸 la segunda de julio llega hasta el 31, no hasta el 30", () => {
    const q = quincena(2026, 7, 2);
    expect([q.desde, q.hasta]).toEqual(["2026-07-16", "2026-07-31"]);
  });

  it("en un mes de 30 la segunda cierra el 30, y en febrero el 28", () => {
    expect(quincena(2026, 6, 2).hasta).toBe("2026-06-30");
    expect(quincena(2026, 2, 2).hasta).toBe("2026-02-28");
    expect(quincena(2028, 2, 2).hasta).toBe("2028-02-29"); // bisiesto
    expect(ultimoDiaDelMes(2026, 7)).toBe(31);
  });

  it("🩸 el día 31 NO PAGA base: el quincenal es salario ÷ 2, tenga 30 días o 31", () => {
    const julio = calcularDinero(566.52, 40, horas(), manuales(), R)!;
    const junio = calcularDinero(566.52, 40, horas(), manuales(), R)!;
    expect(julio.salarioQuincenal).toBe(283.26);
    expect(junio.salarioQuincenal).toBe(283.26);
  });

  it("🩸 …pero si FALTA el 31, sí se le descuenta", () => {
    // Viernes 31 de julio de 2026, día hábil, sin una sola marca.
    const p = armarReporte({
      marcaciones: [{
        empleado_codigo: "8", empleado_nombre: null,
        ocurrio_en: new Date("2026-07-30T08:00:00-05:00").toISOString(),
      }, {
        empleado_codigo: "8", empleado_nombre: null,
        ocurrio_en: new Date("2026-07-30T17:00:00-05:00").toISOString(),
      }],
      horarios: [{ empleado_codigo: "8", entrada: "08:00", salida: "17:00", almuerzo_minutos: 30 }],
      justificaciones: [], feriados: new Map(),
      desde: "2026-07-30", hasta: quincena(2026, 7, 2).hasta,
      reglas: R, incluirNoHabiles: true,
    })[0];
    const h = medirHoras(p, R, 8 * 60);
    expect(h.ausenciaDias).toBe(1);
    expect(h.ausenciaMin).toBe(480);
  });

  it("la clave va y vuelve", () => {
    expect(quincena(2026, 7, 2).clave).toBe("2026-07-2");
    expect(quincenaDesdeClave("2026-07-2")?.hasta).toBe("2026-07-31");
    expect(quincenaDesdeClave("basura")).toBeNull();
    expect(quincenaDesdeClave("2026-13-1")).toBeNull();
    expect(quincenaDesdeClave("2026-07-3")).toBeNull();
  });

  it("la lista de quincenas va hacia atrás sin saltarse ninguna", () => {
    const qs = quincenasHasta("2026-08-06", 4).map((q) => q.clave);
    expect(qs).toEqual(["2026-08-1", "2026-07-2", "2026-07-1", "2026-06-2"]);
  });

  it("el día 16 ya es la segunda quincena; el 15 todavía es la primera", () => {
    expect(quincenasHasta("2026-08-15", 1)[0].n).toBe(1);
    expect(quincenasHasta("2026-08-16", 1)[0].n).toBe(2);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("Los centavos y lo que se escribe a mano", () => {
  it("261,735 redondea a 261,74 y no a 261,73", () => {
    expect(centavos(261.735)).toBe(261.74);
    expect(centavos(523.47 / 2)).toBe(261.74);
  });

  it("no inventa nada cuando le llega basura", () => {
    expect(centavos(NaN)).toBe(0);
    expect(centavos(Infinity)).toBe(0);
    expect(aHoras(186)).toBe(3.1);
  });

  it("los montos manuales solo aceptan positivos: son descuentos", () => {
    const m = normalizarManuales({ prestamo: -10, isr: "25.5" as unknown as number, mercancia: null as unknown as number });
    expect(m.prestamo).toBe(0);
    expect(m.isr).toBe(25.5);
    expect(m.mercancia).toBe(0);
    expect(m.otrosServicios).toBe(0);
  });

  it("préstamo, terceros, mercancía e ISR entran al total de deducciones", () => {
    const d = calcularDinero(600, 40, horas(), manuales({
      isr: 5, prestamo: 10, terceros: 2.5, mercancia: 7.25,
    }), R)!;
    expect(d.totalBruto).toBe(300);
    expect(d.totalDeducciones).toBe(centavos(29.25 + 3.75 + 5 + 10 + 2.5 + 7.25));
    expect(d.netoPagar).toBe(centavos(300 - d.totalDeducciones));
  });

  it("«otros servicios» va aparte del total de deducciones y SUMA al neto", () => {
    const d = calcularDinero(600, 40, horas(), manuales({ otrosServicios: 20 }), R)!;
    expect(d.totalDeducciones).toBe(centavos(29.25 + 3.75));
    expect(d.otrosServicios).toBe(20);
    expect(d.netoPagar).toBe(centavos(300 - d.totalDeducciones + 20));
  });

  it("los porcentajes de seguro salen de las reglas, no del código", () => {
    const d = calcularDinero(600, 40, horas(), manuales(), { ...R, seguroSocialPct: 10, seguroEducativoPct: 0 })!;
    expect(d.seguroSocial).toBe(30);
    expect(d.seguroEducativo).toBe(0);
  });

  it("los recargos también salen de las reglas", () => {
    const d = calcularDinero(600, 40, horas({ extra125: 2 }), manuales(), { ...R, recargoExtraDiurno: 2 })!;
    expect(d.extraDiurno).toBe(centavos(2 * 2 * 3.46));
  });

  it("la jornada de 48 usa SU divisor, no el de 40", () => {
    expect(calcularDinero(600, 48, horas(), manuales(), R)!.rataHora).toBe(2.88); // 600 ÷ 208
    expect(calcularDinero(600, 40, horas(), manuales(), R)!.rataHora).toBe(3.46); // 600 ÷ 173,33
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Higiene. Estos tests miran el CÓDIGO, no lo que hace: son el candado de las
// dos promesas que se le hicieron a Daniel y que no se pueden probar corriendo.
// ═════════════════════════════════════════════════════════════════════════════

const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

/**
 * El archivo SIN comentarios. Estos tests miran lo que el código HACE, y los
 * comentarios de este módulo hablan de las reglas todo el tiempo: sin quitarlos,
 * la frase «módulo puro, sin `new Date()`» hacía fallar el test que exige
 * exactamente eso.
 */
const codigoDe = (rel: string) =>
  leer(rel)
    .split("\n")
    .filter((l) => {
      const t = l.trimStart();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");

describe("higiene de la planilla", () => {
  it("🔴 el motor NO tiene una sola cifra del negocio escrita adentro", () => {
    const codigo = codigoDe("src/lib/asistencia/planilla.ts");
    // Los recargos, los divisores y los porcentajes de seguro. Si alguno
    // aparece como número literal, dejó de salir de `asistencia_reglas`.
    for (const cifra of ["1.25", "1.5", "2.625", "173.33", "208", "9.75", "1.75"]) {
      expect(codigo, `«${cifra}» está escrito en el código del motor`)
        .not.toMatch(new RegExp(`[^\\w.]${cifra.replace(".", "\\.")}[^\\d]`));
    }
  });

  it("el motor es PURO: sin base, sin red, sin env y sin `new Date()` del reloj", () => {
    const codigo = codigoDe("src/lib/asistencia/planilla.ts");
    expect(codigo).not.toMatch(/supabase|fetch\(|process\.env|require\(/);
    // `new Date(Date.UTC(...))` sí: es aritmética de calendario, no "ahora".
    expect(codigo).not.toMatch(/new Date\(\)/);
  });

  it("la ruta usa la fuente única de roles, no una lista a mano", () => {
    const src = leer("src/app/api/asistencia/planilla/route.ts");
    expect(src).toContain("asistenciaRoles()");
    expect(src).not.toMatch(/\[\s*"admin"\s*,\s*"secretaria"/);
  });

  it("la ruta pagina las marcaciones: PostgREST corta en 1.000 EN SILENCIO", () => {
    expect(leer("src/app/api/asistencia/planilla/route.ts")).toContain("leerTodoPaginado");
  });

  it("la planilla ve los domingos: sin esto sus horas no existirían", () => {
    expect(leer("src/app/api/asistencia/planilla/route.ts")).toContain("incluirNoHabiles: true");
  });

  it("los montos manuales aguantan que la migración no esté corrida", () => {
    const io = leer("src/lib/asistencia/planilla-server.ts");
    expect(io).toContain("esTablaFaltante");
    expect(io).toContain("faltaMigracion: true");
    // Y el nombre del archivo se le muestra a la gente tal cual.
    expect(io).toContain("20260806220000_asistencia_planilla_manual.sql");
  });

  it("la ruta normaliza con el módulo puro, no con su propio Number()", () => {
    const src = leer("src/app/api/asistencia/planilla/route.ts");
    expect(src).toContain("normalizarManuales(");
    expect(src).not.toMatch(/Number\(body\./);
  });

  it("los blancos táctiles de la pantalla son de 44 px", () => {
    const src = leer("src/app/asistencia/PlanillaTab.tsx");
    expect(src).toContain("min-h-[44px]");
    expect(src).not.toMatch(/min-h-\[(3\d|4[0-3])px\]/);
  });

  it("la pantalla es ancha: tabla en escritorio y tarjetas en celular", () => {
    const src = leer("src/app/asistencia/PlanillaTab.tsx");
    expect(src).toContain("hidden md:block");
    expect(src).toContain("md:hidden");
    // La tabla se arrastra DENTRO de su caja; la página nunca se va de lado.
    expect(src).toContain("overflow-x-auto");
  });

  it("la pestaña está enchufada en el módulo", () => {
    const src = leer("src/app/asistencia/AsistenciaClient.tsx");
    expect(src).toContain('["planilla", "Planilla"]');
    expect(src).toContain("<PlanillaTab />");
  });

  it("🔴 el PDF no usa glifos que su fuente no tiene (salían como & y \")", () => {
    const src = codigoDe("src/lib/asistencia/planilla-exportar.ts");
    const pdf = src.slice(src.indexOf("export function construirPdfPlanilla"));
    expect(pdf, "el PDF lleva un ⚠ y la fuente base lo imprime como &").not.toMatch(/⚠/);
    expect(pdf, "el PDF lleva un − (U+2212) y sale como una comilla").not.toMatch(/−/);
    expect(leer("src/lib/asistencia/planilla.ts")).not.toMatch(/FORMULA_NETO[\s\S]{0,200}−/);
  });
});
