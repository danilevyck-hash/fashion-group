// ─────────────────────────────────────────────────────────────────────────────
// QUIEN MARCA PERO NO VA EN PLANILLA — el candado
//
// Daniel, textual (13-ago-2026), sobre YULISSA JUAREZ (código 26): *"yulissa es
// servicio profesional, no esta en planilla pero quiero medir asistencia"*.
//
// 🔴 LO QUE SE PRUEBA ACÁ SON LAS DOS MITADES, Y NINGUNA SE PUEDE PROBAR SOLA:
//   1. FUERA de todo cálculo de pago — y el caso que importa no es "no tiene
//      salario": es que CON SALARIO CARGADO tampoco se le calcule un centavo.
//      Ese es el error que este cambio existe para hacer imposible.
//   2. DENTRO del control de asistencia — sus tardanzas y ausencias se
//      siguen midiendo. Si esto se rompiera, la solución sería idéntica a darla
//      de baja, que es justo lo que Daniel NO quiere.
//
// Y una tercera que no es cosmética: DEJA DE SER UN PENDIENTE. Antes salía en
// «les falta el salario» para siempre, y ese aviso es el que la contable usa
// para saber cuánto trabajo le queda.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";

/** Lo que la ruta le manda a la base, y lo que la base le contesta. */
const upserts: Array<Record<string, unknown>> = [];
let respuestas: Array<{ error: unknown }> = [];

vi.mock("@/lib/requireRole", () => ({
  requireRole: () => ({ role: "admin", userName: "test", userId: "1", sessionToken: "t" }),
}));
vi.mock("@/lib/supabase-server", () => ({
  HAS_SERVICE_ROLE: true,
  supabaseServer: {
    from: () => ({
      upsert: (fila: Record<string, unknown>) => {
        upserts.push(fila);
        return Promise.resolve(respuestas.shift() ?? { error: null });
      },
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    }),
  },
}));

import { PUT as putPersona } from "@/app/api/asistencia/configuracion/route";
import {
  armarLinea,
  armarPlanilla,
  faltantesDe,
  FALTA,
  HORAS_CERO,
  MANUALES_CERO,
  ordenarLineas,
  quincenaDesdeClave,
  totalizar,
  type FichaPlanilla,
} from "@/lib/asistencia/planilla";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import { armarReporte, type Marcacion } from "@/lib/asistencia/reporte";
import { faltaEnPersona } from "@/lib/asistencia/configuracion-avisos";
import {
  COLUMNA_SERVICIO_PROFESIONAL,
  esColumnaServicioProfesionalFaltante,
  esServicioProfesional,
  validarServicioProfesional,
} from "@/lib/asistencia/participacion";

// ── Ayudantes ────────────────────────────────────────────────────────────────

/** Una ficha COMPLETA: nombre, salario, jornada y empresa. Se paga sola. */
const fichaCompleta = (over: Partial<FichaPlanilla> = {}): FichaPlanilla => ({
  codigo: "26",
  nombre: "YULISSA JUAREZ",
  salarioMensual: 800,
  jornadaSemanal: 48,
  empresa: "vistana",
  ...over,
});

const linea = (f: FichaPlanilla, horas = HORAS_CERO) =>
  armarLinea(f, horas, MANUALES_CERO, REGLAS_DEFAULT);

const pedido = (body: unknown) => ({ json: async () => body }) as never;

/** Marcaciones reales de un día: entra TARDE (8:30) y se va a su hora. */
const marca = (codigo: string, hhmm: string): Marcacion => ({
  empleado_codigo: codigo,
  empleado_nombre: null,
  ocurrio_en: `2026-07-13T${hhmm}:00-05:00`,
});

beforeEach(() => {
  upserts.length = 0;
  respuestas = [];
});

