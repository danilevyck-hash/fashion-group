// ─────────────────────────────────────────────────────────────────────────────
// LA PLANILLA POR UN RANGO DE FECHAS CUALQUIERA — el candado
//
// Daniel (13-ago-2026) quiere poder pedir la planilla por un rango cualquiera,
// no solo por quincena.
//
// 🔴 LO QUE MÁS IMPORTA DE ESTE ARCHIVO ES EL PRIMER `describe`: **una quincena
// tiene que seguir dando EXACTAMENTE lo mismo que hoy**. Todo lo demás —el
// prorrateo, los montos manuales que no aplican— es capacidad nueva; ese primero
// es la promesa de que agregar una pantalla no le cambió el sueldo a nadie.
//
// ── LA REGLA DE PRORRATEO, Y POR QUÉ ES ÉSTA ─────────────────────────────────
// Se paga la fracción de QUINCENA que el rango cubre. Es la única que deja la
// quincena en factor exactamente 1: el negocio paga medio sueldo por quincena
// sin importar que tenga 15 o 16 días, así que prorratear por días del MES daría
// 15/31 = 0,4839 para la primera de julio — un 3 % menos que hoy, en todas las
// planillas, por haber agregado una pantalla.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";

import {
  armarLinea,
  armarPlanilla,
  calcularDinero,
  centavos,
  diasDelRango,
  esFechaDeCalendario,
  factorBaseDeRango,
  HORAS_CERO,
  MANUALES_CERO,
  periodoDeQuincena,
  periodoDesdeRango,
  quincena,
  quincenaDesdeClave,
  quincenasHasta,
  totalizar,
  type FichaPlanilla,
} from "@/lib/asistencia/planilla";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import { armarReporte } from "@/lib/asistencia/reporte";

const ficha = (over: Partial<FichaPlanilla> = {}): FichaPlanilla => ({
  codigo: "6",
  nombre: "ÁNGELA GARCÍA",
  salarioMensual: 523.47, // el de siete personas de Boston, medido
  jornadaSemanal: 48,
  empresa: "confecciones_boston",
  ...over,
});

