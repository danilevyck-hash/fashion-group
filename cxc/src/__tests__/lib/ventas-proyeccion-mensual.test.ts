// ─────────────────────────────────────────────────────────────────────────────
// VENTAS › RESUMEN — LOS MESES QUE FALTAN, EN GRIS (5-sep-2026).
//
// Hasta hoy, oct-nov-dic decían «—» y la proyección del año entero aparecía de
// la nada en una columna al final. Daniel lo definió así: se llenan en gris con
// la forma del año pasado × el factor que sale de la proyección.
//
// LO QUE ESTE CANDADO SOSTIENE
//
//  1. La cuenta es UNA: factor = proyeccion_restante ÷ (cierre del año pasado −
//     lo que llevaba al mismo día de corte). Nada nuevo se pide a la base.
//  2. El MES EN CURSO no se toca — su celda sigue mostrando lo vendido contra
//     los mismos días del año pasado. El pedazo que le falta a ese mes entra al
//     DIVISOR y no se dibuja: por eso la fila NO suma la Proyección, y está
//     aceptado.
//  3. Sin año base utilizable → «—», nunca un número inventado.
//  4. Un mes que el año pasado valió $0 proyecta 0 y se deja así. Daniel,
//     textual (*«1. a»*): Active Wear y Joystep vendieron $0 en noviembre de
//     2025 y esa es la verdad de lo que hicieron.
//
// LOS NÚMEROS NO SON INVENTADOS: salen de producción el 5-sep-2026, corte
// 2026-09-05 — `ventas_proyeccion_cierre_v7(2026)` para Multifashion y
// `ventas_rollup_mensual_mv` (anio = 2025) para la forma del año pasado.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  mesesProyectados, mesesProyectadosDelGrupo, mesesProyectadosPorFila,
  factorDeReparto, restoDelAnioAnterior, LEYENDA_MESES_PROYECTADOS,
  type EntradaProyeccionMensual,
} from "@/lib/ventas/proyeccion-mensual";

/** Multifashion (`american_classic`), medido contra producción el 5-sep-2026. */
const MULTIFASHION_PREV_2025 = [
  21_996.83, 42_046.32, 36_224.21, 66_778.36, 36_302.49, 59_292.96,
  37_172.16, 39_453.49, 36_430.41, 48_892.13, 61_196.78, 200_257.73,
];

const MULTIFASHION: EntradaProyeccionMensual = {
  prevFull: MULTIFASHION_PREV_2025,
  ventasPrevYtdSp: 344_610.79,
  cierreAnioAnterior: 686_043.69,
  proyeccionRestante: 393_853.36,
  esFallbackLineal: false,
  mesCorte: 9,
};

describe("Multifashion, el caso medido del 5-sep-2026", () => {
  it("el divisor es lo que el año pasado vendió DESPUÉS del corte", () => {
    // 686.043,69 − 344.610,79. Incluye los 25 días de septiembre que faltan.
    expect(restoDelAnioAnterior(MULTIFASHION)).toBeCloseTo(341_432.90, 2);
  });

  it("el factor sale de la proyección, no de una regla nueva", () => {
    expect(factorDeReparto(MULTIFASHION)).toBeCloseTo(1.153531, 6);
  });

  it("octubre, noviembre y diciembre se llenan con la forma de 2025 × el factor", () => {
    const m = mesesProyectados(MULTIFASHION);
    expect(m[9]).toBeCloseTo(56_398.58, 2);   // oct
    expect(m[10]).toBeCloseTo(70_592.37, 2);  // nov
    expect(m[11]).toBeCloseTo(231_003.46, 2); // dic
  });

  it("🔴 los meses ya vividos —incluido SEPTIEMBRE, el mes en curso— quedan en null", () => {
    const m = mesesProyectados(MULTIFASHION);
    for (let i = 0; i <= 8; i++) expect(m[i], `mes ${i + 1}`).toBeNull();
  });

  it("⚠️ la fila NO suma la Proyección, y le falta exactamente el resto de septiembre", () => {
    // Consecuencia aceptada por Daniel: «Total» es lo vendido y «Proyección» el
    // año completo. Lo que no se dibuja son los 25 días de septiembre.
    const m = mesesProyectados(MULTIFASHION);
    const dibujado = m.reduce<number>((s, v) => s + (v ?? 0), 0);
    expect(dibujado).toBeCloseTo(357_994.40, 2);
    const septiembreQueFalta = (36_430.41 - 5_343.98) * factorDeReparto(MULTIFASHION)!;
    expect(dibujado + septiembreQueFalta).toBeCloseTo(MULTIFASHION.proyeccionRestante, 0);
  });

  it("repartir con ese factor devuelve `proyeccion_restante`, ni un centavo más", () => {
    // La propiedad que hace que esto NO sea una segunda verdad: el reparto es
    // exacto contra el número que ya calcula la RPC.
    const f = factorDeReparto(MULTIFASHION)!;
    const resto = restoDelAnioAnterior(MULTIFASHION)!;
    expect(resto * f).toBeCloseTo(MULTIFASHION.proyeccionRestante, 6);
  });

  it("la suma de los 12 meses del año pasado ES el cierre del año pasado", () => {
    // Cuadre de las dos fuentes: `ventas_rollup_mensual_mv` (la forma) contra
    // `cierre_anio_anterior` de la RPC (el divisor). Si divergen, el reparto no
    // sumaría lo que dice sumar.
    const suma = MULTIFASHION_PREV_2025.reduce((a, b) => a + b, 0);
    expect(suma).toBeCloseTo(MULTIFASHION.cierreAnioAnterior, 0);
  });
});

