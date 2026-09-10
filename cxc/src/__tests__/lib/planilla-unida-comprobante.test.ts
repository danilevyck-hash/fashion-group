/* ─────────────────────────────────────────────────────────────────────────────
 * EL COMPROBANTE DE PAGO — el papel que el colaborador firma.
 *
 * Lo que este candado protege, en una línea: **un solo formato para las tres
 * empresas, con TODOS los renglones dibujados aunque vayan en 0.00, y un neto
 * que no puede separarse del que pagó la planilla.**
 *
 * 🩸 De dónde salió: los TRES archivos reales de la II quincena de julio de
 * 2026 traían **34 comprobantes en 13 formatos distintos**, con el renglón de
 * tardanza escrito de **23 formas** («TARDANZAS ()», «TARDANZAS()», «Tardanzas
 * ()», «TARDANZA(45 MINUTOS)», «TARDANZAS (69 minutos  )»…).
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, expect, it } from "vitest";
import {
  CLAVES_RENGLON,
  EMPRESAS,
  armarComprobante,
  lineasConComprobante,
  nombreEmpresaComprobante,
  notaTardanza,
  tituloPeriodo,
} from "@/lib/asistencia/comprobante";
import type { DineroLinea, HorasPersona, LineaPlanilla } from "@/lib/asistencia/planilla";

// ── Andamios ────────────────────────────────────────────────────────────────

const HORAS_CERO = {
  extraDiurnoMin: 0, extraNocturnoMin: 0, extraNoAprobadaMin: 0,
  extraNoAprobadaDiurnoMin: 0, extraNoAprobadaNocturnoMin: 0,
  excedenteMin: 0, domingoMin: 0, feriadoMin: 0,
  tardanzaMin: 0, tardanzaGraveMin: 0, tardanzaGraveDias: 0,
  ausenciaMin: 0, ausenciaDias: 0, ausenciaJustificadaDias: 0,
  vacacionesYaPagadasMin: 0, vacacionesYaPagadasDias: 0, vacacionesDias: 0,
  sabadoMin: 0, diasTrabajados: 0, diasARevisar: 0,
  tardanzaDeDiasARevisarMin: 0, jornadaDiariaMin: 480,
} as unknown as HorasPersona;

const DINERO: DineroLinea = {
  rataHora: 3.02, valorMinuto: 0.0503, salarioQuincenal: 261.74,
  extraDiurno: 13.21, extraNocturno: 0, excedente: 0,
  domingos: 0, feriados: 0, ausencias: 0,
  ausenciaPorTardanza: 0, ausenciaDeDiaCompleto: 0, vacacionesYaPagadas: 0,
  tardanzas: 0, totalBruto: 274.95, baseSeguros: null,
  seguroSocial: 0, seguroEducativo: 0, isr: 0,
  prestamo: 45, terceros: 0, mercancia: 0,
  totalDeducciones: 45, otrosServicios: 0, netoPagar: 229.95,
};

function linea(over: Partial<LineaPlanilla> = {}): LineaPlanilla {
  return {
    codigo: "10", etiqueta: "LUIS PARAJON", nombre: "Luis Parajón",
    empresa: "fashion_wear", empresaEtiqueta: "Fashion Wear",
    salarioMensual: 523.48, jornadaSemanal: 48,
    horas: HORAS_CERO, faltaConfigurar: [], fueraDePlanilla: false,
    pagaSeguros: true, baseSeguros: null, noMarcaReloj: false,
    parte: null, decidirAMano: null, quincenalReferencia: null,
    extraMedido: null, extraNoAprobada: null, extraAprobada: true,
    dinero: DINERO,
    manuales: { isr: 0, prestamo: 45, terceros: 0, mercancia: 0, otrosServicios: 0 },
    ...over,
  } as LineaPlanilla;
}

const PERIODO = { esQuincena: true, anio: 2026, mes: 7, n: 2 as const, etiqueta: "16 al 31 de julio de 2026" };
const claves = (c: ReturnType<typeof armarComprobante>) => c.renglones.map((r) => r.clave);

// ─────────────────────────────────────────────────────────────────────────────
describe("A. UN SOLO FORMATO — el renglón en cero se DIBUJA, no se esconde", () => {
  // 🔴 Daniel, textual: *«Un solo formato, si alguien no lo lleva se pone 0 en
  // el de esa persona»*. Es la regla entera del papel.
  it("están los 23 renglones, en su orden, aunque casi todos den 0.00", () => {
    const c = armarComprobante({ linea: linea() }, PERIODO);
    expect(claves(c)).toEqual([...CLAVES_RENGLON]);
  });

  it("el de Impuesto sobre la renta se dibuja aunque valga 0 — hoy solo lo llevan 2 de 34", () => {
    const c = armarComprobante({ linea: linea() }, PERIODO);
    const isr = c.renglones.find((r) => r.clave === "isr")!;
    expect(isr.monto).toBe(0);
    expect(isr.rotulo).toBe("IMPUESTO SOBRE LA RENTA");
  });

  it("una persona SIN nada más que el sueldo trae igual los 23 renglones", () => {
    const pelado = { ...DINERO, extraDiurno: 0, prestamo: 0, totalDeducciones: 0, netoPagar: 261.74 };
    const c = armarComprobante({ linea: linea({ dinero: pelado }) }, PERIODO);
    expect(claves(c)).toEqual([...CLAVES_RENGLON]);
    // Y ninguno con monto viene en `null`: `null` es solo de los títulos.
    for (const r of c.renglones) {
      if (r.tipo === "seccion") expect(r.monto).toBeNull();
      else expect(typeof r.monto).toBe("number");
    }
  });

  it("los tres títulos de sección y los cuatro totales están donde van", () => {
    const c = armarComprobante({ linea: linea() }, PERIODO);
    const secciones = c.renglones.filter((r) => r.tipo === "seccion").map((r) => r.rotulo);
    expect(secciones).toEqual(["DEDUCCIONES:", "DESCUENTOS :"]);
    const totales = c.renglones.filter((r) => r.tipo === "total").map((r) => r.clave);
    expect(totales).toEqual(["totalDevengado", "totalDeducciones", "totalDescuentos", "salarioAPagar"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("B. EL PAPEL NO PUEDE DECIR UN NETO QUE LA PLANILLA NO PAGÓ", () => {
  // 🔴 El papel parte en DOS lo que el módulo tiene en uno: DEDUCCIONES (seguros
  // + ISR) y DESCUENTOS (préstamo + terceros + compras + mercancía). Las dos
  // juntas tienen que dar exactamente `dinero.totalDeducciones`.
  it("deducciones + descuentos = el totalDeducciones de la planilla", () => {
    const d: DineroLinea = {
      ...DINERO, seguroSocial: 25.5, seguroEducativo: 3.25, isr: 10,
      prestamo: 45, terceros: 7, mercancia: 12,
      totalDeducciones: 25.5 + 3.25 + 10 + 45 + 7 + 12,
      netoPagar: 274.95 - (25.5 + 3.25 + 10 + 45 + 7 + 12),
    };
    const c = armarComprobante({ linea: linea({ dinero: d }) }, PERIODO);
    const m = (k: string) => c.renglones.find((r) => r.clave === k)!.monto!;
    expect(m("totalDeducciones") + m("totalDescuentos")).toBeCloseTo(d.totalDeducciones, 2);
  });

  it("SALARIO A PAGAR = el neto de la planilla, sin ajuste", () => {
    const c = armarComprobante({ linea: linea() }, PERIODO);
    expect(c.renglones.find((r) => r.clave === "salarioAPagar")!.monto).toBeCloseTo(229.95, 2);
  });

  it("TOTAL DEVENGADO = el bruto de la planilla", () => {
    const c = armarComprobante({ linea: linea() }, PERIODO);
    expect(c.renglones.find((r) => r.clave === "totalDevengado")!.monto).toBeCloseTo(274.95, 2);
  });

  it("«OTROS SERVICIOS» SUMA: no se resta", () => {
    const d = { ...DINERO, otrosServicios: 30, netoPagar: 259.95 };
    const c = armarComprobante({ linea: linea({ dinero: d }) }, PERIODO);
    expect(c.renglones.find((r) => r.clave === "otrosServicios")!.monto).toBe(30);
    expect(c.renglones.find((r) => r.clave === "salarioAPagar")!.monto).toBeCloseTo(259.95, 2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("C. EL AJUSTE DE LA QUINCENA ANTERIOR VA EN SU PROPIO RENGLÓN", () => {
  // 🔴 NUNCA mezclado con AUSENCIA. Son dos cosas distintas y sumarlas pierde
  // para siempre la explicación de por qué el neto no da lo que se esperaba.
  it("el renglón existe SIEMPRE, aunque el ajuste sea cero", () => {
    const c = armarComprobante({ linea: linea() }, PERIODO);
    const a = c.renglones.find((r) => r.clave === "ajusteAnterior")!;
    expect(a.monto).toBe(0);
    expect(a.rotulo).toBe("AJUSTE QUINCENA ANTERIOR");
  });

  it("un ajuste NO toca el renglón de AUSENCIA", () => {
    const c = armarComprobante({ linea: linea(), ajusteAnterior: 12.5 }, PERIODO);
    expect(c.renglones.find((r) => r.clave === "ausencia")!.monto).toBe(0);
    expect(c.renglones.find((r) => r.clave === "ajusteAnterior")!.monto).toBe(12.5);
  });

  it("el ajuste entra a TOTAL DE DESCUENTOS y baja el salario a pagar", () => {
    const c = armarComprobante({ linea: linea(), ajusteAnterior: 12.5 }, PERIODO);
    const m = (k: string) => c.renglones.find((r) => r.clave === k)!.monto!;
    expect(m("totalDescuentos")).toBeCloseTo(45 + 12.5, 2);
    expect(m("salarioAPagar")).toBeCloseTo(229.95 - 12.5, 2);
  });

  it("un ajuste NEGATIVO devuelve plata", () => {
    const c = armarComprobante({ linea: linea(), ajusteAnterior: -8 }, PERIODO);
    expect(c.renglones.find((r) => r.clave === "salarioAPagar")!.monto).toBeCloseTo(237.95, 2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("D. LOS MINUTOS DE TARDANZA VAN AL LADO DEL NÚMERO", () => {
  // 🩸 Las 23 grafías salieron de meterlos DENTRO del título.
  it("el rótulo dice «TARDANZAS», seco, haya o no minutos", () => {
    const sin = armarComprobante({ linea: linea() }, PERIODO);
    const conMin = armarComprobante(
      { linea: linea({ horas: { ...HORAS_CERO, tardanzaMin: 45 } as HorasPersona }) },
      PERIODO,
    );
    for (const c of [sin, conMin]) {
      expect(c.renglones.find((r) => r.clave === "tardanzas")!.rotulo).toBe("TARDANZAS");
    }
  });

  it("los minutos viajan en `nota`, no en el rótulo", () => {
    const c = armarComprobante(
      { linea: linea({ horas: { ...HORAS_CERO, tardanzaMin: 45 } as HorasPersona }) },
      PERIODO,
    );
    const t = c.renglones.find((r) => r.clave === "tardanzas")!;
    expect(t.nota).toBe("45 min");
    expect(t.rotulo).not.toMatch(/45|minuto|\(/);
  });

  it("sin tardanza no se escribe nada al lado", () => {
    expect(notaTardanza(HORAS_CERO)).toBeNull();
  });

  // 🩸 LOS MINUTOS TIENEN QUE CUADRAR CON LOS DÓLARES DE SU FILA. `tardanzaMin`
  // es el TOTAL e incluye los días de más de 30 min tarde, que se cobran del
  // lado de AUSENCIA. Escribir el total acá pondría en el papel unos minutos
  // que su propio monto no incluye.
  it("los minutos son los que se VALÚAN, no el total del reloj", () => {
    const h = { ...HORAS_CERO, tardanzaMin: 100, tardanzaGraveMin: 60 } as HorasPersona;
    expect(notaTardanza(h)).toBe("40 min");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("E. LO ÚNICO QUE CAMBIA POR EMPRESA ES EL NOMBRE DE ARRIBA", () => {
  it("las tres empresas, con el nombre que la contadora usa", () => {
    expect(EMPRESAS.fashion_wear).toBe("FASHION WEAR");
    expect(EMPRESAS.confecciones_boston).toBe("CONFECCIONES BOSTON, S.A.");
    expect(EMPRESAS.vistana).toBe("VISTANA INTERNATIONAL");
  });

  it("las tres traen EXACTAMENTE los mismos renglones", () => {
    const claves3 = (["fashion_wear", "confecciones_boston", "vistana"] as const).map((e) =>
      claves(armarComprobante({ linea: linea({ empresa: e }) }, PERIODO)),
    );
    expect(claves3[0]).toEqual(claves3[1]);
    expect(claves3[1]).toEqual(claves3[2]);
  });

  it("una empresa desconocida NO sale con el nombre de otra", () => {
    const n = nombreEmpresaComprobante("empresa_nueva", "Empresa Nueva");
    expect(n).toBe("EMPRESA NUEVA");
    expect(Object.values(EMPRESAS)).not.toContain(n);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("F. LA CABEZA DEL PAPEL", () => {
  it("«II QUINCENA DE JULIO DE 2026», como lo escribe la contadora", () => {
    expect(tituloPeriodo(PERIODO)).toBe("II QUINCENA DE JULIO DE 2026");
    expect(tituloPeriodo({ ...PERIODO, n: 1 })).toBe("I QUINCENA DE JULIO DE 2026");
  });

  // ⚠️ Un rango que NO es una quincena no se disfraza de quincena: escribir
  // «I QUINCENA» encima de un cuadro del 3 al 9 sería mentirle al que firma.
  it("un rango libre dice el rango, no una quincena inventada", () => {
    const t = tituloPeriodo({ esQuincena: false, etiqueta: "3 al 9 de julio de 2026" });
    expect(t).toBe("3 AL 9 DE JULIO DE 2026");
    expect(t).not.toMatch(/QUINCENA/);
  });

  // 🩸 EL CASO QUE DE VERDAD SE ROMPE: un rango libre que igual CAE dentro de un
  // mes, así que trae año y mes. Mirar solo esos dos —y no `esQuincena`— le
  // pondría «I QUINCENA DE JULIO» encima de un cuadro del 3 al 9, que es
  // mentirle al que firma. Sin este caso el candado se deja engañar.
  it("un rango libre CON año y mes tampoco se disfraza", () => {
    const t = tituloPeriodo({
      esQuincena: false, anio: 2026, mes: 7, n: null, etiqueta: "3 al 9 de julio de 2026",
    });
    expect(t).toBe("3 AL 9 DE JULIO DE 2026");
    expect(t).not.toMatch(/QUINCENA/);
  });

  it("el cargo y la rata SALEN IMPRESOS", () => {
    const c = armarComprobante({ linea: linea(), posicion: "Asistente de Bodega" }, PERIODO);
    expect(c.posicion).toBe("Asistente de Bodega");
    expect(c.rataPorHora).toBeCloseTo(3.02, 2);
  });

  // 🔴 Sin cargo cargado, un GUION. Nunca un cargo adivinado del nombre.
  it("sin cargo cargado el papel dice un guion", () => {
    expect(armarComprobante({ linea: linea() }, PERIODO).posicion).toBe("—");
    expect(armarComprobante({ linea: linea(), posicion: "   " }, PERIODO).posicion).toBe("—");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("G. A QUIÉN SE LE HACE COMPROBANTE", () => {
  // 🔑 No es esconder un renglón —eso está prohibido— es no fabricar un papel
  // entero de ceros para alguien a quien todavía nadie le calculó el pago.
  it("quien no produjo dinero no lleva papel", () => {
    const sinPlata = linea({ codigo: "26", etiqueta: "YULISSA JUAREZ", dinero: null, fueraDePlanilla: true });
    expect(lineasConComprobante([linea(), sinPlata]).map((l) => l.codigo)).toEqual(["10"]);
  });

  it("y si igual se le arma, se marca `sinDinero` en vez de inventar ceros", () => {
    const c = armarComprobante({ linea: linea({ dinero: null }) }, PERIODO);
    expect(c.sinDinero).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// H. EL PAPEL DE VERDAD — se leen los bytes del PDF, no el código.
//
// 🔑 Si un renglón no está acá, no está en la hoja que el colaborador firma.
// Se lee el content stream sin comprimir (jsPDF no comprime salvo que se le
// pida), igual que `asistencia-pdf-pie-cabe-en-la-hoja.test.ts`.
// ─────────────────────────────────────────────────────────────────────────────

/** Cada string que el PDF dibuja de verdad. */
function textosDelPdf(bytes: ArrayBuffer): string[] {
  const raw = Buffer.from(bytes).toString("latin1");
  const out: string[] = [];
  for (const stream of raw.matchAll(/stream\n([\s\S]*?)\nendstream/g)) {
    const cuerpo = stream[1];
    if (!cuerpo.includes("BT")) continue;
    for (const t of cuerpo.matchAll(/\(((?:\\.|[^\\()])*)\)\s*Tj/g)) {
      out.push(t[1].replace(/\\([()\\])/g, "$1").replace(/\\(\d{3})/g, (_, o) => String.fromCharCode(parseInt(o, 8))));
    }
  }
  return out;
}

