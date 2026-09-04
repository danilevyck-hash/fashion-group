/* ─────────────────────────────────────────────────────────────────────────────
 * EL AVISO «N PERSONAS TIENEN HORAS EXTRA SIN APROBAR» — y el freno del cierre.
 *
 * 🩸 El defecto (arreglado el 3-sep-2026): el aviso ámbar de la planilla y el
 * freno para cerrar la quincena salían de `extrasNoAprobadas`, que leía
 * `extraMedido`. Pero `extraMedido` se arma con las horas que `medirHoras` YA
 * dejó sin los días no aprobados —lo no aprobado quedaba apartado en
 * `horas.extraNoAprobadaMin` y nadie lo llevaba a la línea—. Resultado:
 *
 *   · todo sin aprobar  → `extraMedido` null → NI aviso NI freno. Se podía
 *     cerrar la quincena con extras sin aprobar, «sin forma de arreglarlo
 *     después sin reabrir» (texto del propio freno).
 *   · parcial (martes sí, miércoles no) → el aviso decía los minutos del
 *     MARTES —los pagados— como «sin aprobar». Número equivocado.
 *
 * 🔴 LO QUE SE PRUEBA ACÁ, CON EL MOTOR REAL (`armarPlanilla`, sin mocks):
 *
 *   a. todo sin aprobar → el aviso trae a la persona con TODOS sus minutos,
 *      el freno `horas-extra` sale, y `extraMedido` es null.
 *   b. parcial → `extraMedido` = solo el martes, `extraNoAprobada` = solo el
 *      miércoles, y el aviso dice los del miércoles.
 *   c. CONTROL: todo aprobado → aviso vacío, sin freno.
 *   d. `exigirAprobacionExtra = false` → nada sin aprobar (se paga todo).
 *   e. el MONTO del aviso es EXACTAMENTE lo que la planilla pagaría al aprobar
 *      —misma rata, mismos recargos 1,25 / 1,50—, centavo por centavo.
 *   f. con el sueldo repartido en dos empresas, el aviso sale UNA vez: en la
 *      línea que pagaría las extras.
 *   g. 🔴 SERVICIO PROFESIONAL (3-sep-2026). Daniel: *«yulisa marca pero no
 *      deberia de calcular ya que es salario fijo, es solo para ver sus
 *      tardanzas y ausencias»*. Con extras sin aprobar → NO está en el aviso ni
 *      en el freno, `extraMedido` y `extraNoAprobada` en null, las columnas con
 *      recargo en cero; tardanza y ausencia INTACTAS; la pestaña Aprobaciones no
 *      la ofrece. CONTROL: la misma persona sin la bandera sí sale.
 *
 * Las fechas son fijas (agosto 2026): nunca `new Date()`.
 * ─────────────────────────────────────────────────────────────────────────── */
import { describe, it, expect } from "vitest";

import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import {
  armarPlanilla,
  centavos,
  medirHoras,
  type FichaPlanilla,
  type LineaPlanilla,
} from "@/lib/asistencia/planilla";
import type { PersonaReporte, DiaReporte } from "@/lib/asistencia/reporte";
import {
  armarDiasAprobacion,
  claveDia,
  extrasNoAprobadas,
  indexarAprobaciones,
  textoExtraNoAprobada,
} from "@/lib/asistencia/aprobaciones";
import { frenosParaCerrar } from "@/lib/asistencia/planilla-guardada";
import { partesDe, type FilaReparto } from "@/lib/asistencia/reparto";

// ── Andamiaje: un día que SALE TARDE, con marcas reales ──────────────────────
function dia(fecha: string, salida: string, extraMin: number): DiaReporte {
  return {
    fecha,
    marcas: ["08:00:00", "12:00:00", "12:30:00", `${salida}:00`],
    marcasIds: ["a", "b", "c", "d"],
    entrada: "08:00:00",
    salida: `${salida}:00`,
    tardeMin: 0, excesoAlmuerzoMin: 0, salidaTempranaMin: 0,
    extraMin, trabajadoMin: 480, revisar: false,
  } as unknown as DiaReporte;
}

function persona(codigo: string, dias: DiaReporte[]): PersonaReporte {
  return {
    codigo, nombre: `P${codigo}`, salida: "17:00", almuerzoMin: 30, dias,
    resumen: { diasTrabajados: dias.length, ausenciasSinJustificar: 0 },
  } as unknown as PersonaReporte;
}

const R = REGLAS_DEFAULT;
const COD = "1";
const MARTES = "2026-08-25";
const MIERCOLES = "2026-08-26";

