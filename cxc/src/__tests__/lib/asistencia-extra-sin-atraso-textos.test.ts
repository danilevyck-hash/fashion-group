/**
 * ─────────────────────────────────────────────────────────────────────────────
 * LO QUE EL PAPEL DICE DE LA HORA EXTRA — el candado del TEXTO, no del número.
 *
 * 🔴 LA REGLA CAMBIÓ EL 1-sep-2026. Antes la hora extra se pagaba NETA del
 * atraso del mismo día (`extraMin = bruto − tardeMin`) y el mínimo era de 15
 * minutos. Ahora el mínimo es el de las reglas (hoy 10) y la extra se paga
 * COMPLETA: preguntado «llegó 20 tarde y se quedó 30 → cobra 10, ¿sigue así?»,
 * Daniel, textual: *«No, van separadas»*. La tardanza se sigue descontando por
 * su lado; la extra se paga desde el primer minuto una vez pasado el mínimo.
 *
 * 🩸 POR QUÉ ESTE ARCHIVO. El motor se arregló en una línea y los tests del
 * motor lo cuidan. La FRASE no se arregla sola: quedó viva en las tres
 * superficies que Daniel mira —pantalla, Excel y PDF— explicando una regla que
 * el sistema ya no hace. Un total que no cuadra se ve; una frase que miente se
 * cree, y la contadora paga por ella.
 *
 * 🔴 Y EL UMBRAL NO SE CABLEA. El mínimo es configurable: si el texto escribe
 * un "10" a mano, el día que Daniel lo mueva en Configuración el papel va a
 * decir un número y el sistema va a pagar otro. Por eso cada caso construye el
 * archivo con un umbral RARO (42) y exige verlo salir por el otro lado.
 *
 * El ⓘ de la pantalla se prueba en `asistencia-poda-textos.test.tsx`, que ya
 * monta la pestaña de verdad y toca el ⓘ.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx-js-style";

import { construirExcel, construirPdf } from "@/lib/asistencia/exportar";
import { construirExcelPlanilla, type DatosPlanillaExport } from "@/lib/asistencia/planilla-exportar";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import { TOTALES_CERO, type Quincena } from "@/lib/asistencia/planilla";

/** Un umbral que NADIE tendría escrito a mano: si sale, es porque se interpoló. */
const UMBRAL_RARO = 42;

const DESDE = "2026-08-01";
const HASTA = "2026-08-15";

/** Las hojas de reglas no dependen de la gente: se arman igual sin renglones. */
const sinGente = { personas: [], desde: DESDE, hasta: HASTA };

function celdas(ws: XLSX.WorkSheet): string[] {
  return Object.keys(ws)
    .filter((k) => !k.startsWith("!"))
    .map((k) => String((ws[k] as { v?: unknown }).v ?? ""));
}

/** La fila de la hoja de reglas cuyo concepto es `concepto`, ya como texto. */
function explicacionDe(ws: XLSX.WorkSheet, concepto: string): string {
  const filas = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
  const fila = filas.find((f) => String(f?.[0] ?? "") === concepto);
  expect(fila, `la hoja perdió la fila «${concepto}»`).toBeDefined();
  return String(fila![1] ?? "");
}