describe("H. EL PAPEL DE VERDAD", () => {
  it("una hoja POR PERSONA", async () => {
    const { construirPdfComprobantes } = await import("@/lib/asistencia/comprobante-pdf");
    const tres = [linea({ codigo: "1" }), linea({ codigo: "2" }), linea({ codigo: "3" })]
      .map((l) => armarComprobante({ linea: l }, PERIODO));
    expect(construirPdfComprobantes(tres).getNumberOfPages()).toBe(3);
  });

  it("los 21 rótulos con monto se DIBUJAN, y los que valen 0 llevan su 0.00", async () => {
    const { construirPdfComprobantes } = await import("@/lib/asistencia/comprobante-pdf");
    const c = armarComprobante({ linea: linea(), posicion: "Asistente de Bodega", cedula: "8-1010-2403" }, PERIODO);
    const doc = construirPdfComprobantes([c]);
    const textos = textosDelPdf(doc.output("arraybuffer") as ArrayBuffer);

    // Cada rótulo del papel está dibujado, sin excepción.
    for (const r of c.renglones) expect(textos).toContain(r.rotulo);

    // 🔴 Y los renglones en cero llevan su «0.00» impreso. Contarlos es lo que
    // impide que alguien «limpie» el papel escondiendo los vacíos: hoy son
    // exactamente los que la contadora también deja en cero.
    const enCero = c.renglones.filter((r) => r.tipo !== "seccion" && r.monto === 0);
    expect(enCero.length).toBeGreaterThanOrEqual(10);
    expect(textos.filter((t) => t === "0.00").length).toBe(enCero.length);

    // La cabeza, la ficha y el pie que se firma.
    expect(textos).toContain("FASHION WEAR");
    expect(textos).toContain("PLANILLA QUINCENAL");
    expect(textos).toContain("COMPROBANTE DE PAGO");
    expect(textos).toContain("II QUINCENA DE JULIO DE 2026");
    expect(textos).toContain("Luis Parajón");
    expect(textos).toContain("Asistente de Bodega");
    expect(textos).toContain("RECIBI CONFORME");
    expect(textos).toContain("CEDULA");
    expect(textos).toContain("FECHA");
    expect(textos).toContain("8-1010-2403");
  });

  it("los minutos de tardanza se imprimen SEPARADOS del rótulo", async () => {
    const { construirPdfComprobantes } = await import("@/lib/asistencia/comprobante-pdf");
    const c = armarComprobante(
      { linea: linea({ horas: { ...HORAS_CERO, tardanzaMin: 45 } as HorasPersona }) },
      PERIODO,
    );
    const textos = textosDelPdf(construirPdfComprobantes([c]).output("arraybuffer") as ArrayBuffer);
    expect(textos).toContain("TARDANZAS");
    expect(textos).toContain("45 min");
    // Nunca pegados: es la forma que produjo las 23 grafías.
    expect(textos.find((t) => /TARDANZA.*\(/.test(t))).toBeUndefined();
  });

  it("las tres empresas imprimen el MISMO papel con distinta cabeza", async () => {
    const { construirPdfComprobantes } = await import("@/lib/asistencia/comprobante-pdf");
    const porEmpresa = (["fashion_wear", "confecciones_boston", "vistana"] as const).map((e) => {
      const c = armarComprobante({ linea: linea({ empresa: e }) }, PERIODO);
      const t = textosDelPdf(construirPdfComprobantes([c]).output("arraybuffer") as ArrayBuffer);
      return { cabeza: t[0], rotulos: c.renglones.map((r) => r.rotulo) };
    });
    expect(porEmpresa.map((p) => p.cabeza)).toEqual(
      ["FASHION WEAR", "CONFECCIONES BOSTON, S.A.", "VISTANA INTERNATIONAL"],
    );
    expect(porEmpresa[0].rotulos).toEqual(porEmpresa[1].rotulos);
    expect(porEmpresa[1].rotulos).toEqual(porEmpresa[2].rotulos);
  });
});
