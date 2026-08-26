// ─────────────────────────────────────────────────────────────────────────────
// LA MARCACIÓN SE MIDE AL SEGUNDO — el candado
//
// Daniel (13-ago-2026), textual: *"y la marcancion tiene que ser al segundo,
// porque redondeas minutos"*.
//
// 🩸 EL DATO SIEMPRE ESTUVO COMPLETO. Las marcaciones de producción traen los
// segundos (medido: 8 de 8 con segundos ≠ 00); lo que redondeaba era el CÁLCULO:
// `minutosDelDia` devolvía minutos enteros y empujaba los segundos al minuto más
// cercano. El argumento escrito al lado —"discutir por segundos es lo que la
// tolerancia evita"— confundía **medir** con **perdonar**.
//
// ── LAS DOS COSAS QUE ESTE ARCHIVO EXIGE ─────────────────────────────────────
//   1. Que se mida al segundo: hasta 30 s por marca, 4 marcas al día, en horas
//      extra que se multiplican por 1,25 o 1,50.
//   2. Que la TOLERANCIA siga siendo de MINUTOS y el REDONDEO DEL DINERO no se
//      haya tocado. Medir fino y perdonar en minutos es lo correcto; el
//      `centavos` con corrección de coma flotante es de plata, no de tiempo.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";

import {
  armarReporte,
  fmtMin,
  minutosDelDia,
  segundosDelDia,
  type Marcacion,
  type HorarioPersona,
} from "@/lib/asistencia/reporte";
import { centavos, clasificarDia, type DiaReporte } from "@/lib/asistencia/planilla";
import { REGLAS_DEFAULT } from "@/lib/asistencia/config";

/** Una marca del día 13-jul-2026 (lunes), en hora de Panamá. */
const marca = (hhmmss: string): Marcacion => ({
  empleado_codigo: "6",
  empleado_nombre: null,
  ocurrio_en: `2026-07-13T${hhmmss}-05:00`,
});

const horario: HorarioPersona = {
  empleado_codigo: "6", entrada: "08:00", salida: "17:00", almuerzo_minutos: 30,
};

const dia = (marcas: string[], h: HorarioPersona | null = horario) =>
  armarReporte({
    marcaciones: marcas.map(marca),
    horarios: h ? [h] : [],
    justificaciones: [],
    feriados: new Map(),
    desde: "2026-07-13",
    hasta: "2026-07-13",
    reglas: REGLAS_DEFAULT,
  })[0].dias[0];