const linea = (f: FichaPlanilla, factor?: number) =>
  armarLinea(f, HORAS_CERO, MANUALES_CERO, REGLAS_DEFAULT, factor);

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 UNA QUINCENA SIGUE DANDO LO MISMO QUE HOY", () => {
  it("el factor de CUALQUIER quincena es exactamente 1", () => {
    // Todas las quincenas de dos años, incluidos febrero (28), los meses de 30
    // y los de 31: el factor no puede depender de cuántos días tenga.
    for (const anio of [2026, 2027]) {
      for (let mes = 1; mes <= 12; mes++) {
        for (const n of [1, 2] as const) {
          const q = quincena(anio, mes, n);
          expect(factorBaseDeRango(q.desde, q.hasta)).toBe(1);
        }
      }
    }
  });

  it("🩸 pedir el rango de una quincena ES esa quincena: misma clave, factor 1", () => {
    const q = quincenaDesdeClave("2026-07-2")!; // 16 al 31, 16 días
    const p = periodoDesdeRango(q.desde, q.hasta)!;
    expect(p.esQuincena).toBe(true);
    expect(p.quincena?.clave).toBe("2026-07-2");
    // La clave es lo que engancha los montos escritos a mano: si cambiara, el
    // ISR tecleado por la contable dejaría de aparecer en su propio cuadro.
    expect(p.claveManuales).toBe("2026-07-2");
    expect(p.factorBase).toBe(1);
    expect(p).toEqual(periodoDeQuincena(q));
  });

  it("el dinero con factor 1 es IDÉNTICO al de antes, centavo por centavo", () => {
    const sinFactor = calcularDinero(523.47, 48, HORAS_CERO, MANUALES_CERO, REGLAS_DEFAULT);
    const conUno = calcularDinero(523.47, 48, HORAS_CERO, MANUALES_CERO, REGLAS_DEFAULT, 1);
    expect(conUno).toEqual(sinFactor);
    // 🩸 261,735 es la mitad exacta de 523,47 — el caso que costó el redondeo de
    // `centavos`. Con el factor de por medio tiene que seguir dando 261,74.
    expect(conUno!.salarioQuincenal).toBe(261.74);
  });

  it("el cuadro entero con factor 1 es idéntico al cuadro sin factor", () => {
    const fichas = new Map([
      ["6", ficha()],
      ["8", ficha({ codigo: "8", nombre: "SAMIR", salarioMensual: 800, jornadaSemanal: 40 })],
    ]);
    const opts = {
      personas: [], fichas, jornadaDiariaMin: () => 480,
      reglas: REGLAS_DEFAULT, empresa: "confecciones_boston",
    };
    const antes = armarPlanilla(opts);
    const despues = armarPlanilla({ ...opts, factorBase: 1 });
    expect(despues).toEqual(antes);
    expect(totalizar(despues)).toEqual(totalizar(antes));
  });

  it("🩸 un factor que no sirve (NaN, 0, negativo) cae en 1, NUNCA en $0", () => {
    // Un `NaN` no da error: `centavos(NaN)` devuelve 0, o sea una planilla de $0
    // que se paga en silencio. Ante la duda se paga la quincena completa, que es
    // lo que se pagaba ayer. El guard está en `calcularDinero`, no solo arriba.
    const base = linea(ficha()).dinero!.salarioQuincenal;
    expect(base).toBe(261.74);
    for (const malo of [NaN, 0, -1, Infinity, undefined]) {
      expect(linea(ficha(), malo as number).dinero!.salarioQuincenal).toBe(base);
    }
    // Y por el camino del cuadro entero, igual.
    const opts = {
      personas: [], fichas: new Map([["6", ficha()]]), jornadaDiariaMin: () => 480,
      reglas: REGLAS_DEFAULT, empresa: "confecciones_boston",
    };
    expect(armarPlanilla({ ...opts, factorBase: NaN })).toEqual(armarPlanilla(opts));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("el rango libre: cuánto se paga", () => {
  it("cuenta los días con los dos extremos adentro", () => {
    expect(diasDelRango("2026-07-25", "2026-07-25")).toBe(1);
    expect(diasDelRango("2026-07-25", "2026-07-31")).toBe(7);
    expect(diasDelRango("2026-07-01", "2026-07-15")).toBe(15);
    expect(diasDelRango("2026-07-31", "2026-07-01")).toBe(0); // al revés no es un rango
  });

  it("🔑 un rango partido paga la parte de CADA quincena que toca", () => {
    // Del 25-jul al 10-ago: 7 días de la 2ª de julio (que tiene 16) + 10 de la
    // 1ª de agosto (que tiene 15).
    const esperado = 7 / 16 + 10 / 15;
    expect(factorBaseDeRango("2026-07-25", "2026-08-10")).toBeCloseTo(esperado, 12);

    const p = periodoDesdeRango("2026-07-25", "2026-08-10")!;
    expect(p.esQuincena).toBe(false);
    expect(p.diasCalendario).toBe(17);
    const d = calcularDinero(523.47, 48, HORAS_CERO, MANUALES_CERO, REGLAS_DEFAULT, p.factorBase)!;
    expect(d.salarioQuincenal).toBe(centavos((523.47 / 2) * esperado));
  });

  it("un mes entero paga DOS quincenas", () => {
    expect(factorBaseDeRango("2026-07-01", "2026-07-31")).toBe(2);
    expect(factorBaseDeRango("2026-02-01", "2026-02-28")).toBe(2);
  });

  it("un solo día paga un día de su quincena", () => {
    expect(factorBaseDeRango("2026-07-20", "2026-07-20")).toBeCloseTo(1 / 16, 12);
    expect(factorBaseDeRango("2026-07-06", "2026-07-06")).toBeCloseTo(1 / 15, 12);
  });

  it("cruzar el año no rompe la cuenta", () => {
    // 6 días de la 2ª de diciembre (16 días) + 5 de la 1ª de enero (15).
    expect(factorBaseDeRango("2026-12-26", "2027-01-05")).toBeCloseTo(6 / 16 + 5 / 15, 12);
  });

  it("media quincena paga cerca de media, no exactamente: los días mandan", () => {
    // Del 1 al 8 de julio son 8 de los 15 días de esa quincena.
    expect(factorBaseDeRango("2026-07-01", "2026-07-08")).toBeCloseTo(8 / 15, 12);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 los montos escritos a mano NO se reparten", () => {
  it("un rango libre no tiene clave de montos manuales", () => {
    // 🩸 Se guardan por quincena —la tabla lo exige con un CHECK— y repartir un
    // ISR por días sería inventar plata. La pantalla lo dice en ámbar.
    expect(periodoDesdeRango("2026-07-25", "2026-08-10")!.claveManuales).toBeNull();
  });

  it("una quincena sí la tiene, y es la de siempre", () => {
    expect(periodoDesdeRango("2026-08-01", "2026-08-15")!.claveManuales).toBe("2026-08-1");
    expect(periodoDesdeRango("2026-02-16", "2026-02-28")!.claveManuales).toBe("2026-02-2");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("fechas que no sirven no producen un cuadro", () => {
  it("rechaza lo que no es una fecha de calendario", () => {
    expect(esFechaDeCalendario("2026-02-31")).toBe(false); // pasa la regex, no existe
    expect(esFechaDeCalendario("2026-13-01")).toBe(false);
    expect(esFechaDeCalendario("25/07/2026")).toBe(false);
    expect(esFechaDeCalendario("")).toBe(false);
    expect(esFechaDeCalendario(null)).toBe(false);
    expect(esFechaDeCalendario("2026-07-25")).toBe(true);
  });

  it("`periodoDesdeRango` devuelve null en vez de un cuadro inventado", () => {
    expect(periodoDesdeRango("2026-02-31", "2026-03-01")).toBeNull();
    expect(periodoDesdeRango("basura", "2026-03-01")).toBeNull();
    // Al revés no es un rango: sin esto saldría un factor 0 y una planilla de $0.
    expect(periodoDesdeRango("2026-08-10", "2026-07-25")).toBeNull();
    expect(factorBaseDeRango("2026-08-10", "2026-07-25")).toBe(0);
  });

  it("un rango absurdamente largo no cuelga el bucle", () => {
    // El tope de 24 meses está para que una fecha tecleada mal no haga girar
    // miles de vueltas. Devuelve un número, no se cuelga.
    const f = factorBaseDeRango("2026-01-01", "2099-12-31");
    expect(Number.isFinite(f)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("las quincenas de la lista siguen intactas", () => {
  it("las 12 últimas se pueden pedir por rango y dan lo mismo", () => {
    for (const q of quincenasHasta("2026-08-13", 12)) {
      const p = periodoDesdeRango(q.desde, q.hasta)!;
      expect(p.esQuincena).toBe(true);
      expect(p.factorBase).toBe(1);
      expect(p.claveManuales).toBe(q.clave);
      expect(linea(ficha(), p.factorBase).dinero!.salarioQuincenal)
        .toBe(linea(ficha()).dinero!.salarioQuincenal);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("✅ LA REGLA DE PRORRATEO — CERRADA POR LA CONTADORA (13-ago-2026)", () => {
  // Daniel había contestado *"8 horas por dias por los total de dia trabajado"*,
  // y eso NO es lo que hace el módulo. Antes de tocar el cálculo se midió contra
  // producción (`scripts/_medir-prorrateo-daniel.ts`, 36 activos, 3 quincenas):
  //
  //     quincena            hábiles   hoy (salario ÷ 2)   8 h × días hábiles
  //     1 al 15 de julio      11          $9.647,40           $9.204,80   (−4,6 %)
  //     16 al 31 de julio     12          $9.647,40          $10.041,60   (+4,1 %)
  //     1 al 15 de agosto     10          $9.647,40           $8.368,00  (−13,3 %)
  //
  // O sea que el mismo sueldo habría pagado 13 % menos en una quincena que en
  // otra según cuántos lunes-a-viernes le tocaron. Se paró y se preguntó.
  //
  // 🟢 LA CONTADORA CONTESTÓ QUE EL CÁLCULO YA ES EXACTO. Daniel, textual:
  // *"pero me dijo mi contable que el calculo dio exacto, solo le falto elegir
  // la fecha exacta y no redonear minutos"* — o sea que lo que faltaba eran las
  // DOS cosas que ya se construyeron (el rango de fechas y medir al segundo), y
  // **la matemática de la planilla no se toca**.
  //
  // ⛔ QUE A NADIE SE LE OCURRA "ARREGLAR" ESTO DESPUÉS. Las tres dudas que
  // habían quedado abiertas están contestadas, y ninguna era un bug:
  //   1. Las 13 personas de 48 h/semana están BIEN cargadas. Daniel: *"no"*, no
  //      se pasan a 40 — su jornada CONTRATADA es de 48 horas.
  //   2. La media hora de los que salen 17:00 NO es hora extra. Daniel: *"los
  //      que salen a las 5 no es mediahora extra, sino que eso es un reemplzao
  //      de sus horas para completar 48 mensuales… aun q alfinal no se
  //      completa"*. Se quedan media hora de lunes a viernes para REPONER el
  //      sábado que no trabajan; no completan las 48 y está bien así.
  //   3. Días trabajados = días con marcación, y la incapacidad justificada SÍ
  //      SE PAGA (ver el describe de abajo, que lo prueba con dinero).

  it("🔴 la quincena NO depende de cuántos días hábiles tenga", () => {
    // Julio 1ª tiene 11 hábiles, julio 2ª tiene 12 y agosto 1ª tiene 10: las
    // tres pagan la MISMA base. Es la regla del negocio, la que la contadora
    // acaba de dar por exacta, y este test es lo que impide volver a moverla.
    const base = (clave: string) => {
      const q = quincenaDesdeClave(clave)!;
      const p = periodoDesdeRango(q.desde, q.hasta)!;
      return linea(ficha(), p.factorBase).dinero!.salarioQuincenal;
    };
    expect(base("2026-07-1")).toBe(261.74);
    expect(base("2026-07-2")).toBe(261.74);
    expect(base("2026-08-1")).toBe(261.74);
  });

  it("⚠️ el divisor es el único puente entre sueldo mensual y hora, y no se toca", () => {
    // Las dos reglas son la MISMA fórmula si los días se cuentan con la jornada
    // de cada quien: para 48 h/semana el divisor 208 implica 26 días de 8 h al
    // mes → 13 por quincena → 8 × 13 × (S/208) = S/2 EXACTO. La aparente
    // contradicción («nadie marca sábado») no era un error de carga: la jornada
    // contratada es de 48 h y la media hora diaria repone el sábado.
    const S = 523.47;
    expect(centavos(8 * 13 * (S / 208))).toBe(centavos(S / 2));
    expect(centavos(8 * (173.33 / 16) * (S / 173.33))).toBe(centavos(S / 2));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 LA INCAPACIDAD JUSTIFICADA SE PAGA — con dinero, no con un booleano", () => {
  // Daniel lo confirmó el 13-ago-2026, y el módulo YA lo hacía: un día
  // justificado no es `ausente`, así que no entra a `ausenciaMin` y no se
  // descuenta. No había un candado que lo probara EN DÓLARES — y sin eso, la
  // diferencia entre "no se descuenta" y "se descuenta" es un `!justificado`
  // que alguien puede borrar sin que se caiga un solo test.
  //
  // 🩸 Caso REAL de producción que lo confirma (quincena 1-15 de agosto):
  // MARTHA ASUCENA CHAVARRIA Z. (código 43) tiene DOS días sin marcas —el 4 de
  // agosto con «Incapacidad» y el 14 sin justificar—. Medido contra el módulo:
  // el 4 sale `ausente=false` y NO se le descuenta; el 14 sale `ausente=true` y
  // sí. Se le descuenta UN día, no dos.

  const dia = (fecha: string) => fecha;
  const correr = (justificaciones: Array<{ empleado_codigo: string; desde: string; hasta: string; motivo: string }>) => {
    const personas = armarReporte({
      // Marca lunes 3 y miércoles 5; el martes 4 falta.
      marcaciones: [
        { empleado_codigo: "43", empleado_nombre: null, ocurrio_en: "2026-08-03T08:00:00-05:00" },
        { empleado_codigo: "43", empleado_nombre: null, ocurrio_en: "2026-08-03T17:00:00-05:00" },
        { empleado_codigo: "43", empleado_nombre: null, ocurrio_en: "2026-08-05T08:00:00-05:00" },
        { empleado_codigo: "43", empleado_nombre: null, ocurrio_en: "2026-08-05T17:00:00-05:00" },
      ],
      horarios: [{ empleado_codigo: "43", entrada: "08:00", salida: "17:00", almuerzo_minutos: 30 }],
      justificaciones,
      feriados: new Map(),
      desde: dia("2026-08-03"),
      hasta: dia("2026-08-05"),
      reglas: REGLAS_DEFAULT,
      incluirNoHabiles: true,
    });
    return armarPlanilla({
      personas,
      fichas: new Map([["43", ficha({ codigo: "43", nombre: "MARTHA" })]]),
      jornadaDiariaMin: () => 480,
      reglas: REGLAS_DEFAULT,
      empresa: "confecciones_boston",
    })[0];
  };

  it("sin justificación, el día que faltó SE DESCUENTA", () => {
    const l = correr([]);
    expect(l.horas.ausenciaDias).toBe(1);
    expect(l.dinero!.ausencias).toBeGreaterThan(0);
  });

  it("🔴 con la incapacidad cargada, NO se descuenta ni un centavo", () => {
    const l = correr([{ empleado_codigo: "43", desde: "2026-08-04", hasta: "2026-08-04", motivo: "Incapacidad" }]);
    expect(l.horas.ausenciaDias).toBe(0);
    expect(l.horas.ausenciaMin).toBe(0);
    expect(l.dinero!.ausencias).toBe(0);
    // …y se sigue viendo que faltó: se cuenta aparte, no desaparece.
    expect(l.horas.ausenciaJustificadaDias).toBe(1);
  });

  it("el neto con incapacidad es el MISMO que si hubiera trabajado ese día", () => {
    const conIncapacidad = correr([{ empleado_codigo: "43", desde: "2026-08-04", hasta: "2026-08-04", motivo: "Incapacidad" }]);
    const sinFaltar = armarPlanilla({
      personas: armarReporte({
        marcaciones: ["03", "04", "05"].flatMap((d) => [
          { empleado_codigo: "43", empleado_nombre: null, ocurrio_en: `2026-08-${d}T08:00:00-05:00` },
          { empleado_codigo: "43", empleado_nombre: null, ocurrio_en: `2026-08-${d}T17:00:00-05:00` },
        ]),
        horarios: [{ empleado_codigo: "43", entrada: "08:00", salida: "17:00", almuerzo_minutos: 30 }],
        justificaciones: [], feriados: new Map(),
        desde: "2026-08-03", hasta: "2026-08-05",
        reglas: REGLAS_DEFAULT, incluirNoHabiles: true,
      }),
      fichas: new Map([["43", ficha({ codigo: "43", nombre: "MARTHA" })]]),
      jornadaDiariaMin: () => 480,
      reglas: REGLAS_DEFAULT,
      empresa: "confecciones_boston",
    })[0];
    expect(conIncapacidad.dinero!.netoPagar).toBe(sinFaltar.dinero!.netoPagar);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("⚠️ décimo tercer mes y vacaciones: NO se provisionan", () => {
  // Daniel, textual (13-ago-2026): *"Décimo tercer mes y vacaciones se registran
  // cuando se pagan"*. O sea que NO se acumulan mes a mes.
  //
  // 🔑 Hoy el cálculo no provisiona nada de eso —se verificó línea por línea— y
  // este test existe para que siga así: el día que alguien agregue una columna
  // de provisión, se entera acá y no en la planilla de la contable.
  it("el desglose del dinero tiene EXACTAMENTE estas columnas, sin provisiones", () => {
    const d = linea(ficha()).dinero!;
    expect(Object.keys(d).sort()).toEqual([
      "ausencias", "domingos", "excedente", "extraDiurno", "extraNocturno",
      "feriados", "isr", "mercancia", "netoPagar", "otrosServicios", "prestamo",
      "rataHora", "salarioQuincenal", "seguroEducativo", "seguroSocial",
      "tardanzas", "terceros", "totalBruto", "totalDeducciones", "valorMinuto",
    ].sort());
  });

  it("el bruto es exactamente la fórmula de la contable, sin un término de más", () => {
    const horas = {
      ...HORAS_CERO,
      extraDiurnoMin: 120, domingoMin: 480, feriadoMin: 240,
      tardanzaMin: 30, ausenciaMin: 480,
    };
    const d = armarLinea(ficha(), horas, MANUALES_CERO, REGLAS_DEFAULT).dinero!;
    expect(d.totalBruto).toBe(centavos(
      d.salarioQuincenal + d.extraDiurno + d.extraNocturno + d.excedente
      + d.domingos + d.feriados - d.ausencias - d.tardanzas,
    ));
  });

  it("⚠️ los porcentajes de seguro son los que están cargados: no se tocan", () => {
    // Daniel: *"Seguro social y educativo los porcentajes son los correctos"*.
    expect(REGLAS_DEFAULT.seguroSocialPct).toBe(9.75);
    expect(REGLAS_DEFAULT.seguroEducativoPct).toBe(1.25);
    const d = linea(ficha()).dinero!;
    expect(d.seguroSocial).toBe(centavos(d.totalBruto * 0.0975));
    expect(d.seguroEducativo).toBe(centavos(d.totalBruto * 0.0125));
  });
});
