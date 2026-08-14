// ─────────────────────────────────────────────────────────────────────────────
// CANDADO — el resumen de Multifashion › Productos ("qué se vende más, qué deja
// más plata, qué cambió"), que es lo que la pantalla responde ANTES de la tabla.
//
// Este archivo se pone rojo si:
//   (a) un mes EMPEZADO se compara contra el mes COMPLETO del año pasado — el
//       error más caro de esta pantalla: el 7 de agosto mostraría una caída del
//       78% que no ocurrió, y se ve exactamente igual que un dato;
//   (b) la comparación deja de ser "el mismo período un año antes";
//   (c) un porcentaje se calcula sobre una base que no es positiva (mismo
//       principio que el margen "—": un % sobre cero o sobre una devolución neta
//       no significa nada);
//   (d) la barra del top-5 se mide contra el total en vez de contra el líder de
//       su lista (cinco hilos de 1 px que no comparan nada);
//   (e) la alerta de margen deja de decir su regla, se cuela un "—" adentro o
//       deja de mirar SOLO a los más vendidos;
//   (f) "qué movió la aguja" se rankea por porcentaje en vez de por dólares, o
//       se le escapan los grupos que DEJARON de venderse;
//   (g) el rango de comparación se le pasa a `gerente_acs` fuera de su ventana.
//
// Verificado por MUTACIÓN — las cuentas exactas están al final del archivo.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  rangoComparativo,
  type RenglonRanking,
} from "@/lib/multifashion/productos-ranking";
import {
  variacion,
  topPor,
  margenFlojo,
  movimientos,
  type RenglonComparativo,
} from "@/lib/multifashion/productos-resumen";

/** Renglón ya agregado. Solo se nombra lo que el caso está probando. */
function r(p: Partial<RenglonRanking> & { clave: string }): RenglonRanking {
  const venta = p.venta ?? 0;
  const costo = p.costo ?? 0;
  const utilidad = p.utilidad ?? venta - costo;
  return {
    clave: p.clave,
    etiqueta: p.etiqueta ?? p.clave,
    detalle: p.detalle ?? "",
    unidades: p.unidades ?? 0,
    venta,
    costo,
    utilidad,
    margen: p.margen !== undefined ? p.margen : venta > 0 ? utilidad / venta : null,
    articulos: p.articulos ?? 1,
  };
}

