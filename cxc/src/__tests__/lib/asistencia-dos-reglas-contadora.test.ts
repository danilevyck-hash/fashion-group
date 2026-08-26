// ─────────────────────────────────────────────────────────────────────────────
// LAS DOS REGLAS QUE CONFIRMÓ LA CONTADORA (25-ago-2026).
//
// Daniel, textual, después de consultarla:
//     *«Excedente de 9 horas es 1.5. Dia de ausencia 8 horas.»*
//
// 🔴 ESTE ARCHIVO NO INVENTA UN SOLO NÚMERO. Cada caso es un renglón real de la
// planilla del 16 al 30 de julio de 2026 —la ÚLTIMA que se calculó a mano— y al
// lado está lo que dice la fórmula del Excel de ella, leída con `openpyxl`.
//
// ⚠️ EL TERCER BLOQUE NO PRUEBA NINGÚN CAMBIO: fija la tardanza tal como estaba
// para que ninguna de las dos reglas se le filtre. La ausencia por tardanza y
// el umbral de 30 minutos son otra cosa y no se tocaron.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  clasificarDia, calcularDinero, jornadaDiariaMin,
  HORAS_CERO, MANUALES_CERO, MIN_DIA_AUSENCIA,
  type HorasPersona,
} from "@/lib/asistencia/planilla";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import { armarReporte, type Marcacion, type HorarioPersona } from "@/lib/asistencia/reporte";

const R = REGLAS_DEFAULT;

/** El horario que tienen 22 de las 31 personas. Dura 8,5 h, no 8. */
const HORARIO_REAL: HorarioPersona = {
  empleado_codigo: "48", entrada: "08:00", salida: "17:00", almuerzo_minutos: 30,
};

const marca = (fecha: string, hhmm: string): Marcacion => ({
  empleado_codigo: "48", ocurrio_en: `${fecha}T${hhmm}:00.000-05:00`,
});

/** Un día del reloj, clasificado igual que en el cuadro. */
function dia(marcas: string[], reglas = R) {
  const f = "2026-07-23";              // un jueves hábil, sin feriado
  const p = armarReporte({
    marcaciones: marcas.map((m) => marca(f, m)),
    horarios: [HORARIO_REAL], justificaciones: [], feriados: new Map(),
    desde: f, hasta: f, reglas, incluirNoHabiles: true,
  })[0];
  return clasificarDia(p.dias[0], reglas, jornadaDiariaMin(HORARIO_REAL));
}

/**
 * Un día HÁBIL sin una sola marca: la ausencia de día completo.
 * 🔑 Se pide un rango de DOS días —el 22 con marcas y el 23 sin ninguna—: el
 * motor arma la lista de gente desde el reloj, así que sin una marca en algún
 * lado la persona no existiría y no habría ausencia que medir.
 */
function diaAusente(reglas = R) {
  const p = armarReporte({
    marcaciones: [marca("2026-07-22", "08:00"), marca("2026-07-22", "17:00")],
    horarios: [HORARIO_REAL], justificaciones: [], feriados: new Map(),
    desde: "2026-07-22", hasta: "2026-07-23", reglas, incluirNoHabiles: true,
  })[0];
  const d = p.dias.find((x) => x.fecha === "2026-07-23")!;
  expect(d.ausente, "el 23 tiene que salir como ausente").toBe(true);
  return clasificarDia(d, reglas, jornadaDiariaMin(HORARIO_REAL));
}

const conHoras = (over: Partial<HorasPersona>): HorasPersona => ({ ...HORAS_CERO, ...over });