// ═════════════════════════════════════════════════════════════════════════════
describe("🔴 el Excel del Reporte — hoja «Cómo se calcula»", () => {
  const hoja = (extraMinimoMin: number) =>
    construirExcel({ ...sinGente, reglas: { ...REGLAS_DEFAULT, extraMinimoMin } })
      .Sheets["Cómo se calcula"];

  it("dice que se paga COMPLETA y que el atraso va aparte", () => {
    const t = explicacionDe(hoja(REGLAS_DEFAULT.extraMinimoMin), "Horas extra");
    expect(t).toContain("se pagan completas");
    expect(t).toContain("desde el primer minuto");
    expect(t).toContain("se descuenta aparte");
  });

  it("🔴 ya NO dice que el atraso se le resta", () => {
    const t = explicacionDe(hoja(REGLAS_DEFAULT.extraMinimoMin), "Horas extra");
    expect(t).not.toMatch(/se le resta el atraso|menos el atraso/);
    // Y en ninguna otra celda del archivo quedó la regla vieja escondida.
    const wb = construirExcel({ ...sinGente, reglas: REGLAS_DEFAULT });
    for (const nombre of wb.SheetNames) {
      expect(
        celdas(wb.Sheets[nombre]).filter((c) => /menos el atraso|se le resta el atraso/.test(c)),
        `la hoja «${nombre}» conserva la regla vieja`,
      ).toHaveLength(0);
    }
  });

  it("🔴 el umbral sale de las reglas, no de un número escrito a mano", () => {
    expect(explicacionDe(hoja(UMBRAL_RARO), "Horas extra")).toContain(`Desde ${UMBRAL_RARO} minutos`);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("🔴 el PDF del Reporte — el pie del papel que se firma", () => {
  /** El PDF de jsPDF sin comprimir: su texto se lee crudo, en latin-1. */
  const texto = (extraMinimoMin: number) =>
    Buffer.from(
      construirPdf({ ...sinGente, reglas: { ...REGLAS_DEFAULT, extraMinimoMin } })
        .output("arraybuffer") as ArrayBuffer,
    ).toString("latin1");

  it("dice que se pagan completas y que el atraso se descuenta aparte", () => {
    const t = texto(REGLAS_DEFAULT.extraMinimoMin);
    expect(t).toContain("se pagan completas");
    expect(t).toContain("el atraso se descuenta aparte");
  });

  it("🔴 ya NO dice «menos el atraso del día»", () => {
    expect(texto(REGLAS_DEFAULT.extraMinimoMin)).not.toContain("menos el atraso");
  });

  it("🔴 el umbral del pie sale de las reglas", () => {
    expect(texto(UMBRAL_RARO)).toContain(`extras desde ${UMBRAL_RARO} min`);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// El Excel de la Planilla: la hoja que la contadora mira para cuadrar el pago.

const QUINCENA: Quincena = {
  anio: 2026, mes: 8, n: 1,
  desde: DESDE, hasta: HASTA,
  etiqueta: "1 al 15 de agosto de 2026", clave: "2026-08-1",
};

function planilla(extraMinimoMin: number): DatosPlanillaExport {
  return {
    lineas: [],
    totales: { ...TOTALES_CERO },
    quincena: QUINCENA,
    empresaEtiqueta: null,
    reglas: { ...REGLAS_DEFAULT, extraMinimoMin },
  };
}

/** La hoja de reglas de la planilla, buscada por su encabezado (no por índice:
 *  el orden de las hojas es cosa del export y puede cambiar sin mentir). */
function hojaReglasPlanilla(d: DatosPlanillaExport): XLSX.WorkSheet {
  const wb = construirExcelPlanilla(d);
  const nombre = wb.SheetNames.find((n) =>
    celdas(wb.Sheets[n]).some((c) => c === "Con qué se calculó esta planilla"));
  expect(nombre, "la planilla perdió su hoja de reglas").toBeDefined();
  return wb.Sheets[nombre!];
}

describe("🔴 el Excel de la Planilla — «Con qué se calculó esta planilla»", () => {
  it("dice que se paga completa y que el atraso se descuenta aparte", () => {
    const t = explicacionDe(hojaReglasPlanilla(planilla(REGLAS_DEFAULT.extraMinimoMin)), "Hora extra");
    expect(t).toContain("se paga completa");
    expect(t).toContain("desde el primer minuto");
    expect(t).toContain("se descuenta aparte");
    // Los recargos de la misma fila siguen ahí: esto corrigió una frase, no
    // borró la explicación.
    expect(t).toContain(String(REGLAS_DEFAULT.recargoExtraDiurno));
    expect(t).toContain(String(REGLAS_DEFAULT.recargoExtraNocturno));
  });

  it("🔴 ya NO dice «menos el atraso del mismo día»", () => {
    expect(explicacionDe(hojaReglasPlanilla(planilla(REGLAS_DEFAULT.extraMinimoMin)), "Hora extra"))
      .not.toMatch(/menos el atraso/);
  });

  it("🔴 el umbral sale de las reglas de ESA planilla", () => {
    expect(explicacionDe(hojaReglasPlanilla(planilla(UMBRAL_RARO)), "Hora extra"))
      .toContain(`Desde ${UMBRAL_RARO} minutos`);
  });
});
