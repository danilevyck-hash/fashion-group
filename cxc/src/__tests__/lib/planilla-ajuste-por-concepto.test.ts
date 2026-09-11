/* ─────────────────────────────────────────────────────────────────────────────
 * EL AJUSTE DE LOS DÍAS DESPUÉS DEL CORTE ENTRA EN LAS COLUMNAS DE SIEMPRE,
 * CADA COSA EN LA SUYA (11-sep-2026).
 *
 * La contadora (Yulissa), textual: *«no puedes netear las horas extras con las
 * horas de tardanza o de ausencia porque valen diferente… debe poner lo que
 * llegó en tardanza en tardanza y lo que llegó como extra en extra porque los
 * valores de la rata por hora son diferentes porque una tiene recargo»*.
 *
 * Daniel: *«el ajuste separado como lo hace ella»* → *«sí»*. Medido en sus
 * Excel: ella NO tiene columna de ajuste; los días después del corte entran
 * en la quincena siguiente dentro de las columnas normales.
 *
 * 🔴 LO QUE NO PUEDE MOVERSE: EL NETO POR PERSONA. Antes «ajuste +2.00»;
 * después «Extras +5.00» y «Tardanza −3.00». Mismo neto, al centavo.
 * ────────────────────────────────────────────────────────────────────────── */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx-js-style";

import {
  CONCEPTOS_DEL_RELOJ,
  ORDEN_DEL_RELOJ,
  ROTULO_DEL_RELOJ,
  ajusteDeDiasSinMedir,
  aplicarAjusteEnLinea,
  columnasConAjuste,
  efectoEnElNeto,
  etiquetaDiasSinMedir,
  netoConAjuste,
  notaAjuste,
  notaCeldaAjuste,
  repartirAjuste,
} from "@/lib/asistencia/corte-quincena";
import { HORAS_CERO, TOTALES_CERO, quincena, totalizar } from "@/lib/asistencia/planilla";
import { centavos, type DineroLinea, type LineaPlanilla } from "@/lib/asistencia/planilla";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import { CLAVES_RENGLON, armarComprobante } from "@/lib/asistencia/comprobante";
import { construirExcelPlanilla, construirPdfPlanilla, type DatosPlanillaExport } from "@/lib/asistencia/planilla-exportar";
import { totalesDe } from "@/lib/asistencia/planilla-guardada";

