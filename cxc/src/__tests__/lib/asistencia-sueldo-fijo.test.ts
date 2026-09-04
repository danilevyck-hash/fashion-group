// ─────────────────────────────────────────────────────────────────────────────
// QUIEN COBRA FIJO Y NO PASA POR EL RELOJ — el candado de conducta
//
// Daniel, textual (25-ago-2026): *"Edwin → crearle ficha con $700/mes marcado
// como no marca el reloj"*. EDWIN GOMEZ vende en la calle: no pasa por el
// aparato ni un día y cobra su quincena completa, con seguros y todo.
//
// 🔴 LAS TRES CONDUCTAS QUE SE PRUEBAN, Y LA TERCERA ES LA QUE PROTEGE A TODOS:
//   1. CON la bandera y CERO marcaciones → produce su neto. Antes caía en «no
//      marcó ni un día» todas las quincenas, y el riesgo real era que una nadie
//      lo mirara y no cobrara.
//   2. CON la bandera y CON marcaciones → EL MISMO NETO, al centavo. El reloj se
//      ignora SIEMPRE, no solo cuando no hay marcas. Si mañana alguien usa su
//      código, no puede aparecerle una ausencia inventada que le mueva el pago.
//   3. SIN la bandera y CERO marcaciones → sigue cayendo en «no marcó ni un
//      día», igual que hoy. Es el que impide que la bandera se filtre a los
//      demás: sin esta prueba, un cambio futuro podría hacer que TODO el que no
//      marca cobre completo, y eso son quincenas regaladas que nadie ve.
//
// 🔑 Ninguna prueba de acá busca texto en un archivo: todas ejecutan el cálculo
// real o llaman al PUT real y miran la fila que se escribe.
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
  armarPlanilla,
  FALTA,
  quincenaDesdeClave,
  periodoDeQuincena,
  totalizar,
  type FichaPlanilla,
} from "@/lib/asistencia/planilla";
import { armarReporte, type Marcacion } from "@/lib/asistencia/reporte";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import {
  COLUMNA_NO_MARCA_RELOJ,
  esColumnaNoMarcaRelojFaltante,
  noMarcaReloj,
  validarNoMarcaReloj,
} from "@/lib/asistencia/sueldo-fijo";

// ── Ayudantes ────────────────────────────────────────────────────────────────

const Q = periodoDeQuincena(quincenaDesdeClave("2026-07-1")!);

/** EDWIN GOMEZ, tal como está en el Excel de Vistana del 16 al 30 de julio:
 *  $700/mes, jornada de 48 h (rata 3,36 = 700 ÷ 208) y paga seguros. */
const edwin = (over: Partial<FichaPlanilla> = {}): FichaPlanilla => ({
  codigo: "V-EG",
  nombre: "EDWIN GOMEZ",
  salarioMensual: 700,
  jornadaSemanal: 48,
  empresa: "vistana",
  pagaSeguros: true,
  ...over,
});

const marca = (codigo: string, dia: string, hhmm: string): Marcacion => ({
  empleado_codigo: codigo,
  empleado_nombre: null,
  ocurrio_en: `2026-07-${dia}T${hhmm}:00-05:00`,
});

/**
 * El cuadro de la quincena. `marcaciones` vacío = nadie pasó por el reloj.
 *
 * 🔑 Va por `armarPlanilla` y no por `armarLinea`: la rama de «no marcó ni un
 * día» vive ahí, y probar la función de abajo dejaría sin probar justo lo que
 * este cambio toca.
 */
const cuadro = (ficha: FichaPlanilla, marcaciones: Marcacion[] = []) => {
  const personas = armarReporte({
    marcaciones,
    horarios: [{ empleado_codigo: ficha.codigo, entrada: "08:00", salida: "17:00", almuerzo_minutos: 30 }],
    justificaciones: [], feriados: new Map(),
    desde: Q.desde, hasta: Q.hasta,
    reglas: REGLAS_DEFAULT,
    incluirNoHabiles: true,
  });
  return armarPlanilla({
    personas,
    fichas: new Map([[ficha.codigo, ficha]]),
    jornadaDiariaMin: () => 480,
    reglas: REGLAS_DEFAULT,
    empresa: "vistana",
  })[0];
};