const FICHA: FichaPlanilla = {
  codigo: COD, nombre: "KEVIN LUBO", salarioMensual: 1000,
  jornadaSemanal: 40, empresa: "fashion_wear",
};

/**
 * Martes: sale 17:22 → 22 min, todos DIURNOS (antes del corte de las 18:00).
 * Miércoles: sale 18:14 → 74 min: 60 diurnos + 14 NOCTURNOS (al 1,50).
 * El miércoles cruza el corte a propósito: es lo que hace que un recargo
 * equivocado se note en el monto.
 */
const P = persona(COD, [
  dia(MARTES, "17:22", 22),
  dia(MIERCOLES, "18:14", 74),
]);

function planilla(
  aprobados: string[],
  opts: { exigir?: boolean; fichas?: Map<string, FichaPlanilla>; empresa?: string | null } = {},
): LineaPlanilla[] {
  return armarPlanilla({
    personas: [P],
    fichas: opts.fichas ?? new Map([[COD, FICHA]]),
    jornadaDiariaMin: () => 480,
    reglas: R,
    empresa: opts.empresa ?? null,
    exigirAprobacionExtra: opts.exigir ?? true,
    diasExtraAprobados: new Set(aprobados.map((f) => claveDia(COD, f))),
  });
}

const pagado = (l: LineaPlanilla) =>
  centavos((l.dinero?.extraDiurno ?? 0) + (l.dinero?.extraNocturno ?? 0));

// ─────────────────────────────────────────────────────────────────────────────

describe("a. 🔴 todo sin aprobar → el aviso SALE y el cierre FRENA", () => {
  const lineas = planilla([]);
  const [l] = lineas;

  it("no se le pagó ni un minuto, y `extraMedido` es null", () => {
    expect(pagado(l)).toBe(0);
    expect(l.extraMedido).toBeNull();
    expect(l.extraAprobada).toBe(false);
  });

  it("`extraNoAprobada` trae los 96 minutos, con su desglose 82 diurnos + 14 nocturnos", () => {
    expect(l.extraNoAprobada).not.toBeNull();
    expect(l.extraNoAprobada!.minutos).toBeCloseTo(96, 6);
    expect(l.extraNoAprobada!.diurnoMin).toBeCloseTo(82, 6);
    expect(l.extraNoAprobada!.nocturnoMin).toBeCloseTo(14, 6);
    // Y las horas de la línea dicen lo mismo: es el MISMO dato.
    expect(l.horas.extraNoAprobadaMin).toBeCloseTo(96, 6);
    expect(l.horas.extraNoAprobadaDiurnoMin + l.horas.extraNoAprobadaNocturnoMin)
      .toBeCloseTo(l.horas.extraNoAprobadaMin, 6);
  });

  it("🔴 el aviso trae a la persona con ESOS minutos y su monto", () => {
    const aviso = extrasNoAprobadas(lineas);
    expect(aviso).toHaveLength(1);
    expect(aviso[0].codigo).toBe(COD);
    expect(aviso[0].etiqueta).toBe("KEVIN LUBO");
    expect(aviso[0].minutos).toBeCloseTo(96, 6);
    expect(aviso[0].monto).not.toBeNull();
    expect(aviso[0].monto!).toBeGreaterThan(0);

    const texto = textoExtraNoAprobada(aviso)!;
    expect(texto).toContain("1 persona tiene horas extra sin aprobar");
    expect(texto).toContain("KEVIN LUBO");
    expect(texto).toContain("1,60 h");
  });

  it("🔴 el cierre FRENA con el freno `horas-extra`", () => {
    const frenos = frenosParaCerrar(lineas, []);
    expect(frenos.map((f) => f.tipo)).toEqual(["horas-extra"]);
    expect(frenos[0].personas).toBe(1);
    expect(frenos[0].quienes).toEqual(["KEVIN LUBO"]);
    expect(frenos[0].texto).toContain("Aprobaciones");
  });
});

