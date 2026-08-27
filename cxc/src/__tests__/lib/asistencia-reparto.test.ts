// ─────────────────────────────────────────────────────────────────────────────
// UNA PERSONA, DOS EMPRESAS — el candado
//
// La contadora, textual (27-ago-2026): *"El salario de Julio es 1000 y están
// divididos en dos empresas. 800 en Vistana, sobre los cuales se aplican seguro
// social y educativo. Los otros 200 están en Fashion Wear. Aquí es servicios
// profesionales y es aquí donde se le pagan las horas extras. En ambas empresas
// su rata por hora es 5.77"*.
//
// 🔴 LO QUE SE PRUEBA ACÁ SON CINCO COSAS, Y NINGUNA SE PUEDE PROBAR SOLA:
//
//   1. LA RATA SALE DEL SUELDO COMPLETO. Es el corazón: con la rata de los $200
//      su hora valdría $1,15 y sus horas extra —que se pagan justamente ahí— se
//      pagarían CINCO VECES MENOS.
//   2. CADA COLUMNA DEL RELOJ CAE EN UNA SOLA LÍNEA. Sumando las partes se
//      reconstruye la medición original, columna por columna. Una ausencia en
//      las dos líneas se descuenta dos veces; una hora extra en ninguna
//      desaparece en silencio.
//   3. UN REPARTO QUE NO CUADRA SE RECHAZA ENTERO, y rechazar es volver a HOY:
//      una sola línea, con su sueldo entero y sus seguros.
//   4. NADIE MÁS SE MUEVE.
//   5. SIN REPARTO, TODO DA EXACTAMENTE LO DE AYER — que es lo que hace que la
//      app funcione ANTES de correr la migración.
//
// ⚠️ Los números son los MEDIDOS contra producción el 27-ago-2026 sobre la
// quincena del 1 al 15 de agosto, con las horas extra aprobadas.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";

import {
  armarLinea,
  armarPlanilla,
  calcularDinero,
  centavos,
  HORAS_CERO,
  MANUALES_CERO,
  partesUsables,
  repartirHoras,
  totalizar,
  type FichaPlanilla,
  type HorasPersona,
  type ParteReparto,
} from "@/lib/asistencia/planilla";
import { REGLAS_DEFAULT, divisorDe } from "@/lib/asistencia/config";
import {
  agruparPorCodigo,
  avisoMigracionReparto,
  comoFilas,
  MIGRACION_REPARTO,
  modoDeParte,
  partesDe,
  TABLA_REPARTO,
  textoRepartoRechazado,
  validarReparto,
  type FilaReparto,
} from "@/lib/asistencia/reparto";
import { armarDiasAprobacion } from "@/lib/asistencia/aprobaciones";
import { armarReporte } from "@/lib/asistencia/reporte";

const R = REGLAS_DEFAULT;
const JULIO = "11";

/** Las dos filas tal como las siembra la migración. */
const FILAS: FilaReparto[] = [
  { empleado_codigo: JULIO, empresa: "vistana", salario_mensual: "800.00", paga_seguros: true, paga_horas_extra: false, orden: 0 },
  { empleado_codigo: JULIO, empresa: "fashion_wear", salario_mensual: "200.00", paga_seguros: false, paga_horas_extra: true, orden: 1 },
];

const PARTES = partesDe(1000, FILAS);

function ficha(extra: Partial<FichaPlanilla> = {}): FichaPlanilla {
  return {
    codigo: JULIO,
    nombre: "JULIO GARAY",
    salarioMensual: 1000,
    jornadaSemanal: 40,
    empresa: "vistana",
    servicioProfesional: false,
    pagaSeguros: true,
    noMarcaReloj: false,
    baseSeguros: null,
    ...extra,
  };
}

/** Las horas REALES de Julio, 1-15 de agosto de 2026, medidas en producción. */
const HORAS_AGOSTO: HorasPersona = {
  ...HORAS_CERO,
  extraDiurnoMin: 642.1333333333334,
  extraNocturnoMin: 137.1166666666665,
  jornadaDiariaMin: 480,
  diasTrabajados: 11,
};

/** Las de la quincena del 16 al 31 de julio: trae domingo, tardanza y ausencia. */
const HORAS_JULIO2: HorasPersona = {
  ...HORAS_CERO,
  extraDiurnoMin: 736.0666666666665,
  extraNocturnoMin: 433.53333333333353,
  domingoMin: 187.5,
  tardanzaMin: 72.18333333333334,
  jornadaDiariaMin: 480,
  diasTrabajados: 12,
};

