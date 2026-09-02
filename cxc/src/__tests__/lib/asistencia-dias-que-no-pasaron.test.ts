/* ─────────────────────────────────────────────────────────────────────────────
 * LA PLANILLA DESCONTABA POR DÍAS QUE NO PASARON — el candado (14-ago-2026)
 *
 * Auditoría medida contra producción, quincena del 1 al 15 de agosto: de los
 * **$1.127,78** que la planilla descontaba por ausencia, **$1.013,87 (el 90%)
 * eran falsos**. Reales: **$113,91**. Tres causas y tres arreglos, y NINGUNO
 * toca el motor de cálculo — los tres son sobre **qué días entran** y **de quién
 * se abstiene el sistema**.
 *
 *   1. El día que no terminó no puede ser ausencia. La Planilla no le pasaba
 *      `diaEnCurso` al motor (el Reporte sí), así que las 33 personas salían
 *      ausentes el 14, el día que la contadora miraba la pantalla: **$866,99**.
 *      Y excluir SOLO hoy no alcanzaba: abierta la quincena un día 3 quedan ~9
 *      días futuros contándose a **~$870 cada uno**.
 *   2. Quien entró o salió a mitad del período NO recibe un número inventado.
 *      🔴 EL ARREGLO OBVIO ES EL EQUIVOCADO: dejar de contarle las ausencias a
 *      YEISHKA (ingreso 10-ago) le paga **$300 completos** por 6 días de 15.
 *      El sistema se ABSTIENE, como ya hace en los otros dos casos que no
 *      puede saber.
 *   3. Quien tiene justificación viva sale del cajón «falta configurar», y el
 *      código sin ficha se muestra UNA vez en vez de una por empresa.
 *
 * 🔴 TODOS LOS CASOS DE ACÁ EJECUTAN LA CONDUCTA: corren el motor REAL y miran
 * los dólares que salen. Ninguno busca texto en un archivo — en este repo ya
 * fallaron VARIOS candados por leer sus propios comentarios.
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { armarReporte, type Marcacion } from "@/lib/asistencia/reporte";
import { hoyPanama } from "@/lib/fecha-panama";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import { motivoPeriodoParcial, type Vigencia } from "@/lib/asistencia/vigencia";
import {
  avisoPeriodoAbierto,
  diaYaPaso,
  diasHabilesPendientes,
  textoCodigosSinFicha,
  textoJustificacion,
} from "@/lib/asistencia/periodo";
import {
  armarPlanilla,
  grupoDeLinea,
  separarSinFicha,
  totalizar,
  type FichaPlanilla,
} from "@/lib/asistencia/planilla";

// ── Datos reales de la quincena medida ───────────────────────────────────────

const DESDE = "2026-08-01";
const HASTA = "2026-08-15";
/** Viernes 14. El 15 es sábado, o sea que el único día pendiente es hoy. */
const HOY = "2026-08-14";

const marca = (codigo: string, dia: string, hhmmss: string): Marcacion => ({
  empleado_codigo: codigo, empleado_nombre: null, ocurrio_en: `${dia}T${hhmmss}-05:00`,
});
const diaCompleto = (codigo: string, dia: string): Marcacion[] => [
  marca(codigo, dia, "08:00:00"), marca(codigo, dia, "12:00:00"),
  marca(codigo, dia, "12:30:00"), marca(codigo, dia, "17:00:00"),
];

/** Los días hábiles de la quincena, del 3 al 14 (el 1 y el 2 caen fin de semana). */
const HABILES = [
  "2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07",
  "2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14",
];

const ficha = (over: Partial<FichaPlanilla> = {}): FichaPlanilla => ({
  codigo: "22", nombre: "ALEJANDRA CAMAÑO", salarioMensual: 600,
  jornadaSemanal: 48, empresa: "confecciones_boston", ...over,
});