beforeEach(() => {
  upserts.length = 0;
  respuestas = [];
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 EL CANDADO DE CONDUCTA — las tres, y ninguna prueba sola", () => {
  it("1. CON la bandera y CERO marcaciones: cobra, y NO es el pendiente de nadie", () => {
    const l = cuadro(edwin({ noMarcaReloj: true }));

    // El número del Excel de la contadora: quincenal 350, seguros 34,13 + 4,38.
    // 🔑 $311,49 y no $311,50: el módulo redondea los seguros a centavos y ella
    // no. Es el MISMO centavo que ya tienen las otras 8 personas que pagan
    // seguros — no es de Edwin y no se toca acá.
    expect(l.dinero).not.toBeNull();
    expect(l.dinero!.salarioQuincenal).toBe(350);
    expect(l.dinero!.seguroSocial).toBe(34.13);
    expect(l.dinero!.seguroEducativo).toBe(4.38);
    expect(l.dinero!.netoPagar).toBe(311.49);

    // Lo que ANTES pasaba y ya no: ni pendiente, ni «Tú decides».
    expect(l.faltaConfigurar).toEqual([]);
    expect(l.decidirAMano).toBeNull();
    expect(l.noMarcaReloj).toBe(true);

    // Y entra al total como cualquiera que cobra: no es un caso aparte.
    const t = totalizar([l]);
    expect(t.personas).toBe(1);
    expect(t.netoPagar).toBe(311.49);
    expect(t.sinConfigurar).toBe(0);
    expect(t.fueraDePlanilla).toBe(0);
    expect(t.decidirAMano).toBe(0);
  });

  it("2. 🩸 CON la bandera y CON marcaciones: EL MISMO NETO, al centavo", () => {
    // Un solo día marcado, y encima tarde. Sin la bandera esto son trece días de
    // ausencia y una tardanza — o sea, otro neto completamente distinto.
    const marcas = [
      marca("V-EG", "13", "09:47"), marca("V-EG", "13", "12:00"),
      marca("V-EG", "13", "12:30"), marca("V-EG", "13", "19:40"),
    ];
    const sinMarcas = cuadro(edwin({ noMarcaReloj: true }));
    const conMarcas = cuadro(edwin({ noMarcaReloj: true }), marcas);

    expect(conMarcas.dinero!.netoPagar).toBe(sinMarcas.dinero!.netoPagar);
    expect(conMarcas.dinero).toEqual(sinMarcas.dinero);

    // Y no es que se hayan compensado: TODAS las columnas del reloj están en
    // cero. Si alguna se moviera, el sueldo fijo dejaría de ser fijo.
    const d = conMarcas.dinero!;
    expect(d.ausencias).toBe(0);
    expect(d.tardanzas).toBe(0);
    expect(d.extraDiurno).toBe(0);
    expect(d.extraNocturno).toBe(0);
    expect(d.excedente).toBe(0);
    expect(d.domingos).toBe(0);
    expect(d.feriados).toBe(0);
    expect(d.totalBruto).toBe(350);

    // La prueba de que el escenario NO era inofensivo: sin la bandera, esas
    // mismas marcas mueven el neto. Si esto no cambiara, el test de arriba
    // estaría pasando por casualidad.
    const sinBandera = cuadro(edwin(), marcas);
    expect(sinBandera.dinero!.netoPagar).not.toBe(d.netoPagar);
    expect(sinBandera.dinero!.ausencias).toBeGreaterThan(0);
  });

  it("3. 🔴 SIN la bandera y cero marcaciones: sigue cayendo en «no marcó ni un día»", () => {
    // El que impide que la bandera se filtre. Nadie más cambia de conducta.
    const l = cuadro(edwin());
    expect(l.dinero).toBeNull();
    expect(l.faltaConfigurar).toContain(FALTA.sinMarcaciones);
    expect(l.noMarcaReloj).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("el default: el día que esto sale, no se mueve un centavo", () => {
  it("ausente, `null`, `undefined` o `false` significan lo mismo: SÍ marca", () => {
    for (const v of [undefined, null, false, "false", 0, "", "cualquier cosa"]) {
      expect(noMarcaReloj(v)).toBe(false);
    }
    for (const v of [true, "true", 1, "1"]) expect(noMarcaReloj(v)).toBe(true);
  });

  it("un cuerpo sin el campo NO prende la bandera", () => {
    expect(validarNoMarcaReloj({})).toEqual({ ok: true, valor: false });
    expect(validarNoMarcaReloj({ noMarcaReloj: "" })).toEqual({ ok: true, valor: false });
    expect(validarNoMarcaReloj(null)).toEqual({ ok: true, valor: false });
    expect(validarNoMarcaReloj({ noMarcaReloj: true })).toEqual({ ok: true, valor: true });
    expect(validarNoMarcaReloj({ noMarcaReloj: "sí" }).ok).toBe(false);
  });

  it("una ficha vieja —sin el campo— da EXACTAMENTE el número de ayer", () => {
    const marcas = [
      marca("V-EG", "13", "08:00"), marca("V-EG", "13", "12:00"),
      marca("V-EG", "13", "12:30"), marca("V-EG", "13", "17:00"),
    ];
    const vieja = cuadro(edwin(), marcas);
    const explicita = cuadro(edwin({ noMarcaReloj: false }), marcas);
    expect(explicita).toEqual(vieja);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("lo que la bandera NO apaga", () => {
  it("apaga el reloj, no la ficha: sin salario sigue diciendo «falta el salario»", () => {
    const l = cuadro(edwin({ noMarcaReloj: true, salarioMensual: null }));
    expect(l.dinero).toBeNull();
    expect(l.faltaConfigurar).toContain(FALTA.salario);
    // 🔑 Pero NO le agrega «no marcó ni un día»: eso mandaría a arreglar en
    // Configuración algo que no hay que arreglar.
    expect(l.faltaConfigurar).not.toContain(FALTA.sinMarcaciones);
  });

  it("la vigencia SIGUE mandando: entrar a mitad del período lo abstiene igual", () => {
    // Entrar o salir a mitad de la quincena no tiene nada que ver con el reloj:
    // ahí el sistema se abstiene aunque cobre fijo, porque el prorrateo lo
    // decide una persona.
    const personas = armarReporte({
      marcaciones: [], horarios: [], justificaciones: [], feriados: new Map(),
      desde: Q.desde, hasta: Q.hasta, reglas: REGLAS_DEFAULT, incluirNoHabiles: true,
    });
    const [l] = armarPlanilla({
      personas,
      fichas: new Map([["V-EG", edwin({ noMarcaReloj: true })]]),
      jornadaDiariaMin: () => 480,
      reglas: REGLAS_DEFAULT,
      empresa: "vistana",
      decidirAMano: new Map([["V-EG", "entró el 10 de julio de 2026"]]),
    });
    expect(l.dinero).toBeNull();
    expect(l.decidirAMano).toBe("entró el 10 de julio de 2026");
  });

  // El rótulo decía «Decidilo vos» hasta el 1-sep-2026; se renombró a «Tú decides» porque era voseo y el sistema habla tuteo neutro (candado `nada-de-voseo`).
  it("🔴 pero una justificación NO lo manda a «Tú decides»", () => {
    // Que no haya marcas no es un hecho a explicar: es su forma de trabajar.
    // Mirar `justificados` le pondría un texto de vacaciones que además es falso.
    const personas = armarReporte({
      marcaciones: [], horarios: [], justificaciones: [], feriados: new Map(),
      desde: Q.desde, hasta: Q.hasta, reglas: REGLAS_DEFAULT, incluirNoHabiles: true,
    });
    const armar = (noMarca: boolean) => armarPlanilla({
      personas,
      fichas: new Map([["V-EG", edwin({ noMarcaReloj: noMarca })]]),
      jornadaDiariaMin: () => 480,
      reglas: REGLAS_DEFAULT,
      empresa: "vistana",
      justificados: new Map([["V-EG", "Vacaciones del 1 jul 2026 al 15 jul 2026"]]),
    })[0];

    expect(armar(true).decidirAMano).toBeNull();
    expect(armar(true).dinero!.netoPagar).toBe(311.49);
    // Sin la bandera, la justificación sigue funcionando igual que siempre.
    expect(armar(false).decidirAMano).toBe("Vacaciones del 1 jul 2026 al 15 jul 2026");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("el PUT y la migración pendiente", () => {
  const cuerpo = (over: Record<string, unknown> = {}) => ({
    codigo: "V-EG",
    nombre: "EDWIN GOMEZ",
    salarioMensual: "700",
    jornadaSemanal: 48,
    empresa: "vistana",
    pagaSeguros: true,
    ...over,
  });
  const pedido = (body: Record<string, unknown>) =>
    new Request("http://local/api/asistencia/configuracion", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;

  const errorColumna = {
    code: "PGRST204",
    message: `Could not find the '${COLUMNA_NO_MARCA_RELOJ}' column of 'asistencia_personas' in the schema cache`,
  };

  it("guarda la bandera en la columna, con el nombre que dice el módulo", async () => {
    const res = await putPersona(pedido(cuerpo({ noMarcaReloj: true })));
    expect(res.status).toBe(200);
    expect(upserts[0][COLUMNA_NO_MARCA_RELOJ]).toBe(true);
  });

  // ⚠️ CAMBIARON DE DIRECCIÓN EL 3-SEP-2026 (tolerancia a la DDL retirada).
  // Hasta ese día, con PGRST204 nombrando la columna: prender el sueldo fijo
  // daba 503 con el nombre del archivo, y con la bandera apagada se REINTENTABA
  // sin la columna (200, dos upserts). La columna existe desde 20260826080000;
  // hoy ese código es un error como cualquier otro: 500, UN solo upsert, sin
  // reintento — reintentar dejaría a Edwin cayendo en «no marcó ni un día»
  // todas las quincenas, y nadie sabría por qué.
  it("🔴 PGRST204 con la bandera prendida: 500, sin «falta la migración», y NO se guarda a medias", async () => {
    respuestas = [{ error: errorColumna }];
    const res = await putPersona(pedido(cuerpo({ noMarcaReloj: true })));
    expect(res.status).toBe(500);
    const d = await res.json();
    expect(d.faltaMigracionNoMarcaReloj).toBeUndefined();
    expect(d.error).not.toContain("20260826080000");
    expect(upserts).toHaveLength(1);
  });

  it("🔴 PGRST204 con la bandera apagada: TAMPOCO se reintenta — 500 y un solo upsert", async () => {
    respuestas = [{ error: errorColumna }, { error: null }];
    const res = await putPersona(pedido(cuerpo({ noMarcaReloj: false })));
    expect(res.status).toBe(500);
    expect(upserts).toHaveLength(1);
    // La única escritura fue la completa, con la columna adentro.
    expect(upserts[0]).toHaveProperty(COLUMNA_NO_MARCA_RELOJ);
  });

  it("⚠️ el error tiene que NOMBRAR la columna, o no es esta migración", () => {
    expect(esColumnaNoMarcaRelojFaltante(errorColumna)).toBe(true);
    expect(esColumnaNoMarcaRelojFaltante({ code: "42703", message: "column no_marca_reloj does not exist" })).toBe(true);
    // Un problema real —permisos, red, RLS— NO se lee como «falta la migración».
    expect(esColumnaNoMarcaRelojFaltante({ code: "42501", message: "permission denied" })).toBe(false);
    expect(esColumnaNoMarcaRelojFaltante({ code: "PGRST204", message: "Could not find the 'paga_seguros' column" })).toBe(false);
    expect(esColumnaNoMarcaRelojFaltante(null)).toBe(false);
  });
});