describe("b. 🔴 PARCIAL: martes aprobado, miércoles no", () => {
  const lineas = planilla([MARTES]);
  const [l] = lineas;

  it("`extraMedido` es SOLO el martes (22 min diurnos)", () => {
    expect(l.extraMedido).not.toBeNull();
    expect(l.extraMedido!.minutos).toBeCloseTo(22, 6);
    expect(l.extraMedido!.diurnoMin).toBeCloseTo(22, 6);
    expect(l.extraMedido!.nocturnoMin).toBe(0);
    expect(pagado(l)).toBe(l.extraMedido!.monto);
    expect(l.extraAprobada).toBe(false);
  });

  it("`extraNoAprobada` es SOLO el miércoles (60 diurnos + 14 nocturnos)", () => {
    expect(l.extraNoAprobada).not.toBeNull();
    expect(l.extraNoAprobada!.minutos).toBeCloseTo(74, 6);
    expect(l.extraNoAprobada!.diurnoMin).toBeCloseTo(60, 6);
    expect(l.extraNoAprobada!.nocturnoMin).toBeCloseTo(14, 6);
  });

  it("🩸 el aviso dice los del MIÉRCOLES, no los del martes", () => {
    const aviso = extrasNoAprobadas(lineas);
    expect(aviso).toHaveLength(1);
    expect(aviso[0].minutos).toBeCloseTo(74, 6);
    // El número viejo —los minutos PAGADOS— no puede volver a colarse.
    expect(aviso[0].minutos).not.toBeCloseTo(22, 6);
    expect(textoExtraNoAprobada(aviso)).toContain("1,23 h");
    expect(frenosParaCerrar(lineas, []).map((f) => f.tipo)).toEqual(["horas-extra"]);
  });

  it("pagado + sin aprobar = todo lo que midió el reloj", () => {
    const todo = medirHoras(P, R, 480);
    expect(l.extraMedido!.minutos + l.extraNoAprobada!.minutos)
      .toBeCloseTo(todo.extraDiurnoMin + todo.extraNocturnoMin, 6);
  });
});

describe("c. CONTROL: todo aprobado → sin aviso, sin freno", () => {
  const lineas = planilla([MARTES, MIERCOLES]);
  const [l] = lineas;

  it("se pagó todo y no quedó nada afuera", () => {
    expect(pagado(l)).toBeGreaterThan(0);
    expect(l.extraMedido!.minutos).toBeCloseTo(96, 6);
    expect(l.extraNoAprobada).toBeNull();
    expect(l.extraAprobada).toBe(true);
    expect(l.horas.extraNoAprobadaMin).toBe(0);
  });

  it("aviso vacío, texto null, cero frenos", () => {
    const aviso = extrasNoAprobadas(lineas);
    expect(aviso).toEqual([]);
    expect(textoExtraNoAprobada(aviso)).toBeNull();
    expect(frenosParaCerrar(lineas, [])).toEqual([]);
  });
});

describe("d. `exigirAprobacionExtra = false` → se paga todo, nada sin aprobar", () => {
  const lineas = planilla([], { exigir: false });
  const [l] = lineas;

  it("es el comportamiento de siempre: sin aviso y sin freno", () => {
    expect(pagado(l)).toBe(planilla([MARTES, MIERCOLES])[0].extraMedido!.monto);
    expect(l.extraNoAprobada).toBeNull();
    expect(l.extraAprobada).toBe(true);
    expect(extrasNoAprobadas(lineas)).toEqual([]);
    expect(frenosParaCerrar(lineas, [])).toEqual([]);
  });
});

describe("e. 🔴 el MONTO del aviso es lo que se pagaría al aprobar, al centavo", () => {
  it("lo no aprobado del miércoles vale EXACTAMENTE lo que paga aprobar solo el miércoles", () => {
    const sinMiercoles = planilla([MARTES])[0];
    const soloMiercoles = planilla([MIERCOLES])[0];
    expect(sinMiercoles.extraNoAprobada!.monto).toBe(pagado(soloMiercoles));
    // Y con todo sin aprobar, el monto es lo que paga aprobar todo.
    const nada = planilla([])[0];
    const todo = planilla([MARTES, MIERCOLES])[0];
    expect(nada.extraNoAprobada!.monto).toBe(pagado(todo));
  });

  it("la fórmula: h × recargo × rata, a centavos por columna, con la rata de la línea", () => {
    const nada = planilla([])[0];
    const rata = nada.dinero!.rataHora;
    // $1.000 ÷ 173,33 = $5,77 — la rata de la ficha, no otra.
    expect(rata).toBe(5.77);
    const esperado = centavos(
      centavos((82 / 60) * R.recargoExtraDiurno * rata)
      + centavos((14 / 60) * R.recargoExtraNocturno * rata),
    );
    expect(nada.extraNoAprobada!.monto).toBe(esperado);
    // 🔑 Con el recargo diurno para los 14 nocturnos daría OTRO número: es lo
    // que hace que el desglose diurno/nocturno no sea decorativo.
    const conRecargoEquivocado = centavos(centavos((96 / 60) * R.recargoExtraDiurno * rata));
    expect(nada.extraNoAprobada!.monto).not.toBe(conRecargoEquivocado);
  });

  it("sin ficha completa los minutos igual se dicen, con el monto en null", () => {
    const sinSalario = new Map([[COD, { ...FICHA, salarioMensual: null }]]);
    const [l] = planilla([], { fichas: sinSalario });
    expect(l.dinero).toBeNull();
    expect(l.extraNoAprobada!.minutos).toBeCloseTo(96, 6);
    expect(l.extraNoAprobada!.monto).toBeNull();
    const aviso = extrasNoAprobadas([l]);
    expect(aviso).toHaveLength(1);
    expect(aviso[0].monto).toBeNull();
  });
});

