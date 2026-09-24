// ─────────────────────────────────────────────────────────────────────────────
// LA GRACIA DEL ALMUERZO (24-sep-2026) — el candado
//
// Daniel, textual: «Almuerzo de 60 que dura 65 no descuenta nada; si dura 66,
// se descuentan los 6, igual que la tardanza se cuenta desde la hora y no
// desde el minuto 11. En Multifashion 60 más 5, en las otras 30 más 5.» Y sobre
// si es una sola regla para las cuatro empresas: «sí».
//
// 🔴 LO QUE SE PRUEBA, Y LAS MUTACIONES QUE CAZA:
//   · 65 → 0 y 66 → 6 (con 60), 35 → 0 y 36 → 6 (con 30). Si alguien cambia el
//     `>` por `>=`, 65 daría 5 y esto cae.
//   · El DEFAULT es 5. Si alguien lo baja a 0, «63 con REGLAS_DEFAULT → 0» cae.
//   · Con el interruptor apagado el cálculo es el de antes, byte a byte.
//   · Sin la columna en la base, la gracia es 0: el sistema de hoy.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  GRACIA_ALMUERZO,
  VALOR_SIN_COLUMNA,
  excesoAlmuerzoBrutoMin,
  graciaAlmuerzoEfectiva,
  sinColumnasNuevas,
  esColumnaReglaNuevaFaltante,
} from "@/lib/asistencia/reglas-nuevas";
import {
  REGLAS_DEFAULT, reglasDesdeFila, reglasHaciaFila, validarReglas,
  type ReglasAsistencia,
} from "@/lib/asistencia/config";
import { armarReporte, type Marcacion } from "@/lib/asistencia/reporte";

const RAIZ = process.cwd();
const CODIGO = "304";
const DIA = "2026-09-21"; // lunes

const marca = (hhmm: string): Marcacion => ({
  empleado_codigo: CODIGO, empleado_nombre: null, ocurrio_en: `${DIA}T${hhmm}:00-05:00`,
});