describe("validarReparto — las cinco reglas", () => {
  it("el reparto de la contadora es válido y sale ordenado", () => {
    const r = validarReparto(1000, FILAS);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.valor).toHaveLength(2);
    expect(r.valor[0]).toMatchObject({
      empresa: "vistana", salarioMensual: 800, pagaSeguros: true,
      llevaHorasExtra: false, llevaElReloj: true,
    });
    expect(r.valor[1]).toMatchObject({
      empresa: "fashion_wear", salarioMensual: 200, pagaSeguros: false,
      llevaHorasExtra: true, llevaElReloj: false,
    });
  });

  it("sin filas NO es un error: es lo que le pasa a 36 de las 37 fichas", () => {
    const r = validarReparto(1000, []);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor).toEqual([]);
    expect(validarReparto(1000, null).ok).toBe(true);
  });

  it("🔴 los montos TIENEN que sumar el salario de la ficha", () => {
    const r = validarReparto(1000, [FILAS[0], { ...FILAS[1], salario_mensual: "100.00" }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("$900.00");
    // Y al revés: con el salario de la ficha en $900 ese mismo reparto sí cuadra.
    expect(validarReparto(900, [FILAS[0], { ...FILAS[1], salario_mensual: "100.00" }]).ok).toBe(true);
  });

  it("🔴 exactamente UNA parte paga las horas extra", () => {
    const ninguna = validarReparto(1000, [FILAS[0], { ...FILAS[1], paga_horas_extra: false }]);
    expect(ninguna.ok).toBe(false);
    if (!ninguna.ok) expect(ninguna.error).toContain("ninguna");
    const dos = validarReparto(1000, [{ ...FILAS[0], paga_horas_extra: true }, FILAS[1]]);
    expect(dos.ok).toBe(false);
    if (!dos.ok) expect(dos.error).toContain("más de una");
  });

  it("un reparto de UNA sola empresa no es un reparto", () => {
    expect(validarReparto(1000, [{ ...FILAS[0], salario_mensual: "1000.00" }]).ok).toBe(false);
    // 🔑 Y el caso que de verdad prueba la regla: una sola parte que SUMA el
    // salario Y paga las horas extra, o sea que pasa TODAS las demás reglas.
    // Sin este caso, el candado se conformaba con que la rechazara la regla 5.
    const unaSolaPerfecta = validarReparto(1000, [
      { ...FILAS[0], salario_mensual: "1000.00", paga_horas_extra: true },
    ]);
    expect(unaSolaPerfecta.ok).toBe(false);
    if (!unaSolaPerfecta.ok) expect(unaSolaPerfecta.error).toContain("dos empresas");
  });

  it("la misma empresa dos veces se rechaza", () => {
    const r = validarReparto(1000, [FILAS[0], { ...FILAS[1], empresa: "vistana" }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("dos veces");
  });

  it("una empresa que no es del reloj se rechaza", () => {
    const r = validarReparto(1000, [FILAS[0], { ...FILAS[1], empresa: "joystep" }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("joystep");
  });

  it("un monto en cero o negativo se rechaza", () => {
    expect(validarReparto(1000, [{ ...FILAS[0], salario_mensual: "1000.00" }, { ...FILAS[1], salario_mensual: "0" }]).ok).toBe(false);
    expect(validarReparto(1000, [{ ...FILAS[0], salario_mensual: "1200.00" }, { ...FILAS[1], salario_mensual: "-200" }]).ok).toBe(false);
  });

  it("sin salario en la ficha no hay nada que repartir", () => {
    expect(validarReparto(null, FILAS).ok).toBe(false);
    expect(validarReparto(0, FILAS).ok).toBe(false);
  });

  it("🩸 el monto llega como TEXTO desde PostgREST y se lee igual", () => {
    const comoNumero = validarReparto(1000, [
      { ...FILAS[0], salario_mensual: 800 }, { ...FILAS[1], salario_mensual: 200 },
    ]);
    expect(comoNumero.ok).toBe(true);
    if (comoNumero.ok) expect(comoNumero.valor.map((p) => p.salarioMensual)).toEqual([800, 200]);
  });

  it("el ORDEN decide quién lleva el reloj, y desempata la empresa", () => {
    // Mismo `orden`: gana la empresa alfabéticamente, y da SIEMPRE lo mismo.
    const a = validarReparto(1000, [
      { ...FILAS[1], orden: 0 }, { ...FILAS[0], orden: 0 },
    ]);
    const b = validarReparto(1000, [
      { ...FILAS[0], orden: 0 }, { ...FILAS[1], orden: 0 },
    ]);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.valor.map((p) => p.empresa)).toEqual(b.valor.map((p) => p.empresa));
    expect(a.valor[0].llevaElReloj).toBe(true);
  });

  it("`partesDe` devuelve la lista VACÍA ante cualquier duda", () => {
    expect(partesDe(1000, [FILAS[0]])).toEqual([]);
    expect(partesDe(null, FILAS)).toEqual([]);
    expect(partesDe(1000, FILAS)).toHaveLength(2);
  });

  it("`comoFilas` cierra el viaje de ida y vuelta con la MISMA validación", () => {
    const r = validarReparto(1000, comoFilas(JULIO, PARTES));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.valor).toEqual(PARTES);
    // Y con otro salario, el motivo lo da la MISMA función (no una copia).
    const otro = validarReparto(900, comoFilas(JULIO, PARTES));
    expect(otro.ok).toBe(false);
  });

  it("`agruparPorCodigo` junta las filas de cada persona", () => {
    const m = agruparPorCodigo([...FILAS, { ...FILAS[0], empleado_codigo: "7" }]);
    expect(m.get(JULIO)).toHaveLength(2);
    expect(m.get("7")).toHaveLength(1);
  });
});

describe("repartirHoras — cada columna cae en UNA sola parte", () => {
  const NO_ADITIVAS = new Set(["jornadaDiariaMin"]);

  it("🔴 sumando las partes se reconstruye la medición, columna por columna", () => {
    for (const horas of [HORAS_AGOSTO, HORAS_JULIO2]) {
      const trozos = PARTES.map((p) => repartirHoras(horas, p));
      for (const k of Object.keys(horas) as Array<keyof HorasPersona>) {
        if (NO_ADITIVAS.has(k)) continue;
        const suma = trozos.reduce((a, t) => a + t[k], 0);
        expect(`${String(k)}=${suma}`).toBe(`${String(k)}=${horas[k]}`);
      }
    }
  });

  it("la jornada diaria se COPIA a las dos, no se reparte", () => {
    for (const t of PARTES.map((p) => repartirHoras(HORAS_AGOSTO, p))) {
      expect(t.jornadaDiariaMin).toBe(480);
    }
  });

  it("las horas extra van SOLO a la parte marcada", () => {
    const vistana = repartirHoras(HORAS_AGOSTO, PARTES[0]);
    const fw = repartirHoras(HORAS_AGOSTO, PARTES[1]);
    expect(vistana.extraDiurnoMin).toBe(0);
    expect(vistana.extraNocturnoMin).toBe(0);
    expect(fw.extraDiurnoMin).toBe(HORAS_AGOSTO.extraDiurnoMin);
    expect(fw.extraNocturnoMin).toBe(HORAS_AGOSTO.extraNocturnoMin);
  });

  it("⚠️ el domingo, la tardanza y la ausencia se quedan con el RELOJ", () => {
    const vistana = repartirHoras(HORAS_JULIO2, PARTES[0]);
    const fw = repartirHoras(HORAS_JULIO2, PARTES[1]);
    expect(vistana.domingoMin).toBe(187.5);
    expect(vistana.tardanzaMin).toBe(HORAS_JULIO2.tardanzaMin);
    expect(fw.domingoMin).toBe(0);
    expect(fw.tardanzaMin).toBe(0);
  });
});

describe("partesUsables — el candado estructural del motor", () => {
  it("acepta el reparto bueno", () => {
    expect(partesUsables(ficha({ reparto: PARTES }))).toHaveLength(2);
  });

  it("rechaza lo que no cuadra, aunque venga «validado»", () => {
    const rotas: ParteReparto[][] = [
      [PARTES[0]],
      [PARTES[0], { ...PARTES[1], salarioMensual: 100 }],
      [PARTES[0], { ...PARTES[1], empresa: "vistana" }],
      [{ ...PARTES[0], llevaHorasExtra: true }, PARTES[1]],
      [{ ...PARTES[0], llevaHorasExtra: false }, { ...PARTES[1], llevaHorasExtra: false }],
      [{ ...PARTES[0], llevaElReloj: false }, { ...PARTES[1], llevaElReloj: false }],
      [{ ...PARTES[0], llevaElReloj: true }, { ...PARTES[1], llevaElReloj: true }],
      [PARTES[0], { ...PARTES[1], salarioMensual: 0 }],
    ];
    for (const r of rotas) expect(partesUsables(ficha({ reparto: r }))).toEqual([]);
    expect(partesUsables(ficha({ reparto: PARTES, salarioMensual: 900 }))).toEqual([]);
    expect(partesUsables(ficha({ reparto: PARTES, salarioMensual: null }))).toEqual([]);
  });

  it("sin reparto devuelve la lista vacía", () => {
    expect(partesUsables(ficha())).toEqual([]);
    expect(partesUsables(ficha({ reparto: [] }))).toEqual([]);
  });
});

describe("🔴 LA RATA SALE DEL SUELDO COMPLETO", () => {
  it("$1.000 ÷ 173,33 = $5,77 — y esa es la rata de LAS DOS partes", () => {
    const divisor = divisorDe(40, R)!;
    const esperada = centavos(1000 / divisor);
    expect(esperada).toBe(5.77);
    for (const p of PARTES) {
      const d = calcularDinero(1000, 40, HORAS_CERO, MANUALES_CERO, R, 1, p.pagaSeguros, null, p.salarioMensual);
      expect(d!.rataHora).toBe(5.77);
    }
  });

  it("🩸 si la rata saliera del monto de la parte, la hora valdría $1,15", () => {
    // Este test NO prueba el producto: prueba que la diferencia es ENORME, o sea
    // que la regla de arriba no es un detalle de redondeo.
    const malo = calcularDinero(200, 40, HORAS_CERO, MANUALES_CERO, R, 1, false, null, null);
    expect(malo!.rataHora).toBe(1.15);
    expect(5.77 / 1.15).toBeGreaterThan(5);
  });

  it("`salarioDeLaParte` toca el QUINCENAL y NADA MÁS", () => {
    const sin = calcularDinero(1000, 40, HORAS_AGOSTO, MANUALES_CERO, R, 1, false, null, null)!;
    const con = calcularDinero(1000, 40, HORAS_AGOSTO, MANUALES_CERO, R, 1, false, null, 200)!;
    expect(con.salarioQuincenal).toBe(100);
    expect(sin.salarioQuincenal).toBe(500);
    // Todo lo demás que sale de la rata es idéntico.
    for (const k of ["rataHora", "valorMinuto", "extraDiurno", "extraNocturno", "excedente", "domingos", "feriados", "ausencias", "tardanzas"] as const) {
      expect(`${k}=${con[k]}`).toBe(`${k}=${sin[k]}`);
    }
  });

  it("sin el parámetro, `calcularDinero` da EXACTAMENTE lo de siempre", () => {
    const antes = calcularDinero(1000, 40, HORAS_JULIO2, MANUALES_CERO, R, 1, true, null);
    const conNull = calcularDinero(1000, 40, HORAS_JULIO2, MANUALES_CERO, R, 1, true, null, null);
    expect(conNull).toEqual(antes);
    // Un 0 o un NaN colados por un llamador NO pagan una quincena de $0.
    expect(calcularDinero(1000, 40, HORAS_CERO, MANUALES_CERO, R, 1, true, null, 0)!.salarioQuincenal).toBe(500);
    expect(calcularDinero(1000, 40, HORAS_CERO, MANUALES_CERO, R, 1, true, null, NaN)!.salarioQuincenal).toBe(500);
  });
});

describe("🔴 LOS NÚMEROS DE LA CONTADORA — 1 al 15 de agosto de 2026", () => {
  const lineas = PARTES.map((p) =>
    armarLinea(ficha({ reparto: PARTES }), HORAS_AGOSTO, MANUALES_CERO, R, 1, null, {}, p),
  );
  const [vistana, fw] = lineas;

  it("Vistana: $400,00 de sueldo, sin extras, $44,00 de seguros, neto $356,00", () => {
    expect(vistana.empresa).toBe("vistana");
    expect(vistana.dinero!.salarioQuincenal).toBe(400);
    expect(vistana.dinero!.extraDiurno + vistana.dinero!.extraNocturno).toBe(0);
    expect(vistana.dinero!.seguroSocial).toBe(39);
    expect(vistana.dinero!.seguroEducativo).toBe(5);
    expect(vistana.dinero!.totalBruto).toBe(400);
    expect(vistana.dinero!.netoPagar).toBe(356);
  });

  it("Fashion Wear: $100,00 de sueldo, $96,97 de extras, SIN seguros, neto $196,97", () => {
    expect(fw.empresa).toBe("fashion_wear");
    expect(fw.dinero!.salarioQuincenal).toBe(100);
    expect(centavos(fw.dinero!.extraDiurno + fw.dinero!.extraNocturno)).toBe(96.97);
    expect(fw.dinero!.seguroSocial).toBe(0);
    expect(fw.dinero!.seguroEducativo).toBe(0);
    expect(fw.dinero!.totalBruto).toBe(196.97);
    expect(fw.dinero!.netoPagar).toBe(196.97);
  });

  it("las dos usan la MISMA rata: $5,77", () => {
    expect(vistana.dinero!.rataHora).toBe(5.77);
    expect(fw.dinero!.rataHora).toBe(5.77);
  });

  it("🔴 el BRUTO TOTAL no se mueve: el reparto no crea ni destruye plata bruta", () => {
    const entero = armarLinea(ficha(), HORAS_AGOSTO, MANUALES_CERO, R, 1);
    const suma = centavos(vistana.dinero!.totalBruto + fw.dinero!.totalBruto);
    expect(suma).toBe(entero.dinero!.totalBruto);
    expect(suma).toBe(596.97);
  });

  it("lo que gana Julio son EXACTAMENTE los seguros que Fashion Wear no paga", () => {
    const entero = armarLinea(ficha(), HORAS_AGOSTO, MANUALES_CERO, R, 1);
    const neto = centavos(vistana.dinero!.netoPagar + fw.dinero!.netoPagar);
    const segDeLaParteFW = centavos(
      centavos(196.97 * (R.seguroSocialPct / 100)) + centavos(196.97 * (R.seguroEducativoPct / 100)),
    );
    expect(centavos(neto - entero.dinero!.netoPagar)).toBe(segDeLaParteFW);
  });

  it("`salarioMensual` de la LÍNEA sigue siendo el sueldo COMPLETO (de ahí sale la rata)", () => {
    expect(vistana.salarioMensual).toBe(1000);
    expect(fw.salarioMensual).toBe(1000);
    // El monto de cada empresa viaja aparte, para que la pantalla lo pueda decir.
    expect(vistana.parte!.salarioMensual).toBe(800);
    expect(fw.parte!.salarioMensual).toBe(200);
  });
});

describe("los montos escritos a mano van con el RELOJ, a una sola línea", () => {
  const MANUALES = { ...MANUALES_CERO, mercancia: 10 };
  const lineas = PARTES.map((p) =>
    armarLinea(ficha({ reparto: PARTES }), HORAS_AGOSTO, MANUALES, R, 1, null, {}, p),
  );

  it("🔴 el ISR/préstamo/mercancía NO se descuentan dos veces", () => {
    expect(lineas[0].dinero!.mercancia).toBe(10);
    expect(lineas[1].dinero!.mercancia).toBe(0);
    expect(lineas[0].manuales.mercancia).toBe(10);
    expect(lineas[1].manuales.mercancia).toBe(0);
    expect(lineas[0].dinero!.netoPagar).toBe(346);
    expect(lineas[1].dinero!.netoPagar).toBe(196.97);
  });

  it("la base propia de seguros tampoco se aplica dos veces", () => {
    const conBase = PARTES.map((p) =>
      armarLinea(ficha({ reparto: PARTES, baseSeguros: 175 }), HORAS_AGOSTO, MANUALES_CERO, R, 1, null, {}, p),
    );
    expect(conBase[0].dinero!.baseSeguros).toBe(175);
    expect(conBase[0].baseSeguros).toBe(175);
    // La parte sin reloj NO tiene base propia... y además tiene los seguros
    // apagados, así que su sello correcto es «sin seguros», no una base.
    expect(conBase[1].dinero!.baseSeguros).toBeNull();
    expect(conBase[1].baseSeguros).toBeNull();
  });

  it("🔴 con las DOS partes pagando seguros, la base propia se usa UNA sola vez", () => {
    // 🩸 El caso anterior no alcanzaba: la parte de Fashion Wear tiene los
    // seguros APAGADOS, así que su base sale `null` por ese camino y una
    // mutación que aplicara la base en las dos líneas pasaba desapercibida.
    // Acá las dos pagan, así que la única razón por la que una no lleva base es
    // que no lleva el reloj.
    const dosConSeguros = partesDe(1000, [
      { ...FILAS[0], paga_seguros: true },
      { ...FILAS[1], paga_seguros: true },
    ]);
    expect(dosConSeguros).toHaveLength(2);
    const ls = dosConSeguros.map((p) =>
      armarLinea(ficha({ reparto: dosConSeguros, baseSeguros: 175 }), HORAS_AGOSTO, MANUALES_CERO, R, 1, null, {}, p),
    );
    expect(ls[0].dinero!.baseSeguros).toBe(175);
    expect(ls[1].dinero!.baseSeguros).toBeNull();
    // Y los montos lo confirman: solo la línea del reloj cobra sobre los $175.
    expect(ls[0].dinero!.seguroSocial).toBe(centavos(175 * (R.seguroSocialPct / 100)));
    expect(ls[1].dinero!.seguroSocial).toBe(
      centavos(ls[1].dinero!.totalBruto * (R.seguroSocialPct / 100)),
    );
    expect(ls[1].baseSeguros).toBeNull();
  });

  it("el interruptor de la FICHA manda: la parte puede apagar los seguros, nunca encenderlos", () => {
    const apagados = PARTES.map((p) =>
      armarLinea(ficha({ reparto: PARTES, pagaSeguros: false }), HORAS_AGOSTO, MANUALES_CERO, R, 1, null, {}, p),
    );
    for (const l of apagados) {
      expect(l.dinero!.seguroSocial).toBe(0);
      expect(l.dinero!.seguroEducativo).toBe(0);
      expect(l.pagaSeguros).toBe(false);
    }
  });
});

describe("armarPlanilla — dos líneas, una en cada cuadro", () => {
  // 🔑 Una persona con CERO días: el motor la mide (o sea, produce dinero) sin
  // que ninguna hora ensucie los quincenales que se están comparando. Sin ella
  // la línea caería en «no marcó ni un día» y `dinero` sería `null`.
  const marco = [{ codigo: JULIO, etiqueta: "JULIO GARAY", nombre: "JULIO GARAY", dias: [] }] as never[];

  const opts = (empresa: string | null, reparto: readonly ParteReparto[]) => ({
    personas: marco,
    fichas: new Map<string, FichaPlanilla>([[JULIO, ficha({ reparto: [...reparto] })]]),
    jornadaDiariaMin: () => 480,
    reglas: R,
    empresa,
  });

  it("aparece en el cuadro de Vistana Y en el de Fashion Wear", () => {
    const v = armarPlanilla(opts("vistana", PARTES));
    const f = armarPlanilla(opts("fashion_wear", PARTES));
    expect(v.filter((l) => l.codigo === JULIO)).toHaveLength(1);
    expect(f.filter((l) => l.codigo === JULIO)).toHaveLength(1);
    expect(v[0].parte!.empresa).toBe("vistana");
    expect(f[0].parte!.empresa).toBe("fashion_wear");
  });

  it("⚠️ no aparece en el cuadro de una empresa que no es suya", () => {
    expect(armarPlanilla(opts("confecciones_boston", PARTES)).filter((l) => l.codigo === JULIO)).toHaveLength(0);
  });

  it("pedido «todas las empresas», salen las DOS líneas", () => {
    expect(armarPlanilla(opts(null, PARTES)).filter((l) => l.codigo === JULIO)).toHaveLength(2);
  });

  it("🔴 con un reparto RECHAZADO vuelve a UNA sola línea, en su empresa", () => {
    const roto = [PARTES[0], { ...PARTES[1], salarioMensual: 100 }];
    const v = armarPlanilla(opts("vistana", roto));
    const f = armarPlanilla(opts("fashion_wear", roto));
    expect(v).toHaveLength(1);
    expect(v[0].parte).toBeNull();
    expect(v[0].dinero!.salarioQuincenal).toBe(500);
    expect(f).toHaveLength(0);
  });

  it("los TOTALES del cuadro suman lo de cada parte, sin duplicar", () => {
    const v = totalizar(armarPlanilla(opts("vistana", PARTES)));
    const f = totalizar(armarPlanilla(opts("fashion_wear", PARTES)));
    expect(v.salarioQuincenal).toBe(400);
    expect(f.salarioQuincenal).toBe(100);
    expect(centavos(v.salarioQuincenal + f.salarioQuincenal)).toBe(500);
  });
});

describe("cuando el sistema SE ABSTIENE, la cifra que se muestra es la de ESA empresa", () => {
  it("🔴 el quincenal de referencia sale de la PARTE, no del sueldo completo", () => {
    // Alguien que entró a mitad del período: el motor no calcula pago y muestra
    // lo que le TOCARÍA. Con el sueldo completo, quien decide la línea de $200
    // pagaría $500 donde van $100.
    const ls = PARTES.map((p) =>
      armarLinea(ficha({ reparto: PARTES }), HORAS_AGOSTO, MANUALES_CERO, R, 1, "entró el 10 de agosto de 2026", {}, p),
    );
    expect(ls[0].dinero).toBeNull();
    expect(ls[0].quincenalReferencia).toBe(400);
    expect(ls[1].quincenalReferencia).toBe(100);
    // Sin reparto sigue siendo el de siempre.
    const entera = armarLinea(ficha(), HORAS_AGOSTO, MANUALES_CERO, R, 1, "entró el 10 de agosto de 2026");
    expect(entera.quincenalReferencia).toBe(500);
  });
});

describe("🔴 SIN REPARTO NO SE MUEVE UN CENTAVO", () => {
  const casos: Array<[string, HorasPersona]> = [
    ["agosto", HORAS_AGOSTO],
    ["julio 2", HORAS_JULIO2],
    ["sin horas", { ...HORAS_CERO, jornadaDiariaMin: 480 }],
  ];

  it("`armarLinea` sin `parte` da lo mismo, campo por campo", () => {
    for (const [nombre, horas] of casos) {
      const a = armarLinea(ficha(), horas, MANUALES_CERO, R, 1);
      const b = armarLinea(ficha({ reparto: [] }), horas, MANUALES_CERO, R, 1, null, {}, null);
      expect(`${nombre}: ${JSON.stringify(b.dinero)}`).toBe(`${nombre}: ${JSON.stringify(a.dinero)}`);
      expect(b.horas).toEqual(a.horas);
      expect(b.parte).toBeNull();
      expect(b.empresa).toBe("vistana");
    }
  });

  it("`armarPlanilla` con las fichas de siempre produce UNA línea por persona", () => {
    const fichas = new Map<string, FichaPlanilla>([
      [JULIO, ficha()],
      ["7", ficha({ codigo: "7", nombre: "ANGELA", salarioMensual: 600 })],
    ]);
    const l = armarPlanilla({ personas: [], fichas, jornadaDiariaMin: () => 480, reglas: R, empresa: "vistana" });
    expect(l).toHaveLength(2);
    for (const x of l) expect(x.parte).toBeNull();
  });
});

describe("🔴 NADIE MÁS SE MUEVE al repartir a Julio", () => {
  const otra = ficha({ codigo: "7", nombre: "ANGELA GARCIA", salarioMensual: 600 });

  it("la línea de la otra persona es idéntica, campo por campo", () => {
    const base = new Map<string, FichaPlanilla>([[JULIO, ficha()], ["7", otra]]);
    const con = new Map<string, FichaPlanilla>([[JULIO, ficha({ reparto: PARTES })], ["7", otra]]);
    const args = { personas: [], jornadaDiariaMin: () => 480, reglas: R, empresa: "vistana" as const };
    const antes = armarPlanilla({ ...args, fichas: base }).find((l) => l.codigo === "7")!;
    const despues = armarPlanilla({ ...args, fichas: con }).find((l) => l.codigo === "7")!;
    expect(JSON.stringify(despues)).toBe(JSON.stringify(antes));
  });
});

describe("Aprobaciones — la lista dice DÓNDE se pagan las extras", () => {
  // Un día REAL: entra 08:00 y sale 18:00 en Panamá → hay hora extra que aprobar.
  const personas = armarReporte({
    marcaciones: [
      { empleado_codigo: JULIO, empleado_nombre: "JULIO GARAY", ocurrio_en: "2026-08-03T13:00:00.000Z" },
      { empleado_codigo: JULIO, empleado_nombre: "JULIO GARAY", ocurrio_en: "2026-08-03T23:00:00.000Z" },
    ],
    horarios: [{ empleado_codigo: JULIO, entrada: "08:00", salida: "17:00", almuerzo_minutos: 30 }],
    justificaciones: [],
    vacaciones: [],
    feriados: new Map(),
    desde: "2026-08-03",
    hasta: "2026-08-03",
    reglas: R,
    nombres: new Map([[JULIO, "JULIO GARAY"]]),
    incluirNoHabiles: true,
  } as never);

  const lineas = PARTES.map((p) =>
    armarLinea(ficha({ reparto: PARTES }), HORAS_AGOSTO, MANUALES_CERO, R, 1, null, {}, p),
  );

  it("hay algo que aprobar (si no, el resto del bloque no probaría nada)", () => {
    const dias = armarDiasAprobacion({ lineas, personas, reglas: R, aprobaciones: new Map() });
    expect(dias.flatMap((d) => d.gente).filter((g) => g.codigo === JULIO).length).toBeGreaterThan(0);
  });

  it("🔴 gana la línea que PAGA las horas extra, venga en el orden que venga", () => {
    // 🩸 Sin este caso el candado no valía: en el orden natural la parte de las
    // extras cae ÚLTIMA, así que un `new Map(...)` a secas —que se queda con la
    // última— da lo mismo que la regla buena. Se prueba con el orden INVERTIDO.
    for (const orden of [lineas, [lineas[1], lineas[0]]]) {
      const dias = armarDiasAprobacion({ lineas: orden, personas, reglas: R, aprobaciones: new Map() });
      const gente = dias.flatMap((d) => d.gente).filter((g) => g.codigo === JULIO);
      expect(gente.length).toBeGreaterThan(0);
      for (const g of gente) {
        expect(g.empresa).toBe("fashion_wear");
        expect(g.empresaEtiqueta).toBe("Fashion Wear");
      }
    }
  });

  it("sin reparto, la única línea manda como siempre", () => {
    const una = [armarLinea(ficha(), HORAS_AGOSTO, MANUALES_CERO, R, 1)];
    const dias = armarDiasAprobacion({ lineas: una, personas, reglas: R, aprobaciones: new Map() });
    for (const g of dias.flatMap((d) => d.gente)) expect(g.empresa).toBe("vistana");
  });
});

describe("las palabras y el aviso de la migración", () => {
  it("el modo de cada parte sale de si paga seguros", () => {
    expect(modoDeParte(PARTES[0])).toBe("Planilla");
    expect(modoDeParte(PARTES[1])).toBe("Servicios profesionales");
  });

  it("el aviso NOMBRA el archivo que hay que correr", () => {
    expect(avisoMigracionReparto()).toContain(MIGRACION_REPARTO);
    expect(MIGRACION_REPARTO).toMatch(/^\d{14}_.*\.sql$/);
    expect(TABLA_REPARTO).toBe("asistencia_reparto_empresa");
  });

  it("🔴 lo que el guard rechazó se DICE, con nombre y motivo", () => {
    expect(textoRepartoRechazado([])).toBeNull();
    const uno = textoRepartoRechazado([{ codigo: JULIO, etiqueta: "JULIO GARAY", motivo: "las partes suman $900.00" }])!;
    expect(uno).toContain("JULIO GARAY");
    expect(uno).toContain("$900.00");
    expect(uno).toContain("una sola planilla");
    const dos = textoRepartoRechazado([
      { codigo: JULIO, etiqueta: "JULIO GARAY", motivo: "a" },
      { codigo: "7", etiqueta: "ANGELA", motivo: "b" },
    ])!;
    expect(dos).toContain("2 sueldos repartidos");
  });
});

describe("la migración es aditiva y no toca lo que ya está", () => {
  const sql = require("node:fs").readFileSync(
    require("node:path").join(process.cwd(), "supabase/migrations", MIGRACION_REPARTO),
    "utf8",
  ) as string;
  /** 🩸 Los comentarios se borran PRIMERO: este archivo NOMBRA en prosa lo que
   *  el barrido prohíbe, y un candado que se cumple con su propia explicación
   *  da permiso para romper. Ya pasó cuatro veces en este repo. */
  const codigo = sql.replace(/--.*$/gm, "");

  it("no borra ni reescribe nada", () => {
    expect(codigo).not.toMatch(/DROP\s+TABLE/i);
    expect(codigo).not.toMatch(/TRUNCATE/i);
    expect(codigo).not.toMatch(/DELETE\s+FROM/i);
  });

  it("🔴 NO toca `asistencia_personas` — el salario de Julio sigue en $1.000", () => {
    expect(codigo).not.toMatch(/UPDATE\s+asistencia_personas/i);
    expect(codigo).not.toMatch(/ALTER\s+TABLE\s+asistencia_personas/i);
  });

  it("no toca los montos escritos a mano de una quincena vieja", () => {
    expect(codigo).not.toMatch(/asistencia_planilla_manual/i);
  });

  it("crea la tabla y el índice de «una sola parte paga las extras»", () => {
    expect(codigo).toMatch(/CREATE TABLE IF NOT EXISTS asistencia_reparto_empresa/i);
    expect(codigo).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS asistencia_reparto_una_extra/i);
    expect(codigo).toMatch(/WHERE paga_horas_extra/i);
    expect(codigo).toMatch(/ENABLE ROW LEVEL SECURITY/i);
  });

  it("siembra las DOS filas de Julio, con los montos de la contadora", () => {
    expect(codigo).toMatch(/'11',\s*'vistana',\s*800\.00,\s*true,\s*false/);
    expect(codigo).toMatch(/'11',\s*'fashion_wear',\s*200\.00,\s*false,\s*true/);
    // Idempotente: correrla dos veces deja lo mismo.
    expect((codigo.match(/ON CONFLICT \(empleado_codigo, empresa\) DO UPDATE/g) ?? []).length).toBe(2);
  });
});