function planilla(opts: {
  marcaciones: Marcacion[];
  fichas: FichaPlanilla[];
  hoy?: string | null;
  decidirAMano?: Map<string, string>;
  justificados?: Map<string, string>;
  justificaciones?: Array<{ empleado_codigo: string; desde: string; hasta: string; motivo: string }>;
  desde?: string;
  hasta?: string;
}) {
  const desde = opts.desde ?? DESDE;
  const hasta = opts.hasta ?? HASTA;
  const personas = armarReporte({
    marcaciones: opts.marcaciones,
    horarios: [],
    justificaciones: opts.justificaciones ?? [],
    feriados: new Map(),
    desde, hasta,
    reglas: REGLAS_DEFAULT,
    incluirNoHabiles: true,
    diaEnCurso: opts.hoy,
  });
  const lineas = armarPlanilla({
    personas,
    fichas: new Map(opts.fichas.map((f) => [f.codigo, f])),
    jornadaDiariaMin: () => 8 * 60,
    reglas: REGLAS_DEFAULT,
    empresa: null,
    decidirAMano: opts.decidirAMano,
    justificados: opts.justificados,
  });
  return { lineas, totales: totalizar(lineas), de: (c: string) => lineas.find((l) => l.codigo === c)! };
}

// ═════════════════════════════════════════════════════════════════════════════
// ARREGLO 1 — EL DÍA QUE NO PASÓ NO PUEDE SER AUSENCIA
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 arreglo 1 · un día que todavía no pasó no es una falta", () => {
  it("🩸 EL CASO DE PRODUCCIÓN: trabajó todos los días hábiles hasta ayer y no debe nada", () => {
    // Vino el 3, 4, 5, 6, 7, 10, 11, 12 y 13. Hoy es 14 y todavía no marcó.
    const marcaciones = HABILES.filter((d) => d < HOY).flatMap((d) => diaCompleto("22", d));

    const sinArreglo = planilla({ marcaciones, fichas: [ficha()], hoy: null });
    const conArreglo = planilla({ marcaciones, fichas: [ficha()], hoy: HOY });

    // Sin el arreglo se le descuenta el día de hoy —y el 15 si fuera hábil—.
    expect(sinArreglo.de("22").horas.ausenciaDias).toBe(1);
    expect(sinArreglo.de("22").dinero!.ausencias).toBeGreaterThan(0);
    // Con el arreglo, cero.
    expect(conArreglo.de("22").horas.ausenciaDias).toBe(0);
    expect(conArreglo.de("22").dinero!.ausencias).toBe(0);
    // Y le queda MÁS plata, que es de lo que se trata.
    expect(conArreglo.de("22").dinero!.netoPagar).toBeGreaterThan(sinArreglo.de("22").dinero!.netoPagar);
  });

  it("🔴 NO SE EXCLUYE SOLO HOY: los días FUTUROS tampoco cuentan (~$870 cada uno)", () => {
    // La contadora abre la quincena el día 3: quedan 9 días hábiles por venir.
    const hoyTemprano = "2026-08-03";
    const marcaciones = diaCompleto("22", "2026-08-03");
    const p = planilla({ marcaciones, fichas: [ficha()], hoy: hoyTemprano });
    expect(p.de("22").horas.ausenciaDias).toBe(0);
    expect(p.de("22").dinero!.ausencias).toBe(0);

    // Y con la versión que solo excluía HOY (`===`), los 9 días que faltan
    // seguían descontándose. Se reproduce pasando un "hoy" imposible de
    // alcanzar salvo por igualdad: sin el `>=` esto daría 9 ausencias.
    const soloHoy = planilla({ marcaciones, fichas: [ficha()], hoy: null });
    expect(soloHoy.de("22").horas.ausenciaDias).toBe(9);
  });

  it("un día que YA PASÓ sin marcas sigue siendo una ausencia y se descuenta", () => {
    // Faltó el martes 4 y vino todos los demás días ya pasados.
    const marcaciones = HABILES.filter((d) => d < HOY && d !== "2026-08-04")
      .flatMap((d) => diaCompleto("22", d));
    const p = planilla({ marcaciones, fichas: [ficha()], hoy: HOY });
    expect(p.de("22").horas.ausenciaDias).toBe(1);
    expect(p.de("22").dinero!.ausencias).toBeGreaterThan(0);
  });

  it("🔴 UNA QUINCENA YA CERRADA NO SE MUEVE UN CENTAVO", () => {
    // La de julio ya se pagó: ninguno de sus días alcanza al "hoy" de agosto.
    const julio = { desde: "2026-07-01", hasta: "2026-07-15" };
    const marcaciones = ["2026-07-01", "2026-07-02", "2026-07-03"].flatMap((d) => diaCompleto("22", d));
    const sin = planilla({ marcaciones, fichas: [ficha()], hoy: null, ...julio });
    const con = planilla({ marcaciones, fichas: [ficha()], hoy: HOY, ...julio });
    expect(JSON.stringify(con.de("22").dinero)).toBe(JSON.stringify(sin.de("22").dinero));
    expect(con.totales.netoPagar).toBe(sin.totales.netoPagar);
  });

  it("🔑 lo que YA se trabajó se sigue midiendo: la tardanza de hoy se cobra igual", () => {
    // Llegó 8:30 hoy: 30 minutos tarde. El día no se juzga, pero se mide.
    const marcaciones = [
      marca("22", HOY, "08:30:00"), marca("22", HOY, "12:00:00"),
      marca("22", HOY, "12:30:00"), marca("22", HOY, "17:00:00"),
    ];
    const p = planilla({ marcaciones, fichas: [ficha()], hoy: HOY });
    expect(p.de("22").horas.tardanzaMin).toBe(30);
    expect(p.de("22").dinero!.tardanzas).toBeGreaterThan(0);
  });

  it('🔴 "hoy" es el día de PANAMÁ (UTC−5): a las 23:30 el día todavía no cambió', () => {
    const instante = new Date("2026-08-15T04:30:00Z"); // 14-ago 23:30 en Panamá
    expect(hoyPanama(instante)).toBe("2026-08-14");
    expect(instante.toISOString().slice(0, 10)).toBe("2026-08-15"); // lo que NO se usa

    // Con el día de UTC, el 14 —que sigue corriendo— vuelve a contar como falta.
    const marcaciones = HABILES.filter((d) => d < HOY).flatMap((d) => diaCompleto("22", d));
    const conUtc = planilla({ marcaciones, fichas: [ficha()], hoy: instante.toISOString().slice(0, 10) });
    expect(conUtc.de("22").horas.ausenciaDias).toBe(1); // ← el bug
    const conPanama = planilla({ marcaciones, fichas: [ficha()], hoy: hoyPanama(instante) });
    expect(conPanama.de("22").horas.ausenciaDias).toBe(0); // ← lo correcto
  });
});

