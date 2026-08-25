// ─────────────────────────────────────────────────────────────────────────────
// A QUIÉN SE LE DESCUENTAN LOS SEGUROS — el candado
//
// La planilla se los cobraba a las 31 de 31. El Excel de la contadora (16 al 31
// de julio de 2026) se los cobra a 8 de 27: 4 de 19 en Boston, 6 de 8 en
// Vistana, NADIE en Fashion Wear.
//
// 🔴 LO QUE SE PRUEBA ACÁ, Y NINGUNA DE LAS TRES SE PUEDE PROBAR SOLA:
//   1. EL DEFAULT ES «SE COBRA». Sin la columna, con `null`, con `undefined` o
//      con una ficha vieja, el número es EXACTAMENTE el de ayer. Es lo que hace
//      que este cambio salga a producción sin mover un centavo.
//   2. APAGADO, SOLO SE MUEVEN LAS DOS COLUMNAS DE SEGUROS. El bruto, los
//      recargos, las ausencias, las tardanzas y los montos escritos a mano son
//      idénticos. Si el bruto se moviera, la fórmula cotejada al centavo contra
//      su Excel habría dejado de valer.
//   3. LOS DOS VAN JUNTOS. Daniel, textual: *"esto es junto, no es separado
//      cada uno. El que usa uno usará ambos."* No hay forma de tener el social
//      sin el educativo, y el candado lo prueba en dólares.
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
  HORAS_CERO,
  MANUALES_CERO,
  type FichaPlanilla,
  type HorasPersona,
} from "@/lib/asistencia/planilla";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import {
  COLUMNA_PAGA_SEGUROS,
  esColumnaPagaSegurosFaltante,
  pagaSeguros,
  validarPagaSeguros,
} from "@/lib/asistencia/seguros";

// ── Ayudantes ────────────────────────────────────────────────────────────────

/** BRICEIDA MONTERO (código 8, Boston): una de las cuatro que en el Excel de
 *  la contadora SÍ tienen la fórmula del 9,75 %. Ficha real de producción. */
const ficha = (over: Partial<FichaPlanilla> = {}): FichaPlanilla => ({
  codigo: "8",
  nombre: "BRICEIDA MONTERO",
  salarioMensual: 566.52,
  jornadaSemanal: 40,
  empresa: "confecciones_boston",
  ...over,
});

