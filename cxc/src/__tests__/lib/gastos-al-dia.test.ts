/**
 * Candados de "¿hasta qué mes está al día cada empresa?".
 *
 * Existe por UNA razón: que Daniel vea el avance de la contadora sin
 * preguntárselo a nadie. Daniel confirmó que los gastos de las 8 empresas SÍ se
 * registran en el mismo lugar y que lo que falta es que ella se ponga al día:
 * *"por ahi mismo pero no esta acutalizado aun, estamos en eso"*.
 *
 * 🔴 LA LÍNEA QUE ESTOS TESTS DEFIENDEN ES LA DE LA HONESTIDAD:
 *   · "hasta qué mes hay renglones" es un HECHO y se afirma.
 *   · "ese mes está incompleto" NO se puede afirmar con egresos (son pagos
 *     sueltos, sin asiento de cierre): se dice **"puede estar a medio cargar"**,
 *     con los dos números a la vista, y solo cuando el historial de la PROPIA
 *     empresa lo justifica.
 *   · una empresa sin nada NUNCA se muestra en $0.
 *
 * Los fixtures son los DATOS REALES de producción medidos el 13-ago-2026 sobre
 * los 441 renglones de `egresos_varios` (`scripts/_diag-gastos-al-dia.ts`).
 */
import { describe, it, expect } from "vitest";
import {
  MIN_MESES_PREVIOS,
  UMBRAL_INCOMPLETO,
  alDiaDe,
  mediana,
  serieDeGasto,
  type MesDeGasto,
} from "@/lib/egresos/al-dia";

const d = (n: number) => Math.round(n * 100);

/** Gasto (grupo 6) por mes y empresa, tal cual está hoy en producción. */
const PRODUCCION: Record<string, MesDeGasto[]> = {
  vistana: [
    { mes: "2026-01", gastoCent: d(11862.74) },
    { mes: "2026-02", gastoCent: d(8352.17) },
    { mes: "2026-03", gastoCent: d(37404.28) },
    { mes: "2026-04", gastoCent: d(19113.71) },
    { mes: "2026-05", gastoCent: d(15405.66) },
    { mes: "2026-06", gastoCent: d(13338.34) },
    { mes: "2026-07", gastoCent: d(13276.86) },
  ],
  // 🩸 El caso que originó la regla: cae de $6.482 a $27 y $257.
  fashion_wear: [
    { mes: "2026-01", gastoCent: d(6482.97) },
    { mes: "2026-02", gastoCent: d(2262.8) },
    { mes: "2026-03", gastoCent: d(2701.29) },
    { mes: "2026-04", gastoCent: d(27.18) },
    { mes: "2026-05", gastoCent: d(257.43) },
  ],
  fashion_shoes: [
    { mes: "2026-01", gastoCent: d(2900) },
    { mes: "2026-02", gastoCent: d(3400) },
    { mes: "2026-03", gastoCent: d(3000) },
    { mes: "2026-04", gastoCent: d(2250) },
  ],
  active_wear: [
    { mes: "2026-01", gastoCent: d(416.95) },
    { mes: "2026-02", gastoCent: d(765.29) },
    { mes: "2026-03", gastoCent: d(219.35) },
    { mes: "2026-04", gastoCent: 0 },
  ],
  // Las que no tienen NI UNA fila.
  active_shoes: [],
  joystep: [],
  american_classic: [],
  confecciones_boston: [],
};

/** Agosto: el mes en curso el día que esto se midió. */
const HOY = "2026-08";

