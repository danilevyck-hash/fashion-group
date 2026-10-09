// ─────────────────────────────────────────────────────────────────────────────
// 🔴 COMPENSACIÓN DE TARDANZA (9-oct-2026) — el candado
//
// Daniel aprobó «Repone tardanza», por colaborador: el tiempo después de la
// salida borra tardanza del MISMO día, minuto por minuto, y no es hora extra;
// lo que sobra sigue la regla de siempre (puerta de 10, 1,25/1,50, Aprobaciones).
// Apagada (todos, por omisión): todo exactamente como hoy.
//
// Horario 9:00–18:00, almuerzo 60, $600 / 48 h → rata $2,88, minuto $0,048.
// El corte nocturno es 18:00, así que toda extra de salida va al 1,50.
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import { armarLinea, medirHoras, type FichaPlanilla } from "@/lib/asistencia/planilla";
import { armarReporte, type Marcacion, type HorarioPersona } from "@/lib/asistencia/reporte";
import { diasConExtra } from "@/lib/asistencia/aprobaciones";
import { compensarTardanza, reponeTardanza, validarReponeTardanza } from "@/lib/asistencia/repone-tardanza";

const RAIZ = join(__dirname, "..", "..", "..");
const R = REGLAS_DEFAULT;
const COD = "77";
const DIA = "2026-09-22"; // martes
const HORARIO: HorarioPersona = { empleado_codigo: COD, entrada: "09:00", salida: "18:00", almuerzo_minutos: 60 };
const FICHA: FichaPlanilla = { codigo: COD, nombre: "PRUEBA", salarioMensual: 600, jornadaSemanal: 48, empresa: "boston" };
const MANUALES = { isr: 0, prestamo: 0, terceros: 0, mercancia: 0, otrosServicios: 0 };

const marca = (hhmm: string): Marcacion => ({
  empleado_codigo: COD, empleado_nombre: null, ocurrio_en: `${DIA}T${hhmm}:00-05:00`,
});

function correr(entra: string, sale: string, prendida: boolean, aprobada = true) {
  const [p] = armarReporte({
    marcaciones: [entra, "13:00", "14:00", sale].map(marca),
    horarios: [HORARIO], justificaciones: [], feriados: new Map(), desde: DIA, hasta: DIA, reglas: R,
    reponeTardanza: prendida ? new Set([COD]) : new Set(),
  });
  const h = medirHoras(p, R, 480, { exigir: true, claves: new Set(aprobada ? [`${COD}|${DIA}`] : []), codigo: COD });
  const l = armarLinea(FICHA, h, MANUALES, R, 1, null, { exigirAprobacion: true, aprobada });
  const d = l.dinero!;
  return {
    dia: p.dias[0],
    persona: p,
    tardanzaMin: h.tardanzaMin,
    tardanza$: d.tardanzas + d.ausenciaPorTardanza,
    extraMin: h.extraDiurnoMin + h.extraNocturnoMin,
    extra$: d.extraDiurno + d.extraNocturno,
    neto: d.netoPagar,
    linea: l,
  };
}

describe("🔴 los ejemplos de Daniel, con la casilla PRENDIDA", () => {
  it("9:15 → 18:15: tardanza $0, extra $0", () => {
    const r = correr("09:15", "18:15", true);
    expect(r.dia.tardeMin).toBe(0);
    expect(r.dia.extraMin).toBe(0);
    expect(r.tardanza$).toBe(0);
    expect(r.extra$).toBe(0);
  });

  it("9:15 → 18:20: tardanza $0, sobran 5 → menos de 10 → extra $0", () => {
    const r = correr("09:15", "18:20", true);
    expect(r.tardanza$).toBe(0);
    expect(r.dia.extraMin).toBe(0);
    expect(r.extra$).toBe(0);
  });

  it("9:15 → 18:30: tardanza $0, extra de 15 min al 1,50 = $1,08, y pasa por Aprobaciones", () => {
    const r = correr("09:15", "18:30", true);
    expect(r.tardanza$).toBe(0);
    expect(r.dia.extraMin).toBe(15);
    expect(r.extraMin).toBe(15);
    expect(r.linea.dinero!.extraNocturno).toBeCloseTo(1.08, 2);
    // Los 15 que se pagan son los ÚLTIMOS (18:15–18:30): mismo corte de siempre.
    expect(diasConExtra(r.persona, R)[0]).toMatchObject({ fecha: DIA, minutos: 15 });
    // Sin aprobar: no se paga, pero se ve.
    const sin = correr("09:15", "18:30", true, false);
    expect(sin.extra$).toBe(0);
    expect(sin.linea.extraNoAprobada).toMatchObject({ minutos: 15 });
  });

  it("9:15 → 18:05: repone 5, se descuentan 10 minutos = $0,48 (la tolerancia ya decidió al entrar)", () => {
    const r = correr("09:15", "18:05", true);
    expect(r.dia.tardeMin).toBe(10);
    expect(r.tardanzaMin).toBe(10);
    expect(r.tardanza$).toBeCloseTo(0.48, 2);
    expect(r.extra$).toBe(0);
  });

  it("9:15 → 18:00: se descuentan los 15, como hoy ($0,72)", () => {
    const r = correr("09:15", "18:00", true);
    expect(r.dia.tardeMin).toBe(15);
    expect(r.tardanza$).toBeCloseTo(0.72, 2);
  });

  it("la tolerancia no cambia: 9:08 → 18:30 no tiene tardanza y cobra los 30 de extra completos", () => {
    const r = correr("09:08", "18:30", true);
    expect(r.dia.tardeMin).toBe(0);
    expect(r.dia.extraMin).toBe(30);
  });

  it("sin límite: 10:30 → 19:45 repone los 90 y sobran 15", () => {
    const r = correr("10:30", "19:45", true);
    expect(r.dia.tardeMin).toBe(0);
    expect(r.dia.extraMin).toBe(15);
    expect(r.tardanza$).toBe(0);
  });
});