describe("f. sueldo repartido en dos empresas: el aviso sale UNA vez, donde se pagaría", () => {
  const FILAS: FilaReparto[] = [
    { empleado_codigo: COD, empresa: "vistana", salario_mensual: "800.00", paga_seguros: true, paga_horas_extra: false, orden: 0 },
    { empleado_codigo: COD, empresa: "fashion_wear", salario_mensual: "200.00", paga_seguros: false, paga_horas_extra: true, orden: 1 },
  ];
  const fichas = new Map([[COD, { ...FICHA, empresa: "vistana", reparto: partesDe(1000, FILAS) }]]);
  const lineas = planilla([], { fichas });

  it("dos líneas, y solo la de Fashion Wear (la que paga extras) lleva lo no aprobado", () => {
    expect(lineas).toHaveLength(2);
    const fw = lineas.find((l) => l.empresa === "fashion_wear")!;
    const vi = lineas.find((l) => l.empresa === "vistana")!;
    expect(fw.extraNoAprobada!.minutos).toBeCloseTo(96, 6);
    expect(vi.extraNoAprobada).toBeNull();
    // Con la rata del sueldo COMPLETO ($5,77), no la de los $200.
    expect(fw.extraNoAprobada!.monto).toBe(planilla([])[0].extraNoAprobada!.monto);
  });

  it("el aviso y el freno cuentan UNA persona, no dos líneas", () => {
    expect(extrasNoAprobadas(lineas)).toHaveLength(1);
    const frenos = frenosParaCerrar(lineas, []);
    expect(frenos).toHaveLength(1);
    expect(frenos[0].personas).toBe(1);
  });
});