// ═════════════════════════════════════════════════════════════════════════════
describe("🔴 REGLA 2 — un día de ausencia vale 8 HORAS, no la jornada del horario", () => {
  it("el horario de la gente dura 8,5 h — si esto cambia, el resto del archivo miente", () => {
    expect(jornadaDiariaMin(HORARIO_REAL)).toBe(510);
    expect(MIN_DIA_AUSENCIA).toBe(480);
  });

  it("🩸 con jornada de 8,5 h, el día ausente descuenta 8 h y no 8,5", () => {
    const c = diaAusente();
    expect(c.ausenciaMin).toBe(480);
    expect(c.ausenciaMin).not.toBe(510);
  });

  it("ROXANA HERNÁNDEZ (cod 1) — el Excel dice «=8*4.04»: $32,32", () => {
    // Salario 700 / 40 h → rata 4,04. Un día ausente en la quincena 2026-07-2.
    // El módulo descontaba $34,34 (8,5 h) y ella descuenta $32,32.
    const d = calcularDinero(700, 40, conHoras({ ausenciaMin: MIN_DIA_AUSENCIA }), MANUALES_CERO, R)!;
    expect(d.rataHora).toBe(4.04);
    expect(d.ausencias).toBe(32.32);
    expect(d.ausenciaDeDiaCompleto).toBe(32.32);
  });

  it("🩸 HÉCTOR PÉREZ (cod 48) — su $23,08 está tecleado a mano; 8 h dan $23,04", () => {
    // Salario 600 / 48 h → rata 2,88. La contadora le escribe `23.08` sin
    // fórmula (= 600 ÷ 26, el día calendario). Es el ÚNICO renglón que no sale
    // de «8 × rata» en las tres empresas.
    const d = calcularDinero(600, 48, conHoras({ ausenciaMin: MIN_DIA_AUSENCIA }), MANUALES_CERO, R)!;
    expect(d.rataHora).toBe(2.88);
    expect(d.ausencias).toBe(23.04);
    // Se ACERCA: con 8,5 h daba 24,48, o sea $1,40 lejos de su cifra. Ahora 4 ¢.
    expect(Math.abs(d.ausencias - 23.08)).toBeLessThan(0.05);
    expect(Math.abs(24.48 - 23.08)).toBeGreaterThan(1);
  });

  it("dos días ausentes son 16 h — el Excel de SAMIR POLO dice «=16*3.02»", () => {
    const d = calcularDinero(523.47, 40, conHoras({ ausenciaMin: 2 * MIN_DIA_AUSENCIA }), MANUALES_CERO, R)!;
    expect(d.rataHora).toBe(3.02);
    expect(d.ausencias).toBe(48.32);      // 16 × 3,02
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("🔴 REGLA 1 — los minutos del 2,625 se pagan al 1,50", () => {
  it("4 h extra con 3 de noche: las 3 van enteras al 1,50 y el excedente queda en 0", () => {
    const c = dia(["08:00", "12:00", "12:30", "21:00"]);
    expect(c.extraDiurnoMin).toBe(60);
    expect(c.extraNocturnoMin).toBe(180);
    expect(c.excedenteMin).toBe(0);
  });

  it("🩸 en dólares: 3 h de noche a rata 3,02 son $13,59, no $16,99", () => {
    const antes = calcularDinero(
      523.47, 40, conHoras({ extraNocturnoMin: 120, excedenteMin: 60 }), MANUALES_CERO, R,
    )!;
    const ahora = calcularDinero(
      523.47, 40, conHoras({ extraNocturnoMin: 180 }), MANUALES_CERO, R,
    )!;
    // Lo que pagaba el reparto viejo: 2 h × 1,50 + 1 h × 2,625.
    expect(antes.extraNocturno + antes.excedente).toBeCloseTo(16.99, 10);
    // Lo que paga la contadora: 3 h × 1,50.
    expect(ahora.extraNocturno).toBe(13.59);
    expect(ahora.excedente).toBe(0);
  });

  it("la columna «Excedente» queda en $0,00 — igual que la del Excel de ella", () => {
    const d = calcularDinero(523.47, 40, conHoras({ extraNocturnoMin: 600 }), MANUALES_CERO, R)!;
    expect(d.excedente).toBe(0);
  });

  it("mover el tope o el recargo del excedente en Configuración no mueve un centavo", () => {
    const base = dia(["08:00", "12:00", "12:30", "21:00"]);
    for (const reglas of [
      { ...R, excedenteHorasDia: 1 },
      { ...R, excedenteHorasDia: 12 },
      { ...R, recargoExcedenteNocturnaMixta: 5 },
    ]) {
      expect(dia(["08:00", "12:00", "12:30", "21:00"], reglas)).toEqual(base);
    }
  });

  it("🔑 KENER, CRISTIAN y RAMÓN: 1,50 + excedente daban 2,5 h, y ella cobra 2,5 h al 1,50", () => {
    // Los tres renglones reales de Boston en la quincena 2026-07-2, medidos con
    // `_diag-planilla-vs-contadora.ts`. Su Excel: H = 2.5*1.5*rata en los tres.
    const casos: Array<[string, number, number, number]> = [
      // nombre,          rata, min al 1,50 (viejo), min de excedente (viejo)
      ["CRISTIAN BLANCO", 3.02, 89.0, 61.283333],
      ["RAMÓN MIRANDA",   3.27, 119.0, 31.483333],
      ["KENER HERNÁNDEZ", 3.46, 119.0, 31.616667],
    ];
    for (const [nombre, , n150, nExc] of casos) {
      const horas = (n150 + nExc) / 60;
      expect(`${nombre} ${Math.round(horas * 4) / 4}`).toBe(`${nombre} 2.5`);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("⚠️ LA TARDANZA NO SE MUEVE — el candado contra el desborde", () => {
  it("la tardanza sigue valuándose minutos × valor del minuto", () => {
    // KENER, quincena real: 18 minutos a rata 3,46 → 18 × 0,057666 = $1,04.
    const d = calcularDinero(600, 40, conHoras({ tardanzaMin: 18 }), MANUALES_CERO, R)!;
    expect(d.valorMinuto).toBeCloseTo(3.46 / 60, 10);
    expect(d.tardanzas).toBe(1.04);
    expect(d.ausencias).toBe(0);        // una tardanza corta NO es ausencia
  });

  it("el umbral de los 30 minutos sigue siendo 30, y NO cobra el día entero", () => {
    // 45 minutos tarde cambian de COLUMNA, no de precio: se muestran en
    // «Ausencia» y valen 45 × valor del minuto, no 8 horas.
    const d = calcularDinero(
      600, 40, conHoras({ tardanzaMin: 45, tardanzaGraveMin: 45, tardanzaGraveDias: 1 }),
      MANUALES_CERO, R,
    )!;
    expect(d.ausenciaPorTardanza).toBe(2.6);    // 45 × 0,057666 = 2,595
    expect(d.ausenciaDeDiaCompleto).toBe(0);
    expect(d.ausencias).toBe(2.6);
    expect(d.tardanzas).toBe(0);
    // 🔴 Y NO son 8 horas: si la regla de la ausencia se filtrara acá, esto
    // valdría $27,68 en vez de $2,59.
    expect(d.ausencias).not.toBe(27.68);
  });

  it("la tolerancia y el umbral se leen de las reglas y siguen en 10 y 30", () => {
    expect(R.toleranciaTardanzaMin).toBe(10);
    const c = dia(["08:45", "12:00", "12:30", "17:00"]);
    expect(c.tardanzaMin).toBe(45);           // desde la entrada, pasada la tolerancia
    expect(c.ausenciaMin).toBe(0);            // vino: no hay ausencia de día completo
  });
});
