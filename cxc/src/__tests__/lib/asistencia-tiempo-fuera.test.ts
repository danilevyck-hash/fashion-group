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

describe("🔴 prendido: los seis casos de Daniel", () => {
  it("1 · almuerzo + salida de 14:00 a 16:00 → 120 min ($7,70)", () => {
    const { dia, h, d } = correr(CASO1, { prendido: true });
    expect(h.salidaTempranaMin).toBe(120);
    expect(d.rataHora).toBe(3.85);
    expect(d.salidaTemprana).toBe(7.7);
    expect(dia.trabajadoMin).toBe(390);
    expect(dia.revisar).toBe(true); // 6 marcas sigue a revisar (decisión pendiente de Daniel)
  });
  it("2 · cuatro marcas con un hueco de 120 → 90 min ($5,78)", () => {
    const { h, d } = correr(CASO2, { prendido: true });
    expect(h.salidaTempranaMin).toBe(90);
    expect(d.salidaTemprana).toBe(5.78);
  });
  it("3 · almuerzo de 30 justo → 0", () => {
    const { h, d } = correr(CASO3, { prendido: true });
    expect(h.salidaTempranaMin).toBe(0);
    expect(d.salidaTemprana).toBe(0);
  });
  it("4 · se fue a las 14:00 y no volvió → 240 de salida temprana, como hoy ($15,40)", () => {
    const { h, d } = correr(CASO4, { prendido: true });
    expect(h.salidaTempranaMin).toBe(240);
    expect(d.salidaTemprana).toBe(15.4);
  });
  it("5 · el caso 1 con una Constancia de 14:00 a 16:00 → 0", () => {
    const { dia, h } = correr(CASO1, { prendido: true, just: permiso("Constancia") });
    expect(h.salidaTempranaMin).toBe(0);
    expect(dia.permisoPerdonaAlmuerzoMin).toBe(120); // nada callado
  });
  it("6 · el caso 1 con un Permiso personal → 120 min, y se lee «Permiso personal»", () => {
    const { dia, h, d } = correr(CASO1, { prendido: true, just: permiso(MOTIVO_PERMISO_PERSONAL) });
    expect(h.salidaTempranaMin).toBe(120);
    expect(d.salidaTemprana).toBe(7.7);
    expect(dia.permiso).toBe("Permiso personal · 14:00–16:00 · se descuenta");
    expect(dia.permisoSeDescuenta).toBe(true);
    expect(dia.justificado).toBeNull();
  });
});

describe("🔴 lo que no se adivina", () => {
  it("5 marcas: a revisar y sin descuento de tiempo fuera", () => {
    const { dia } = correr(["09:00", "12:00", "12:30", "14:00", "18:00"], { prendido: true });
    expect(dia.revisar).toBe(true);
    expect(dia.descuentaFueraMin).toBe(0);
  });
  it("8 marcas: a revisar y sin descuento de tiempo fuera", () => {
    const { dia, h } = correr(
      ["09:00", "10:00", "11:00", "12:00", "12:30", "14:00", "16:00", "18:00"], { prendido: true });
    expect(dia.revisar).toBe(true);
    expect(dia.descuentaFueraMin).toBe(0);
    expect(h.salidaTempranaMin).toBe(0);
  });
  it("la gracia del almuerzo (5 min) es una puerta: 35 → 0 · 36 → 6", () => {
    expect(correr(["09:00", "12:00", "12:35", "18:00"], { prendido: true }).h.salidaTempranaMin).toBe(0);
    expect(correr(["09:00", "12:00", "12:36", "18:00"], { prendido: true }).h.salidaTempranaMin).toBe(6);
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
});

describe("🔴 apagado = la planilla de hoy", () => {
  it("el interruptor viene apagado", () => {
    expect(DESCUENTA_TIEMPO_FUERA).toBe(false);
  });
  it.each([
    ["caso 1", CASO1, 0], ["caso 2", CASO2, 0], ["caso 3", CASO3, 0], ["caso 4", CASO4, 240],
  ])("%s descuenta lo de hoy", (_n, marcas, salida) => {
    const { dia, h } = correr(marcas as string[], { prendido: false });
    expect(h.salidaTempranaMin).toBe(salida);
    expect(dia.descuentaFueraMin).toBeUndefined();
  });
  it("6 marcas sigue a revisar y con 510 trabajados", () => {
    const { dia } = correr(CASO1, { prendido: false });
    expect(dia.revisar).toBe(true);
    expect(dia.trabajadoMin).toBe(510);
  });
  it("«Permiso personal» no se ofrece ni se acepta", () => {
    expect(motivosParaElegir(null)).toEqual(MOTIVOS_JUSTIFICACION);
    expect(motivoSeOfrece(MOTIVO_PERMISO_PERSONAL)).toBe(false);
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