const raiz = process.cwd();
const leer = (p: string) => fs.readFileSync(path.join(raiz, p), "utf8");
/** Sin comentarios: los comentarios de la casa nombran a propósito lo prohibido. */
const leerSinComentarios = (p: string) =>
  leer(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const DINERO = (o: Partial<DineroLinea> = {}): DineroLinea => ({
  rataHora: 3, valorMinuto: 0.05, salarioQuincenal: 300,
  extraDiurno: 0, extraNocturno: 0, excedente: 0, domingos: 0, feriados: 0,
  ausencias: 0, ausenciaPorTardanza: 0, ausenciaDeDiaCompleto: 0, vacacionesYaPagadas: 0,
  tardanzas: 0, salidaTemprana: 0, totalBruto: 300, baseSeguros: null,
  seguroSocial: 29.25, seguroEducativo: 3.75, isr: 0, prestamo: 0, terceros: 0, mercancia: 0,
  totalDeducciones: 33, otrosServicios: 0, netoPagar: 267, ...o,
});

const LINEA = (o: Partial<LineaPlanilla> = {}): LineaPlanilla => ({
  codigo: "1", etiqueta: "ANA", nombre: "ANA", empresa: "vistana", empresaEtiqueta: "Vistana",
  salarioMensual: 600, jornadaSemanal: 48, horas: HORAS_CERO, faltaConfigurar: [],
  fueraDePlanilla: false, pagaSeguros: true, baseSeguros: null, noMarcaReloj: false, parte: null,
  decidirAMano: null, prorrateo: null, quincenalReferencia: null, extraMedido: null,
  extraNoAprobada: null, extraAprobada: true, dinero: DINERO(),
  manuales: { isr: 0, prestamo: 0, terceros: 0, mercancia: 0, otrosServicios: 0 },
  ...o,
} as LineaPlanilla);

/** Los días 14 y 15 de Ana: 1 h tarde ($3) y 1 h extra diurna ($5), ya valuados. */
const DIAS_DE_ANA = DINERO({ salarioQuincenal: 40, totalBruto: 42, extraDiurno: 5, tardanzas: 3, netoPagar: 42 });
const DIAS = { desde: "2026-09-14", hasta: "2026-09-15" };

// ─────────────────────────────────────────────────────────────────────────────
describe("A. EL CASO DE DANIEL — Ana, $600, el 14 y el 15 con 1 h tarde y 1 h extra", () => {
  it("ANTES: un solo número, «ajuste» de −2.00 (se le devuelven $2)", () => {
    expect(ajusteDeDiasSinMedir(DIAS_DE_ANA)).toBeCloseTo(-2, 2);
  });

  it("DESPUÉS: «Extras +5.00» y «Tardanza +3.00», cada una en su columna", () => {
    expect(repartirAjuste(DIAS_DE_ANA)).toEqual({ extraDiurno: 5, tardanzas: 3 });
  });

  // 🔴 EL NETO NO CAMBIA. Es la regla entera de este cambio.
  it("🔴 el neto es IDÉNTICO por los dos caminos", () => {
    const antes = netoConAjuste(LINEA().dinero!.netoPagar, ajusteDeDiasSinMedir(DIAS_DE_ANA));
    const despues = aplicarAjusteEnLinea(LINEA(), DIAS_DE_ANA, DIAS).dinero!.netoPagar;
    expect(despues).toBeCloseTo(antes, 2);
    expect(despues).toBeCloseTo(269, 2);
  });

  it("y la suma de lo repartido (con su signo) ES el ajuste viejo, al centavo", () => {
    const r = repartirAjuste(DIAS_DE_ANA);
    expect(efectoEnElNeto(r)).toBeCloseTo(ajusteDeDiasSinMedir(DIAS_DE_ANA), 2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("B. EL REPARTO — solo lo que sale del reloj, y cada cosa en la suya", () => {
  it("un concepto en cero NO aparece en el reparto", () => {
    expect(repartirAjuste(DINERO())).toEqual({});
    expect(repartirAjuste(null)).toEqual({});
    expect(repartirAjuste(undefined)).toEqual({});
  });

  it("el sueldo, los seguros y lo escrito a mano NUNCA entran al reparto", () => {
    const r = repartirAjuste(DINERO({ salarioQuincenal: 999, seguroSocial: 50, isr: 20, prestamo: 30, otrosServicios: 40 }));
    expect(r).toEqual({});
  });

  // ⚠️ Eran SIETE hasta el 11-sep-2026. Daniel: *«la salida temprana incluirla»*
  // — «Salida temprana» nació el 10-sep, después del corte, y quedaba afuera
  // del ajuste. Cambió de número con nota, no de regla.
  it("los OCHO conceptos entran, cada uno por su nombre — la salida temprana también", () => {
    const todo = DINERO({ ausencias: 1, tardanzas: 2, salidaTemprana: 2.5, extraDiurno: 3, extraNocturno: 4, excedente: 5, domingos: 6, feriados: 7 });
    const r = repartirAjuste(todo);
    for (const { campo } of CONCEPTOS_DEL_RELOJ) expect(r[campo]).toBe(todo[campo]);
    expect(Object.keys(r).sort()).toEqual([...CONCEPTOS_DEL_RELOJ].map((c) => c.campo).sort());
    expect(CONCEPTOS_DEL_RELOJ).toHaveLength(8);
    // Con signo +: se descuenta después, igual que la tardanza.
    expect(CONCEPTOS_DEL_RELOJ.find((c) => c.campo === "salidaTemprana")?.signo).toBe(1);
  });

  it("🔴 EL CASO DE ELOYN (29): salió temprano el 29–31 ago por $11,83 → entra en «Salida temprana» y baja el neto", () => {
    const eloyn = LINEA({ codigo: "29", etiqueta: "ELOYN MENDOZA", dinero: DINERO({ totalBruto: 300, netoPagar: 267 }) });
    const con = aplicarAjusteEnLinea(eloyn, DINERO({ salidaTemprana: 11.83 }), { desde: "2026-08-29", hasta: "2026-08-31" });
    expect(con.dinero!.salidaTemprana).toBeCloseTo(11.83, 2);
    expect(con.ajusteAnterior).toBeCloseTo(11.83, 2);
    expect(con.dinero!.totalBruto).toBeCloseTo(300 - 11.83, 2);
    expect(con.dinero!.netoPagar).toBeCloseTo(267 - 11.83, 2);
    expect(con.ajusteDetalle?.reparto).toEqual({ salidaTemprana: 11.83 });
    expect(ROTULO_DEL_RELOJ.salidaTemprana).toBe("Salida temprana");
    expect(ORDEN_DEL_RELOJ.indexOf("salidaTemprana")).toBe(ORDEN_DEL_RELOJ.indexOf("tardanzas") + 1);
  });

  it("`ajusteDeDiasSinMedir` se DERIVA del reparto: Σ signo × monto", () => {
    const casos = [
      DINERO({ ausencias: 24.16, tardanzas: 1.5 }),
      DINERO({ extraDiurno: 12.5 }),
      DINERO({ extraDiurno: 12.5, extraNocturno: 4.5, domingos: 20, tardanzas: 0.55, ausencias: 8.88 }),
      DINERO(),
    ];
    for (const d of casos) {
      let esperado = 0;
      for (const { campo, signo } of CONCEPTOS_DEL_RELOJ) esperado += signo * d[campo];
      expect(ajusteDeDiasSinMedir(d)).toBeCloseTo(Math.round(esperado * 100) / 100, 2);
      expect(efectoEnElNeto(repartirAjuste(d))).toBeCloseTo(ajusteDeDiasSinMedir(d), 2);
    }
  });

  it("cada columna tiene su rótulo, el MISMO del cuadro, y el orden es el de la contable", () => {
    expect(ROTULO_DEL_RELOJ.extraDiurno).toBe("Horas extra 1.25");
    expect(ROTULO_DEL_RELOJ.extraNocturno).toBe("Horas extra 1.50");
    expect(ROTULO_DEL_RELOJ.tardanzas).toBe("Tardanzas");
    expect(ROTULO_DEL_RELOJ.ausencias).toBe("Ausencias");
    expect([...ORDEN_DEL_RELOJ].sort()).toEqual([...CONCEPTOS_DEL_RELOJ].map((c) => c.campo).sort());
    expect(ORDEN_DEL_RELOJ[0]).toBe("extraDiurno");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("C. APLICARLO A LA LÍNEA — las columnas suman lo suyo y nada más se mueve", () => {
  const con = aplicarAjusteEnLinea(
    LINEA({ dinero: DINERO({ extraDiurno: 10, tardanzas: 1, ausencias: 24, ausenciaDeDiaCompleto: 24, totalBruto: 285, netoPagar: 252 }) }),
    DINERO({ extraDiurno: 5, extraNocturno: 4.5, tardanzas: 3, ausencias: 8, ausenciaPorTardanza: 8 }),
    DIAS,
  );
  const d = con.dinero!;

  it("extra en extra, tardanza en tardanza, ausencia en ausencia", () => {
    expect(d.extraDiurno).toBeCloseTo(15, 2);
    expect(d.extraNocturno).toBeCloseTo(4.5, 2);
    expect(d.tardanzas).toBeCloseTo(4, 2);
    expect(d.ausencias).toBeCloseTo(32, 2);
    expect(d.excedente).toBe(0);
  });

  it("el bruto se mueve por el efecto neto (+9.50 − 11 = −1.50) y el neto igual", () => {
    // Efecto: ausencias 8 + tardanzas 3 − extraDiurno 5 − extraNocturno 4.5 = +1.50 (descuenta)
    expect(con.ajusteAnterior).toBeCloseTo(1.5, 2);
    expect(d.totalBruto).toBeCloseTo(285 - 1.5, 2);
    expect(d.netoPagar).toBeCloseTo(252 - 1.5, 2);
  });

  // ⚠️ CAMBIÓ DE DIRECCIÓN EL 11-SEP-2026, NO SE BORRÓ. Decía «los seguros … quedan
  // TAL CUAL» (decisión pendiente). Daniel: *«los seguros, va»*. Sin los
  // porcentajes (como acá) siguen tal cual — es el CONTROL —; con ellos se
  // recalculan sobre el bruto con el ajuste (ver la sección C2).
  it("SIN los porcentajes, los seguros, el ISR, el préstamo y lo escrito a mano quedan TAL CUAL", () => {
    expect(d.seguroSocial).toBe(29.25);
    expect(d.seguroEducativo).toBe(3.75);
    expect(d.totalDeducciones).toBe(33);
    expect(d.isr).toBe(0);
    expect(d.prestamo).toBe(0);
    expect(d.otrosServicios).toBe(0);
    expect(d.salarioQuincenal).toBe(300);
    expect(con.ajusteDetalle?.seguros).toBeUndefined();
  });

  it("los desgloses de la ausencia siguen siendo SUBCONJUNTOS de la ausencia", () => {
    expect(d.ausenciaPorTardanza).toBeCloseTo(8, 2);
    expect(d.ausenciaDeDiaCompleto).toBeCloseTo(24, 2);
    expect(d.ausenciaPorTardanza + d.ausenciaDeDiaCompleto).toBeLessThanOrEqual(d.ausencias + 1e-9);
  });

  it("la línea dice de qué días salió y cuánto por columna", () => {
    expect(con.ajusteDetalle).toEqual({
      desde: "2026-09-14", hasta: "2026-09-15",
      reparto: { extraDiurno: 5, extraNocturno: 4.5, tardanzas: 3, ausencias: 8 },
    });
  });

  it("sin nada que repartir, la línea vuelve TAL CUAL (misma referencia)", () => {
    const l = LINEA();
    expect(aplicarAjusteEnLinea(l, DINERO(), DIAS)).toBe(l);
    expect(aplicarAjusteEnLinea(l, undefined, DIAS)).toBe(l);
    const sinDinero = LINEA({ dinero: null });
    expect(aplicarAjusteEnLinea(sinDinero, DIAS_DE_ANA, DIAS)).toBe(sinDinero);
  });

  it("la línea original NO se muta", () => {
    const l = LINEA();
    const antes = JSON.stringify(l);
    aplicarAjusteEnLinea(l, DIAS_DE_ANA, DIAS);
    expect(JSON.stringify(l)).toBe(antes);
  });

  it("`totalizar` suma las columnas con el ajuste adentro — ningún total se resta aparte", () => {
    const t = totalizar([aplicarAjusteEnLinea(LINEA(), DIAS_DE_ANA, DIAS)]);
    expect(t.extraDiurno).toBeCloseTo(5, 2);
    expect(t.tardanzas).toBeCloseTo(3, 2);
    expect(t.netoPagar).toBeCloseTo(269, 2);
  });

  it("y el testigo del cierre (`totalesDe`) tampoco lo resta otra vez", () => {
    const l = aplicarAjusteEnLinea(LINEA(), DIAS_DE_ANA, DIAS);
    expect(totalesDe([l]).totalNeto).toBeCloseTo(269, 2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("C2. 🔴 LOS SEGUROS SE CALCULAN SOBRE LO QUE ENTRA POR EL AJUSTE (11-sep-2026)", () => {
  // Daniel: *«los seguros, va»*. Yulissa calcula 9,75 % y 1,25 % sobre todo lo
  // ganado en la quincena, extras incluidas.
  const PCT = { seguroSocialPct: 9.75, seguroEducativoPct: 1.25 };

  it("🔴 EL CASO DE ANA: $5 de extras del ajuste → +$0,49 de seguro social y +$0,06 de educativo", () => {
    const con = aplicarAjusteEnLinea(LINEA(), DINERO({ extraDiurno: 5 }), DIAS, PCT);
    const d = con.dinero!;
    // Bruto 300 → 305. Seguros sobre 305: 29,74 y 3,81.
    expect(d.totalBruto).toBeCloseTo(305, 2);
    expect(d.seguroSocial).toBe(29.74);
    expect(d.seguroEducativo).toBe(3.81);
    expect(con.ajusteDetalle?.seguros).toEqual({ seguroSocial: 0.49, seguroEducativo: 0.06 });
    // Deducciones 33 → 33,55; neto = 305 − 33,55 = 271,45 (= 267 + 5 − 0,55).
    expect(d.totalDeducciones).toBe(33.55);
    expect(d.netoPagar).toBe(271.45);
  });

  it("y con los días de Ana enteros (1 h tarde, 1 h extra): el neto por columna, con los seguros adentro", () => {
    const con = aplicarAjusteEnLinea(LINEA(), DIAS_DE_ANA, DIAS, PCT);
    const d = con.dinero!;
    // Efecto neto del reparto: +3 tardanza − 5 extra = −2 (se le devuelven $2) → bruto 302.
    expect(d.totalBruto).toBeCloseTo(302, 2);
    expect(d.seguroSocial).toBe(centavos(302 * 0.0975));
    expect(d.seguroEducativo).toBe(centavos(302 * 0.0125));
    expect(d.netoPagar).toBe(centavos(302 - d.seguroSocial - d.seguroEducativo));
  });

  it("🔴 un ajuste NEGATIVO (más tardanza que extras) también baja la base — igual que una tardanza normal", () => {
    const con = aplicarAjusteEnLinea(LINEA(), DINERO({ tardanzas: 10 }), DIAS, PCT);
    const d = con.dinero!;
    expect(d.totalBruto).toBeCloseTo(290, 2);
    expect(d.seguroSocial).toBe(centavos(290 * 0.0975));   // 28.28 (bajó de 29.25)
    expect(con.ajusteDetalle?.seguros?.seguroSocial).toBeLessThan(0);
  });

  it("respeta `paga_seguros`: apagado, nada se recalcula", () => {
    const sin = aplicarAjusteEnLinea(
      LINEA({ pagaSeguros: false, dinero: DINERO({ seguroSocial: 0, seguroEducativo: 0, totalDeducciones: 0, netoPagar: 300 }) }),
      DINERO({ extraDiurno: 5 }), DIAS, PCT,
    );
    expect(sin.dinero!.seguroSocial).toBe(0);
    expect(sin.dinero!.seguroEducativo).toBe(0);
    expect(sin.dinero!.netoPagar).toBe(305);
    expect(sin.ajusteDetalle?.seguros).toBeUndefined();
  });

  it("respeta `seguros_base_quincena`: con base propia el seguro no sale del bruto y no cambia", () => {
    // RODRIGO: base $175 → 17,06 y 2,19, pase lo que pase con el bruto.
    const rod = aplicarAjusteEnLinea(
      LINEA({ baseSeguros: 175, dinero: DINERO({ baseSeguros: 175, seguroSocial: 17.06, seguroEducativo: 2.19, totalDeducciones: 19.25, netoPagar: 280.75 }) }),
      DINERO({ extraDiurno: 5 }), DIAS, PCT,
    );
    expect(rod.dinero!.seguroSocial).toBe(17.06);
    expect(rod.dinero!.seguroEducativo).toBe(2.19);
    expect(rod.dinero!.netoPagar).toBe(285.75);
    expect(rod.ajusteDetalle?.seguros).toBeUndefined();
  });

  it("la ruta pasa los porcentajes de las reglas vigentes", () => {
    const ruta = leerSinComentarios("src/app/api/asistencia/planilla/route.ts");
    expect(ruta).toMatch(/aplicarAjusteEnLinea\(\s*l, medido\.dinero\.get\(l\.codigo\), medido\.dias,\s*\{ seguroSocialPct: reglas\.seguroSocialPct, seguroEducativoPct: reglas\.seguroEducativoPct \},\s*\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("D. LA NOTA — se dice de dónde salió, sin cajas ni chips", () => {
  it("los días se escriben cortos: «14–15 sep», «14 sep», «29 ago–2 sep»", () => {
    expect(etiquetaDiasSinMedir("2026-09-14", "2026-09-15")).toBe("14–15 sep");
    expect(etiquetaDiasSinMedir("2026-09-14", "2026-09-14")).toBe("14 sep");
    expect(etiquetaDiasSinMedir("2026-08-29", "2026-09-02")).toBe("29 ago–2 sep");
    expect(etiquetaDiasSinMedir("2026-08-29", "2026-08-31")).toBe("29–31 ago");
  });

  it("la nota de la celda dice cuánto y de qué días; sin ajuste en esa columna, nada", () => {
    const l = aplicarAjusteEnLinea(LINEA(), DIAS_DE_ANA, DIAS);
    expect(notaCeldaAjuste("extraDiurno", l.ajusteDetalle)).toBe(
      "Incluye $5.00 de los días 14–15 sep, que la quincena anterior pagó sin medir.",
    );
    expect(notaCeldaAjuste("tardanzas", l.ajusteDetalle)).toMatch(/\$3\.00/);
    expect(notaCeldaAjuste("ausencias", l.ajusteDetalle)).toBeNull();
    expect(notaCeldaAjuste("extraDiurno", undefined)).toBeNull();
  });

  it("la nota del pie nombra las columnas en el orden del cuadro", () => {
    const l = aplicarAjusteEnLinea(LINEA(), DIAS_DE_ANA, DIAS);
    expect(notaAjuste([l])).toBe(
      "Horas extra 1.25 y Tardanzas incluyen los días 14–15 sep, que la quincena anterior pagó sin medir.",
    );
    expect(notaAjuste([LINEA()])).toBeNull();
    expect(notaAjuste([])).toBeNull();
  });

  it("con varias personas, la nota UNE las columnas y dice cuántas son", () => {
    const a = aplicarAjusteEnLinea(LINEA(), DIAS_DE_ANA, DIAS);
    const b = aplicarAjusteEnLinea(LINEA({ codigo: "2", etiqueta: "BETO" }), DINERO({ domingos: 20 }), DIAS);
    const c = LINEA({ codigo: "3", etiqueta: "CARLA" });
    expect(notaAjuste([a, b, c])).toBe(
      "Horas extra 1.25, Tardanzas y Domingos incluyen los días 14–15 sep, que la quincena anterior pagó sin medir (2 colaboradores).",
    );
    expect(columnasConAjuste({ domingos: 20, extraDiurno: 1 })).toEqual(["extraDiurno", "domingos"]);
  });

  it("con una sola columna, el verbo va en singular", () => {
    const b = aplicarAjusteEnLinea(LINEA(), DINERO({ domingos: 20 }), DIAS);
    expect(notaAjuste([b])).toMatch(/^Domingos incluye los días/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("E. LAS CUATRO SUPERFICIES — Planilla, Excel, PDF y comprobante", () => {
  const Q = quincena(2026, 9, 1);
  const datos = (lineas: LineaPlanilla[]): DatosPlanillaExport => ({
    lineas, totales: totalizar(lineas), quincena: Q, empresaEtiqueta: "Vistana", reglas: REGLAS_DEFAULT,
  });
  const conAjuste = aplicarAjusteEnLinea(LINEA(), DIAS_DE_ANA, DIAS);

  it("🔴 la columna «Ajuste quincena anterior» se RETIRÓ de las cuatro", () => {
    const pantalla = leerSinComentarios("src/app/asistencia/PlanillaTab.tsx");
    const excelPdf = leerSinComentarios("src/lib/asistencia/planilla-exportar.ts");
    const papel = leerSinComentarios("src/lib/asistencia/comprobante.ts");
    for (const src of [pantalla, excelPdf, papel]) {
      expect(src).not.toMatch(/Ajuste quincena anterior/i);
      expect(src).not.toMatch(/AJUSTE QUINCENA ANTERIOR/);
    }
    expect(CLAVES_RENGLON as readonly string[]).not.toContain("ajusteAnterior");
  });

  it("🔴 la pantalla NO vuelve a restar el ajuste: el neto es `netoPagar` tal cual", () => {
    const pantalla = leerSinComentarios("src/app/asistencia/PlanillaTab.tsx");
    expect(pantalla).not.toMatch(/netoConAjuste/);
    expect(pantalla).not.toMatch(/netoPagar\s*-\s*\(?\s*(data\.)?ajuste/);
    expect(pantalla).not.toMatch(/ajusteTotal/);
    // y sí dice de dónde salió: la celda (title) y el pie.
    expect(pantalla).toMatch(/notaCeldaAjuste\(/);
    expect(pantalla).toMatch(/notaAjuste\(buenas\)/);
    expect(pantalla).toMatch(/notaAjuste\(\[l\]\)/);
  });

  it("el testigo del cierre tampoco lo resta", () => {
    const guardada = leerSinComentarios("src/lib/asistencia/planilla-guardada.ts");
    expect(guardada).toMatch(/totalNeto \+= l\.dinero\.netoPagar;/);
    expect(guardada).not.toMatch(/netoPagar - \(l\.ajusteAnterior/);
  });

  it("CONTROL: la planilla de Boston (David) lee `netoPagar` directo — ahora ES el neto que se paga", () => {
    const boston = leerSinComentarios("src/app/boston/tabs/PlanillaBoston.tsx");
    expect(boston).toMatch(/l\.dinero\.netoPagar/);
    expect(boston).not.toMatch(/netoConAjuste|ajusteAnterior/);
  });

  it("Excel: la nota va al pie de la hoja «Planilla» y nace la hoja «Ajuste anterior»", () => {
    const wb = construirExcelPlanilla(datos([conAjuste]));
    expect(wb.SheetNames).toEqual(["Planilla", "Horas", "Cómo se calcula", "Ajuste anterior"]);
    const textos = (ws: XLSX.WorkSheet) => Object.keys(ws).filter((k) => !k.startsWith("!")).map((k) => String((ws[k] as { v?: unknown }).v ?? ""));
    expect(textos(wb.Sheets.Planilla).join("\n")).toMatch(/Horas extra 1\.25 y Tardanzas incluyen los días 14–15 sep/);
    const hoja = textos(wb.Sheets["Ajuste anterior"]);
    expect(hoja).toContain("Horas extra 1.25");
    expect(hoja).toContain("Tardanzas");
    expect(hoja).toContain("14–15 sep");
    expect(hoja).toContain("Ana");
    // Y la columna de extras de la hoja Planilla ya trae los $5 sumados.
    expect(textos(wb.Sheets.Planilla)).toContain("5");
  });

  it("Excel: sin ajuste, las TRES hojas de siempre y ni una palabra de ajuste", () => {
    const wb = construirExcelPlanilla(datos([LINEA()]));
    expect(wb.SheetNames).toEqual(["Planilla", "Horas", "Cómo se calcula"]);
    const todo = wb.SheetNames.map((n) => Object.keys(wb.Sheets[n]).filter((k) => !k.startsWith("!")).map((k) => String((wb.Sheets[n][k] as { v?: unknown }).v ?? "")).join("\n")).join("\n");
    expect(todo).not.toMatch(/pagó sin medir/);
  });

  it("PDF: la nota va en el pie del papel que se firma", () => {
    const src = leerSinComentarios("src/lib/asistencia/planilla-exportar.ts");
    const pie = src.slice(src.indexOf("const pie = armarPie(doc, ["), src.indexOf("], PIE_PT, PIE_MARGEN);"));
    expect(pie).toMatch(/notaAjuste\(d\.lineas\)/);
    // Y el papel se construye sin reventar con y sin ajuste.
    expect(() => construirPdfPlanilla(datos([conAjuste]))).not.toThrow();
    expect(() => construirPdfPlanilla(datos([LINEA()]))).not.toThrow();
  });

  it("comprobante: sin renglón de ajuste, con la nota al pie y el neto de la planilla", () => {
    const c = armarComprobante({ linea: conAjuste }, { esQuincena: true, anio: 2026, mes: 9, n: 1, etiqueta: Q.etiqueta });
    expect(c.renglones.map((r) => r.clave)).not.toContain("ajusteAnterior");
    expect(c.renglones.find((r) => r.clave === "extra125")!.monto).toBeCloseTo(5, 2);
    expect(c.renglones.find((r) => r.clave === "tardanzas")!.monto).toBeCloseTo(3, 2);
    expect(c.renglones.find((r) => r.clave === "salarioAPagar")!.monto).toBeCloseTo(269, 2);
    expect(c.nota).toMatch(/Horas extra 1\.25 y Tardanzas incluyen los días 14–15 sep/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("F. EL CABLEADO DE LA RUTA", () => {
  const ruta = leerSinComentarios("src/app/api/asistencia/planilla/route.ts");
  it("el ajuste entra a la línea por `aplicarAjusteEnLinea`, y los totales salen de esas líneas", () => {
    // ⚠️ 11-sep-2026: la llamada ganó un cuarto argumento —los porcentajes de los
    // seguros (Daniel: «los seguros, va»)— y se partió en varias líneas. La
    // regla que protege no cambió: el ajuste entra por `aplicarAjusteEnLinea`.
    expect(ruta).toMatch(/aplicarAjusteEnLinea\(\s*l, medido\.dinero\.get\(l\.codigo\), medido\.dias,/);
    expect(ruta).toMatch(/totales: totalizar\(lineasFinal\)/);
    expect(ruta).not.toMatch(/ajusteDeDiasSinMedir/);
  });
  it("sigue colgando del interruptor, la quincena y la empresa", () => {
    expect(ruta).toMatch(/if \(PLANILLA_UNIDA && q\.esQuincena && q\.quincena && empresa\)/);
  });
  it("TOTALES_CERO sigue sin columna de ajuste: no existe tal columna", () => {
    expect(Object.keys(TOTALES_CERO)).not.toContain("ajusteAnterior");
  });
});
