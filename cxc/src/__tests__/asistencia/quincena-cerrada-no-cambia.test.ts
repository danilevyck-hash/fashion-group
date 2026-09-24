// ─────────────────────────────────────────────────────────────────────────────
// 🔴 NINGÚN NÚMERO DE UNA QUINCENA YA CERRADA CAMBIA (24-sep-2026) — el candado
//
// Las tres reglas nuevas (gracia del almuerzo · entrada autorizada · aviso)
// solo tocan lo que el motor GENERA de ahora en adelante. Una planilla cerrada
// es su RESULTADO congelado (`asistencia_planilla_guardada`), se lee de sus
// filas y nadie la vuelve a calcular. Y con los interruptores apagados el motor
// es el de antes, byte a byte.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import { armarReporte, type Marcacion } from "@/lib/asistencia/reporte";
import { medirHoras, HORAS_CERO } from "@/lib/asistencia/planilla";
import { excesoAlmuerzoBrutoMin, graciaAlmuerzoEfectiva } from "@/lib/asistencia/reglas-nuevas";
import { extraDeEntrada, avisoEntradaTemprana, horaASeg } from "@/lib/asistencia/entrada-autorizada";

const RAIZ = process.cwd();
const leer = (f: string) =>
  fs.readFileSync(path.join(RAIZ, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("🔴 lo cerrado se LEE, no se recalcula", () => {
  it("el I/O de la planilla guardada no importa el motor ni las reglas nuevas", () => {
    const io = leer("src/lib/asistencia/planilla-guardada-server.ts");
    const puro = leer("src/lib/asistencia/planilla-guardada.ts");
    for (const prohibido of ["armarReporte", "medirHoras", "clasificarDia", "reglas-nuevas", "entrada-autorizada", "graciaAlmuerzo", "entradasAutorizadas"]) {
      expect(io.includes(prohibido), `planilla-guardada-server.ts → ${prohibido}`).toBe(false);
      expect(puro.includes(prohibido), `planilla-guardada.ts → ${prohibido}`).toBe(false);
    }
  });

  it("la migración no toca la planilla guardada ni reescribe nada", () => {
    const sql = fs.readFileSync(
      path.join(RAIZ, "supabase/migrations/20261219120000_asistencia_gracia_almuerzo_entrada_autorizada.sql"),
      "utf8",
    ).replace(/--[^\n]*/g, "");
    expect(sql).not.toMatch(/planilla_guardada/);
    expect(sql).not.toMatch(/\b(UPDATE|DELETE|DROP|TRUNCATE|ALTER COLUMN)\b/i);
    // Solo columnas nuevas con DEFAULT y una tabla nueva.
    expect(sql.match(/ADD COLUMN IF NOT EXISTS/g)?.length).toBe(2);
    expect(sql.match(/CREATE TABLE IF NOT EXISTS/g)?.length).toBe(1);
  });

  it("lo que se congela no cambió de forma: `HorasPersona` tiene las 25 cifras de siempre", () => {
    expect(Object.keys(HORAS_CERO).length).toBe(25);
  });
});

describe("🔴 con los interruptores apagados, el motor de antes byte a byte", () => {
  const CODIGO = "5";
  const DIA = "2026-09-21";
  const marca = (hhmm: string): Marcacion => ({ empleado_codigo: CODIGO, empleado_nombre: null, ocurrio_en: `${DIA}T${hhmm}-05:00` });
  const base = {
    // Un día con TODO: 35 min antes, 66 de almuerzo, 25 de extra.
    marcaciones: ["07:25:00", "12:00:00", "13:06:00", "17:25:00"].map(marca),
    horarios: [{ empleado_codigo: CODIGO, entrada: "08:00", salida: "17:00", almuerzo_minutos: 60 }],
    justificaciones: [], feriados: new Map<string, string>(), desde: DIA, hasta: DIA,
  };

  it("gracia 0 y sin autorizaciones = el cálculo anterior: 6 de exceso, 25 de extra, sin campos nuevos", () => {
    const [p] = armarReporte({ ...base, reglas: { ...REGLAS_DEFAULT, graciaAlmuerzoMin: 0, avisoEntradaTempranaMin: 0 } });
    const d = p.dias[0];
    expect(d.excesoAlmuerzoMin).toBe(6);
    expect(d.extraMin).toBe(25);
    expect(d.tardeMin).toBe(0);
    expect("extraEntradaMin" in d).toBe(false);
    expect("entradaAutorizada" in d).toBe(false);
    expect("entradaTempranaMin" in d).toBe(false);
    const h = medirHoras(p, REGLAS_DEFAULT, 8 * 60);
    expect(h.extraDiurnoMin).toBe(25);
    expect(h.extraNocturnoMin).toBe(0);
  });

  it("las tres funciones nuevas, apagadas, devuelven exactamente lo de siempre", () => {
    expect(graciaAlmuerzoEfectiva(5, 5, false)).toBe(0);
    expect(excesoAlmuerzoBrutoMin(66 * 60, 60 * 60, 0)).toBe(6);
    expect(extraDeEntrada({ entSeg: horaASeg("05:58"), entradaProgSeg: horaASeg("10:00"), autorizadaSeg: horaASeg("06:00"), extraMinimoSeg: 600, activo: false }).min).toBe(0);
    expect(avisoEntradaTemprana({ entSeg: horaASeg("06:00"), entradaProgSeg: horaASeg("10:00"), umbralMin: 30, tieneAutorizacion: false, activo: false })).toBeNull();
  });

  it("y prendidas, SOLO se mueve lo que Daniel definió: el exceso de 6 sigue siendo 6 (pasa la gracia), la extra sigue en 25", () => {
    const [p] = armarReporte({ ...base, reglas: REGLAS_DEFAULT });
    const d = p.dias[0];
    expect(d.excesoAlmuerzoMin).toBe(6);
    expect(d.extraMin).toBe(25);
    expect(d.entradaTempranaMin).toBe(35);
  });
});