const comp = (clave: string, venta: number, unidades = 0, utilidad = 0): RenglonComparativo => ({
  clave, venta, unidades, utilidad,
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. El período contra el que se compara
// ═════════════════════════════════════════════════════════════════════════════

describe("rangoComparativo — el mismo período, un año antes", () => {
  // 7-ago-2026 18:00 UTC = 13:00 en Panamá. Mes en curso: agosto 2026, día 7.
  const AHORA = new Date("2026-08-07T18:00:00.000Z");

  it("🩸 un mes EMPEZADO se compara contra los MISMOS DÍAS del año pasado", () => {
    // El bug que esto previene: 7 días contra los 31 de agosto-2025 daría una
    // caída de ~78% que nadie vivió. La comparación se RECORTA; el período
    // actual nunca se infla con una proyección.
    const c = rangoComparativo(
      "mes",
      { year: 2026, mes: 8, desde: "2026-08-01", hasta: "2026-08-31" },
      AHORA,
    );
    expect(c).toEqual({ desde: "2025-08-01", hasta: "2025-08-07", parcial: true });
  });

  it("un mes YA CERRADO se compara entero contra entero", () => {
    const c = rangoComparativo(
      "mes",
      { year: 2025, mes: 12, desde: "2025-12-01", hasta: "2025-12-31" },
      AHORA,
    );
    expect(c).toEqual({ desde: "2024-12-01", hasta: "2024-12-31", parcial: false });
  });

  it("el borde de mes es UTC-5: el 1-ago 02:00 UTC en Panamá todavía es 31-jul", () => {
    // Calculado en UTC pelado, el corte del mes en curso saltaría un día antes
    // de tiempo y la comparación se recortaría de más.
    const c = rangoComparativo(
      "mes",
      { year: 2026, mes: 7, desde: "2026-07-01", hasta: "2026-07-31" },
      new Date("2026-08-01T02:00:00.000Z"),
    );
    expect(c).toEqual({ desde: "2025-07-01", hasta: "2025-07-31", parcial: false });
  });

  it("29 de febrero: el año no bisiesto cierra el 28, no un 29 que no existe", () => {
    const c = rangoComparativo(
      "mes",
      { year: 2028, mes: 2, desde: "2028-02-01", hasta: "2028-02-29" },
      new Date("2028-02-29T18:00:00.000Z"),
    );
    expect(c).toEqual({ desde: "2027-02-01", hasta: "2027-02-28", parcial: false });
  });

  it("un mes del futuro no tiene días transcurridos: se compara el mes completo", () => {
    const c = rangoComparativo(
      "mes",
      { year: 2026, mes: 11, desde: "2026-11-01", hasta: "2026-11-30" },
      AHORA,
    );
    expect(c).toEqual({ desde: "2025-11-01", hasta: "2025-11-30", parcial: false });
  });

  it("12 meses: la MISMA ventana corrida 12 meses (mismo largo, mismo corte)", () => {
    const c = rangoComparativo(
      "12m",
      { year: 2026, mes: 8, desde: "2025-09-01", hasta: "2026-08-07" },
      AHORA,
    );
    expect(c).toEqual({ desde: "2024-09-01", hasta: "2025-08-07", parcial: false });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. La variación
// ═════════════════════════════════════════════════════════════════════════════

describe("variacion — el % usa LA regla de la app, no una copia", () => {
  it("caso normal: absoluto y porcentaje", () => {
    expect(variacion(120, 100)).toEqual({ abs: 20, pct: 0.2 });
    expect(variacion(80, 100)).toEqual({ abs: -20, pct: -0.2 });
  });

  it("base 0 o negativa → pct null, pero el ABSOLUTO se muestra igual", () => {
    // El absoluto es un número real y es el que un dueño usa; el % sobre cero
    // sería una división por cero disfrazada de dato.
    expect(variacion(500, 0)).toEqual({ abs: 500, pct: null });
    expect(variacion(500, -200)).toEqual({ abs: 700, pct: null });
    expect(variacion(0, 0)).toEqual({ abs: 0, pct: null });
  });

  it("🩸 una base de centavos NO produce un porcentaje de nueve dígitos", () => {
    // Es el caso real de este repo: Daniel vio "+363024750%" en el histórico de
    // Multifashion porque mayo 2024 valía $0,01. Esta pantalla tiene la misma
    // forma de datos (categorías con centavos en un período y miles en otro),
    // así que se apoya en `variacionPct` en vez de reescribir la división.
    expect(variacion(36_302.49, 0.01).pct).toBeNull();
    expect(variacion(5_000, 40).pct).toBeNull();
    // Y un crecimiento grande DE VERDAD se sigue viendo: $200 → $2.000 es +900%.
    expect(variacion(2_000, 200).pct).toBe(9);
  });

  it("el absoluto no arrastra basura de coma flotante", () => {
    expect(variacion(0.3, 0.1).abs).toBe(0.2);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. Los primeros N, con su barra
// ═════════════════════════════════════════════════════════════════════════════

describe("topPor — la barra compara contra el LÍDER de su lista", () => {
  const filas = [
    r({ clave: "A", unidades: 100, venta: 1000, costo: 600 }),
    r({ clave: "B", unidades: 50, venta: 4000, costo: 1000 }),
    r({ clave: "C", unidades: 25, venta: 500, costo: 400 }),
  ];

  it("ordena de mayor a menor por la columna pedida y corta en n", () => {
    expect(topPor(filas, "unidades", 2, 175).map(f => f.clave)).toEqual(["A", "B"]);
    // Por UTILIDAD el orden es otro — que las dos preguntas no den la misma
    // respuesta es justamente lo que la pantalla quiere hacer visible.
    expect(topPor(filas, "utilidad", 2, 2500).map(f => f.clave)).toEqual(["B", "A"]);
  });

  it("🩸 la fracción es contra el primero, NO contra el total", () => {
    const top = topPor(filas, "unidades", 3, 175);
    expect(top.map(f => f.fraccion)).toEqual([1, 0.5, 0.25]);
    // Contra el total, las mismas barras serían 0,57 / 0,29 / 0,14 y en un
    // catálogo de 570 categorías quedarían todas en 1-3 px.
    expect(top.map(f => f.pctDelTotal)).toEqual([100 / 175, 50 / 175, 25 / 175]);
  });

  it("con un total no positivo el % del total es '—', no 0", () => {
    expect(topPor(filas, "utilidad", 1, 0)[0].pctDelTotal).toBeNull();
    expect(topPor(filas, "utilidad", 1, -50)[0].pctDelTotal).toBeNull();
  });

  it("un líder no positivo deja las barras en 0 en vez de invertirlas", () => {
    const soloDevoluciones = [r({ clave: "X", unidades: -10 }), r({ clave: "Y", unidades: -30 })];
    expect(topPor(soloDevoluciones, "unidades", 2, -40).map(f => f.fraccion)).toEqual([0, 0]);
  });

  it("conserva las cifras de la otra pregunta (venta, utilidad, margen)", () => {
    const [primero] = topPor(filas, "unidades", 1, 175);
    expect(primero).toMatchObject({ clave: "A", valor: 100, venta: 1000, utilidad: 400, margen: 0.4 });
  });

  it("pedir más de los que hay no rompe; pedir 0 devuelve vacío", () => {
    expect(topPor(filas, "unidades", 99, 175)).toHaveLength(3);
    expect(topPor(filas, "unidades", 0, 175)).toEqual([]);
    expect(topPor([], "unidades", 5, 0)).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. Se vende mucho pero deja poco
// ═════════════════════════════════════════════════════════════════════════════

describe("margenFlojo — la conclusión de negocio que nadie mostraba", () => {
  const filas = [
    // Los 4 más vendidos, en orden de unidades.
    r({ clave: "MUCHO-POCO", unidades: 500, venta: 1000, costo: 900 }),   // margen 10%
    r({ clave: "MUCHO-BIEN", unidades: 400, venta: 1000, costo: 400 }),   // margen 60%
    r({ clave: "PEOR-AUN", unidades: 300, venta: 1000, costo: 950 }),     // margen 5%
    r({ clave: "DEVUELTO", unidades: 200, venta: -100, costo: 50 }),      // margen null
    // Fuera del pelotón: margen malísimo pero casi no se vende.
    r({ clave: "IRRELEVANTE", unidades: 1, venta: 10, costo: 9.9 }),      // margen 1%
  ];

  it("muestra los de margen por debajo del general, el PEOR primero", () => {
    const out = margenFlojo(filas, 0.3, { entreLosPrimeros: 4, maximo: 3 });
    expect(out.map(f => f.clave)).toEqual(["PEOR-AUN", "MUCHO-POCO"]);
    expect(out[0].margen).toBeCloseTo(0.05, 10);
  });

  it("🩸 solo mira a los MÁS VENDIDOS: lo que casi no se vende no es un hallazgo", () => {
    // Sin el corte, la alerta se llenaría de artículos de $10 y dejaría de
    // señalar lo que de verdad mueve el período.
    const out = margenFlojo(filas, 0.3, { entreLosPrimeros: 4, maximo: 5 });
    expect(out.map(f => f.clave)).not.toContain("IRRELEVANTE");
  });

  it("un margen '—' NUNCA entra: no tiene margen, no es que 'deje poco'", () => {
    const out = margenFlojo(filas, 0.3, { entreLosPrimeros: 5, maximo: 5 });
    expect(out.map(f => f.clave)).not.toContain("DEVUELTO");
  });

  it("guarda el puesto en el ranking de unidades, que es lo que lo hace grave", () => {
    const out = margenFlojo(filas, 0.3, { entreLosPrimeros: 4, maximo: 3 });
    expect(out.find(f => f.clave === "MUCHO-POCO")?.puesto).toBe(1);
    expect(out.find(f => f.clave === "PEOR-AUN")?.puesto).toBe(3);
  });

  it("sin margen general no hay contra qué comparar: no se inventa un umbral", () => {
    expect(margenFlojo(filas, null, { entreLosPrimeros: 10, maximo: 3 })).toEqual([]);
  });

  it("si nadie está por debajo, no hay alerta", () => {
    expect(margenFlojo(filas, 0.01, { entreLosPrimeros: 4, maximo: 3 })).toEqual([]);
  });

  it("respeta el máximo que se muestra", () => {
    expect(margenFlojo(filas, 0.9, { entreLosPrimeros: 5, maximo: 2 })).toHaveLength(2);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. Qué movió la aguja
// ═════════════════════════════════════════════════════════════════════════════

describe("movimientos — en DÓLARES, no en porcentaje", () => {
  const actuales = [
    r({ clave: "GRANDE", venta: 62000 }),   // −18.000 contra 80.000
    r({ clave: "CHICA", venta: 200 }),      // +160 contra 40, o sea +400%
    r({ clave: "SUBIO", venta: 95000 }),    // +25.000 contra 70.000
    r({ clave: "NUEVA", venta: 3000 }),     // no existía
  ];
  const anteriores = [
    comp("GRANDE", 80000),
    comp("CHICA", 40),
    comp("SUBIO", 70000),
    comp("MURIO", 12000),                   // dejó de venderse
  ];

  it("🩸 el ranking es por dólares: lo que sube 400% desde $40 no mueve el mes", () => {
    const { subieron } = movimientos(actuales, anteriores, 2);
    expect(subieron.map(m => m.clave)).toEqual(["SUBIO", "NUEVA"]);
    // CHICA sube 400% y queda tercera — por porcentaje habría sido la primera.
    expect(subieron.map(m => m.clave)).not.toContain("CHICA");
  });

  it("🩸 los grupos que DEJARON de venderse entran: es la caída completa", () => {
    // Recorriendo solo el período actual serían invisibles, o sea el peor caso
    // contado como si no hubiera pasado.
    const { bajaron } = movimientos(actuales, anteriores, 2);
    expect(bajaron.map(m => m.clave)).toEqual(["GRANDE", "MURIO"]);
    const murio = bajaron.find(m => m.clave === "MURIO");
    expect(murio).toMatchObject({ ventaActual: 0, ventaAnterior: 12000, abs: -12000, desaparecido: true });
  });

  it("lo que no vendía el año pasado se marca 'nuevo' en vez de un % infinito", () => {
    const { subieron } = movimientos(actuales, anteriores, 5);
    const nueva = subieron.find(m => m.clave === "NUEVA");
    expect(nueva).toMatchObject({ nuevo: true, pct: null, abs: 3000 });
  });

  it("lo que no se movió no aparece de ningún lado", () => {
    const iguales = movimientos([r({ clave: "A", venta: 100 })], [comp("A", 100)], 5);
    expect(iguales).toEqual({ subieron: [], bajaron: [] });
  });

  it("sin período de comparación todo es 'nuevo', y eso es correcto", () => {
    const { subieron, bajaron } = movimientos([r({ clave: "A", venta: 100 })], [], 5);
    expect(subieron.map(m => m.clave)).toEqual(["A"]);
    expect(bajaron).toEqual([]);
  });

  it("empate en dólares: desempata por etiqueta y no se reordena solo", () => {
    const a = [r({ clave: "ZETA", venta: 100 }), r({ clave: "ALFA", venta: 100 })];
    const { subieron } = movimientos(a, [], 5);
    expect(subieron.map(m => m.clave)).toEqual(["ALFA", "ZETA"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// VERIFICADO POR MUTACIÓN (7-ago-2026). La sección 6 —el rango de comparación
// pasando por la ventana de `gerente_acs`— se retiró el 13-ago-2026 junto con la
// ventana misma (ver `multifashion-acceso.test.ts`):
//   · comparar contra el mes COMPLETO (quitar el recorte por día) → rompe 2
//   · comparar contra el mes ANTERIOR en vez del año anterior      → rompe 7
//   · devolver pct sobre una base ≤ 0 (dividir igual)              → rompe 1
//   · medir la barra contra el total en vez del líder              → rompe 1
//   · dejar entrar los márgenes "—" en la alerta de margen         → rompe 3
//   · quitar el corte de "entre los primeros N"                    → rompe 3
//   · rankear los movimientos por pct en vez de por dólares        → rompe 2
//   · no recorrer los grupos que solo existen en el año pasado     → rompe 1
// ─────────────────────────────────────────────────────────────────────────────
