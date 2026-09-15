/* ─────────────────────────────────────────────────────────────────────────────
 * UN DÍA ANTERIOR AL INGRESO NO ES UNA AUSENCIA — el candado (15-sep-2026)
 *
 * ── 🩸 EL CASO ───────────────────────────────────────────────────────────────
 *
 * ENRIQUE SÁNCHEZ (56, Confecciones Boston, $650 al mes) **entró el 7 de
 * septiembre**. En la quincena del 1 al 15, con el corte que la pantalla
 * propone (13 de septiembre), el sistema le hacía las DOS cuentas a la vez:
 *
 *     sus 7 días trabajados, prorrateados      $175,00   ✅ = la contadora
 *     4 ausencias: 1, 2, 3 y 4 de septiembre  −$100,16   🩸 no trabajaba acá
 *     ────────────────────────────────────────────────
 *     neto del sistema                          $74,84
 *     neto de la contadora                     $175,00
 *
 * Lo castigaba **dos veces por lo mismo**: le prorrateaba el sueldo por los días
 * que sí trabajó —bien, y al centavo igual que ella— y encima le descontaba los
 * días anteriores a su ingreso. Iba a repetirse con cada alta y cada baja.
 *
 * ── LA REGLA ─────────────────────────────────────────────────────────────────
 *
 * 🔴 UN DÍA ANTERIOR A LA `fecha_ingreso` —O POSTERIOR A LA `fecha_salida`— NO
 * SUMA, NO RESTA Y NO EXISTE PARA ESA PERSONA: ni ausencia, ni tardanza, ni
 * salida temprana, ni hora extra. `diaFueraDeVigencia` (`vigencia.ts`) es la
 * única regla; el motor del reporte le pregunta y suspende el veredicto.
 *
 * 🔑 ES LA MISMA FORMA DE PENSAR QUE «LOS DÍAS QUE NO PASARON NO SE CUENTAN»
 * (`diaEnCurso`): allá el día todavía no llegó, acá no le tocaba. En los dos el
 * día se deja sin juzgar ANTES de calcular, en vez de calcular y anular después.
 *
 * ⚠️ EL PRORRATEO DEL SUELDO NO SE TOCA. Ya estaba bien y ya coincidía con la
 * contadora (`prorrateo-ingreso.ts`, 10-sep-2026, Daniel: *«se paga días
 * trabajados»*). Lo que sobraba era la ausencia.
 *
 * ⚠️ LOS BORDES SON INCLUSIVOS: el día que entró y el día que salió SÍ trabajó,
 * y esos días se siguen midiendo enteros. Medido en producción: Yeritza (51) no
 * marcó su PRIMER día (27-jul) y esa ausencia se conserva; Roxana (27) no marcó
 * su ÚLTIMO día (13-jul) y esa también.
 *
 * ── MEDIDO CONTRA PRODUCCIÓN, antes y después (solo lectura) ─────────────────
 *
 *   1–15 sep (corte 13)  ENRIQUE $74,84 → $175,00 · 46 de 47 líneas idénticas
 *   1–15 sep (sin corte) ENRIQUE $49,80 → $149,96 · la ausencia REAL del 14 de
 *                        septiembre ($25,04) SE CONSERVA
 *   16–31 ago            0 de 46 líneas cambian (nadie entró ni salió)
 *   1–15 ago             3 (Jennifer, Gabriela, Yeishka) · +$345,60
 *   16–31 jul            1 (Yeritza) · +$111,28
 *   1–15 jul             2 con plata (María V., Jennifer) · +$320,60
 *
 * 🔴 TODOS LOS CASOS EJECUTAN LA CONDUCTA: corren el motor REAL y miran los
 * dólares que salen. Ninguno busca texto en un archivo.
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { armarReporte, type Marcacion } from "@/lib/asistencia/reporte";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import {
  diaFueraDeVigencia,
  trabajaEseDia,
  type Vigencia,
} from "@/lib/asistencia/vigencia";
import {
  armarPlanilla,
  totalizar,
  type FichaPlanilla,
} from "@/lib/asistencia/planilla";
import { prorrateoPorVigencia } from "@/lib/asistencia/prorrateo-ingreso";

// ── El caso de producción ────────────────────────────────────────────────────

const DESDE = "2026-09-01";
const HASTA = "2026-09-15";
/** El corte que la pantalla propone para una primera quincena. */
const CORTE = "2026-09-13";
/** Enrique entró este día: lunes. */
const INGRESO = "2026-09-07";