describe("cuándo NO se dibuja nada", () => {
  it("sin año base utilizable (fallback lineal) se queda en «—»", () => {
    const m = mesesProyectados({ ...MULTIFASHION, esFallbackLineal: true });
    expect(m.every(v => v === null)).toBe(true);
  });

  it("sin cierre del año anterior se queda en «—»", () => {
    expect(mesesProyectados({ ...MULTIFASHION, cierreAnioAnterior: 0 }).every(v => v === null)).toBe(true);
  });

  it("un cierre NEGATIVO (más notas de crédito que ventas) tampoco reparte", () => {
    // El caso que el guard del cierre atrapa y el del divisor NO: con los dos
    // números negativos, la resta da positiva y el factor saldría del revés.
    const m = mesesProyectados({
      ...MULTIFASHION, cierreAnioAnterior: -100, ventasPrevYtdSp: -500,
    });
    expect(m.every(v => v === null)).toBe(true);
  });

  it("con el año pasado ya cerrado antes del corte (divisor ≤ 0) se queda en «—»", () => {
    const m = mesesProyectados({ ...MULTIFASHION, ventasPrevYtdSp: 700_000 });
    expect(m.every(v => v === null)).toBe(true);
  });

  it("sin nada que repartir (proyección ya alcanzada) se queda en «—», no en ceros", () => {
    const m = mesesProyectados({ ...MULTIFASHION, proyeccionRestante: 0 });
    expect(m.every(v => v === null)).toBe(true);
  });

  it("en diciembre no queda ningún mes por delante", () => {
    expect(mesesProyectados({ ...MULTIFASHION, mesCorte: 12 }).every(v => v === null)).toBe(true);
  });

  it("sin mes de corte (año sin datos) no se dibuja nada", () => {
    expect(mesesProyectados({ ...MULTIFASHION, mesCorte: 0 }).every(v => v === null)).toBe(true);
  });
});

describe("🔴 un mes que el año pasado valió $0 proyecta 0, y se deja así", () => {
  // Daniel, 5-sep-2026: *«1. a»*. Active Wear vendió $0 en noviembre de 2025.
  const ACTIVE_WEAR: EntradaProyeccionMensual = {
    prevFull: [
      13_559.33, 25_155, 25_155, 25_155, 25_155, 25_155,
      25_155, 25_155, 25_155, 4_996, null, 3_237,
    ],
    ventasPrevYtdSp: 191_458.33,
    cierreAnioAnterior: 199_716.33,
    proyeccionRestante: 14_712.07,
    esFallbackLineal: false,
    mesCorte: 9,
  };

  it("noviembre da 0, no «—» y no un invento", () => {
    const m = mesesProyectados(ACTIVE_WEAR);
    expect(m[10]).toBe(0);
    expect(m[9]).toBeGreaterThan(0);
    expect(m[11]).toBeGreaterThan(0);
  });
});

describe("el renglón del Total Grupo es la SUMA de lo que se proyectó", () => {
  it("suma solo los meses donde alguna empresa pudo proyectar", () => {
    const grupo = mesesProyectadosDelGrupo([
      [null, null, 10, 20],
      [null, null, 5, null],
    ]);
    expect(grupo[0]).toBeNull();
    expect(grupo[2]).toBe(15);
    expect(grupo[3]).toBe(20);
  });

  it("un mes donde NINGUNA pudo proyectar se queda en «—»", () => {
    const grupo = mesesProyectadosDelGrupo([[null, null], [null, null]]);
    expect(grupo.every(v => v === null)).toBe(true);
  });
});

describe("la matriz entera sale de UNA sola función", () => {
  // El escritorio y el celular la llaman a ella: dos cuentas separadas es cómo
  // dos vistas del mismo Resumen terminan diciendo números distintos.
  const filas = [
    { id: "multi", ventasPrevFull: MULTIFASHION_PREV_2025 },
    { id: "joystep", ventasPrevFull: Array(12).fill(0) },
  ];
  const buscar = (id: string) =>
    id === "multi"
      ? {
          ventas_prev_ytd_sp: MULTIFASHION.ventasPrevYtdSp,
          cierre_anio_anterior: MULTIFASHION.cierreAnioAnterior,
          proyeccion_restante: MULTIFASHION.proyeccionRestante,
          es_fallback_lineal: false,
        }
      : null;

  it("cada fila trae sus meses y el grupo su suma", () => {
    const { porFila, grupo } = mesesProyectadosPorFila(filas, 9, buscar);
    expect(porFila.multi[9]).toBeCloseTo(56_398.58, 2);
    expect(porFila.joystep.every(v => v === null)).toBe(true);
    expect(grupo[9]).toBeCloseTo(56_398.58, 2);
    expect(grupo[0]).toBeNull();
  });

  it("una empresa sin `ventasPrevFull` no rompe la matriz", () => {
    const { porFila } = mesesProyectadosPorFila(
      [{ id: "multi", ventasPrevFull: undefined as unknown as (number | null)[] }],
      9,
      buscar,
    );
    expect(porFila.multi[9]).toBe(0);
  });
});

describe("la leyenda dice qué es el gris, en una línea", () => {
  it("nombra el gris y de dónde sale, sin párrafo", () => {
    expect(LEYENDA_MESES_PROYECTADOS).toContain("gris");
    expect(LEYENDA_MESES_PROYECTADOS.length).toBeLessThan(140);
  });
});
