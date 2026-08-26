// ─────────────────────────────────────────────────────────────────────────────
// LA BASE PROPIA DE LOS SEGUROS — el candado
//
// 🩸 EL CASO REAL. La contadora, textual, cuando Daniel le preguntó de dónde
// salían los $17,06 de seguro social de RODRIGO MIRANDA escritos a mano en su
// Excel: *«Con respecto a Rodrigo, sí su base para el cálculo del seguro social
// y seguro educativo es 175.00. Recuerda que te comenté que él está en una
// planilla doméstica y con un menor salario.»*
//
//     175,00 × 9,75 % = 17,0625 → $17,06
//     175,00 × 1,25 % =  2,1875 →  $2,19
//
// El módulo se los calculaba sobre su bruto de $403,94: $39,38 + $5,05, o sea
// **$25,18 de más por quincena** a una persona de verdad.
//
// 🔴 LO QUE SE PRUEBA ACÁ, Y NINGUNA DE LAS CINCO SE PUEDE PROBAR SOLA:
//   1. EL DEFAULT ES «SOBRE EL BRUTO». Sin la columna, con `null`, con `0` o
//      con una ficha vieja, el número es EXACTAMENTE el de ayer. Es lo que hace
//      que este cambio salga a producción sin mover un centavo.
//   2. LOS DOS MONTOS DE RODRIGO, AL CENTAVO, contra su Excel.
//   3. CON BASE, SOLO SE MUEVEN LAS DOS COLUMNAS DE SEGUROS. El bruto, los
//      recargos, las ausencias y los montos escritos a mano son idénticos.
//   4. 🔴 EL CANDADO DEL ORDEN: la base NO enciende los seguros de nadie. Con
//      `pagaSeguros: false` las dos columnas siguen en $0,00 aunque haya base.
//   5. EL PERÍODO PARCIAL sigue el criterio del sueldo: una quincena entera da
//      la base clavada, y un rango libre la reparte con el MISMO factor.
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
  armarLinea,
  calcularDinero,
  centavos,
  HORAS_CERO,
  MANUALES_CERO,
  type FichaPlanilla,
  type HorasPersona,
} from "@/lib/asistencia/planilla";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import {
  baseSeguros,
  BASE_SEGUROS_MAX,
  chipBaseSeguros,
  COLUMNA_BASE_SEGUROS,
  esColumnaBaseSegurosFaltante,
  MIGRACION_BASE_SEGUROS,
  validarBaseSeguros,
} from "@/lib/asistencia/seguros-base";

// ── Ayudantes ────────────────────────────────────────────────────────────────

/** La base que dijo la contadora, y los dos montos que ella escribió a mano. */
const BASE_RODRIGO = 175;
const SU_SEGURO_SOCIAL = 17.06;
const SU_SEGURO_EDUCATIVO = 2.19;

/** RODRIGO MIRANDA (código 13, Vistana). Ficha real de producción. */
const ficha = (over: Partial<FichaPlanilla> = {}): FichaPlanilla => ({
  codigo: "13",
  nombre: "RODRIGO MIRANDA",
  salarioMensual: 800,
  jornadaSemanal: 48,
  empresa: "vistana",
  ...over,
});

/** Horas con algo en CADA columna que toca dinero. Así, si alguna se moviera al
 *  poner la base, el test lo ve — con horas en cero no probaría nada. */
const HORAS_CON_TODO: HorasPersona = {
  ...HORAS_CERO,
  extraDiurnoMin: 90,
  extraNocturnoMin: 30,
  excedenteMin: 15,
  domingoMin: 120,
  feriadoMin: 60,
  ausenciaMin: 45,
  tardanzaMin: 22,
};

const MANUALES_CON_TODO = {
  isr: 12.5, prestamo: 40, terceros: 7.25, mercancia: 16, otrosServicios: 9.75,
};

const linea = (f: FichaPlanilla, horas = HORAS_CON_TODO) =>
  armarLinea(f, horas, MANUALES_CON_TODO, REGLAS_DEFAULT);