const vig = (over: Partial<Vigencia> = {}): Vigencia => ({
  fechaIngreso: null, fechaSalida: null, motivoSalida: null, ...over,
});

const marca = (codigo: string, dia: string, hhmmss: string): Marcacion => ({
  empleado_codigo: codigo, empleado_nombre: null, ocurrio_en: `${dia}T${hhmmss}-05:00`,
});
const diaCompleto = (codigo: string, dia: string): Marcacion[] => [
  marca(codigo, dia, "08:00:00"), marca(codigo, dia, "12:00:00"),
  marca(codigo, dia, "12:30:00"), marca(codigo, dia, "17:00:00"),
];

/** Los cinco días que Enrique trabajó: del lunes 7 al viernes 11. */
const TRABAJADOS = ["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11"];

const ficha = (over: Partial<FichaPlanilla> = {}): FichaPlanilla => ({
  codigo: "56", nombre: "Enrique Sanchez", salarioMensual: 650,
  jornadaSemanal: 48, empresa: "confecciones_boston",
  // En producción tiene los seguros apagados: así el neto ES el bruto y el
  // número del candado se puede comparar contra el Excel de la contadora.
  pagaSeguros: false, ...over,
});

/**
 * Corre el motor completo, como lo hace la ruta.
 *
 * 🔑 `vigencias` SIEMPRE alimenta el prorrateo del sueldo —eso ya existía desde
 * el 10-sep y no es lo que este candado cambia—. Lo que se prende y se apaga es
 * si el MOTOR DEL REPORTE lo recibe: `sinRegla: true` es el CONTROL, o sea el
 * sistema exactamente como estaba antes del 15-sep-2026.
 */