/** Horas con algo en CADA columna que toca dinero. Así, si alguna se moviera
 *  al apagar los seguros, el test lo ve — con horas en cero no probaría nada. */
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
describe("🔴 EL DEFAULT ES «SE LE COBRA» — nada se mueve hasta que alguien lo apague", () => {
  it("vacío, nulo, ausente y una ficha vieja significan «sí se le cobra»", () => {
    for (const v of [undefined, null, true, "", "true", 1, "1", "cualquier cosa"]) {
      expect(pagaSeguros(v)).toBe(true);
    }
    // 🔑 SOLO un `false` explícito lo apaga. Apagar un descuento por un
    // `undefined` es dejar de retener sin que nadie lo haya pedido, y eso se
    // descubre meses después cuando la Caja reclama lo que no se retuvo.
    expect(pagaSeguros(false)).toBe(false);
    expect(pagaSeguros("false")).toBe(false);
    expect(pagaSeguros(0)).toBe(false);
    expect(pagaSeguros("0")).toBe(false);
  });

  it("una ficha SIN el campo da EXACTAMENTE lo mismo que una con `true`", () => {
    const vieja = linea(ficha());
    const nueva = linea(ficha({ pagaSeguros: true }));
    expect(vieja.dinero).toEqual(nueva.dinero);
    // Y cobra de verdad: si los dos fueran cero, la igualdad no probaría nada.
    expect(vieja.dinero!.seguroSocial).toBeGreaterThan(0);
    expect(vieja.dinero!.seguroEducativo).toBeGreaterThan(0);
  });

  it("`calcularDinero` sin el parámetro nuevo devuelve lo de siempre", () => {
    const sinParametro = calcularDinero(566.52, 40, HORAS_CON_TODO, MANUALES_CON_TODO, REGLAS_DEFAULT, 1);
    const conTrue = calcularDinero(566.52, 40, HORAS_CON_TODO, MANUALES_CON_TODO, REGLAS_DEFAULT, 1, true);
    expect(sinParametro).toEqual(conTrue);
    expect(sinParametro!.seguroSocial).toBe(Number((sinParametro!.totalBruto * 0.0975).toFixed(2)));
  });

  it("🩸 un `null` o un `undefined` que llegan de la base tampoco apagan el descuento", () => {
    // 🩸 EL CASO REAL, Y ES EL QUE EL `!== false` EXISTE PARA TAPAR: la columna
    // llega de Postgres y una fila vieja trae `null`, no `undefined`. El valor
    // por defecto del parámetro NO se aplica con `null` —solo con `undefined`—,
    // así que un `=== true` acá dejaría de retenerle el 11 % en silencio a
    // cualquiera cuya fila tenga `null`. Es el error que este archivo existe
    // para hacer imposible, y por eso se prueba en dólares y no leyendo el `if`.
    const conNull = calcularDinero(
      566.52, 40, HORAS_CON_TODO, MANUALES_CON_TODO, REGLAS_DEFAULT, 1,
      null as unknown as boolean,
    )!;
    const conUndefined = calcularDinero(
      566.52, 40, HORAS_CON_TODO, MANUALES_CON_TODO, REGLAS_DEFAULT, 1,
      undefined as unknown as boolean,
    )!;
    const conTrue = calcularDinero(566.52, 40, HORAS_CON_TODO, MANUALES_CON_TODO, REGLAS_DEFAULT, 1, true)!;
    expect(conNull).toEqual(conTrue);
    expect(conUndefined).toEqual(conTrue);
    expect(conNull.seguroSocial).toBeGreaterThan(0);

    // Y lo mismo por el camino de `armarLinea`, con la ficha sin el campo y con
    // el campo en `null` — las dos formas en que llega una fila que nadie tocó.
    const fichaSinCampo = { ...ficha() };
    delete (fichaSinCampo as Record<string, unknown>).pagaSeguros;
    expect(linea(fichaSinCampo).dinero!.seguroSocial).toBeGreaterThan(0);
    expect(linea(ficha({ pagaSeguros: null as unknown as boolean })).dinero!.seguroSocial).toBeGreaterThan(0);
  });

  it("la línea expone la bandera para que un $0,00 no se lea como un error", () => {
    expect(linea(ficha()).pagaSeguros).toBe(true);
    expect(linea(ficha({ pagaSeguros: false })).pagaSeguros).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 APAGADO: se mueven las dos columnas de seguros y NADA MÁS", () => {
  it("el bruto y las 16 columnas que no son seguros quedan IDÉNTICOS", () => {
    const con = linea(ficha({ pagaSeguros: true })).dinero!;
    const sin = linea(ficha({ pagaSeguros: false })).dinero!;

    // 🩸 Ésta es la prueba de que la fórmula cotejada al centavo contra el
    // Excel de la contadora sigue valiendo: el interruptor no toca el cálculo,
    // solo decide si se retiene.
    for (const campo of [
      "rataHora", "valorMinuto", "salarioQuincenal", "extraDiurno", "extraNocturno",
      "excedente", "domingos", "feriados", "ausencias", "tardanzas", "totalBruto",
      "isr", "prestamo", "terceros", "mercancia", "otrosServicios",
    ] as const) {
      expect(sin[campo], `la columna ${campo} se movió`).toBe(con[campo]);
    }
  });

  it("las dos columnas van a $0,00 y el neto sube EXACTAMENTE lo que se dejó de retener", () => {
    const con = linea(ficha({ pagaSeguros: true })).dinero!;
    const sin = linea(ficha({ pagaSeguros: false })).dinero!;

    expect(sin.seguroSocial).toBe(0);
    expect(sin.seguroEducativo).toBe(0);

    const dejadoDeRetener = con.seguroSocial + con.seguroEducativo;
    expect(sin.netoPagar - con.netoPagar).toBeCloseTo(dejadoDeRetener, 2);
    expect(con.totalDeducciones - sin.totalDeducciones).toBeCloseTo(dejadoDeRetener, 2);
    // El resto de las deducciones sigue entero: apagar el seguro no perdona un
    // préstamo ni un ISR.
    expect(sin.totalDeducciones).toBeCloseTo(12.5 + 40 + 7.25 + 16, 2);
  });

  it("🔴 LOS DOS VAN JUNTOS: no hay forma de tener social sin educativo", () => {
    // Un solo interruptor, probado en dólares y no leyendo un `if`: en las dos
    // posiciones, o los dos tienen número o los dos están en cero.
    for (const v of [true, false]) {
      const d = linea(ficha({ pagaSeguros: v })).dinero!;
      expect(d.seguroSocial > 0).toBe(d.seguroEducativo > 0);
    }
  });

  it("apagarlo NO le calcula pago a quien no va en planilla", () => {
    // El candado del servicio profesional manda: quien no va en planilla sigue
    // sin producir un centavo, tenga los seguros apagados o prendidos.
    const l = linea(ficha({ servicioProfesional: true, pagaSeguros: false }));
    expect(l.dinero).toBeNull();
    expect(l.fueraDePlanilla).toBe(true);
  });

  it("apagarlo NO le calcula pago a quien el sistema deja para decidir a mano", () => {
    const l = armarLinea(
      ficha({ pagaSeguros: false }), HORAS_CON_TODO, MANUALES_CON_TODO,
      REGLAS_DEFAULT, 1, "entró el 10 de agosto de 2026",
    );
    expect(l.dinero).toBeNull();
    expect(l.decidirAMano).toBe("entró el 10 de agosto de 2026");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("el dato y la migración", () => {
  it("el validador convierte él y rechaza lo que no es una respuesta", () => {
    // Ausente = `true`: para cualquier llamador que no sea el formulario, el
    // valor seguro es el que RETIENE.
    expect(validarPagaSeguros({})).toEqual({ ok: true, valor: true });
    expect(validarPagaSeguros({ pagaSeguros: false })).toEqual({ ok: true, valor: false });
    expect(validarPagaSeguros({ pagaSeguros: "false" })).toEqual({ ok: true, valor: false });
    expect(validarPagaSeguros({ pagaSeguros: "quizás" }).ok).toBe(false);
  });

  it("la detección de «falta la columna» exige que el error la NOMBRE", () => {
    expect(esColumnaPagaSegurosFaltante({
      code: "PGRST204",
      message: `Could not find the '${COLUMNA_PAGA_SEGUROS}' column of 'asistencia_personas'`,
    })).toBe(true);
    expect(esColumnaPagaSegurosFaltante({
      code: "42703", message: "column asistencia_personas.paga_seguros does not exist",
    })).toBe(true);
    // 🩸 Un problema real —permisos, red, RLS— NO puede leerse como "falta la
    // migración": eso convierte un error en una pantalla que miente.
    expect(esColumnaPagaSegurosFaltante({ code: "42501", message: "permission denied" })).toBe(false);
    expect(esColumnaPagaSegurosFaltante({ message: "fetch failed" })).toBe(false);
    expect(esColumnaPagaSegurosFaltante({ code: "42703", message: "column otra_cosa does not exist" })).toBe(false);
    expect(esColumnaPagaSegurosFaltante(null)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 CONDUCTA — el PUT real, mirando la fila que se escribe", () => {
  it("guarda la columna con lo que se eligió", async () => {
    const res = await putPersona(pedido({
      codigo: "8", nombre: "BRICEIDA MONTERO", salarioMensual: 566.52,
      jornadaSemanal: 40, empresa: "confecciones_boston", pagaSeguros: false,
    }));
    expect(res.status).toBe(200);
    expect(upserts[0][COLUMNA_PAGA_SEGUROS]).toBe(false);
  });

  it("sin mandar el campo, la fila se guarda con «sí se le cobra»", async () => {
    await putPersona(pedido({
      codigo: "8", nombre: "BRICEIDA MONTERO", salarioMensual: 566.52,
      jornadaSemanal: 40, empresa: "confecciones_boston",
    }));
    expect(upserts[0][COLUMNA_PAGA_SEGUROS]).toBe(true);
  });

  it("🩸 SIN LA COLUMNA CORRIDA: guardar un nombre sigue funcionando", async () => {
    respuestas = [{
      error: { code: "PGRST204", message: `Could not find the '${COLUMNA_PAGA_SEGUROS}' column of 'asistencia_personas'` },
    }];
    const res = await putPersona(pedido({
      codigo: "8", nombre: "BRICEIDA MONTERO", salarioMensual: 566.52,
      jornadaSemanal: 40, empresa: "confecciones_boston", pagaSeguros: true,
    }));
    expect(res.status).toBe(200);
    // Se reintentó SIN la columna, y el nombre quedó guardado igual que ayer.
    expect(upserts).toHaveLength(2);
    expect(COLUMNA_PAGA_SEGUROS in upserts[1]).toBe(false);
    expect(upserts[1].nombre).toBe("BRICEIDA MONTERO");
  });

  it("🔴 SIN LA COLUMNA CORRIDA: quitarle el seguro a alguien NO se guarda a medias", async () => {
    respuestas = [{
      error: { code: "PGRST204", message: `Could not find the '${COLUMNA_PAGA_SEGUROS}' column of 'asistencia_personas'` },
    }];
    const res = await putPersona(pedido({
      codigo: "8", nombre: "BRICEIDA MONTERO", salarioMensual: 566.52,
      jornadaSemanal: 40, empresa: "confecciones_boston", pagaSeguros: false,
    }));
    // 🩸 Un "guardado" que se traga la bandera le seguiría descontando el 11 %
    // a alguien a quien la contadora no se lo descuenta, y nadie sabría por qué.
    expect(res.status).toBe(503);
    const d = await res.json();
    expect(d.faltaMigracionSeguros).toBe(true);
    expect(d.error).toContain("20260825120000_asistencia_paga_seguros.sql");
    // Y NO se reintentó: una sola escritura, la que falló.
    expect(upserts).toHaveLength(1);
  });

  it("un valor que no es una respuesta se rechaza con 400 y no escribe nada", async () => {
    const res = await putPersona(pedido({
      codigo: "8", nombre: "BRICEIDA MONTERO", salarioMensual: 566.52,
      jornadaSemanal: 40, empresa: "confecciones_boston", pagaSeguros: "quizás",
    }));
    expect(res.status).toBe(400);
    expect(upserts).toHaveLength(0);
  });
});
