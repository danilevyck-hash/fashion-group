// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO — EL TIEMPO FUERA DURANTE LA JORNADA SE DESCUENTA (9-oct-2026)
//
// Daniel: «¿cómo no se descuenta si alguien salió?». Los seis casos, con el
// motor real y la planilla real: $800, 48 h semanales (rata $3,85, minuto
// $0,0642), horario 9:00–18:00 con 30 min de almuerzo, martes 6-oct-2026.
//
// Y el otro lado: con `DESCUENTA_TIEMPO_FUERA` apagado, la planilla de HOY.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { armarReporte, type Justificacion, type Marcacion } from "@/lib/asistencia/reporte";
import { calcularDinero, medirHoras, MANUALES_CERO } from "@/lib/asistencia/planilla";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import { DESCUENTA_TIEMPO_FUERA } from "@/lib/asistencia/tiempo-fuera";
import {
  MOTIVO_PERMISO_PERSONAL, motivoSeOfrece, motivosParaElegir, MOTIVOS_JUSTIFICACION,
} from "@/lib/asistencia/motivos";
import { motivoAdmiteHoras, motivoExigeHoras, textoPermiso } from "@/lib/asistencia/permiso-horas";

const R = REGLAS_DEFAULT;
const FECHA = "2026-10-06"; // martes

function correr(horas: string[], opts: { just?: Justificacion; prendido: boolean }) {
  const marcaciones: Marcacion[] = horas.map((h) => ({
    empleado_codigo: "7", empleado_nombre: null,
    ocurrio_en: new Date(`${FECHA}T${h}:00-05:00`).toISOString(),
  }));
  const p = armarReporte({
    marcaciones,
    horarios: [{ empleado_codigo: "7", entrada: "09:00", salida: "18:00", almuerzo_minutos: 30 }],
    justificaciones: opts.just ? [opts.just] : [],
    feriados: new Map(), desde: FECHA, hasta: FECHA, reglas: R,
    descuentaTiempoFuera: opts.prendido,
  })[0];
  const h = medirHoras(p, R, 8.5 * 60);
  const d = calcularDinero(800, 48, h, MANUALES_CERO, R)!;
  return { dia: p.dias[0], h, d };
}

const permiso = (motivo: string): Justificacion => ({
  empleado_codigo: "7", desde: FECHA, hasta: FECHA, motivo, hora_desde: "14:00", hora_hasta: "16:00",
});

const CASO1 = ["09:00", "12:00", "12:30", "14:00", "16:00", "18:00"];
const CASO2 = ["09:00", "14:00", "16:00", "18:00"];
const CASO3 = ["09:00", "12:00", "12:30", "18:00"];
const CASO4 = ["09:00", "12:00", "12:30", "14:00"];

describe("🔴 prendido: los seis casos de Daniel, en «Tiempo no laborado» (9-oct-2026)", () => {
  // 🔴 Desde el 9-oct-2026 un día tiene MÁXIMO 4 marcas (Daniel). Los casos 1,
  // 5 y 6 eran de 6 marcas: con 4 marcas son el mismo hueco de 14:00 a 16:00
  // sin almuerzo aparte (CASO2): 120 − 30 = 90 min. Con 6 marcas el día queda
  // a revisar y no descuenta (abajo).
  it("1 · salida de 14:00 a 16:00 y vuelve → 90 min ($5,78) en Tiempo no laborado, no en Salida temprana", () => {
    const { dia, h, d } = correr(CASO2, { prendido: true });
    expect(h.tiempoNoLaboradoMin).toBe(90);
    expect(d.tiempoNoLaborado).toBe(5.78);
    expect(h.salidaTempranaMin).toBe(0);
    expect(d.salidaTemprana).toBe(0);
    expect(d.rataHora).toBe(3.85);
    expect(dia.revisar).toBe(false);
  });
  it("2 · el total bruto resta el tiempo no laborado: 400 − 5,78", () => {
    const { d } = correr(CASO2, { prendido: true });
    expect(d.totalBruto).toBe(394.22);
  });
  it("3 · almuerzo de 30 justo → 0", () => {
    const { h, d } = correr(CASO3, { prendido: true });
    expect(h.tiempoNoLaboradoMin).toBe(0);
    expect(d.tiempoNoLaborado).toBe(0);
    expect(d.salidaTemprana).toBe(0);
  });
  it("4 · se fue a las 14:00 y no volvió → 240 de SALIDA TEMPRANA ($15,40), nada en Tiempo no laborado", () => {
    const { h, d } = correr(CASO4, { prendido: true });
    expect(h.salidaTempranaMin).toBe(240);
    expect(d.salidaTemprana).toBe(15.4);
    expect(h.tiempoNoLaboradoMin).toBe(0);
    expect(d.tiempoNoLaborado).toBe(0);
  });
  it("5 · con una Constancia de 14:00 a 16:00 → 0", () => {
    const { dia, h } = correr(CASO2, { prendido: true, just: permiso("Constancia") });
    expect(h.tiempoNoLaboradoMin).toBe(0);
    expect(dia.permisoPerdonaAlmuerzoMin).toBe(90); // nada callado
  });
  it("6 · con un Permiso personal → 90 min ($5,78), y se lee «Permiso personal»", () => {
    const { dia, h, d } = correr(CASO2, { prendido: true, just: permiso(MOTIVO_PERMISO_PERSONAL) });
    expect(h.tiempoNoLaboradoMin).toBe(90);
    expect(d.tiempoNoLaborado).toBe(5.78);
    expect(d.salidaTemprana).toBe(0);
    expect(dia.permiso).toBe("Permiso personal · 14:00–16:00 · se descuenta");
    expect(dia.permisoSeDescuenta).toBe(true);
    expect(dia.justificado).toBeNull();
  });
  it("la gracia del almuerzo (5 min) es una puerta: 35 → 0 · 36 → 6 ($0,39)", () => {
    expect(correr(["09:00", "12:00", "12:35", "18:00"], { prendido: true }).h.tiempoNoLaboradoMin).toBe(0);
    const r = correr(["09:00", "12:00", "12:36", "18:00"], { prendido: true });
    expect(r.h.tiempoNoLaboradoMin).toBe(6);
    expect(r.d.tiempoNoLaborado).toBe(0.39);
  });
});

