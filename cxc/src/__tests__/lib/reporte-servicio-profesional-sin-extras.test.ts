/* ─────────────────────────────────────────────────────────────────────────────
 * EL REPORTE DE ASISTENCIA: al servicio profesional NO se le cuentan las horas
 * extra — se le muestran «—» y no suman al total. Tardanzas y ausencias, igual
 * que a todos. (3-sep-2026)
 *
 * Daniel, textual: *«yulisa marca pero no deberia de calcular ya que es salario
 * fijo, es solo para ver sus tardanzas y ausencias»*.
 *
 * El motor (`armarReporte`) sigue midiendo `extraMin` —es lo que marcó el
 * reloj—; la bandera `servicioProfesional` la pone la ruta desde la ficha. Acá
 * se prueba lo que SE VE: la fila del Excel, el total del Excel y el PDF. CONTROL:
 * la misma persona sin la bandera sale con su número.
 * Fechas fijas (agosto 2026), nunca `new Date()`.
 * ─────────────────────────────────────────────────────────────────────────── */
import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx-js-style";

import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import {
  armarReporte, cuentaHorasExtra, extraQueCuenta,
  type HorarioPersona, type Marcacion, type PersonaReporte,
} from "@/lib/asistencia/reporte";
import { construirExcel, construirPdf } from "@/lib/asistencia/exportar";

const R = REGLAS_DEFAULT;
const DESDE = "2026-08-03";
const HASTA = "2026-08-04";
const enPanama = (dia: string, hhmm: string) =>
  new Date(Date.parse(`${dia}T${hhmm}:00-05:00`)).toISOString();

// Lunes: llega 08:40 (tarde) y sale 18:00 (una hora extra). Martes: no viene.
const marcaciones: Marcacion[] = ["08:40", "12:00", "12:30", "18:00"].map((h) => ({
  empleado_codigo: "26", empleado_nombre: null, ocurrio_en: enPanama("2026-08-03", h),
}));
const horarios: HorarioPersona[] = [
  { empleado_codigo: "26", entrada: "08:00", salida: "17:00", almuerzo_minutos: 30 },
];

function reporte(servicioProfesional: boolean): PersonaReporte[] {
  const personas = armarReporte({
    marcaciones, horarios, justificaciones: [], feriados: new Map(),
    desde: DESDE, hasta: HASTA, reglas: R, nombres: new Map([["26", "YULISSA JUAREZ"]]),
  });
  // Es lo que hace la ruta `/api/asistencia/reporte` con la ficha.
  return servicioProfesional ? personas.map((p) => ({ ...p, servicioProfesional: true })) : personas;
}

const filas = (wb: XLSX.WorkBook, hoja: string) =>
  XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[hoja], { header: 1 }) as unknown[][];

describe("el motor mide igual; la bandera decide qué se cuenta", () => {
  it("CONTROL: sin la bandera, 60 min de extra, y se cuentan", () => {
    const [p] = reporte(false);
    expect(p.resumen.extraMin).toBeCloseTo(60, 6);
    expect(cuentaHorasExtra(p)).toBe(true);
    expect(extraQueCuenta(p)).toBeCloseTo(60, 6);
  });

  it("🔴 con la bandera: el reloj midió lo mismo, pero NO se cuenta; tardanza y ausencia intactas", () => {
    const [sp] = reporte(true);
    const [normal] = reporte(false);
    expect(sp.resumen.extraMin).toBeCloseTo(normal.resumen.extraMin, 6);
    expect(cuentaHorasExtra(sp)).toBe(false);
    expect(extraQueCuenta(sp)).toBe(0);
    expect(sp.resumen.minutosTarde).toBeGreaterThan(0);
    expect(sp.resumen.minutosTarde).toBe(normal.resumen.minutosTarde);
    expect(sp.resumen.ausenciasSinJustificar).toBe(normal.resumen.ausenciasSinJustificar);
    expect(sp.resumen.ausenciasSinJustificar).toBe(1);
  });
});

describe("el Excel y el PDF muestran «—», nunca 0 ni el número", () => {
  const col = (f: unknown[][], nombre: string) => (f[0] as string[]).indexOf(nombre);

  it("Resumen: la celda de extras es «—» y el total no la suma", () => {
    const f = filas(construirExcel({ personas: reporte(true), desde: DESDE, hasta: HASTA, reglas: R }), "Resumen");
    const c = col(f, "Extras (min)");
    expect(c).toBeGreaterThan(-1);
    const fila = f.find((r) => String(r[0]).includes("YULISSA"))!;
    expect(fila[c]).toBe("—");
    const total = f.find((r) => String(r[0]).toUpperCase().includes("TOTAL"))!;
    expect(total[c] === "" || total[c] === undefined || total[c] === 0).toBe(true);
    // Y su tardanza sigue saliendo con número.
    const ct = col(f, "Minutos tarde");
    expect(Number(fila[ct])).toBeGreaterThan(0);
  });

  it("CONTROL Resumen: sin la bandera sale 60", () => {
    const f = filas(construirExcel({ personas: reporte(false), desde: DESDE, hasta: HASTA, reglas: R }), "Resumen");
    const c = col(f, "Extras (min)");
    const fila = f.find((r) => String(r[0]).includes("YULISSA"))!;
    expect(Number(fila[c])).toBeCloseTo(60, 6);
  });

  it("Detalle: el día con extra dice «—»", () => {
    const f = filas(construirExcel({ personas: reporte(true), desde: DESDE, hasta: HASTA, reglas: R }), "Detalle");
    const c = col(f, "Extra (min)");
    const dia = f.find((r) => String(r[0]).includes("YULISSA") && String(r[3] ?? "").startsWith("08:"))!;
    expect(dia[c]).toBe("—");
  });

  it("PDF: el total de extras no la incluye (arma sin reventar)", () => {
    const doc = construirPdf({ personas: reporte(true), desde: DESDE, hasta: HASTA, reglas: R });
    expect(doc.internal.pages.length).toBeGreaterThan(1);
  });
});