describe("el aviso de arriba del cuadro", () => {
  it("dice cuántos días hábiles faltan, en singular cuando es uno", () => {
    const a = avisoPeriodoAbierto(DESDE, HASTA, HOY, true);
    expect(a).not.toBeNull();
    expect(a!.diasHabiles).toBe(1);
    expect(a!.texto).toBe(
      "Esta quincena todavía no termina — falta 1 día hábil. Los días que no pasaron no se cuentan.",
    );
  });

  it("y en plural cuando faltan varios", () => {
    const a = avisoPeriodoAbierto(DESDE, HASTA, "2026-08-03", true)!;
    expect(a.diasHabiles).toBe(10); // del 3 al 14
    expect(a.texto).toContain("faltan 10 días hábiles");
  });

  it("🔴 NO se muestra cuando el período ya cerró — un cartel permanente se deja de leer", () => {
    expect(avisoPeriodoAbierto("2026-07-01", "2026-07-15", HOY, true)).toBeNull();
  });

  it("un rango libre no se llama quincena", () => {
    expect(avisoPeriodoAbierto(DESDE, HASTA, HOY, false)!.texto).toContain("Este período");
  });

  it("hoy NO cuenta como pasado: a las 8:59 nadie faltó todavía", () => {
    expect(diaYaPaso(HOY, HOY)).toBe(false);
    expect(diaYaPaso("2026-08-13", HOY)).toBe(true);
    expect(diaYaPaso("2026-08-15", HOY)).toBe(false);
  });

  it("los días pendientes son solo lunes a viernes", () => {
    // Del 14 (viernes) al 15 (sábado): un solo día hábil.
    expect(diasHabilesPendientes(DESDE, HASTA, HOY)).toBe(1);
    // Un sábado de "hoy" con el domingo por delante: ninguno.
    expect(diasHabilesPendientes("2026-08-15", "2026-08-16", "2026-08-15")).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// ARREGLO 2 — QUIEN ENTRÓ A MITAD DEL PERÍODO NO RECIBE UN NÚMERO INVENTADO
// ═════════════════════════════════════════════════════════════════════════════

const vig = (over: Partial<Vigencia> = {}): Vigencia => ({
  fechaIngreso: null, fechaSalida: null, motivoSalida: null, ...over,
});

describe("🔴 arreglo 2 · el sistema se abstiene cuando no puede saber", () => {
  it("reconoce a quien entró a mitad del período, con el motivo escrito", () => {
    expect(motivoPeriodoParcial(vig({ fechaIngreso: "2026-08-10" }), DESDE, HASTA))
      .toBe("entró el 10 de agosto de 2026");
    expect(motivoPeriodoParcial(vig({ fechaIngreso: "2026-08-04" }), DESDE, HASTA))
      .toBe("entró el 4 de agosto de 2026");
  });

  it("y a quien salió a mitad, con los dos si pasaron las dos cosas", () => {
    expect(motivoPeriodoParcial(vig({ fechaSalida: "2026-08-07", motivoSalida: "otro" }), DESDE, HASTA))
      .toBe("salió el 7 de agosto de 2026");
    expect(motivoPeriodoParcial(
      vig({ fechaIngreso: "2026-08-04", fechaSalida: "2026-08-10", motivoSalida: "renuncia" }), DESDE, HASTA,
    )).toBe("entró el 4 de agosto de 2026 y salió el 10 de agosto de 2026");
  });

  it("⚠️ quien entró el PRIMER día (o salió el último) trabajó el período entero", () => {
    expect(motivoPeriodoParcial(vig({ fechaIngreso: DESDE }), DESDE, HASTA)).toBeNull();
    expect(motivoPeriodoParcial(vig({ fechaSalida: HASTA, motivoSalida: "otro" }), DESDE, HASTA)).toBeNull();
  });

  it("⚠️ las 29 fichas SIN fecha_ingreso se comportan EXACTAMENTE como antes", () => {
    expect(motivoPeriodoParcial(vig(), DESDE, HASTA)).toBeNull();
    expect(motivoPeriodoParcial(null, DESDE, HASTA)).toBeNull();
    expect(motivoPeriodoParcial(undefined, DESDE, HASTA)).toBeNull();
    // Y una fecha de otro período tampoco la alcanza.
    expect(motivoPeriodoParcial(vig({ fechaIngreso: "2026-05-02" }), DESDE, HASTA)).toBeNull();
  });

  it("🔴🔴 EL CANDADO QUE MÁS PESA: YEISHKA NO COBRA $300", () => {
    // Ingreso 10-ago, salario $600 → quincenal $300. Trabajó del 10 al 13.
    const yeishka = ficha({ codigo: "54", nombre: "YEISHKA IRENE DIAZ MARKHAM", salarioMensual: 600 });
    const marcaciones = ["2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13"]
      .flatMap((d) => diaCompleto("54", d));

    const p = planilla({
      marcaciones, fichas: [yeishka], hoy: HOY,
      decidirAMano: new Map([["54", "entró el 10 de agosto de 2026"]]),
    });
    const l = p.de("54");

    // Ni $300 (la quincena completa) ni $133,34 (el número inventado de antes).
    expect(l.dinero).toBeNull();
    expect(grupoDeLinea(l)).toBe("decidir");
    expect(l.decidirAMano).toBe("entró el 10 de agosto de 2026");
    // El quincenal que le TOCARÍA se muestra, para que no haya que calcularlo.
    expect(l.quincenalReferencia).toBe(300);
    // 🔴 Y NO ENTRA AL TOTAL: ni los $300 ni un centavo.
    expect(p.totales.netoPagar).toBe(0);
    expect(p.totales.salarioQuincenal).toBe(0);
    expect(p.totales.personas).toBe(0);
    // Se cuenta APARTE de los pendientes: no hay nada que configurarle.
    expect(p.totales.decidirAMano).toBe(1);
    expect(p.totales.sinConfigurar).toBe(0);
  });

  it("🔴🔴 EL ARREGLO OBVIO ES EL EQUIVOCADO: no contarle esos días le paga $300", () => {
    // ESTE es el error que había que hacer imposible. "Dejar de contarle como
    // ausencia los días en que no trabajaba acá" es, literalmente, medirle solo
    // desde su ingreso — y ahí no le queda ni una falta, así que cobra la
    // QUINCENA COMPLETA por 4 días trabajados de 10 hábiles.
    const yeishka = ficha({ codigo: "54", salarioMensual: 600 });
    const marcaciones = ["2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13"]
      .flatMap((d) => diaCompleto("54", d));

    const ingenuo = planilla({
      marcaciones, fichas: [yeishka], hoy: HOY, desde: "2026-08-10",
    });
    expect(ingenuo.de("54").dinero!.ausencias).toBe(0);
    expect(ingenuo.de("54").dinero!.salarioQuincenal).toBe(300); // ← la quincena entera
    expect(ingenuo.de("54").dinero!.netoPagar).toBeGreaterThan(250);

    // Con el gate no hay número: ni $300, ni $133,34, ni nada en el medio.
    const conGate = planilla({
      marcaciones, fichas: [yeishka], hoy: HOY,
      decidirAMano: new Map([["54", "entró el 10 de agosto de 2026"]]),
    });
    expect(conGate.de("54").dinero).toBeNull();
    expect(conGate.totales.netoPagar).toBe(0);
  });

  it("⚠️ NO se construye prorrateo: no existe ningún número entre $0 y la quincena", () => {
    const l = planilla({
      marcaciones: diaCompleto("54", "2026-08-11"), fichas: [ficha({ codigo: "54", salarioMensual: 600 })],
      hoy: HOY, decidirAMano: new Map([["54", "entró el 10 de agosto de 2026"]]),
    }).de("54");
    // La única cifra que se muestra es la quincena COMPLETA, rotulada como lo
    // que le tocaría — nunca una fracción calculada por el sistema.
    expect(l.dinero).toBeNull();
    expect(l.quincenalReferencia).toBe(300);
  });

  it("el gate manda aunque la ficha esté completa y haya marcado todos los días", () => {
    const marcaciones = HABILES.filter((d) => d < HOY).flatMap((d) => diaCompleto("54", d));
    const l = planilla({
      marcaciones, fichas: [ficha({ codigo: "54" })], hoy: HOY,
      decidirAMano: new Map([["54", "entró el 4 de agosto de 2026"]]),
    }).de("54");
    expect(l.dinero).toBeNull();
    expect(l.faltaConfigurar).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// ARREGLO 3 — LA BOLSA ÁMBAR SE PARTE EN DOS, Y EL SIN FICHA VA UNA SOLA VEZ
// ═════════════════════════════════════════════════════════════════════════════

// El rótulo decía «Decidilo vos» hasta el 1-sep-2026; se renombró a «Tú decides» porque era voseo y el sistema habla tuteo neutro (candado `nada-de-voseo`).
describe("🔴 arreglo 3 · «falta un dato» y «Tú decides» son dos cosas distintas", () => {
  it("🩸 RODRIGO (trabajo fuera) sale del cajón ámbar y con su motivo al lado", () => {
    const rodrigo = ficha({ codigo: "13", nombre: "RODRIGO MIRANDA", salarioMensual: 800, empresa: "vistana" });
    const texto = textoJustificacion("Trabajo fuera de la oficina", "2026-08-01", "2026-08-13");
    const p = planilla({
      marcaciones: [], fichas: [rodrigo], hoy: HOY,
      justificados: new Map([["13", texto]]),
    });
    const l = p.de("13");
    expect(grupoDeLinea(l)).toBe("decidir");
    expect(l.decidirAMano).toBe("Trabajo fuera de la oficina del 1 ago 2026 al 13 ago 2026");
    // 🔴 Y NO dice «no marcó ni un día», que es lo que lo mandaba a buscar en
    // Configuración un arreglo que no existe.
    expect(l.faltaConfigurar).toEqual([]);
    expect(l.quincenalReferencia).toBe(400);
    expect(p.totales.decidirAMano).toBe(1);
    expect(p.totales.sinConfigurar).toBe(0);
  });

  it("ELOYN (vacaciones) igual, con su rango escrito", () => {
    const eloyn = ficha({ codigo: "29", nombre: "ELOYN MENDOZA", salarioMensual: 566.52, empresa: "fashion_wear" });
    const p = planilla({
      marcaciones: [], fichas: [eloyn], hoy: HOY,
      justificados: new Map([["29", textoJustificacion("Vacaciones", "2026-07-16", "2026-08-13")]]),
    });
    expect(p.de("29").decidirAMano).toBe("Vacaciones del 16 jul 2026 al 13 ago 2026");
    expect(grupoDeLinea(p.de("29"))).toBe("decidir");
  });

  it("🔴 quien NO marcó y NO tiene justificación sigue en ámbar, como siempre", () => {
    const p = planilla({ marcaciones: [], fichas: [ficha()], hoy: HOY });
    const l = p.de("22");
    expect(grupoDeLinea(l)).toBe("falta");
    expect(l.faltaConfigurar).toEqual(["no marcó ni un día en esta quincena"]);
    expect(l.dinero).toBeNull();
    expect(p.totales.sinConfigurar).toBe(1);
    expect(p.totales.decidirAMano).toBe(0);
  });

  it("🩸 quien SÍ marcó y además tiene una justificación de dos días COBRA NORMAL", () => {
    // El error caro sería quitarle la quincena entera a quien vino a trabajar.
    const marcaciones = HABILES.filter((d) => d < HOY).flatMap((d) => diaCompleto("22", d));
    const p = planilla({
      marcaciones, fichas: [ficha()], hoy: HOY,
      justificados: new Map([["22", textoJustificacion("Permiso", "2026-08-05", "2026-08-06")]]),
    });
    expect(p.de("22").dinero).not.toBeNull();
    expect(grupoDeLinea(p.de("22"))).toBe("pagada");
    expect(p.totales.personas).toBe(1);
  });

  it("a quien le falta un dato Y hay que decidirlo, gana «falta un dato»", () => {
    // Sin la ficha completa no se puede decidir nada tampoco.
    const p = planilla({
      marcaciones: diaCompleto("54", "2026-08-11"),
      fichas: [ficha({ codigo: "54", salarioMensual: null })],
      hoy: HOY, decidirAMano: new Map([["54", "entró el 10 de agosto de 2026"]]),
    });
    expect(grupoDeLinea(p.de("54"))).toBe("falta");
    expect(p.de("54").faltaConfigurar).toContain("falta el salario");
  });
});

describe("🔴 arreglo 3 · el código sin ficha se muestra UNA vez, no una por empresa", () => {
  it("sale del cuadro y no desaparece: viaja aparte", () => {
    const p = planilla({
      marcaciones: diaCompleto("50", "2026-08-03"), fichas: [ficha()], hoy: HOY,
    });
    const { lineas, sinFicha } = separarSinFicha(p.lineas);
    expect(sinFicha.map((l) => l.codigo)).toEqual(["50"]);
    expect(lineas.some((l) => l.codigo === "50")).toBe(false);
    // 🔴 La intención de que NO SE BORRE EN SILENCIO se conserva.
    expect(sinFicha).toHaveLength(1);
  });

  it("y el aviso dice quién es y que no se le puede pagar", () => {
    expect(textoCodigosSinFicha([{ codigo: "50", marcaciones: 53 }])).toBe(
      "1 código marcó 53 veces y no tiene ficha (código 50). "
      + "Hasta saber quién es, no se le puede calcular pago.",
    );
  });

  it("con varios códigos lo dice en plural y los nombra a todos", () => {
    const t = textoCodigosSinFicha([
      { codigo: "50", marcaciones: 53 }, { codigo: "51", marcaciones: 2 },
    ])!;
    expect(t).toContain("2 códigos marcaron 55 veces");
    expect(t).toContain("(códigos 50, 51)");
  });

  it("sin ninguno no hay aviso", () => {
    expect(textoCodigosSinFicha([])).toBeNull();
  });

  it("🔑 separar no toca a nadie más: los que sí cobran quedan intactos", () => {
    const marcaciones = [
      ...diaCompleto("50", "2026-08-03"),
      ...HABILES.filter((d) => d < HOY).flatMap((d) => diaCompleto("22", d)),
    ];
    const p = planilla({ marcaciones, fichas: [ficha()], hoy: HOY });
    const { lineas } = separarSinFicha(p.lineas);
    expect(totalizar(lineas).netoPagar).toBe(p.totales.netoPagar);
    expect(totalizar(lineas).personas).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// EL ORDEN DEL CUADRO
// ═════════════════════════════════════════════════════════════════════════════

describe("el orden del cuadro: pagadas, fuera de planilla, tú decides, falta un dato", () => {
  it("los cuatro grupos salen en ese orden", () => {
    const marcaciones = HABILES.filter((d) => d < HOY).flatMap((d) => diaCompleto("22", d));
    const p = planilla({
      marcaciones,
      fichas: [
        ficha(),
        ficha({ codigo: "26", nombre: "YULISSA", servicioProfesional: true }),
        ficha({ codigo: "54", nombre: "YEISHKA" }),
        ficha({ codigo: "99", nombre: "SIN SALARIO", salarioMensual: null }),
      ],
      hoy: HOY,
      decidirAMano: new Map([["54", "entró el 10 de agosto de 2026"]]),
    });
    expect(p.lineas.map((l) => grupoDeLinea(l))).toEqual(["pagada", "fuera", "decidir", "falta"]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 🔴 LA RUTA — CONDUCTA. Se llama al handler REAL y se mira qué devuelve.
//
// 🩸 ESTE BLOQUE ES EL QUE CAZA EL BUG ORIGINAL, y hace falta que exista: el
// motor SIEMPRE supo callarse el día en curso —lo usaba el Reporte desde el
// 13-ago— y lo que estaba mal era que la PLANILLA no se lo pasaba. Un `grep
// diaEnCurso` sobre `route.ts` daba CERO. Ninguna prueba del motor puede ver
// eso: hay que ejecutar la ruta.
// ═════════════════════════════════════════════════════════════════════════════

const db = {
  marcaciones: [] as Array<Record<string, unknown>>,
  personas: [] as Array<Record<string, unknown>>,
  justificaciones: [] as Array<Record<string, unknown>>,
};

vi.mock("@/lib/requireRole", () => ({
  requireRole: () => ({ role: "admin", userId: "u1", userName: "Daniel", sessionToken: "t" }),
}));
vi.mock("@/lib/supabase-paginado", () => ({
  leerTodoPaginado: async () => db.marcaciones,
}));
vi.mock("@/lib/asistencia/correcciones-server", () => ({
  leerCorrecciones: async () => ({ correcciones: [], faltaMigracion: false }),
}));
vi.mock("@/lib/asistencia/planilla-server", () => ({
  leerManuales: async () => ({ porCodigo: new Map(), faltaMigracion: false }),
  guardarManuales: async () => true,
  avisoMigracionPlanilla: () => "falta la migración",
}));
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
  const cadena = (tabla: string) => {
    const api: Record<string, unknown> = {};
    for (const m of ["select", "eq", "gte", "lte", "order", "range"]) api[m] = () => api;
    (api as { then: unknown }).then = (res: (v: unknown) => unknown) =>
      res({ data: tabla === "asistencia_justificaciones" ? db.justificaciones : [], error: null });
    return api;
  };
  return { HAS_SERVICE_ROLE: true, supabaseServer: { from: (t: string) => cadena(t) } };
});

async function pedirPlanilla(clave: string, empresa: string) {
  const { GET } = await import("@/app/api/asistencia/planilla/route");
  const { NextRequest } = await import("next/server");
  const req = new NextRequest(`http://x/api/asistencia/planilla?quincena=${clave}&empresa=${empresa}`);
  const res = await GET(req);
  return (await res.json()) as {
    lineas: LineaRuta[];
    totales: { netoPagar: number; personas: number; decidirAMano: number; sinConfigurar: number; ausencias: number };
    avisos: Record<string, unknown>;
  };
}

interface LineaRuta {
  codigo: string;
  dinero: { ausencias: number; netoPagar: number; salarioQuincenal: number } | null;
  decidirAMano: string | null;
  quincenalReferencia: number | null;
  faltaConfigurar: string[];
  horas: { ausenciaDias: number };
}

const filaDb = (codigo: string, over: Record<string, unknown> = {}) => ({
  empleado_codigo: codigo, nombre: `P${codigo}`, salario_mensual: 600,
  jornada_semanal: 48, empresa: "confecciones_boston",
  fecha_ingreso: null, fecha_salida: null, motivo_salida: null,
  servicio_profesional: false, ...over,
});

const marcasDb = (codigo: string, dia: string) =>
  ["08:00:00", "12:00:00", "12:30:00", "17:00:00"].map((h, i) => ({
    id: `${codigo}-${dia}-${i}`, empleado_codigo: codigo, empleado_nombre: null,
    ocurrio_en: `${dia}T${h}-05:00`,
  }));

describe("🔴 LA RUTA de la planilla — el bug original y los tres arreglos", () => {
  beforeEach(() => {
    db.marcaciones = [];
    db.personas = [];
    db.justificaciones = [];
    vi.useFakeTimers();
    // 14-ago-2026, 10 de la mañana de Panamá: la quincena va por la mitad.
    vi.setSystemTime(new Date("2026-08-14T15:00:00Z"));
  });
  afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

  it("🔴🔴 no descuenta ausencia por HOY ni por los días que faltan", async () => {
    db.personas = [filaDb("22")];
    db.marcaciones = HABILES.filter((d) => d < HOY).flatMap((d) => marcasDb("22", d));
    const r = await pedirPlanilla("2026-08-1", "confecciones_boston");
    const l = r.lineas.find((x) => x.codigo === "22")!;
    expect(l.horas.ausenciaDias).toBe(0);
    expect(l.dinero!.ausencias).toBe(0);
    expect(r.totales.ausencias).toBe(0);
  });

  it("y lo dice arriba del cuadro, con cuántos días hábiles faltan", async () => {
    db.personas = [filaDb("22")];
    db.marcaciones = marcasDb("22", "2026-08-03");
    const r = await pedirPlanilla("2026-08-1", "confecciones_boston");
    const aviso = r.avisos.periodoAbierto as { diasHabiles: number; texto: string } | null;
    expect(aviso).not.toBeNull();
    expect(aviso!.diasHabiles).toBe(1);
    expect(aviso!.texto).toContain("Los días que no pasaron no se cuentan");
  });

  it("una quincena YA CERRADA no anuncia nada y descuenta sus faltas como siempre", async () => {
    db.personas = [filaDb("22")];
    db.marcaciones = marcasDb("22", "2026-07-01");
    const r = await pedirPlanilla("2026-07-1", "confecciones_boston");
    expect(r.avisos.periodoAbierto).toBeNull();
    const l = r.lineas.find((x) => x.codigo === "22")!;
    expect(l.horas.ausenciaDias).toBeGreaterThan(0);
  });

  it("🔴 YEISHKA (ingreso 10-ago) no produce un número: sale para decidir", async () => {
    db.personas = [filaDb("54", { nombre: "YEISHKA", fecha_ingreso: "2026-08-10" })];
    db.marcaciones = ["2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13"]
      .flatMap((d) => marcasDb("54", d));
    const r = await pedirPlanilla("2026-08-1", "confecciones_boston");
    const l = r.lineas.find((x) => x.codigo === "54")!;
    expect(l.dinero).toBeNull();
    expect(l.decidirAMano).toBe("entró el 10 de agosto de 2026");
    expect(l.quincenalReferencia).toBe(300);
    expect(r.totales.netoPagar).toBe(0);
    expect(r.totales.decidirAMano).toBe(1);
    expect(r.totales.sinConfigurar).toBe(0);
  });

  it("🔴 RODRIGO (justificado, sin una sola marca) sale para decidir, no en ámbar", async () => {
    db.personas = [filaDb("13", { nombre: "RODRIGO MIRANDA" }), filaDb("22")];
    db.marcaciones = marcasDb("22", "2026-08-03");
    db.justificaciones = [{
      empleado_codigo: "13", desde: "2026-08-01", hasta: "2026-08-13",
      motivo: "Trabajo fuera de la oficina",
    }];
    const r = await pedirPlanilla("2026-08-1", "confecciones_boston");
    const l = r.lineas.find((x) => x.codigo === "13")!;
    expect(l.decidirAMano).toBe("Trabajo fuera de la oficina del 1 ago 2026 al 13 ago 2026");
    expect(l.faltaConfigurar).toEqual([]);
    expect(l.dinero).toBeNull();
  });

  it("🔴 el código sin ficha sale del cuadro y va en un aviso, una sola vez", async () => {
    db.personas = [filaDb("22")];
    db.marcaciones = [...marcasDb("22", "2026-08-03"), ...marcasDb("50", "2026-08-03")];
    const r = await pedirPlanilla("2026-08-1", "confecciones_boston");
    expect(r.lineas.some((x) => x.codigo === "50")).toBe(false);
    expect(r.avisos.sinFicha).toEqual([{ codigo: "50", marcaciones: 4 }]);
    expect(String(r.avisos.avisoSinFicha)).toContain("no tiene ficha (código 50)");
    // 🔴 Y NO DESAPARECE: el aviso es la prueba de que sigue estando.
    expect(r.avisos.avisoSinFicha).not.toBeNull();
  });

  it("⚠️ una ficha SIN fecha de ingreso se comporta exactamente como antes", async () => {
    db.personas = [filaDb("22", { fecha_ingreso: null })];
    db.marcaciones = HABILES.filter((d) => d < HOY).flatMap((d) => marcasDb("22", d));
    const r = await pedirPlanilla("2026-08-1", "confecciones_boston");
    const l = r.lineas.find((x) => x.codigo === "22")!;
    expect(l.decidirAMano).toBeNull();
    expect(l.dinero).not.toBeNull();
    expect(r.totales.personas).toBe(1);
  });
});
