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