describe("🔴 máximo 4 marcas: lo que no se adivina (reloj físico)", () => {
  it.each([
    ["5 marcas", ["09:00", "12:00", "12:30", "14:00", "18:00"]],
    ["6 marcas", CASO1],
    ["8 marcas", ["09:00", "10:00", "11:00", "12:00", "12:30", "14:00", "16:00", "18:00"]],
  ])("%s: a revisar y sin descuento", (_n, marcas) => {
    const { dia, h, d } = correr(marcas as string[], { prendido: true });
    expect(dia.revisar).toBe(true);
    expect(dia.descuentaFueraMin).toBe(0);
    expect(h.tiempoNoLaboradoMin).toBe(0);
    expect(d.tiempoNoLaborado).toBe(0);
    expect(h.salidaTempranaMin).toBe(0);
  });
  it.each([
    ["1 marca", ["09:00"]],
    ["2 marcas", ["09:00", "18:00"]],
    ["3 marcas", ["09:00", "12:00", "12:30"]],
  ])("%s: igual con el interruptor prendido o apagado", (_n, marcas) => {
    const on = correr(marcas as string[], { prendido: true });
    const off = correr(marcas as string[], { prendido: false });
    expect(on.h.tiempoNoLaboradoMin).toBe(0);
    expect(on.d.totalBruto).toBe(off.d.totalBruto);
    expect(on.h.salidaTempranaMin).toBe(off.h.salidaTempranaMin);
    expect(on.dia.revisar).toBe(off.dia.revisar);
  });
  it("un Permiso personal no justifica un día sin marcas: sigue siendo ausencia", () => {
    const p = armarReporte({
      marcaciones: ["09:00", "18:00"].map((h) => ({
        empleado_codigo: "7", empleado_nombre: null,
        ocurrio_en: new Date(`2026-10-05T${h}:00-05:00`).toISOString(),
      })),
      horarios: [{ empleado_codigo: "7", entrada: "09:00", salida: "18:00", almuerzo_minutos: 30 }],
      justificaciones: [permiso(MOTIVO_PERMISO_PERSONAL)],
      feriados: new Map(), desde: "2026-10-05", hasta: FECHA, reglas: R, descuentaTiempoFuera: true,
    })[0];
    const martes = p.dias.find((d) => d.fecha === FECHA)!;
    expect(martes.ausente).toBe(true);
    expect(martes.justificado).toBeNull();
    expect(martes.permiso).toBe("Permiso personal · 14:00–16:00 · se descuenta");
  });
  it("el resumen del Reporte suma el tiempo no laborado y el total lo usa", () => {
    const { dia } = correr(CASO2, { prendido: true });
    expect(dia.descuentaFueraMin).toBe(90);
  });
});

describe("🔴 apagado = la planilla de hoy", () => {
  it("el interruptor está PRENDIDO (9-oct-2026, Daniel)", () => {
    expect(DESCUENTA_TIEMPO_FUERA).toBe(true);
  });
  it.each([
    ["caso 1", CASO1, 0], ["caso 2", CASO2, 0], ["caso 3", CASO3, 0], ["caso 4", CASO4, 240],
  ])("%s descuenta lo de hoy", (_n, marcas, salida) => {
    const { dia, h, d } = correr(marcas as string[], { prendido: false });
    expect(h.salidaTempranaMin).toBe(salida);
    expect(h.tiempoNoLaboradoMin ?? 0).toBe(0);
    expect(d.tiempoNoLaborado).toBe(0);
    expect(dia.descuentaFueraMin).toBeUndefined();
  });
  it("6 marcas sigue a revisar y con 510 trabajados", () => {
    const { dia } = correr(CASO1, { prendido: false });
    expect(dia.revisar).toBe(true);
    expect(dia.trabajadoMin).toBe(510);
  });
  it("apagado, «Permiso personal» no se ofrece ni se acepta", () => {
    expect(motivosParaElegir(null, false)).toEqual(MOTIVOS_JUSTIFICACION);
    expect(motivoSeOfrece(MOTIVO_PERMISO_PERSONAL, false)).toBe(false);
  });
});

describe("🔴 «Permiso personal»: se registra como una constancia", () => {
  it("se ofrece al lado de Constancia con el interruptor prendido", () => {
    const l = motivosParaElegir(null, true);
    expect(l[l.indexOf("Constancia") + 1]).toBe(MOTIVO_PERMISO_PERSONAL);
    expect(motivoSeOfrece(MOTIVO_PERMISO_PERSONAL, true)).toBe(true);
  });
  it("lleva horas, obligatorias, y se lee distinto en la ficha", () => {
    expect(motivoAdmiteHoras(MOTIVO_PERMISO_PERSONAL)).toBe(true);
    expect(motivoExigeHoras(MOTIVO_PERMISO_PERSONAL)).toBe(true);
    expect(motivoExigeHoras("Constancia")).toBe(false);
    expect(textoPermiso(MOTIVO_PERMISO_PERSONAL, "14:00", "16:00"))
      .toBe("Permiso personal · 14:00–16:00 · se descuenta");
  });
});