describe("🩸 el estado REAL de producción, empresa por empresa", () => {
  it("dice hasta qué mes llega cada una — y coincide con lo medido a mano", () => {
    const hasta = Object.fromEntries(
      Object.entries(PRODUCCION).map(([k, serie]) => {
        const a = alDiaDe(serie, HOY);
        return [k, a.estado === "sin_nada" ? null : a.mes];
      }),
    );
    expect(hasta).toEqual({
      vistana: "2026-07",
      fashion_wear: "2026-05",
      fashion_shoes: "2026-04",
      active_wear: "2026-04",
      active_shoes: null,
      joystep: null,
      american_classic: null,
      confecciones_boston: null,
    });
  });

  it("🔴 las que no tienen nada dicen `sin_nada`, NUNCA cero", () => {
    // Un $0 acá le diría a Daniel que esas empresas no gastaron. Gastan: lo que
    // falta es que estén cargadas.
    for (const k of ["active_shoes", "joystep", "american_classic", "confecciones_boston"]) {
      expect(alDiaDe(PRODUCCION[k], HOY)).toEqual({ estado: "sin_nada" });
    }
  });

  it("marca como dudosas SOLO las dos que se caen contra su propio historial", () => {
    const dudosas = Object.entries(PRODUCCION)
      .filter(([, s]) => alDiaDe(s, HOY).estado === "quizas_incompleto")
      .map(([k]) => k)
      .sort();
    expect(dudosas).toEqual(["active_wear", "fashion_wear"]);
  });

  it("Fashion Wear: mayo trae ~10% de lo habitual, y los dos números viajan", () => {
    const a = alDiaDe(PRODUCCION.fashion_wear, HOY);
    expect(a).toEqual({
      estado: "quizas_incompleto",
      mes: "2026-05",
      gastoCent: d(257.43),
      // mediana de [6482.97, 2262.80, 2701.29, 27.18] = (2262.80+2701.29)/2 =
      // 2.482,045 → redondeado a centavo entero, porque este número se PINTA.
      habitualCent: 248205,
    });
    // Sin los dos números, "puede estar a medio cargar" sería una opinión.
    if (a.estado !== "quizas_incompleto") throw new Error("cambió el estado");
    expect(a.gastoCent / a.habitualCent).toBeLessThan(UMBRAL_INCOMPLETO);
  });

  it("🔴 Vistana y Fashion Shoes NO se marcan: bajar un poco no es estar a medias", () => {
    // Julio de Vistana es el 92% de su mediana y abril de Fashion Shoes el 75%.
    // Marcarlos convertiría el aviso en ruido y dejaría de leerse.
    expect(alDiaDe(PRODUCCION.vistana, HOY)).toEqual({ estado: "al_dia", mes: "2026-07" });
    expect(alDiaDe(PRODUCCION.fashion_shoes, HOY)).toEqual({ estado: "al_dia", mes: "2026-04" });
  });
});

describe("la sospecha se levanta con dato, no con ganas", () => {
  it("hacen falta al menos 3 meses previos para tener 'lo habitual'", () => {
    // Con dos previos, una empresa nueva que arranca despacio quedaría marcada
    // por existir.
    const dosPrevios: MesDeGasto[] = [
      { mes: "2026-01", gastoCent: d(1000) },
      { mes: "2026-02", gastoCent: d(1000) },
      { mes: "2026-03", gastoCent: d(1) },
    ];
    expect(alDiaDe(dosPrevios, HOY)).toEqual({ estado: "al_dia", mes: "2026-03" });
    expect(MIN_MESES_PREVIOS).toBe(3);

    // Con tres, la misma caída SÍ se marca.
    const tresPrevios: MesDeGasto[] = [{ mes: "2025-12", gastoCent: d(1000) }, ...dosPrevios];
    expect(alDiaDe(tresPrevios, HOY).estado).toBe("quizas_incompleto");
  });

  it("un solo mes cargado no se compara con nada", () => {
    expect(alDiaDe([{ mes: "2026-03", gastoCent: d(5) }], HOY)).toEqual({
      estado: "al_dia",
      mes: "2026-03",
    });
  });

  it("si lo habitual es cero, no hay contra qué comparar y no se sospecha", () => {
    // Una empresa que solo movió transferencias (gasto 0) durante meses: la
    // división daría infinito y el aviso no significaría nada.
    const sinGasto: MesDeGasto[] = [
      { mes: "2026-01", gastoCent: 0 },
      { mes: "2026-02", gastoCent: 0 },
      { mes: "2026-03", gastoCent: 0 },
      { mes: "2026-04", gastoCent: 0 },
    ];
    expect(alDiaDe(sinGasto, HOY)).toEqual({ estado: "al_dia", mes: "2026-04" });
  });

  it("🔴 se compara contra la MEDIANA, no contra el promedio", () => {
    // Vistana tiene un marzo de $37.404 entre meses de ~$13.000. Con promedio su
    // julio queda en 75% y con mediana en 92%: un solo mes atípico no puede
    // mover la vara de "lo habitual de ESTA empresa".
    const previos = PRODUCCION.vistana.slice(0, -1).map((m) => m.gastoCent);
    const promedio = previos.reduce((a, b) => a + b, 0) / previos.length;
    const med = mediana(previos);
    expect(med).toBeLessThan(promedio);
    const julio = PRODUCCION.vistana[6].gastoCent;
    expect(julio / med).toBeGreaterThan(0.9);
    expect(julio / promedio).toBeLessThan(0.8);
  });

  it("🔴 la mediana de una cantidad PAR de meses se redondea al centavo", () => {
    // Sale un promedio de dos y puede caer en medio centavo. El número se pinta
    // con `usd()`: un "$2,482.045" en pantalla hace dudar de todo lo demás.
    const a = alDiaDe(PRODUCCION.fashion_wear, HOY);
    if (a.estado !== "quizas_incompleto") throw new Error("cambió el estado");
    expect(Number.isInteger(a.habitualCent)).toBe(true);
    expect(Number.isInteger(a.gastoCent)).toBe(true);
  });

  it("la mediana es la mediana (par e impar)", () => {
    expect(mediana([])).toBe(0);
    expect(mediana([5])).toBe(5);
    expect(mediana([1, 3, 100])).toBe(3);
    expect(mediana([1, 3, 5, 100])).toBe(4);
    // No depende del orden de entrada.
    expect(mediana([100, 1, 3])).toBe(3);
  });
});

