/* ─────────────────────────────────────────────────────────────────────────────
 * EL DÍA LIBRE DE LA EMPRESA — el candado (17-sep-2026).
 *
 * Daniel, textual: *«en las fiestas judías hay días libres, dentro de las
 * jornadas ordinarias, que son libres para el colaborador, pero se pagan con el
 * tiempo de horas extra»* · *«se le paga ese día pero deben las horas laborales
 * (8 horas para todos)»* · *«debe de ser el dólares pienso, porque no todas las
 * horas valen igual»* · *«queda debiendo para la próxima quincena hasta cancelar
 * la deuda de horas»* · *«arrastra para siempre hasta que haga horas extra»* ·
 * *«[si se va debiendo, se le descuenta de la liquidación] no»*.
 *
 * Lo que este archivo NO deja que se rompa:
 *   1. el día se paga completo (no es ausencia, no descuenta el sueldo);
 *   2. la deuda son 8 × la rata de ESA persona, en dólares y congelada;
 *   3. se cobra SOLO con horas extra, y el tope es el extra — nunca el neto;
 *   4. lo que no alcanza ARRASTRA, sin límite;
 *   5. sin deuda cargada, NADA se mueve (es la medición contra producción);
 *   6. «Día libre de la empresa» y «Compensatorio» no se confunden;
 *   7. sin la migración, todo se comporta como el día anterior.
 *
 * 🔑 Medido contra producción el 17-sep-2026 (1–15 sep, corte 10-sep,
 * `scripts/_medir-vs-yulissa.ts`): sin ninguna deuda cargada, las 46 líneas dan
 * el MISMO neto, $11.314,29, hasta el centavo. Con un día libre cargado a SAMIR
 * POLO (42, rata $3,02): su extra de $6,28 se va a cero, queda debiendo $17,88
 * y NADIE MÁS se mueve.
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, expect, it } from "vitest";

import {
  aplicarDiaLibreEnLinea,
  avisoMigracionDiaLibre,
  COLUMNAS_DE_EXTRA,
  deudaDelDiaLibre,
  diasHabilesDelRango,
  diasLibresDelCuadro,
  esTablaDiaLibreFaltante,
  extraDeLaQuincena,
  HORAS_DEL_DIA_LIBRE,
  MIGRACION_DIA_LIBRE,
  saldosDiaLibre,
  textoDiaLibreCelda,
  textoDiasLibres,
  textoSaldoDiaLibre,
  TITULO_DIA_LIBRE,
  type SaldoDiaLibre,
} from "@/lib/asistencia/dia-libre-empresa";
import {
  esDiaLibreDeLaEmpresa,
  MOTIVO_COMPENSATORIO,
  MOTIVO_DIA_LIBRE_EMPRESA,
  MOTIVOS_JUSTIFICACION,
  motivoSeOfrece,
  notaDelMotivo,
  textoDiaJustificado,
} from "@/lib/asistencia/motivos";
import { motivoAdmiteHoras } from "@/lib/asistencia/permiso-horas";
import { diaLibreRoles, puedeCargarDiaLibre } from "@/lib/asistencia/roles";
import { rataPorHoraCalculo } from "@/lib/asistencia/rata";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import type { DineroLinea } from "@/lib/asistencia/planilla";

// ─────────────────────────────────────────────────────────────────────────────
// Un `DineroLinea` de juguete, con los números de SAMIR POLO (42) medidos el
// 17-sep-2026: rata $3,02, extra diurna $6,28, neto $265,62.
// ─────────────────────────────────────────────────────────────────────────────

function dinero(over: Partial<DineroLinea> = {}): DineroLinea {
  const base: DineroLinea = {
    rataHora: 3.02, valorMinuto: 3.02 / 60, salarioQuincenal: 275,
    extraDiurno: 6.28, extraNocturno: 0, excedente: 0, domingos: 0, feriados: 0,
    ausencias: 0, ausenciaPorTardanza: 0, ausenciaDeDiaCompleto: 0,
    vacacionesYaPagadas: 0, tardanzas: 0, salidaTemprana: 0,
    totalBruto: 281.28, baseSeguros: null, seguroSocial: 0, seguroEducativo: 0,
    isr: 0, prestamo: 0, terceros: 0, mercancia: 0,
    totalDeducciones: 0, otrosServicios: 0, netoPagar: 281.28,
  };
  return { ...base, ...over };
}

const linea = (d: DineroLinea | null, extra: Record<string, unknown> = {}) => ({
  codigo: "42", etiqueta: "SAMIR POLO ARRIETA", dinero: d, ...extra,
});

const saldo = (queda: number, pagado = 0): SaldoDiaLibre => ({
  codigo: "42", debia: queda + pagado, pagado, queda,
});

// ═════════════════════════════════════════════════════════════════════════════
describe("1. LA DEUDA — 8 horas, EN DÓLARES, con la rata de esa persona", () => {
  it("son OCHO horas para todos, no la jornada de la ficha", () => {
    expect(HORAS_DEL_DIA_LIBRE).toBe(8);
  });

  it("8 × rata, a centavos: con $3,02 la deuda es $24,16", () => {
    expect(deudaDelDiaLibre(3.02)).toBe(24.16);
    expect(deudaDelDiaLibre(3.61)).toBe(28.88);
  });

  // 🔴 La rata sale de `rata.ts` y NO de una segunda cuenta de este módulo: es
  // la MISMA por la que se multiplican las horas extra.
  it("🔴 la rata es la del módulo, no una propia", () => {
    const r = rataPorHoraCalculo(600, 48, REGLAS_DEFAULT);
    expect(r).not.toBeNull();
    expect(deudaDelDiaLibre(r)).toBe(Math.round(8 * (r as number) * 100) / 100);
  });

  // 🔴 Sin rata NO es cero: un cero se leería como «no debe nada» y el día se
  // habría regalado dos veces —el día y las horas— sin que nadie lo viera.
  it("🔴 sin rata usable devuelve null, NUNCA 0", () => {
    for (const r of [null, undefined, 0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(deudaDelDiaLibre(r as number), String(r)).toBeNull();
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("2. LOS DÍAS — solo los hábiles, y el rango tiene tope", () => {
  it("un lunes suelto es un día; el sábado y el domingo no cuentan", () => {
    expect(diasHabilesDelRango("2026-09-07", "2026-09-07")).toEqual(["2026-09-07"]);
    // 12 y 13 de septiembre de 2026 son sábado y domingo.
    expect(diasHabilesDelRango("2026-09-11", "2026-09-14"))
      .toEqual(["2026-09-11", "2026-09-14"]);
  });

  it("un rango al revés no da ningún día", () => {
    expect(diasHabilesDelRango("2026-09-10", "2026-09-01")).toEqual([]);
  });

  it("una fecha que no es fecha no da días", () => {
    expect(diasHabilesDelRango("no-es", "2026-09-01")).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("3. EL SALDO — arrastra, y nunca queda en negativo", () => {
  it("suma lo que nació y resta lo que ya se pagó", () => {
    const s = saldosDiaLibre(
      [
        { empleado_codigo: "42", fecha: "2026-05-22", monto: 18.5 },
        { empleado_codigo: "42", fecha: "2026-09-07", monto: 24.16 },
        { empleado_codigo: "28", fecha: "2026-05-22", monto: 97.46 },
      ],
      [
        { empleado_codigo: "42", quincena: "2026-06-1", monto: 5.66 },
        { empleado_codigo: "28", quincena: "2026-06-1", monto: 43.77 },
      ],
    );
    expect(s.get("42")).toEqual({ codigo: "42", debia: 42.66, pagado: 5.66, queda: 37 });
    // 🔑 Los dos saldos VIVOS medidos en el Excel de la contadora el 17-sep-2026.
    expect(s.get("28")).toEqual({ codigo: "28", debia: 97.46, pagado: 43.77, queda: 53.69 });
  });

  it("🔴 pagada de más, el saldo queda en 0 y no en negativo", () => {
    const s = saldosDiaLibre(
      [{ empleado_codigo: "42", fecha: "2026-05-22", monto: 18.5 }],
      [{ empleado_codigo: "42", quincena: "2026-06-1", monto: 30 }],
    );
    expect(s.get("42")!.queda).toBe(0);
  });

  it("sin deudas no hay saldos", () => {
    expect(saldosDiaLibre([], []).size).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("4. EL COBRO — SOLO con horas extra, y el tope es el extra", () => {
  // 🔴 EL CASO MEDIDO CONTRA PRODUCCIÓN. Samir (42): extra $6,28, deuda $24,16.
  it("🔴 SAMIR: su extra de $6.28 se va a CERO y queda debiendo $17.88", () => {
    const l = aplicarDiaLibreEnLinea(linea(dinero()), saldo(24.16));
    expect(l.dinero!.extraDiurno).toBe(0);
    expect(l.diaLibre).toEqual({
      saldoAntes: 24.16, pagado: 6.28, queda: 17.88, consumido: { extraDiurno: 6.28 },
    });
    // El bruto y el neto bajan EXACTAMENTE lo que se cobró, ni un centavo más.
    expect(l.dinero!.totalBruto).toBe(275);
    expect(l.dinero!.netoPagar).toBe(275);
  });

  // 🔴 EL CANDADO DE TODO ESTO: si no hizo horas extra, NO se le cobra nada —
  // pase lo que pase con su neto. Nunca sale del sueldo.
  it("🔴 sin horas extra no se cobra NI UN CENTAVO, y el neto no se mueve", () => {
    const d = dinero({ extraDiurno: 0, totalBruto: 275, netoPagar: 275 });
    const l = aplicarDiaLibreEnLinea(linea(d), saldo(24.16));
    expect(l.dinero!.netoPagar).toBe(275);
    expect(l.dinero!.totalBruto).toBe(275);
    expect(l.diaLibre).toEqual({ saldoAntes: 24.16, pagado: 0, queda: 24.16, consumido: {} });
  });

  it("🔴 el extra que SOBRA se le paga: deuda chica, extra grande", () => {
    const d = dinero({ extraDiurno: 40, totalBruto: 315, netoPagar: 315 });
    const l = aplicarDiaLibreEnLinea(linea(d), saldo(24.16));
    expect(l.dinero!.extraDiurno).toBe(15.84);
    expect(l.dinero!.netoPagar).toBe(290.84);
    expect(l.diaLibre!.queda).toBe(0);
  });

  it("las CINCO columnas del extra pagan, en orden, hasta cubrir la deuda", () => {
    const d = dinero({
      extraDiurno: 5, extraNocturno: 5, excedente: 5, domingos: 5, feriados: 5,
      totalBruto: 300, netoPagar: 300,
    });
    const l = aplicarDiaLibreEnLinea(linea(d), saldo(18));
    expect(l.diaLibre!.pagado).toBe(18);
    expect(l.dinero!.extraDiurno).toBe(0);
    expect(l.dinero!.extraNocturno).toBe(0);
    expect(l.dinero!.excedente).toBe(0);
    expect(l.dinero!.domingos).toBe(2);
    expect(l.dinero!.feriados).toBe(5);
    // La suma no cambia por el orden: lo que se cobró es lo que bajó el bruto.
    expect(l.dinero!.totalBruto).toBe(282);
  });

  it("extraDeLaQuincena suma las cinco y nada más", () => {
    expect(COLUMNAS_DE_EXTRA).toEqual([
      "extraDiurno", "extraNocturno", "excedente", "domingos", "feriados",
    ]);
    const d = dinero({
      extraDiurno: 1, extraNocturno: 2, excedente: 3, domingos: 4, feriados: 5,
      // Lo que NO es hora extra no entra: el sueldo quincenal ni los servicios.
      salarioQuincenal: 500, otrosServicios: 99,
    });
    expect(extraDeLaQuincena(d)).toBe(15);
    expect(extraDeLaQuincena(null)).toBe(0);
  });

  // 🔴 Sin deuda, la línea vuelve TAL CUAL: es lo que hace que las 46 líneas de
  // producción no se muevan ni un centavo.
  it("🔴 sin deuda la línea vuelve con la MISMA referencia y sin `diaLibre`", () => {
    const l0 = linea(dinero());
    expect(aplicarDiaLibreEnLinea(l0, undefined)).toBe(l0);
    expect(aplicarDiaLibreEnLinea(l0, saldo(0))).toBe(l0);
    expect(aplicarDiaLibreEnLinea(l0, null)).toBe(l0);
    expect((aplicarDiaLibreEnLinea(l0, saldo(0)) as { diaLibre?: unknown }).diaLibre)
      .toBeUndefined();
  });

  it("a quien no se le calcula dinero no se le cobra nada", () => {
    const l0 = linea(null);
    expect(aplicarDiaLibreEnLinea(l0, saldo(24.16))).toBe(l0);
  });

  it("los seguros se recalculan sobre el bruto SIN esas horas", () => {
    const d = dinero({ seguroSocial: 27.42, seguroEducativo: 3.52, totalDeducciones: 30.94, netoPagar: 250.34 });
    const l = aplicarDiaLibreEnLinea(linea(d, { pagaSeguros: true }), saldo(24.16), {
      seguroSocialPct: 9.75, seguroEducativoPct: 1.25,
    });
    expect(l.dinero!.totalBruto).toBe(275);
    expect(l.dinero!.seguroSocial).toBe(26.81);
    expect(l.dinero!.seguroEducativo).toBe(3.44);
  });

  it("⚠️ con los seguros apagados no se tocan", () => {
    const d = dinero({ seguroSocial: 0, seguroEducativo: 0 });
    const l = aplicarDiaLibreEnLinea(linea(d, { pagaSeguros: false }), saldo(24.16), {
      seguroSocialPct: 9.75, seguroEducativoPct: 1.25,
    });
    expect(l.dinero!.seguroSocial).toBe(0);
    expect(l.dinero!.seguroEducativo).toBe(0);
  });

  it("⚠️ con base propia el seguro no sale del bruto: no cambia", () => {
    const d = dinero({ baseSeguros: 175, seguroSocial: 17.06, seguroEducativo: 2.19 });
    const l = aplicarDiaLibreEnLinea(linea(d, { pagaSeguros: true }), saldo(24.16), {
      seguroSocialPct: 9.75, seguroEducativoPct: 1.25,
    });
    expect(l.dinero!.seguroSocial).toBe(17.06);
    expect(l.dinero!.seguroEducativo).toBe(2.19);
  });

  // 🔴 ARRASTRA. Dos quincenas seguidas con poco extra van bajando la deuda y
  // lo que falta sigue vivo: no caduca ni se perdona.
  it("🔴 ARRASTRA entre quincenas hasta saldar", () => {
    const q1 = aplicarDiaLibreEnLinea(linea(dinero()), saldo(24.16));
    expect(q1.diaLibre!.queda).toBe(17.88);
    const q2 = aplicarDiaLibreEnLinea(linea(dinero({ extraDiurno: 10 })), saldo(17.88));
    expect(q2.diaLibre!.queda).toBe(7.88);
    const q3 = aplicarDiaLibreEnLinea(linea(dinero({ extraDiurno: 10 })), saldo(7.88));
    expect(q3.diaLibre!.queda).toBe(0);
    expect(q3.diaLibre!.pagado).toBe(7.88);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("5. EL MOTIVO — se ofrece, se paga, y NO se confunde con el compensatorio", () => {
  it("está en la lista que ofrece la pantalla", () => {
    expect(MOTIVO_DIA_LIBRE_EMPRESA).toBe("Día libre de la empresa");
    expect(MOTIVOS_JUSTIFICACION as readonly string[]).toContain(MOTIVO_DIA_LIBRE_EMPRESA);
    expect(motivoSeOfrece(MOTIVO_DIA_LIBRE_EMPRESA)).toBe(true);
    expect(esDiaLibreDeLaEmpresa(MOTIVO_DIA_LIBRE_EMPRESA)).toBe(true);
  });

  // 🔑 Igualdad EXACTA, nunca por parecido: un motivo escrito a mano parecido
  // («día libre») no es éste y no puede crear una deuda.
  it("🔴 se reconoce por igualdad exacta, nunca por parecido", () => {
    for (const m of ["día libre", "Dia libre de la empresa", "Compensatorio", "", null, undefined, 7]) {
      expect(esDiaLibreDeLaEmpresa(m as string), String(m)).toBe(false);
    }
    expect(esDiaLibreDeLaEmpresa(" Día libre de la empresa ")).toBe(true);
  });

  // 🔴 LOS DOS TEXTOS TIENEN QUE LEERSE DISTINTO. Uno es un libre que la empresa
  // DEBÍA (gratis) y el otro uno que REGALA (deja debiendo 8 horas).
  it("🔴 su nota y la del compensatorio no se parecen", () => {
    const nota = notaDelMotivo(MOTIVO_DIA_LIBRE_EMPRESA)!;
    const comp = notaDelMotivo(MOTIVO_COMPENSATORIO)!;
    expect(nota).not.toBe(comp);
    expect(nota).toMatch(/8 horas/);
    expect(nota).toMatch(/horas extra/);
    expect(comp).not.toMatch(/8 horas/);
  });

  // 🔴 NO ES UNA AUSENCIA: el día se pagó completo.
  it("🔴 el renglón del día no dice «ausencia»", () => {
    const t = textoDiaJustificado(MOTIVO_DIA_LIBRE_EMPRESA);
    expect(t.toLowerCase()).not.toContain("ausencia");
    expect(t).toMatch(/debiendo/);
    expect(t).not.toBe(textoDiaJustificado(MOTIVO_COMPENSATORIO));
  });

  // Es de DÍA COMPLETO: las horas siguen siendo solo de «Constancia».
  it("no admite un rango de horas", () => {
    expect(motivoAdmiteHoras(MOTIVO_DIA_LIBRE_EMPRESA)).toBe(false);
  });

  // 🔴 Lo carga contabilidad y admin, no la secretaria (Daniel).
  it("🔴 lo cargan contabilidad y admin, nadie más", () => {
    expect(diaLibreRoles().sort()).toEqual(["admin", "contabilidad"]);
    expect(puedeCargarDiaLibre("admin")).toBe(true);
    expect(puedeCargarDiaLibre("contabilidad")).toBe(true);
    for (const r of ["secretaria", "bodega", "vendedor", "gerente_boston"]) {
      expect(puedeCargarDiaLibre(r), r).toBe(false);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("6. LO QUE SE DICE — nada se descuenta en silencio", () => {
  it("la ficha dice cuánto debe, y que se paga con horas extra", () => {
    const t = textoSaldoDiaLibre(saldo(17.88))!;
    expect(t).toContain("$17.88");
    expect(t).toMatch(/horas extra/);
  });

  it("sin deuda no dice nada: un «$0.00» es ruido", () => {
    expect(textoSaldoDiaLibre(saldo(0))).toBeNull();
    expect(textoSaldoDiaLibre(null)).toBeNull();
  });

  it("la celda dice cuánto pagó y cuánto queda", () => {
    const l = aplicarDiaLibreEnLinea(linea(dinero()), saldo(24.16));
    const t = textoDiaLibreCelda(l.diaLibre)!;
    expect(t).toContain("$6.28");
    expect(t).toContain("$17.88");
  });

  it("la celda también habla cuando NO se cobró nada", () => {
    const l = aplicarDiaLibreEnLinea(linea(dinero({ extraDiurno: 0 })), saldo(24.16));
    expect(textoDiaLibreCelda(l.diaLibre)!).toMatch(/no hizo horas extra/);
    expect(textoDiaLibreCelda(null)).toBeNull();
  });

  it("«Antes de cerrar» nombra a cada uno con su monto; sin nadie, null", () => {
    const l = aplicarDiaLibreEnLinea(linea(dinero()), saldo(24.16));
    const items = diasLibresDelCuadro([l]);
    expect(items).toEqual([{ codigo: "42", etiqueta: "SAMIR POLO ARRIETA", pagado: 6.28, queda: 17.88 }]);
    const t = textoDiasLibres(items)!;
    expect(t).toContain("SAMIR POLO ARRIETA");
    expect(t).toContain("$17.88");
    expect(textoDiasLibres([])).toBeNull();
  });

  it("el título explica que NUNCA sale del sueldo", () => {
    expect(TITULO_DIA_LIBRE).toMatch(/horas extra/i);
    expect(TITULO_DIA_LIBRE).toMatch(/[Nn]unca sale del sueldo/);
  });

  // 🔴 Español neutro, tuteo. Nunca voseo (hay barrido, y acá también).
  it("🔴 los textos no tienen voseo", () => {
    const todos = [
      TITULO_DIA_LIBRE, avisoMigracionDiaLibre(),
      notaDelMotivo(MOTIVO_DIA_LIBRE_EMPRESA)!,
      textoSaldoDiaLibre(saldo(10))!,
    ].join(" ");
    expect(todos).not.toMatch(/\b(elegí|escribí|revisá|guardá|tocá|mirá|acá|tenés|podés|vos)\b/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("7. SIN LA MIGRACIÓN — todo se comporta como el día anterior", () => {
  it("el aviso nombra el archivo que hay que correr", () => {
    expect(MIGRACION_DIA_LIBRE).toBe("20261203120000_asistencia_dia_libre_empresa.sql");
    expect(avisoMigracionDiaLibre()).toContain(MIGRACION_DIA_LIBRE);
  });

  it("reconoce que la tabla no existe, por código y por texto", () => {
    expect(esTablaDiaLibreFaltante({ code: "42P01", message: 'relation "asistencia_dia_libre_deuda" does not exist' })).toBe(true);
    expect(esTablaDiaLibreFaltante({ code: "PGRST205", message: "asistencia_dia_libre_pago not found in schema cache" })).toBe(true);
  });

  // 🔴 El error tiene que NOMBRAR una de las dos tablas. Tragarse cualquier
  // error convertiría un permiso denegado en «falta la migración», y una deuda
  // que desaparece en silencio.
  it("🔴 un error que no nombra la tabla NO se lee como «falta la migración»", () => {
    expect(esTablaDiaLibreFaltante({ code: "42501", message: "permission denied for table otra_cosa" })).toBe(false);
    expect(esTablaDiaLibreFaltante({ code: "42P01", message: 'relation "otra_cosa" does not exist' })).toBe(false);
    expect(esTablaDiaLibreFaltante(null)).toBe(false);
    expect(esTablaDiaLibreFaltante(undefined)).toBe(false);
  });
});