function correr(opts: {
  marcaciones: Marcacion[];
  fichas?: FichaPlanilla[];
  vigencias?: Map<string, Vigencia>;
  sinRegla?: boolean;
  desde?: string;
  /** Hasta dónde se mide el RELOJ (el corte). */
  hasta?: string;
  /** El último día de la quincena, que es lo que prorratea el sueldo. */
  finQuincena?: string;
  hoy?: string | null;
}) {
  const desde = opts.desde ?? DESDE;
  const hasta = opts.hasta ?? CORTE;
  const finQuincena = opts.finQuincena ?? HASTA;
  const fichas = opts.fichas ?? [ficha()];
  const personas = armarReporte({
    marcaciones: opts.marcaciones,
    horarios: [],
    justificaciones: [],
    feriados: new Map(),
    desde, hasta,
    reglas: REGLAS_DEFAULT,
    incluirNoHabiles: true,
    diaEnCurso: opts.hoy ?? null,
    vigencias: opts.sinRegla ? undefined : opts.vigencias,
  });
  const prorrateo = new Map<string, { factor: number; texto: string }>();
  for (const [codigo, v] of opts.vigencias ?? []) {
    const pr = prorrateoPorVigencia(v, desde, finQuincena);
    if (pr) prorrateo.set(codigo, { factor: pr.factor, texto: pr.texto });
  }
  const lineas = armarPlanilla({
    personas,
    fichas: new Map(fichas.map((f) => [f.codigo, f])),
    jornadaDiariaMin: () => 8 * 60,
    reglas: REGLAS_DEFAULT,
    empresa: null,
    prorrateo,
  });
  return {
    lineas, totales: totalizar(lineas),
    de: (c: string) => lineas.find((l) => l.codigo === c)!,
    dias: (c: string) => personas.find((p) => p.codigo === c)?.dias ?? [],
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// LA REGLA, PURA
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 la regla: ¿esta persona trabajaba acá ese día?", () => {
  it("un día ANTERIOR al ingreso no es suyo", () => {
    const v = vig({ fechaIngreso: INGRESO });
    expect(trabajaEseDia(v, "2026-09-04")).toBe(false);
    expect(diaFueraDeVigencia(v, "2026-09-04")).toBe(true);
  });

  it("un día POSTERIOR a la salida tampoco", () => {
    const v = vig({ fechaSalida: "2026-08-03", motivoSalida: "renuncia" });
    expect(trabajaEseDia(v, "2026-08-04")).toBe(false);
    expect(diaFueraDeVigencia(v, "2026-08-04")).toBe(true);
  });

  it("⚠️ LOS BORDES SON INCLUSIVOS: el día que entró y el día que salió SÍ trabajó", () => {
    expect(trabajaEseDia(vig({ fechaIngreso: INGRESO }), INGRESO)).toBe(true);
    expect(trabajaEseDia(vig({ fechaSalida: "2026-08-03", motivoSalida: "otro" }), "2026-08-03")).toBe(true);
  });

  it("🔑 sin ficha, o sin ninguna de las dos fechas, NADA cambia: todos los días son suyos", () => {
    expect(trabajaEseDia(null, "2026-09-04")).toBe(true);
    expect(trabajaEseDia(undefined, "2026-09-04")).toBe(true);
    expect(trabajaEseDia(vig(), "2026-09-04")).toBe(true);
    // Una fecha basura no saca a nadie de su propia quincena.
    expect(trabajaEseDia(vig({ fechaIngreso: "no-es-fecha" }), "2026-09-04")).toBe(true);
    expect(trabajaEseDia(vig({ fechaIngreso: "2026-02-31" }), "2026-09-04")).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// EL CASO DE PRODUCCIÓN — ENRIQUE SÁNCHEZ
// ═════════════════════════════════════════════════════════════════════════════

describe("🩸🔴 ENRIQUE SÁNCHEZ cobra $175,00, lo mismo que la contadora", () => {
  const marcaciones = TRABAJADOS.flatMap((d) => diaCompleto("56", d));
  const vigencias = new Map([["56", vig({ fechaIngreso: INGRESO })]]);

  it("EL CONTROL: sin el arreglo se le cobran 4 ausencias y cobra $74,84", () => {
    const antes = correr({ marcaciones, vigencias, sinRegla: true });
    // Las 4 ausencias son el 1, 2, 3 y 4 de septiembre: días en que no trabajaba acá.
    expect(antes.de("56").horas.ausenciaDias).toBe(4);
    expect(antes.de("56").dinero!.ausencias).toBeCloseTo(100.16, 2);
    expect(antes.de("56").dinero!.netoPagar).toBeCloseTo(74.84, 2);
  });

  it("🔴 CON EL ARREGLO: cero ausencias y $175,00 — el sueldo prorrateado, entero", () => {
    const despues = correr({ marcaciones, vigencias });
    expect(despues.de("56").horas.ausenciaDias).toBe(0);
    expect(despues.de("56").dinero!.ausencias).toBe(0);
    expect(despues.de("56").dinero!.netoPagar).toBeCloseTo(175, 2);
  });

  it("⚠️ EL PRORRATEO DEL SUELDO NO SE TOCA: los mismos 7 días hábiles, antes y después", () => {
    const antes = correr({ marcaciones, vigencias, sinRegla: true });
    const despues = correr({ marcaciones, vigencias });
    // 🔴 EL MISMO NÚMERO DE LOS DOS LADOS: 7 días × (650 ÷ 26) = $175,00. Es lo
    // que este arreglo NO toca — el sueldo ya estaba bien.
    expect(antes.de("56").dinero!.salarioQuincenal).toBeCloseTo(175, 2);
    expect(despues.de("56").dinero!.salarioQuincenal).toBeCloseTo(175, 2);
    expect(despues.de("56").prorrateo).toBe(
      "entró el 7 de septiembre de 2026: 7 días hábiles (sueldo ÷ 26 por día)",
    );
    // 🔑 Y la diferencia del neto es EXACTAMENTE la ausencia que sobraba.
    expect(despues.de("56").dinero!.netoPagar - antes.de("56").dinero!.netoPagar)
      .toBeCloseTo(100.16, 2);
  });

  it("🔴 LOS DÍAS ANTERIORES AL INGRESO QUEDAN MARCADOS, no escondidos", () => {
    const dias = correr({ marcaciones, vigencias }).dias("56");
    const previos = dias.filter((d) => d.fecha < INGRESO);
    expect(previos.length).toBeGreaterThan(0);
    for (const d of previos) {
      expect(d.fueraDeVigencia).toBe(true);
      expect(d.ausente).toBe(false);
      expect(d.revisar).toBe(false);
      expect(d.tardeMin).toBe(0);
      expect(d.salidaTempranaMin).toBe(0);
      expect(d.extraMin).toBe(0);
      expect(d.trabajadoMin).toBe(0);
    }
    // Y los suyos siguen siendo suyos.
    for (const d of dias.filter((x) => x.fecha >= INGRESO)) {
      expect(d.fueraDeVigencia).toBe(false);
    }
  });

  it("🔴 UNA AUSENCIA DE VERDAD SE SIGUE COBRANDO: el lunes 14, que sí faltó", () => {
    // La quincena entera, sin corte: el 14 es hábil y posterior a su ingreso.
    const despues = correr({ marcaciones, vigencias, hasta: HASTA, hoy: "2026-09-15" });
    expect(despues.de("56").dinero!.salarioQuincenal).toBeCloseTo(175, 2);
    expect(despues.de("56").horas.ausenciaDias).toBe(1);
    expect(despues.de("56").dinero!.ausencias).toBeCloseTo(25.04, 2);
    expect(despues.de("56").dinero!.netoPagar).toBeCloseTo(149.96, 2);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TARDANZA Y SALIDA TEMPRANA — LA MISMA REGLA
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 si no hay ausencia porque no trabajaba, tampoco hay tardanza", () => {
  /**
   * Llegó 20 minutos tarde y se fue 2 h antes.
   * ⚠️ 20 y no 120: pasados los 30 minutos la tardanza se cobra en la columna
   * «Ausencia por tardanza», que es otra celda. Acá se miran las dos de las que
   * habla el encargo.
   */
  const diaMalo = (codigo: string, dia: string): Marcacion[] => [
    marca(codigo, dia, "08:20:00"), marca(codigo, dia, "12:00:00"),
    marca(codigo, dia, "12:30:00"), marca(codigo, dia, "15:00:00"),
  ];

  it("EL CONTROL: ese mismo día, DENTRO de su vigencia, sí se cobra", () => {
    const r = correr({
      marcaciones: diaMalo("56", "2026-09-08"),
      vigencias: new Map([["56", vig({ fechaIngreso: INGRESO })]]),
    });
    expect(r.de("56").dinero!.tardanzas).toBeGreaterThan(0);
    expect(r.de("56").dinero!.salidaTemprana).toBeGreaterThan(0);
  });

  it("🔴 el MISMO día, ANTES del ingreso: ni tardanza ni salida temprana", () => {
    // Marcó el 2 de septiembre, cinco días antes de entrar. Pasa (un código
    // reusado, una huella prestada), y no puede costarle plata a nadie.
    const marcaciones = diaMalo("56", "2026-09-02");
    const vigencias = new Map([["56", vig({ fechaIngreso: INGRESO })]]);
    const antes = correr({ marcaciones, vigencias, sinRegla: true });
    const despues = correr({ marcaciones, vigencias });
    expect(antes.de("56").dinero!.tardanzas).toBeGreaterThan(0);
    expect(antes.de("56").dinero!.salidaTemprana).toBeGreaterThan(0);
    expect(despues.de("56").dinero!.tardanzas).toBe(0);
    expect(despues.de("56").dinero!.salidaTemprana).toBe(0);
  });

  it("🔴 ni hora extra: quedarse hasta las 8 el día antes de entrar no se paga", () => {
    const marcaciones = [
      marca("56", "2026-09-02", "08:00:00"), marca("56", "2026-09-02", "12:00:00"),
      marca("56", "2026-09-02", "12:30:00"), marca("56", "2026-09-02", "20:00:00"),
    ];
    const despues = correr({
      marcaciones,
      vigencias: new Map([["56", vig({ fechaIngreso: INGRESO })]]),
    });
    const dia = despues.dias("56").find((d) => d.fecha === "2026-09-02")!;
    expect(dia.extraMin).toBe(0);
    expect(despues.de("56").horas.extraDiurnoMin).toBe(0);
    expect(despues.de("56").horas.extraNocturnoMin).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// LA BAJA — EL OTRO LADO DE LA MISMA REGLA
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 el día posterior a la salida tampoco es una falta", () => {
  // Jennifer (50) salió el lunes 3 de agosto; la quincena va del 1 al 15.
  const SALIDA = "2026-08-03";
  const vigencias = new Map([["50", vig({ fechaSalida: SALIDA, motivoSalida: "renuncia" })]]);
  const marcaciones = diaCompleto("50", SALIDA);
  const fichas = [ficha({ codigo: "50", nombre: "JENNIFER ARMAS", salarioMensual: 600 })];
  const rango = { desde: "2026-08-01", hasta: "2026-08-15", hoy: "2026-08-31" };

  it("EL CONTROL: sin el arreglo se le cobran los 9 días hábiles que ya no trabajó", () => {
    const antes = correr({ marcaciones, fichas, vigencias, sinRegla: true, ...rango });
    expect(antes.de("50").horas.ausenciaDias).toBe(9);
    expect(antes.de("50").dinero!.ausencias).toBeGreaterThan(0);
  });

  it("🔴 CON EL ARREGLO: ninguna ausencia después del 3 de agosto", () => {
    const despues = correr({ marcaciones, fichas, vigencias, ...rango });
    expect(despues.de("50").horas.ausenciaDias).toBe(0);
    expect(despues.de("50").dinero!.ausencias).toBe(0);
  });

  it("⚠️ LAS MARCAS POSTERIORES A LA BAJA SE CONSERVAN: es el único aviso que existe", () => {
    // 🩸 Si se borraran, `marcoDespuesDeLaBaja` —que mira `ultimoDiaConMarcas`—
    // dejaría de avisar que alguien dado de baja siguió marcando: o volvió y la
    // planilla le va a pagar cero, o alguien más está usando su huella.
    const conMarcaPosterior = [...marcaciones, ...diaCompleto("50", "2026-08-10")];
    const r = correr({ marcaciones: conMarcaPosterior, fichas, vigencias, ...rango });
    const dia = r.dias("50").find((d) => d.fecha === "2026-08-10")!;
    expect(dia.fueraDeVigencia).toBe(true);
    expect(dia.marcas.length).toBe(4);
    // Y aun así no cuesta un centavo.
    expect(r.de("50").dinero!.ausencias).toBe(0);
    expect(r.de("50").dinero!.tardanzas).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 🔴 EL CONTROL QUE MÁS PESA — QUIEN TRABAJÓ LA QUINCENA ENTERA NO SE MUEVE
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 quien trabajó la quincena entera da EXACTAMENTE lo mismo que antes", () => {
  const HABILES = [
    "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04",
    "2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11",
  ];

  it("sin fecha de ingreso ni de salida: ni un centavo de diferencia", () => {
    const marcaciones = HABILES.flatMap((d) => diaCompleto("22", d));
    const fichas = [ficha({ codigo: "22", nombre: "ALEJANDRA CAMAÑO", salarioMensual: 600 })];
    const vigencias = new Map([["22", vig()]]);
    const antes = correr({ marcaciones, fichas, vigencias, sinRegla: true });
    const despues = correr({ marcaciones, fichas, vigencias });
    expect(despues.de("22").dinero).toEqual(antes.de("22").dinero);
    expect(despues.de("22").horas).toEqual(antes.de("22").horas);
  });

  it("CON fecha de ingreso VIEJA —el caso de las 40 fichas— tampoco se mueve", () => {
    const marcaciones = HABILES.flatMap((d) => diaCompleto("22", d));
    const fichas = [ficha({ codigo: "22", nombre: "ALEJANDRA CAMAÑO", salarioMensual: 600 })];
    const vigencias = new Map([["22", vig({ fechaIngreso: "2024-02-19" })]]);
    const antes = correr({ marcaciones, fichas, vigencias, sinRegla: true });
    const despues = correr({ marcaciones, fichas, vigencias });
    expect(despues.de("22").dinero).toEqual(antes.de("22").dinero);
    expect(despues.de("22").horas).toEqual(antes.de("22").horas);
    expect(despues.dias("22").every((d) => d.fueraDeVigencia === false)).toBe(true);
  });

  it("y con faltas de verdad, las faltas se siguen cobrando igual", () => {
    // Faltó el 3 y el 10: dos ausencias que no tienen nada que ver con su alta.
    const marcaciones = HABILES.filter((d) => d !== "2026-09-03" && d !== "2026-09-10")
      .flatMap((d) => diaCompleto("22", d));
    const fichas = [ficha({ codigo: "22", nombre: "ALEJANDRA CAMAÑO", salarioMensual: 600 })];
    const vigencias = new Map([["22", vig({ fechaIngreso: "2024-02-19" })]]);
    const antes = correr({ marcaciones, fichas, vigencias, sinRegla: true });
    const despues = correr({ marcaciones, fichas, vigencias });
    expect(antes.de("22").horas.ausenciaDias).toBe(2);
    expect(despues.de("22").horas.ausenciaDias).toBe(2);
    expect(despues.de("22").dinero).toEqual(antes.de("22").dinero);
  });

  it("y el TOTAL del cuadro con varias personas solo se mueve por quien entró", () => {
    const fichas = [
      ficha({ codigo: "22", nombre: "ALEJANDRA CAMAÑO", salarioMensual: 600 }),
      ficha(),
    ];
    const marcaciones = [
      ...HABILES.flatMap((d) => diaCompleto("22", d)),
      ...TRABAJADOS.flatMap((d) => diaCompleto("56", d)),
    ];
    const vigencias = new Map([
      ["22", vig({ fechaIngreso: "2024-02-19" })],
      ["56", vig({ fechaIngreso: INGRESO })],
    ]);
    const antes = correr({ marcaciones, fichas, vigencias, sinRegla: true });
    const despues = correr({ marcaciones, fichas, vigencias });
    expect(despues.de("22").dinero).toEqual(antes.de("22").dinero);
    // El único que se mueve es Enrique, y se mueve exactamente su ausencia falsa.
    expect(despues.totales.netoPagar - antes.totales.netoPagar).toBeCloseTo(100.16, 2);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// EL CABLEADO — LAS DOS RUTAS TIENEN QUE PASAR EL MAPA
// ═════════════════════════════════════════════════════════════════════════════

const db: {
  personas: Record<string, unknown>[];
  marcaciones: Record<string, unknown>[];
} = { personas: [], marcaciones: [] };

vi.mock("@/lib/requireRole", () => ({
  requireRole: () => ({ role: "admin", userId: "u1", userName: "Daniel", sessionToken: "t" }),
}));
vi.mock("@/lib/asistencia/correcciones-server", () => ({
  leerCorrecciones: async () => ({ correcciones: [], porDia: new Map(), faltaMigracion: false }),
}));
vi.mock("@/lib/supabase-paginado", () => ({
  leerTodoPaginado: async () => db.marcaciones,
}));
vi.mock("@/lib/asistencia/planilla-server", async () => {
  const real = await vi.importActual<typeof import("@/lib/asistencia/planilla-server")>(
    "@/lib/asistencia/planilla-server",
  );
  return { ...real, leerManuales: async () => ({ porCodigo: new Map(), faltaMigracion: false }) };
});
vi.mock("@/lib/asistencia/config-server", async () => {
  const real = await vi.importActual<typeof import("@/lib/asistencia/config-server")>(
    "@/lib/asistencia/config-server",
  );
  return {
    ...real,
    leerReglas: async () => ({ reglas: REGLAS_DEFAULT, faltaMigracion: false }),
    leerPersonas: async () => ({
      filas: db.personas, faltaMigracion: false,
      faltaColumnasBajas: false, faltaColumnaServicioProfesional: false,
    }),
  };
});
vi.mock("@/lib/supabase-server", () => {
  const cadena = () => {
    const api: Record<string, unknown> = {};
    for (const m of ["select", "eq", "gte", "lte", "order", "range", "in"]) api[m] = () => api;
    (api as { then: unknown }).then = (res: (v: unknown) => unknown) => res({ data: [], error: null });
    return api;
  };
  return { HAS_SERVICE_ROLE: true, supabaseServer: { from: () => cadena() } };
});

const filaDb = (codigo: string, over: Record<string, unknown> = {}) => ({
  empleado_codigo: codigo, nombre: `P${codigo}`, salario_mensual: 650,
  jornada_semanal: 48, empresa: "confecciones_boston",
  fecha_ingreso: null, fecha_salida: null, motivo_salida: null,
  servicio_profesional: false, paga_seguros: false, ...over,
});

const marcasDb = (codigo: string, dia: string) =>
  ["08:00:00", "12:00:00", "12:30:00", "17:00:00"].map((h, i) => ({
    id: `${codigo}-${dia}-${i}`, empleado_codigo: codigo, empleado_nombre: null,
    ocurrio_en: `${dia}T${h}-05:00`,
  }));

describe("🔴 LA RUTA DE LA PLANILLA le pasa las vigencias al motor", () => {
  beforeEach(() => {
    db.personas = [];
    db.marcaciones = [];
    vi.useFakeTimers();
    // 15-sep-2026, 10 de la mañana de Panamá.
    vi.setSystemTime(new Date("2026-09-15T15:00:00Z"));
  });
  afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

  it("🩸🔴 EL CASO ENTERO, DE PUNTA A PUNTA: a Enrique no le quedan las 4 faltas falsas", async () => {
    db.personas = [filaDb("56", { nombre: "Enrique Sanchez", fecha_ingreso: INGRESO })];
    db.marcaciones = TRABAJADOS.flatMap((d) => marcasDb("56", d));

    const { GET } = await import("@/app/api/asistencia/planilla/route");
    const { NextRequest } = await import("next/server");
    const res = await GET(new NextRequest(
      "http://x/api/asistencia/planilla?quincena=2026-09-1&empresa=confecciones_boston",
    ));
    const r = (await res.json()) as {
      lineas: Array<{
        codigo: string;
        prorrateo: string | null;
        horas: { ausenciaDias: number };
        dinero: { ausencias: number; netoPagar: number; salarioQuincenal: number } | null;
      }>;
      totales: { ausencias: number };
    };
    const l = r.lineas.find((x) => x.codigo === "56")!;
    // ⚠️ La quincena ENTERA (el corte solo existe con la planilla unida
    // prendida), así que queda su falta REAL del lunes 14: 1 ausencia, $25,04.
    // 🔴 Antes eran CINCO ($125,20): las 4 del 1 al 4 de septiembre sobraban.
    expect(l.horas.ausenciaDias).toBe(1);
    expect(l.dinero!.ausencias).toBeCloseTo(25.04, 2);
    expect(l.dinero!.salarioQuincenal).toBeCloseTo(175, 2);
    expect(l.dinero!.netoPagar).toBeCloseTo(149.96, 2);
    expect(l.prorrateo).toBe(
      "entró el 7 de septiembre de 2026: 7 días hábiles (sueldo ÷ 26 por día)",
    );
  });
});

describe("🔴 LA PANTALLA DE ASISTENCIA dice lo mismo que la planilla", () => {
  beforeEach(() => {
    db.personas = [];
    db.marcaciones = [];
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T15:00:00Z"));
  });
  afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

  it("🩸 no le marca faltas del 1 al 4 a quien entró el 7", async () => {
    db.personas = [filaDb("56", { nombre: "Enrique Sanchez", fecha_ingreso: INGRESO })];
    db.marcaciones = TRABAJADOS.flatMap((d) => marcasDb("56", d));

    const { GET } = await import("@/app/api/asistencia/reporte/route");
    const { NextRequest } = await import("next/server");
    const res = await GET(new NextRequest(
      `http://x/api/asistencia/reporte?desde=${DESDE}&hasta=${CORTE}`,
    ));
    const r = (await res.json()) as {
      personas: Array<{ codigo: string; resumen: { ausenciasSinJustificar: number } }>;
    };
    const p = r.personas.find((x) => x.codigo === "56")!;
    expect(p.resumen.ausenciasSinJustificar).toBe(0);
  });
});