describe("🔴 la gracia se mide sobre la tardanza ORIGINAL (decisión 9-oct-2026, la tabla del coordinador)", () => {
  // [entra, sale, se descuenta (min), extra (min)]
  const TABLA: [string, string, number, number][] = [
    ["09:15", "18:00", 15, 0],
    ["09:15", "18:05", 10, 0],
    ["09:15", "18:10", 5, 0],
    ["09:15", "18:15", 0, 0],
    ["09:15", "18:30", 0, 15],
    ["09:08", "18:00", 0, 0],
  ];
  for (const [entra, sale, tarde, extra] of TABLA) {
    it(`${entra} → ${sale}: se descuentan ${tarde} min, extra ${extra} min`, () => {
      const r = correr(entra, sale, true);
      expect(r.dia.tardeMin).toBe(tarde);
      expect(r.tardanzaMin).toBe(tarde);
      expect(r.tardanza$).toBeCloseTo(tarde * 0.048, 2);
      expect(r.dia.extraMin).toBe(extra);
    });
  }
});

describe("🔴 con la casilla APAGADA, todo como hoy", () => {
  it("9:15 → 18:15: 15 de tardanza y 15 de extra, separadas", () => {
    const r = correr("09:15", "18:15", false);
    expect(r.dia.tardeMin).toBe(15);
    expect(r.dia.extraMin).toBe(15);
    expect(r.tardanza$).toBeCloseTo(0.72, 2);
    expect(r.linea.dinero!.extraNocturno).toBeCloseTo(1.08, 2);
  });

  it("9:15 → 18:05: 15 de tardanza, 0 de extra (5 no pasa la puerta)", () => {
    const r = correr("09:15", "18:05", false);
    expect(r.dia.tardeMin).toBe(15);
    expect(r.dia.extraMin).toBe(0);
  });

  it("la casilla de OTRO no mueve a nadie", () => {
    const [p] = armarReporte({
      marcaciones: ["09:15", "13:00", "14:00", "18:15"].map(marca),
      horarios: [HORARIO], justificaciones: [], feriados: new Map(), desde: DIA, hasta: DIA, reglas: R,
      reponeTardanza: new Set(["otro"]),
    });
    expect(p.dias[0]).toMatchObject({ tardeMin: 15, extraMin: 15 });
  });
});

describe("la regla pura y el dato", () => {
  it("compensarTardanza", () => {
    expect(compensarTardanza(false, 15, 900)).toEqual({ tardeMin: 15, brutoSeg: 900 });
    expect(compensarTardanza(true, 15, 300)).toEqual({ tardeMin: 10, brutoSeg: 0 });
    expect(compensarTardanza(true, 15, 1800)).toEqual({ tardeMin: 0, brutoSeg: 900 });
    expect(compensarTardanza(true, 0, 1800)).toEqual({ tardeMin: 0, brutoSeg: 1800 });
  });

  it("solo un `true` explícito la prende; ausente = no", () => {
    expect(reponeTardanza(true)).toBe(true);
    expect(reponeTardanza(null)).toBe(false);
    expect(reponeTardanza(undefined)).toBe(false);
    expect(validarReponeTardanza({})).toEqual({ ok: true, valor: false });
    expect(validarReponeTardanza({ reponeTardanza: true })).toEqual({ ok: true, valor: true });
    expect(validarReponeTardanza({ reponeTardanza: "x" }).ok).toBe(false);
  });

  it("la migración es aditiva y nace APAGADA", () => {
    const sql = readFileSync(join(RAIZ, "supabase/migrations/20270110120000_asistencia_repone_tardanza.sql"), "utf8")
      .replace(/--.*$/gm, "");
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS repone_tardanza boolean NOT NULL DEFAULT false/);
    expect(sql).not.toMatch(/\b(UPDATE|DELETE|DROP|TRUNCATE|INSERT)\b/i);
  });

  it("la planilla y el reporte le pasan la casilla al motor", () => {
    for (const ruta of ["src/app/api/asistencia/planilla/route.ts", "src/app/api/asistencia/reporte/route.ts"]) {
      const src = readFileSync(join(RAIZ, ruta), "utf8");
      expect(src).toContain("leerReponeTardanza()");
      expect(src).toContain("reponeTardanza: compensan");
    }
  });
});