describe("el mes que todavía corre es un HECHO del calendario, no una sospecha", () => {
  it("el último mes cargado siendo el mes en curso se dice así", () => {
    const conAgosto: MesDeGasto[] = [...PRODUCCION.vistana, { mes: "2026-08", gastoCent: d(900) }];
    expect(alDiaDe(conAgosto, HOY)).toEqual({ estado: "mes_en_curso", mes: "2026-08" });
  });

  it("🔴 gana sobre la sospecha: un mes que va corriendo SIEMPRE trae menos", () => {
    // Sin este orden, el primer día de cada mes las 8 empresas dirían "puede
    // estar a medio cargar" — verdadero pero inútil, y el aviso se quemaría.
    const arrancando: MesDeGasto[] = [...PRODUCCION.vistana, { mes: "2026-08", gastoCent: d(1) }];
    expect(alDiaDe(arrancando, HOY).estado).toBe("mes_en_curso");
  });

  it("un mes FUTURO (reloj corrido o carga adelantada) tampoco se afirma como cerrado", () => {
    const futuro: MesDeGasto[] = [...PRODUCCION.vistana, { mes: "2026-09", gastoCent: d(10) }];
    expect(alDiaDe(futuro, HOY)).toEqual({ estado: "mes_en_curso", mes: "2026-09" });
  });
});

describe("la serie se arma de los renglones, y solo con los meses que existen", () => {
  it("suma por mes y NO inventa los meses vacíos del medio", () => {
    // Un mes sin una sola fila no es un mes en $0: es un mes del que no hay
    // nada. Meterlo como 0 hundiría la mediana e inventaría sospechas.
    const serie = serieDeGasto([
      { mes: "2026-01", gastoCent: 100 },
      { mes: "2026-01", gastoCent: 250 },
      { mes: "2026-04", gastoCent: 700 },
    ]);
    expect(serie).toEqual([
      { mes: "2026-01", gastoCent: 350 },
      { mes: "2026-04", gastoCent: 700 },
    ]);
  });

  it("ordena aunque los renglones lleguen mezclados", () => {
    const serie = serieDeGasto([
      { mes: "2026-05", gastoCent: 1 },
      { mes: "2026-02", gastoCent: 2 },
      { mes: "2026-03", gastoCent: 3 },
    ]);
    expect(serie.map((s) => s.mes)).toEqual(["2026-02", "2026-03", "2026-05"]);
  });

  it("sin renglones, la serie está vacía y el estado es `sin_nada`", () => {
    expect(serieDeGasto([])).toEqual([]);
    expect(alDiaDe(serieDeGasto([]), HOY)).toEqual({ estado: "sin_nada" });
  });
});