// ─────────────────────────────────────────────────────────────────────────────
describe("el instante que marcó la persona, sin tocar", () => {
  it("`segundosDelDia` no redondea nada", () => {
    expect(segundosDelDia("2026-07-13T08:00:00-05:00")).toBe(8 * 3600);
    expect(segundosDelDia("2026-07-13T08:00:29-05:00")).toBe(8 * 3600 + 29);
    expect(segundosDelDia("2026-07-13T17:04:59-05:00")).toBe(17 * 3600 + 4 * 60 + 59);
  });

  it("⚠️ `minutosDelDia` sigue existiendo, pero SOLO para sugerir la hora de salida", () => {
    // Redondea a propósito: elegir entre 16:30 y 17:00 con la mediana de las
    // últimas marcas no cambia por 29 segundos. No toca plata.
    expect(minutosDelDia("2026-07-13T17:00:29-05:00")).toBe(17 * 60);
    expect(minutosDelDia("2026-07-13T17:00:31-05:00")).toBe(17 * 60 + 1);
  });

  it("🔴 las marcas se muestran CON segundos: es el dato del que sale todo", () => {
    // Si el papel dijera 08:00 y 17:04, nadie podría reproducir a mano las
    // horas que la planilla paga.
    const d = dia(["08:00:17", "12:00:03", "12:30:29", "17:04:59"]);
    expect(d.marcas).toEqual(["08:00:17", "12:00:03", "12:30:29", "17:04:59"]);
    expect(d.entrada).toBe("08:00:17");
    expect(d.salida).toBe("17:04:59");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 LO QUE SE PERDÍA, Y AHORA NO", () => {
  it("una salida 17:30:59 vale 30 min 59 s de extra, no 31 minutos redondos", () => {
    // Antes: 17:30:59 → se redondeaba a 17:31 → 31 minutos exactos de extra.
    // Ahora: 1.859 segundos = 30,9833… minutos. La empresa deja de pagar 1
    // segundo que no ocurrió, y —del otro lado— deja de perder los 29 s de una
    // marca 17:31:29 que antes se redondeaban hacia abajo.
    const d = dia(["08:00:00", "12:00:00", "12:30:00", "17:30:59"]);
    expect(d.extraMin).toBeCloseTo(1859 / 60, 10);
    expect(d.extraMin).not.toBe(31);
  });

  it("29 segundos ya no desaparecen hacia abajo", () => {
    const d = dia(["08:00:00", "12:00:00", "12:30:00", "17:20:29"]);
    expect(d.extraMin).toBeCloseTo(1229 / 60, 10); // 20 min 29 s
  });

  it("el almuerzo se mide al segundo", () => {
    // 12:00:00 → 12:30:29 son 30 min 29 s: 29 segundos de exceso sobre los 30.
    const d = dia(["08:00:00", "12:00:00", "12:30:29", "17:00:00"]);
    expect(d.excesoAlmuerzoMin).toBeCloseTo(29 / 60, 10);
  });

  it("el tiempo trabajado también", () => {
    const d = dia(["08:00:17", "12:00:00", "12:30:00", "17:04:59"]);
    // 08:00:17 → 17:04:59 menos 30 min de almuerzo tomado.
    const esperado = (17 * 3600 + 4 * 60 + 59 - (8 * 3600 + 17) - 30 * 60) / 60;
    expect(d.trabajadoMin).toBeCloseTo(esperado, 10);
  });

  it("la salida temprana no se disimula con el redondeo", () => {
    const d = dia(["08:00:00", "12:00:00", "12:30:00", "16:59:31"]);
    expect(d.salidaTempranaMin).toBeCloseTo(29 / 60, 10);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("⚠️ LA TOLERANCIA SIGUE SIENDO DE MINUTOS", () => {
  it("los 10 minutos de gracia no cambiaron: 8:10:00 no es tarde", () => {
    expect(dia(["08:10:00", "12:00:00", "12:30:00", "17:00:00"]).tardeMin).toBe(0);
    expect(dia(["08:09:59", "12:00:00", "12:30:00", "17:00:00"]).tardeMin).toBe(0);
  });

  it("pasada la gracia se cuenta DESDE LAS 8:00, y ahora al segundo", () => {
    // La regla de siempre —el atraso se cuenta desde la hora de entrada, no
    // desde el fin de la tolerancia— no se tocó; lo que cambió es la precisión.
    const d = dia(["08:10:01", "12:00:00", "12:30:00", "17:00:00"]);
    expect(d.tardeMin).toBeCloseTo(601 / 60, 10);

    const veinte = dia(["08:20:00", "12:00:00", "12:30:00", "17:00:00"]);
    expect(veinte.tardeMin).toBe(20); // entero, como siempre
  });

  it("el mínimo de hora extra se sigue midiendo contra 15 MINUTOS", () => {
    // Quedarse 14 min 59 s no es hora extra; 15 en punto sí. El umbral es el
    // mismo de siempre, comparado al segundo.
    expect(dia(["08:00:00", "12:00:00", "12:30:00", "17:14:59"]).extraMin).toBe(0);
    expect(dia(["08:00:00", "12:00:00", "12:30:00", "17:15:00"]).extraMin).toBe(15);
  });

  it("el atraso del mismo día se sigue descontando de la extra", () => {
    // Llegó 20 tarde y se fue 20 tarde: RECUPERÓ, no hizo extra.
    const d = dia(["08:20:00", "12:00:00", "12:30:00", "17:20:00"]);
    expect(d.extraMin).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 EL REDONDEO DEL DINERO NO SE TOCÓ", () => {
  it("`centavos` sigue corrigiendo la coma flotante", () => {
    // 🩸 261,735 es la mitad de 523,47 —el salario de SIETE personas de Boston—
    // y en binario se guarda como 261,7349999…: sin la corrección, el medio
    // centavo "hacia arriba" cae hacia abajo.
    expect(centavos(261.735)).toBe(261.74);
    expect(centavos(0.005)).toBe(0.01);
    expect(centavos(-261.735)).toBe(-261.74);
    expect(centavos(NaN)).toBe(0);
  });

  it("la frontera de las 18:00 usa la salida CON segundos", () => {
    // Una salida 18:00:30 con 90 minutos de extra: hasta las 18:00 va al 1,25 y
    // los 30 segundos que pasan, al 1,50. Antes la salida se redondeaba a 18:01
    // y esos segundos caían enteros del otro lado de la frontera.
    const d: DiaReporte = {
      // ⚠️ `marcas` NO puede ir vacío: un día sin marcas no clasifica nada.
      fecha: "2026-07-13",
      marcas: ["08:00:00", "12:00:00", "12:30:00", "18:00:30"],
      entrada: "08:00:00", salida: "18:00:30",
      tardeMin: 0, excesoAlmuerzoMin: 0, salidaTempranaMin: 0,
      extraMin: 90.5, trabajadoMin: 600, revisar: false, ausente: false,
      justificado: null, feriado: null, habil: true,
    };
    const c = clasificarDia(d, REGLAS_DEFAULT);
    expect(c.extraNocturnoMin).toBeCloseTo(0.5, 10);
    expect(c.extraDiurnoMin).toBeCloseTo(90, 10);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("cómo se MUESTRA un minuto con fracción", () => {
  it("los enteros se ven enteros, y la fracción se ve con 2 decimales", () => {
    // Una columna de minutos que redondea cada celda al entero deja de sumar el
    // total; con 2 decimales cierra y no miente.
    expect(fmtMin(30)).toBe("30");
    expect(fmtMin(0)).toBe("0");
    expect(fmtMin(299 / 60)).toBe("4.98");
    expect(fmtMin(29 / 60)).toBe("0.48");
    expect(fmtMin(NaN)).toBe("0");
  });
});