describe("g. 🔴 SERVICIO PROFESIONAL: sin horas extra, con tardanzas y ausencias", () => {
  // Llega 08:40 el martes: 40 min tarde (30 pasada la tolerancia de 10) y se
  // queda hasta las 17:22. El miércoles no viene: ausencia. Sin aprobar nada.
  const TARDE: DiaReporte = {
    ...dia(MARTES, "17:22", 22),
    marcas: ["08:40:00", "12:00:00", "12:30:00", "17:22:00"],
    entrada: "08:40:00", tardeMin: 40,
  } as unknown as DiaReporte;
  const AUSENTE = {
    fecha: MIERCOLES, marcas: [], marcasIds: [], entrada: null, salida: null,
    tardeMin: 0, excesoAlmuerzoMin: 0, salidaTempranaMin: 0, extraMin: 0, trabajadoMin: 0,
    revisar: false, ausente: true,
  } as unknown as DiaReporte;
  const YULISSA = persona("26", [TARDE, AUSENTE]);
  const FICHA_SP: FichaPlanilla = {
    codigo: "26", nombre: "YULISSA JUAREZ", salarioMensual: null, jornadaSemanal: null,
    empresa: "vistana", servicioProfesional: true,
  };
  const FICHA_NORMAL: FichaPlanilla = {
    ...FICHA_SP, salarioMensual: 1000, jornadaSemanal: 40, servicioProfesional: false,
  };

  function cuadro(ficha: FichaPlanilla) {
    const lineas = armarPlanilla({
      personas: [YULISSA],
      fichas: new Map([["26", ficha]]),
      jornadaDiariaMin: () => 480,
      reglas: R,
      empresa: null,
      exigirAprobacionExtra: true,
      diasExtraAprobados: new Set<string>(),
    });
    return { lineas, l: lineas[0] };
  }

  it("CONTROL: la misma persona SIN la bandera sí sale en el aviso y frena", () => {
    const { lineas, l } = cuadro(FICHA_NORMAL);
    expect(l.fueraDePlanilla).toBe(false);
    expect(l.extraNoAprobada!.minutos).toBeCloseTo(22, 6);
    expect(extrasNoAprobadas(lineas).map((e) => e.codigo)).toEqual(["26"]);
    expect(frenosParaCerrar(lineas, []).map((f) => f.tipo)).toEqual(["horas-extra"]);
    const dias = armarDiasAprobacion({
      lineas, personas: [YULISSA], reglas: R, aprobaciones: indexarAprobaciones([]),
    });
    expect(dias.flatMap((d) => d.gente.map((g) => g.codigo))).toEqual(["26"]);
  });

  it("🔴 con la bandera NO está en el aviso ni en el freno del cierre", () => {
    const { lineas, l } = cuadro(FICHA_SP);
    expect(l.fueraDePlanilla).toBe(true);
    expect(extrasNoAprobadas(lineas)).toEqual([]);
    expect(frenosParaCerrar(lineas, [])).toEqual([]);
  });

  it("🔴 `extraMedido` y `extraNoAprobada` en null; extras, excedente, domingo y feriado en cero", () => {
    const { l } = cuadro(FICHA_SP);
    expect(l.extraMedido).toBeNull();
    expect(l.extraNoAprobada).toBeNull();
    expect(l.extraAprobada).toBe(true);
    for (const campo of [
      "extraDiurnoMin", "extraNocturnoMin", "excedenteMin",
      "extraNoAprobadaMin", "extraNoAprobadaDiurnoMin", "extraNoAprobadaNocturnoMin",
      "domingoMin", "feriadoMin",
    ] as const) {
      expect(l.horas[campo], campo).toBe(0);
    }
  });

  it("🔴 pero TARDANZA y AUSENCIA se siguen midiendo, idénticas a las de la persona sin la bandera", () => {
    const sp = cuadro(FICHA_SP).l;
    const normal = cuadro(FICHA_NORMAL).l;
    // 40 min tarde con 10 de tolerancia → 30 contados desde las 8:00 (regla de siempre).
    expect(normal.horas.tardanzaMin).toBeGreaterThan(0);
    expect(sp.horas.tardanzaMin).toBe(normal.horas.tardanzaMin);
    expect(normal.horas.ausenciaDias).toBeGreaterThan(0);
    expect(sp.horas.ausenciaDias).toBe(normal.horas.ausenciaDias);
    expect(sp.horas.ausenciaMin).toBe(normal.horas.ausenciaMin);
    expect(sp.horas.diasTrabajados).toBe(normal.horas.diasTrabajados);
    // Y sigue sin plata, como siempre.
    expect(sp.dinero).toBeNull();
  });

  it("🔴 la lista de la pestaña Aprobaciones NO la ofrece — no hay nada que aprobar", () => {
    const { lineas } = cuadro(FICHA_SP);
    const dias = armarDiasAprobacion({
      lineas, personas: [YULISSA], reglas: R, aprobaciones: indexarAprobaciones([]),
    });
    expect(dias).toEqual([]);
  });

  it("si alguien la había aprobado antes, esa fila se IGNORA (no cambia nada, no se borra)", () => {
    const { lineas, l } = cuadro(FICHA_SP);
    const aprobaciones = indexarAprobaciones([
      { codigo: "26", fecha: MARTES, aprobado: true, minutosVistos: 22, por: "Julio", cuando: null },
    ]);
    const dias = armarDiasAprobacion({ lineas, personas: [YULISSA], reglas: R, aprobaciones });
    expect(dias).toEqual([]);
    expect(l.extraMedido).toBeNull();
    expect(l.dinero).toBeNull();
  });

  it("junto a otra persona, la otra sale igual que siempre", () => {
    const lineas = armarPlanilla({
      personas: [P, YULISSA],
      fichas: new Map([[COD, FICHA], ["26", FICHA_SP]]),
      jornadaDiariaMin: () => 480,
      reglas: R,
      empresa: null,
      exigirAprobacionExtra: true,
      diasExtraAprobados: new Set<string>(),
    });
    expect(extrasNoAprobadas(lineas).map((e) => e.codigo)).toEqual([COD]);
    expect(frenosParaCerrar(lineas, [])[0].quienes).toEqual(["KEVIN LUBO"]);
    expect(frenosParaCerrar(lineas, [])[0].codigos).toEqual([COD]);
    const dias = armarDiasAprobacion({
      lineas, personas: [P, YULISSA], reglas: R, aprobaciones: indexarAprobaciones([]),
    });
    expect(new Set(dias.flatMap((d) => d.gente.map((g) => g.codigo)))).toEqual(new Set([COD]));
  });
});