const pedido = (body: unknown) => ({ json: async () => body }) as never;

beforeEach(() => {
  upserts.length = 0;
  respuestas = [];
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🩸 LOS DOS MONTOS DE RODRIGO, AL CENTAVO", () => {
  it("175,00 da $17,06 de social y $2,19 de educativo — lo que ella escribió a mano", () => {
    // 🔴 LA PRUEBA DE QUE LA REGLA ES LA DE LA CONTADORA. Los dos números están
    // escritos arriba como constantes y salen del CÁLCULO REAL, no de repetir
    // la multiplicación acá: si mañana alguien toca el redondeo o el orden de
    // los porcentajes, este test se cae con los dólares en la cara.
    const d = linea(ficha({ baseSeguros: BASE_RODRIGO })).dinero!;
    expect(d.seguroSocial).toBe(SU_SEGURO_SOCIAL);
    expect(d.seguroEducativo).toBe(SU_SEGURO_EDUCATIVO);
  });

  it("sobre el bruto le salían $25,18 de más por quincena", () => {
    const conBruto = linea(ficha()).dinero!;
    const conBase = linea(ficha({ baseSeguros: BASE_RODRIGO })).dinero!;

    const deMas =
      (conBruto.seguroSocial + conBruto.seguroEducativo)
      - (conBase.seguroSocial + conBase.seguroEducativo);
    // Sobre el bruto los seguros son mayores, y su neto sube EXACTAMENTE eso.
    expect(deMas).toBeGreaterThan(0);
    expect(conBase.netoPagar - conBruto.netoPagar).toBeCloseTo(deMas, 2);
  });

  it("con su bruto real de producción ($403,94) la diferencia es $25,18", () => {
    // 🔑 EL NÚMERO MEDIDO EN PRODUCCIÓN. Su bruto de la quincena era $403,94:
    //   sobre el bruto → 403,94 × 9,75 % = 39,38  y  403,94 × 1,25 % = 5,05
    //   sobre la base  → 175,00 × 9,75 % = 17,06  y  175,00 × 1,25 % = 2,19
    //   de más         → (39,38 + 5,05) − (17,06 + 2,19) = 25,18
    const BRUTO = 403.94;
    const sobreBruto = centavos(BRUTO * 0.0975) + centavos(BRUTO * 0.0125);
    const sobreBase = SU_SEGURO_SOCIAL + SU_SEGURO_EDUCATIVO;
    expect(centavos(BRUTO * 0.0975)).toBe(39.38);
    expect(centavos(BRUTO * 0.0125)).toBe(5.05);
    expect(centavos(sobreBruto - sobreBase)).toBe(25.18);
  });

  it("la línea trae el sello con el monto, para que el número se explique solo", () => {
    const l = linea(ficha({ baseSeguros: BASE_RODRIGO }));
    expect(l.baseSeguros).toBe(BASE_RODRIGO);
    expect(l.dinero!.baseSeguros).toBe(BASE_RODRIGO);
    // El sello dice el monto: sin él, $17,06 donde se esperaba $39,38 no se
    // puede reconstruir sin preguntarle a alguien.
    expect(chipBaseSeguros(BASE_RODRIGO)).toContain("175.00");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 EL DEFAULT ES «SOBRE EL BRUTO» — nada se mueve hasta que alguien la cargue", () => {
  it("vacío, nulo, ausente, cero y basura significan «no tiene base propia»", () => {
    for (const v of [undefined, null, "", "   ", 0, "0", -5, "hola", NaN, {}, []]) {
      expect(baseSeguros(v), `${JSON.stringify(v)} no debería ser una base`).toBeNull();
    }
    // 🔴 EL CERO NO ES UNA BASE. Apagaría los dos seguros por un camino distinto
    // al del interruptor —sin sello, sin aviso y sin que la pantalla diga nada—.
    expect(baseSeguros(0)).toBeNull();
    // Un monto de verdad sí, venga como número o como TEXTO (PostgREST manda
    // los `numeric` como texto: verificado en pglite, devuelve "175.00").
    expect(baseSeguros(175)).toBe(175);
    expect(baseSeguros("175.00")).toBe(175);
    expect(baseSeguros("175,50")).toBe(175.5);
    // Y por encima del tope tampoco: eso no es un dato, es un tecleo.
    expect(baseSeguros(BASE_SEGUROS_MAX + 1)).toBeNull();
  });

  it("una ficha SIN el campo da EXACTAMENTE lo mismo que una con `null` o con `0`", () => {
    const vieja = { ...ficha() };
    delete (vieja as Record<string, unknown>).baseSeguros;
    const conNull = linea(ficha({ baseSeguros: null }));
    const conCero = linea(ficha({ baseSeguros: 0 }));

    expect(linea(vieja).dinero).toEqual(conNull.dinero);
    expect(conCero.dinero).toEqual(conNull.dinero);
    // Y cobra de verdad sobre el bruto: si todos fueran cero no probaría nada.
    expect(conNull.dinero!.seguroSocial).toBeGreaterThan(0);
    expect(conNull.dinero!.baseSeguros).toBeNull();
  });

  it("`calcularDinero` sin el parámetro nuevo devuelve lo de siempre", () => {
    const sinParametro = calcularDinero(800, 48, HORAS_CON_TODO, MANUALES_CON_TODO, REGLAS_DEFAULT, 1, true);
    const conNull = calcularDinero(800, 48, HORAS_CON_TODO, MANUALES_CON_TODO, REGLAS_DEFAULT, 1, true, null);
    expect(sinParametro).toEqual(conNull);
    // Y los seguros salen del BRUTO, que es la fórmula cotejada contra el Excel.
    expect(sinParametro!.seguroSocial).toBe(centavos(sinParametro!.totalBruto * 0.0975));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 CON BASE: se mueven las dos columnas de seguros y NADA MÁS", () => {
  it("el bruto y las 16 columnas que no son seguros quedan IDÉNTICOS", () => {
    const sin = linea(ficha()).dinero!;
    const con = linea(ficha({ baseSeguros: BASE_RODRIGO })).dinero!;

    // 🩸 Ésta es la prueba de que la fórmula cotejada al centavo contra el
    // Excel sigue valiendo: la base no toca el cálculo del bruto, solo decide
    // sobre qué monto se aplica el porcentaje.
    for (const campo of [
      "rataHora", "valorMinuto", "salarioQuincenal", "extraDiurno", "extraNocturno",
      "excedente", "domingos", "feriados", "ausencias", "tardanzas", "totalBruto",
      "isr", "prestamo", "terceros", "mercancia", "otrosServicios",
    ] as const) {
      expect(con[campo], `la columna ${campo} se movió`).toBe(sin[campo]);
    }
  });

  it("el neto sube EXACTAMENTE lo que se dejó de retener, ni un centavo más", () => {
    const sin = linea(ficha()).dinero!;
    const con = linea(ficha({ baseSeguros: BASE_RODRIGO })).dinero!;

    const dejadoDeRetener =
      (sin.seguroSocial + sin.seguroEducativo) - (con.seguroSocial + con.seguroEducativo);
    expect(con.netoPagar - sin.netoPagar).toBeCloseTo(dejadoDeRetener, 2);
    expect(sin.totalDeducciones - con.totalDeducciones).toBeCloseTo(dejadoDeRetener, 2);
    // El resto de las deducciones sigue entero: una base propia no perdona un
    // préstamo ni un ISR.
    expect(con.totalDeducciones).toBeCloseTo(
      con.seguroSocial + con.seguroEducativo + 12.5 + 40 + 7.25 + 16, 2,
    );
  });

  it("🔴 LOS DOS SIGUEN JUNTOS: la base se aplica a los dos o a ninguno", () => {
    const d = linea(ficha({ baseSeguros: BASE_RODRIGO })).dinero!;
    expect(d.seguroSocial).toBe(centavos(BASE_RODRIGO * 0.0975));
    expect(d.seguroEducativo).toBe(centavos(BASE_RODRIGO * 0.0125));
  });

  it("una base NO le calcula pago a quien no va en planilla ni a quien se decide a mano", () => {
    const fuera = linea(ficha({ servicioProfesional: true, baseSeguros: BASE_RODRIGO }));
    expect(fuera.dinero).toBeNull();
    expect(fuera.fueraDePlanilla).toBe(true);

    const decidir = armarLinea(
      ficha({ baseSeguros: BASE_RODRIGO }), HORAS_CON_TODO, MANUALES_CON_TODO,
      REGLAS_DEFAULT, 1, "entró el 10 de agosto de 2026",
    );
    expect(decidir.dinero).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 EL CANDADO DEL ORDEN — la base NO enciende los seguros de nadie", () => {
  it("con los seguros APAGADOS, una base cargada deja las dos columnas en $0,00", () => {
    // 🩸 EL MODO DE FALLO QUE ESTO EXISTE PARA HACER IMPOSIBLE: un monto tecleado
    // en el campo de al lado empezándole a retener a alguien a quien la
    // contadora no le retiene. No se ve en ningún lado hasta el día de cobro.
    const d = linea(ficha({ pagaSeguros: false, baseSeguros: BASE_RODRIGO })).dinero!;
    expect(d.seguroSocial).toBe(0);
    expect(d.seguroEducativo).toBe(0);
    // Y el sello NO se muestra: lo que corresponde decir ahí es «sin seguros»,
    // no una base que no se usó para nada.
    expect(d.baseSeguros).toBeNull();
    expect(linea(ficha({ pagaSeguros: false, baseSeguros: BASE_RODRIGO })).baseSeguros).toBeNull();
  });

  it("apagado + base da EXACTAMENTE lo mismo que apagado a secas", () => {
    const soloApagado = linea(ficha({ pagaSeguros: false })).dinero!;
    const apagadoConBase = linea(ficha({ pagaSeguros: false, baseSeguros: BASE_RODRIGO })).dinero!;
    expect(apagadoConBase).toEqual(soloApagado);
  });

  it("prendido + base sí cobra, para que la igualdad de arriba no sea trivial", () => {
    const d = linea(ficha({ pagaSeguros: true, baseSeguros: BASE_RODRIGO })).dinero!;
    expect(d.seguroSocial).toBe(SU_SEGURO_SOCIAL);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("⚠️ EL PERÍODO — la base sigue el MISMO criterio que el sueldo quincenal", () => {
  it("una quincena entera (factor 1) da la base CLAVADA, sin arrastre de coma", () => {
    // `× 1` no cambia un número IEEE-754: en toda planilla real la base es la
    // que se escribió, hasta el último centavo.
    const d = calcularDinero(
      800, 48, HORAS_CON_TODO, MANUALES_CON_TODO, REGLAS_DEFAULT, 1, true, BASE_RODRIGO,
    )!;
    expect(d.baseSeguros).toBe(BASE_RODRIGO);
    expect(d.seguroSocial).toBe(SU_SEGURO_SOCIAL);
    expect(d.seguroEducativo).toBe(SU_SEGURO_EDUCATIVO);
  });

  it("un rango libre reparte la base con el MISMO factor que el quincenal", () => {
    // 🔴 SI NO SE REPARTIERA, media quincena pagaría medio sueldo y el seguro
    // ENTERO: la base sería el único renglón del cuadro que no se achica al
    // achicar el rango, y quien lo encuentre deja de confiar en el cuadro.
    const medio = calcularDinero(
      800, 48, HORAS_CERO, MANUALES_CERO, REGLAS_DEFAULT, 0.5, true, BASE_RODRIGO,
    )!;
    const entero = calcularDinero(
      800, 48, HORAS_CERO, MANUALES_CERO, REGLAS_DEFAULT, 1, true, BASE_RODRIGO,
    )!;
    expect(medio.baseSeguros).toBe(centavos(BASE_RODRIGO * 0.5));
    expect(medio.salarioQuincenal).toBe(centavos(entero.salarioQuincenal * 0.5));
    // La base se achica en la MISMA proporción que el sueldo. Es el criterio ya
    // escrito para el quincenal, no uno nuevo inventado para esto.
    expect(medio.baseSeguros! / entero.baseSeguros!)
      .toBeCloseTo(medio.salarioQuincenal / entero.salarioQuincenal, 6);
  });

  it("un factor roto cae del lado seguro: la quincena COMPLETA, como se pagaba ayer", () => {
    // Mismo guard que ya protege al quincenal. `centavos(NaN)` da 0, o sea una
    // base de $0 que apagaría los seguros en silencio.
    const roto = calcularDinero(
      800, 48, HORAS_CERO, MANUALES_CERO, REGLAS_DEFAULT, NaN, true, BASE_RODRIGO,
    )!;
    expect(roto.baseSeguros).toBe(BASE_RODRIGO);
    expect(roto.seguroSocial).toBe(SU_SEGURO_SOCIAL);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("el dato y la migración", () => {
  it("el validador convierte él y rechaza lo que no es un monto", () => {
    // Ausente o vacío = `null`: para cualquier llamador que no sea el
    // formulario, el valor seguro es el que deja el cálculo como está hoy.
    expect(validarBaseSeguros({})).toEqual({ ok: true, valor: null });
    expect(validarBaseSeguros({ baseSeguros: "" })).toEqual({ ok: true, valor: null });
    expect(validarBaseSeguros({ baseSeguros: "   " })).toEqual({ ok: true, valor: null });
    expect(validarBaseSeguros({ baseSeguros: null })).toEqual({ ok: true, valor: null });

    expect(validarBaseSeguros({ baseSeguros: "175" })).toEqual({ ok: true, valor: 175 });
    expect(validarBaseSeguros({ baseSeguros: 175 })).toEqual({ ok: true, valor: 175 });
    // Coma decimal: la contadora escribe con coma tan seguido como con punto.
    expect(validarBaseSeguros({ baseSeguros: "175,50" })).toEqual({ ok: true, valor: 175.5 });
    // A centavos, porque la columna es `numeric(12,2)`: sin esto un 175,004 se
    // guardaría distinto de como se muestra.
    expect(validarBaseSeguros({ baseSeguros: "175.004" })).toEqual({ ok: true, valor: 175 });

    // 🔴 El cero se RECHAZA en vez de guardarse. Apagar los seguros se hace con
    // el interruptor de al lado, que sí lo dice en pantalla.
    const cero = validarBaseSeguros({ baseSeguros: "0" });
    expect(cero.ok).toBe(false);
    expect(cero.ok === false && cero.error).toContain("vacía");

    expect(validarBaseSeguros({ baseSeguros: "-5" }).ok).toBe(false);
    expect(validarBaseSeguros({ baseSeguros: "hola" }).ok).toBe(false);
    expect(validarBaseSeguros({ baseSeguros: BASE_SEGUROS_MAX + 1 }).ok).toBe(false);
  });

  it("la detección de «falta la columna» exige que el error la NOMBRE", () => {
    expect(esColumnaBaseSegurosFaltante({
      code: "PGRST204",
      message: `Could not find the '${COLUMNA_BASE_SEGUROS}' column of 'asistencia_personas'`,
    })).toBe(true);
    expect(esColumnaBaseSegurosFaltante({
      code: "42703", message: `column asistencia_personas.${COLUMNA_BASE_SEGUROS} does not exist`,
    })).toBe(true);
    // 🩸 Un problema real —permisos, red, RLS— NO puede leerse como "falta la
    // migración": eso convierte un error en una pantalla que miente.
    expect(esColumnaBaseSegurosFaltante({ code: "42501", message: "permission denied" })).toBe(false);
    expect(esColumnaBaseSegurosFaltante({ message: "fetch failed" })).toBe(false);
    expect(esColumnaBaseSegurosFaltante({ code: "42703", message: "column otra_cosa does not exist" })).toBe(false);
    expect(esColumnaBaseSegurosFaltante(null)).toBe(false);
  });

  it("🔑 el nombre de la columna dice la UNIDAD, que es lo único ambiguo de esto", () => {
    // Si mañana alguien la renombra a `seguros_base` a secas, quien la lea en
    // seis meses tiene que adivinar si los 175 son del mes o de la quincena —y
    // esa duda vale la mitad de un seguro—. El nombre lo contesta.
    expect(COLUMNA_BASE_SEGUROS).toContain("quincena");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 CONDUCTA — el PUT real, mirando la fila que se escribe", () => {
  const cuerpo = (over: Record<string, unknown> = {}) => ({
    codigo: "13", nombre: "RODRIGO MIRANDA", salarioMensual: 800,
    jornadaSemanal: 48, empresa: "vistana", ...over,
  });

  it("guarda la base con el monto que se escribió", async () => {
    const res = await putPersona(pedido(cuerpo({ baseSeguros: "175" })));
    expect(res.status).toBe(200);
    expect(upserts[0][COLUMNA_BASE_SEGUROS]).toBe(175);
    const d = await res.json();
    expect(d.persona.baseSeguros).toBe(175);
  });

  it("sin mandar el campo, la fila se guarda SIN base: los seguros salen del bruto", async () => {
    await putPersona(pedido(cuerpo()));
    expect(upserts[0][COLUMNA_BASE_SEGUROS]).toBeNull();
  });

  it("un campo vacío BORRA la base — que es como se vuelve atrás", async () => {
    await putPersona(pedido(cuerpo({ baseSeguros: "" })));
    expect(upserts[0][COLUMNA_BASE_SEGUROS]).toBeNull();
  });

  it("🩸 SIN LA COLUMNA CORRIDA: guardar un nombre sigue funcionando", async () => {
    respuestas = [{
      error: {
        code: "PGRST204",
        message: `Could not find the '${COLUMNA_BASE_SEGUROS}' column of 'asistencia_personas'`,
      },
    }];
    const res = await putPersona(pedido(cuerpo()));
    expect(res.status).toBe(200);
    // Se reintentó SIN la columna, y el nombre quedó guardado igual que ayer.
    expect(upserts).toHaveLength(2);
    expect(COLUMNA_BASE_SEGUROS in upserts[1]).toBe(false);
    expect(upserts[1].nombre).toBe("RODRIGO MIRANDA");
  });

  it("🔴 SIN LA COLUMNA CORRIDA: cargarle la base a alguien NO se guarda a medias", async () => {
    respuestas = [{
      error: {
        code: "PGRST204",
        message: `Could not find the '${COLUMNA_BASE_SEGUROS}' column of 'asistencia_personas'`,
      },
    }];
    const res = await putPersona(pedido(cuerpo({ baseSeguros: "175" })));
    // 🩸 Un "guardado" que se traga la base le seguiría reteniendo a Rodrigo
    // $39,38 donde le tocan $17,06, y nadie sabría por qué.
    expect(res.status).toBe(503);
    const d = await res.json();
    expect(d.faltaMigracionBaseSeguros).toBe(true);
    expect(d.error).toContain(MIGRACION_BASE_SEGUROS);
    // Y NO se reintentó: una sola escritura, la que falló.
    expect(upserts).toHaveLength(1);
  });

  it("un monto que no es un monto se rechaza con 400 y no escribe nada", async () => {
    for (const v of ["hola", "0", "-5"]) {
      upserts.length = 0;
      const res = await putPersona(pedido(cuerpo({ baseSeguros: v })));
      expect(res.status, `${v} debería rebotar`).toBe(400);
      expect(upserts).toHaveLength(0);
    }
  });

  it("guardar la base NO apaga los seguros ni marca a nadie fuera de planilla", async () => {
    await putPersona(pedido(cuerpo({ baseSeguros: "175" })));
    // Las otras tres banderas quedan en su default: la base contesta UNA
    // pregunta y no toca las otras tres.
    expect(upserts[0].paga_seguros).toBe(true);
    expect(upserts[0].servicio_profesional).toBe(false);
    expect(upserts[0].no_marca_reloj).toBe(false);
  });
});