// ─────────────────────────────────────────────────────────────────────────────
describe("el dato: solo `true` saca a alguien de la planilla", () => {
  it("vacío, nulo y ausente significan «va en planilla»", () => {
    for (const v of [undefined, null, false, "", 0, "false"]) {
      expect(esServicioProfesional(v)).toBe(false);
    }
    // Ante la duda nadie sale del cálculo: sacarlo por accidente es dejar de
    // pagarle a una persona.
    expect(esServicioProfesional(true)).toBe(true);
    expect(esServicioProfesional("true")).toBe(true);
  });

  it("el validador convierte él y rechaza lo que no es una respuesta", () => {
    expect(validarServicioProfesional({})).toEqual({ ok: true, valor: false });
    expect(validarServicioProfesional({ servicioProfesional: true })).toEqual({ ok: true, valor: true });
    expect(validarServicioProfesional({ servicioProfesional: "quizás" }).ok).toBe(false);
  });

  it("la detección de «falta la columna» exige que el error la NOMBRE", () => {
    expect(esColumnaServicioProfesionalFaltante({
      code: "PGRST204",
      message: `Could not find the '${COLUMNA_SERVICIO_PROFESIONAL}' column of 'asistencia_personas'`,
    })).toBe(true);
    expect(esColumnaServicioProfesionalFaltante({
      code: "42703", message: "column asistencia_personas.servicio_profesional does not exist",
    })).toBe(true);
    // 🩸 Un problema real —permisos, red, RLS— NO puede leerse como "falta la
    // migración": eso convierte un error en una pantalla que miente.
    expect(esColumnaServicioProfesionalFaltante({ code: "42501", message: "permission denied" })).toBe(false);
    expect(esColumnaServicioProfesionalFaltante({ message: "fetch failed" })).toBe(false);
    expect(esColumnaServicioProfesionalFaltante(null)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 MITAD 1 — fuera de TODO cálculo de pago", () => {
  it("la MISMA ficha, con y sin la bandera: una cobra y la otra no", () => {
    const paga = linea(fichaCompleta());
    expect(paga.dinero).not.toBeNull();
    expect(paga.dinero!.salarioQuincenal).toBe(400);
    expect(paga.fueraDePlanilla).toBe(false);

    const noPaga = linea(fichaCompleta({ servicioProfesional: true }));
    expect(noPaga.dinero).toBeNull();
    expect(noPaga.fueraDePlanilla).toBe(true);
  });

  it("🩸 CON SALARIO CARGADO POR ERROR TAMPOCO SE LE CALCULA NADA", () => {
    // El `if` no pregunta por el sueldo: pregunta por la bandera. Es el caso
    // que Daniel describió — «si algún día se le carga uno por error».
    const conSueldoAlto = linea(fichaCompleta({ salarioMensual: 5000, servicioProfesional: true }));
    expect(conSueldoAlto.dinero).toBeNull();
  });

  it("con horas trabajadas, extras y tardanzas tampoco sale un número", () => {
    const horas = {
      ...HORAS_CERO,
      extraDiurnoMin: 120, extraNocturnoMin: 60, domingoMin: 480,
      tardanzaMin: 45, ausenciaMin: 480, diasTrabajados: 10,
    };
    const l = linea(fichaCompleta({ servicioProfesional: true }), horas);
    expect(l.dinero).toBeNull();
    // …pero TARDANZAS y AUSENCIAS viajan igual: son la mitad que sí se conserva.
    expect(l.horas.tardanzaMin).toBe(45);
    expect(l.horas.ausenciaMin).toBe(480);
    expect(l.horas.diasTrabajados).toBe(10);
    // 🔴 3-sep-2026 — Daniel precisó cuál mitad: *«yulisa marca pero no deberia
    // de calcular ya que es salario fijo, es solo para ver sus tardanzas y
    // ausencias»*. Las horas con recargo salen en CERO (antes viajaban enteras:
    // 120 diurnas, 60 nocturnas, 480 de domingo).
    expect(l.horas.extraDiurnoMin).toBe(0);
    expect(l.horas.extraNocturnoMin).toBe(0);
    expect(l.horas.domingoMin).toBe(0);
    expect(l.extraMedido).toBeNull();
    expect(l.extraNoAprobada).toBeNull();
  });

  it("no entra al total, y NO se cuenta como pendiente", () => {
    const lineas = [
      linea(fichaCompleta({ codigo: "6", nombre: "Ángela", salarioMensual: 600 })),
      linea(fichaCompleta({ servicioProfesional: true })),
      linea(fichaCompleta({ codigo: "53", nombre: "Gabriela", salarioMensual: null })),
    ];
    const t = totalizar(lineas);
    expect(t.personas).toBe(1);
    expect(t.netoPagar).toBe(lineas[0].dinero!.netoPagar);
    // 🔴 Cada uno en su balde: 1 pendiente de verdad (Gabriela, sin salario) y
    // 1 fuera de planilla a propósito. Sumarlos escondería el trabajo real.
    expect(t.sinConfigurar).toBe(1);
    expect(t.fueraDePlanilla).toBe(1);
  });

  it("marcar a UNA persona no mueve un centavo de las demás", () => {
    const otras = [
      linea(fichaCompleta({ codigo: "6", nombre: "Ángela", salarioMensual: 600 })),
      linea(fichaCompleta({ codigo: "8", nombre: "Samir", salarioMensual: 523.47 })),
    ];
    const antes = totalizar([...otras, linea(fichaCompleta({ salarioMensual: null }))]);
    const despues = totalizar([...otras, linea(fichaCompleta({ salarioMensual: null, servicioProfesional: true }))]);
    expect(despues.netoPagar).toBe(antes.netoPagar);
    expect(despues.totalBruto).toBe(antes.totalBruto);
    expect(despues.personas).toBe(antes.personas);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 MITAD 2 — dentro del control de asistencia", () => {
  const Q = quincenaDesdeClave("2026-07-1")!;

  /** El cuadro de una quincena con dos personas: una cobra, la otra no. */
  const cuadro = (servicioProfesional: boolean) => {
    const personas = armarReporte({
      // El código 26 llega 8:30 (tarde) y el 6 llega a su hora.
      marcaciones: [
        marca("26", "08:30"), marca("26", "12:00"), marca("26", "12:30"), marca("26", "17:00"),
        marca("6", "08:00"), marca("6", "12:00"), marca("6", "12:30"), marca("6", "17:00"),
      ],
      horarios: [
        { empleado_codigo: "26", entrada: "08:00", salida: "17:00", almuerzo_minutos: 30 },
        { empleado_codigo: "6", entrada: "08:00", salida: "17:00", almuerzo_minutos: 30 },
      ],
      justificaciones: [], feriados: new Map(),
      desde: Q.desde, hasta: Q.hasta,
      reglas: REGLAS_DEFAULT,
      incluirNoHabiles: true,
    });
    const fichas = new Map<string, FichaPlanilla>([
      ["26", fichaCompleta({ servicioProfesional })],
      ["6", fichaCompleta({ codigo: "6", nombre: "Ángela", salarioMensual: 600 })],
    ]);
    return armarPlanilla({
      personas, fichas, jornadaDiariaMin: () => 480, reglas: REGLAS_DEFAULT, empresa: "vistana",
    });
  };

  it("sigue apareciendo en el cuadro: no desaparece de la vista de nadie", () => {
    const l = cuadro(true).find((x) => x.codigo === "26");
    expect(l).toBeTruthy();
    expect(l!.etiqueta).toContain("YULISSA");
  });

  it("🩸 SUS TARDANZAS SE SIGUEN MIDIENDO — es lo que Daniel quiere conservar", () => {
    const conBandera = cuadro(true).find((x) => x.codigo === "26")!;
    const sinBandera = cuadro(false).find((x) => x.codigo === "26")!;
    // Llegó 8:30 con 10 de tolerancia → 30 minutos, contados desde las 8:00.
    expect(sinBandera.horas.tardanzaMin).toBe(30);
    expect(conBandera.horas.tardanzaMin).toBe(30);
    expect(conBandera.horas.diasTrabajados).toBe(sinBandera.horas.diasTrabajados);
    expect(conBandera.horas.ausenciaDias).toBe(sinBandera.horas.ausenciaDias);
    // Lo único que cambia es que no se convierte en dinero.
    expect(sinBandera.dinero).not.toBeNull();
    expect(conBandera.dinero).toBeNull();
  });

  it("la persona de al lado no se entera: mismos minutos y mismo neto", () => {
    const a = cuadro(false).find((x) => x.codigo === "6")!;
    const b = cuadro(true).find((x) => x.codigo === "6")!;
    expect(b.horas).toEqual(a.horas);
    expect(b.dinero).toEqual(a.dinero);
  });

  it("sin una sola marca NO se le agrega «no marcó ni un día»: no hay nada que pagar", () => {
    const lineas = armarPlanilla({
      personas: [],
      fichas: new Map([["26", fichaCompleta({ servicioProfesional: true })]]),
      jornadaDiariaMin: () => 480,
      reglas: REGLAS_DEFAULT,
      empresa: "vistana",
    });
    expect(lineas[0].faltaConfigurar).toEqual([]);
    expect(lineas[0].fueraDePlanilla).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 DEJA DE SER UN PENDIENTE", () => {
  it("no se le pide el salario ni la jornada", () => {
    expect(faltantesDe(fichaCompleta({ salarioMensual: null }), REGLAS_DEFAULT))
      .toContain(FALTA.salario);
    expect(faltantesDe(fichaCompleta({ salarioMensual: null, servicioProfesional: true }), REGLAS_DEFAULT))
      .toEqual([]);
    expect(faltantesDe(
      fichaCompleta({ salarioMensual: null, jornadaSemanal: null, servicioProfesional: true }),
      REGLAS_DEFAULT,
    )).toEqual([]);
  });

  it("⚠️ la EMPRESA se sigue pidiendo: es lo que separa las tres planillas", () => {
    expect(faltantesDe(
      fichaCompleta({ empresa: null, salarioMensual: null, servicioProfesional: true }),
      REGLAS_DEFAULT,
    )).toEqual([FALTA.empresa]);
  });

  it("la pantalla de Configuración dice lo MISMO que el motor", () => {
    expect(faltaEnPersona({ nombre: "YULISSA", empresa: "vistana", salarioMensual: null }))
      .toEqual(["el salario"]);
    expect(faltaEnPersona({
      nombre: "YULISSA", empresa: "vistana", salarioMensual: null, servicioProfesional: true,
    })).toEqual([]);
    // Lo que sí le puede faltar sigue faltándole.
    expect(faltaEnPersona({
      nombre: "", empresa: null, salarioMensual: null, servicioProfesional: true,
    })).toEqual(["el nombre", "la empresa"]);
  });

  it("va en su propio grupo: después de los que cobran y antes de los pendientes", () => {
    // 🔑 Los nombres están elegidos para que el orden ALFABÉTICO los mezclaría:
    // «Ana» va antes que «Zulema». Si los tres grupos se aplastaran en uno, la
    // línea sin dinero quedaría entre las que cobran — y el Excel y el PDF
    // recorren esta lista tal cual, así que en el papel se leería como una fila
    // con las columnas de plata vacías en medio del cuadro.
    const lineas = ordenarLineas([
      linea(fichaCompleta({ codigo: "53", nombre: "Gabriela", salarioMensual: null })),
      linea(fichaCompleta({ codigo: "26", nombre: "Ana", servicioProfesional: true })),
      linea(fichaCompleta({ codigo: "9", nombre: "Zulema", salarioMensual: 600 })),
    ]);
    expect(lineas.map((l) => l.codigo)).toEqual(["9", "26", "53"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("guardar la decisión: la ruta", () => {
  it("escribe la bandera en la ficha", async () => {
    const res = await putPersona(pedido({
      codigo: "26", nombre: "YULISSA JUAREZ", salarioMensual: "",
      jornadaSemanal: 48, empresa: "vistana", servicioProfesional: true,
    }));
    expect(res.status).toBe(200);
    expect(upserts[0][COLUMNA_SERVICIO_PROFESIONAL]).toBe(true);
    expect(await res.json()).toMatchObject({ ok: true, persona: { servicioProfesional: true } });
  });

  it("quien va en planilla se guarda con la bandera apagada", async () => {
    await putPersona(pedido({
      codigo: "6", nombre: "Ángela", salarioMensual: "600",
      jornadaSemanal: 48, empresa: "vistana",
    }));
    expect(upserts[0][COLUMNA_SERVICIO_PROFESIONAL]).toBe(false);
  });

  // ⚠️ CAMBIARON DE DIRECCIÓN EL 3-SEP-2026 (tolerancia a la DDL retirada).
  // Hasta ese día, con PGRST204 nombrando la columna: marcar a alguien daba 503
  // con el nombre del archivo, y poner un nombre se REINTENTABA sin la columna
  // (200, dos upserts). La columna existe desde 20260813120000; hoy ese código
  // es un error como cualquier otro: 500, UN solo upsert, sin reintento —
  // reintentar guardaría la ficha SIN la bandera, y la persona seguiría en la
  // planilla sin que nadie sepa por qué.
  it("🔴 con PGRST204 marcar a alguien es 500, sin «falta la migración», y NO se guarda a medias", async () => {
    respuestas = [{ error: { code: "PGRST204", message: "Could not find the 'servicio_profesional' column of 'asistencia_personas'" } }];
    const res = await putPersona(pedido({
      codigo: "26", nombre: "YULISSA JUAREZ", salarioMensual: "",
      jornadaSemanal: 48, empresa: "vistana", servicioProfesional: true,
    }));
    expect(res.status).toBe(500);
    const j = await res.json();
    expect(j.faltaMigracionServicioProfesional).toBeUndefined();
    expect(String(j.error)).not.toContain("20260813120000");
    expect(upserts).toHaveLength(1); // no reintentó a espaldas de nadie
  });

  it("🔴 y poner un nombre TAMPOCO se reintenta sin la columna: 500 y un solo upsert", async () => {
    respuestas = [{ error: { code: "PGRST204", message: "Could not find the 'servicio_profesional' column of 'asistencia_personas'" } }];
    const res = await putPersona(pedido({
      codigo: "6", nombre: "Ángela", salarioMensual: "600",
      jornadaSemanal: 48, empresa: "vistana",
    }));
    expect(res.status).toBe(500);
    expect(upserts).toHaveLength(1);
    expect(COLUMNA_SERVICIO_PROFESIONAL in upserts[0]).toBe(true);
  });
});