/** Un día con almuerzo de `almuerzoMin` que DURÓ `duraMin` minutos. */
function diaConAlmuerzo(almuerzoMin: number, duraMin: number, reglas?: Partial<ReglasAsistencia>) {
  const salida = 12 * 60 + duraMin;
  const p2 = (n: number) => String(n).padStart(2, "0");
  const vuelta = `${p2(Math.floor(salida / 60))}:${p2(salida % 60)}`;
  const [p] = armarReporte({
    marcaciones: [marca("08:00"), marca("12:00"), marca(vuelta), marca("17:00")],
    horarios: [{ empleado_codigo: CODIGO, entrada: "08:00", salida: "17:00", almuerzo_minutos: almuerzoMin }],
    justificaciones: [], feriados: new Map(), desde: DIA, hasta: DIA,
    reglas: reglas ?? REGLAS_DEFAULT,
  });
  return p.dias[0];
}

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 la regla, pura: una PUERTA, no un descuento", () => {
  it("60 que dura 65 → 0; 66 → 6 enteros (no 1)", () => {
    expect(excesoAlmuerzoBrutoMin(65 * 60, 60 * 60, 5)).toBe(0);
    expect(excesoAlmuerzoBrutoMin(66 * 60, 60 * 60, 5)).toBe(6);
  });

  it("30 que dura 35 → 0; 36 → 6", () => {
    expect(excesoAlmuerzoBrutoMin(35 * 60, 30 * 60, 5)).toBe(0);
    expect(excesoAlmuerzoBrutoMin(36 * 60, 30 * 60, 5)).toBe(6);
  });

  it("⛔ el borde es `>`: 65:00 en punto sigue siendo 0, un segundo más ya cuenta entero", () => {
    expect(excesoAlmuerzoBrutoMin(65 * 60, 60 * 60, 5)).toBe(0);
    expect(excesoAlmuerzoBrutoMin(65 * 60 + 1, 60 * 60, 5)).toBeCloseTo(5 + 1 / 60, 10);
  });

  it("con gracia 0 es `max(0, tomado − programado)`: el cálculo de antes", () => {
    expect(excesoAlmuerzoBrutoMin(65 * 60, 60 * 60, 0)).toBe(5);
    expect(excesoAlmuerzoBrutoMin(60 * 60, 60 * 60, 0)).toBe(0);
    expect(excesoAlmuerzoBrutoMin(48 * 60, 60 * 60, 0)).toBe(0);
  });

  it("el DEFAULT es 5 y el interruptor está prendido", () => {
    expect(REGLAS_DEFAULT.graciaAlmuerzoMin).toBe(5);
    expect(GRACIA_ALMUERZO).toBe(true);
  });

  it("apagado → 0 mire lo que mire la base; un valor raro cae al respaldo, nunca a NaN", () => {
    expect(graciaAlmuerzoEfectiva(5, 5, false)).toBe(0);
    expect(graciaAlmuerzoEfectiva(7, 5, true)).toBe(7);
    expect(graciaAlmuerzoEfectiva(undefined, 5, true)).toBe(5);
    expect(graciaAlmuerzoEfectiva(Number.NaN, 5, true)).toBe(5);
    expect(graciaAlmuerzoEfectiva(-1, 5, true)).toBe(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 en el motor, con los almuerzos reales: 30 y 60", () => {
  it("Multifashion (60): dura 65 → 0 · dura 66 → 6", () => {
    expect(diaConAlmuerzo(60, 65).excesoAlmuerzoMin).toBe(0);
    expect(diaConAlmuerzo(60, 66).excesoAlmuerzoMin).toBe(6);
  });

  it("las otras tres (30): dura 35 → 0 · dura 36 → 6", () => {
    expect(diaConAlmuerzo(30, 35).excesoAlmuerzoMin).toBe(0);
    expect(diaConAlmuerzo(30, 36).excesoAlmuerzoMin).toBe(6);
  });

  it("⛔ caza «5 → 0»: con REGLAS_DEFAULT, 63 de 60 no descuenta nada", () => {
    expect(diaConAlmuerzo(60, 63).excesoAlmuerzoMin).toBe(0);
  });

  it("con gracia 0 por reglas, 65 de 60 descuenta 5: el número de siempre", () => {
    expect(diaConAlmuerzo(60, 65, { ...REGLAS_DEFAULT, graciaAlmuerzoMin: 0 }).excesoAlmuerzoMin).toBe(5);
  });

  it("es UNA regla para las cuatro: la misma gracia con 30 y con 60", () => {
    const con30 = diaConAlmuerzo(30, 34).excesoAlmuerzoMin;
    const con60 = diaConAlmuerzo(60, 64).excesoAlmuerzoMin;
    expect(con30).toBe(0);
    expect(con60).toBe(0);
  });

  it("nada más del día se mueve: tardanza, salida y extra iguales con y sin gracia", () => {
    const con = diaConAlmuerzo(60, 66);
    const sin = diaConAlmuerzo(60, 66, { ...REGLAS_DEFAULT, graciaAlmuerzoMin: 0 });
    for (const k of ["tardeMin", "salidaTempranaMin", "extraMin", "trabajadoMin", "revisar"] as const) {
      expect(con[k]).toEqual(sin[k]);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 falla ABIERTA: sin la columna, el sistema de hoy", () => {
  it("una fila que existe y NO trae la columna vale 0, no 5", () => {
    const r = reglasDesdeFila({ tolerancia_tardanza_min: 10 });
    expect(r.graciaAlmuerzoMin).toBe(VALOR_SIN_COLUMNA.graciaAlmuerzoMin);
    expect(r.graciaAlmuerzoMin).toBe(0);
  });

  it("con la columna, vale lo que dice la base", () => {
    expect(reglasDesdeFila({ gracia_almuerzo_min: 5 }).graciaAlmuerzoMin).toBe(5);
    expect(reglasDesdeFila({ gracia_almuerzo_min: 0 }).graciaAlmuerzoMin).toBe(0);
  });

  it("ida y vuelta con la base la lleva; y se puede quitar para reintentar sin ella", () => {
    const fila = reglasHaciaFila(REGLAS_DEFAULT);
    expect(fila.gracia_almuerzo_min).toBe(5);
    expect(reglasDesdeFila(fila)).toEqual(REGLAS_DEFAULT);
    const sin = sinColumnasNuevas(fila);
    expect("gracia_almuerzo_min" in sin).toBe(false);
    expect("aviso_entrada_temprana_min" in sin).toBe(false);
    expect(sin.tolerancia_tardanza_min).toBe(10);
  });

  it("el error que NOMBRA la columna se reconoce; cualquier otro no", () => {
    expect(esColumnaReglaNuevaFaltante({ code: "PGRST204", message: "Could not find the 'gracia_almuerzo_min' column of 'asistencia_reglas' in the schema cache" })).toBe(true);
    expect(esColumnaReglaNuevaFaltante({ code: "42703", message: "column asistencia_reglas.aviso_entrada_temprana_min does not exist" })).toBe(true);
    expect(esColumnaReglaNuevaFaltante({ code: "42703", message: "column asistencia_reglas.otra does not exist" })).toBe(false);
    expect(esColumnaReglaNuevaFaltante({ code: "PGRST301", message: "timeout gracia_almuerzo_min" })).toBe(false);
  });

  it("un cuerpo viejo, sin el campo, se guarda igual (y con el DEFAULT); uno malo se rechaza", () => {
    const cuerpo: Record<string, unknown> = {
      toleranciaTardanzaMin: "10", extraMinimoMin: "10", recargoExtraDiurno: "1.25",
      recargoExtraNocturno: "1.50", horaCorteNocturno: "18:00", recargoDomingoFeriado: "1.50",
      divisor40: "173.33", divisor48: "208", seguroSocialPct: "9.75", seguroEducativoPct: "1.25",
      excedenteHorasDia: "3", recargoExcedenteNocturnaMixta: "2.625",
    };
    const viejo = validarReglas(cuerpo);
    expect(viejo.ok).toBe(true);
    if (viejo.ok) expect(viejo.valor.graciaAlmuerzoMin).toBe(5);
    const nuevo = validarReglas({ ...cuerpo, graciaAlmuerzoMin: "7" });
    expect(nuevo.ok).toBe(true);
    if (nuevo.ok) expect(nuevo.valor.graciaAlmuerzoMin).toBe(7);
    expect(validarReglas({ ...cuerpo, graciaAlmuerzoMin: "-1" }).ok).toBe(false);
    expect(validarReglas({ ...cuerpo, graciaAlmuerzoMin: "61" }).ok).toBe(false);
    expect(validarReglas({ ...cuerpo, graciaAlmuerzoMin: "abc" }).ok).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("la migración y la pantalla", () => {
  const MIGRACION = "supabase/migrations/20261219120000_asistencia_gracia_almuerzo_entrada_autorizada.sql";

  it("la migración es aditiva: ADD COLUMN IF NOT EXISTS con DEFAULT 5 y 30, y nunca borra", () => {
    const sql = fs.readFileSync(path.join(RAIZ, MIGRACION), "utf8");
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS gracia_almuerzo_min smallint NOT NULL DEFAULT 5/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS aviso_entrada_temprana_min smallint NOT NULL DEFAULT 30/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS asistencia_entradas_autorizadas/);
    const sinComentarios = sql.replace(/--[^\n]*/g, "");
    expect(sinComentarios).not.toMatch(/\b(DROP|TRUNCATE|DELETE|UPDATE)\b/i);
    expect(sinComentarios).not.toMatch(/planilla_guardada/);
  });

  it("Configuración › Reglas del cálculo ofrece los dos campos al lado de la tolerancia", () => {
    const tsx = fs.readFileSync(path.join(RAIZ, "src/app/asistencia/ConfiguracionTab.tsx"), "utf8");
    const iTol = tsx.indexOf('label="Tolerancia de tardanza"');
    // `lastIndexOf`: el primer uso es el import de arriba; el que importa es el <Campo>.
    const iGracia = tsx.lastIndexOf("ROTULO_GRACIA_ALMUERZO");
    const iAviso = tsx.lastIndexOf("ROTULO_AVISO_ENTRADA_TEMPRANA");
    expect(iTol).toBeGreaterThan(0);
    expect(iGracia).toBeGreaterThan(iTol);
    expect(iAviso).toBeGreaterThan(iTol);
    expect(tsx).toContain('set("graciaAlmuerzoMin", v)');
    expect(tsx).toContain('set("avisoEntradaTempranaMin", v)');
  });

  it("el papel dice la gracia con la que se calculó, y no la inventa sin dato", () => {
    const src = fs.readFileSync(path.join(RAIZ, "src/lib/asistencia/exportar.ts"), "utf8");
    expect(src).toContain("graciaAlmuerzoMin: n(r?.graciaAlmuerzoMin, 0)");
    expect(src).toContain("minutos de gracia");
  });
});
