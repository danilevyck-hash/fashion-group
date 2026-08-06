// ─────────────────────────────────────────────────────────────────────────────
// Las reglas del reporte de asistencia. Horas FIJAS, nunca `new Date()`.
//
// Los casos salen de los 3 archivos reales del 13 al 27 de julio de 2026.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  armarReporte, salidaSugerida, diaPanama, minutosDelDia,
  TOLERANCIA_MIN, ALMUERZO_DEFAULT_MIN, EXTRA_MINIMO_MIN,
  type Marcacion, type HorarioPersona,
} from "@/lib/asistencia/reporte";

/** "2026-07-13 08:16" en Panamá → el instante ISO que guarda la base. */
const marca = (fecha: string, hhmm: string, cod = "6", nom = "KEVIN LUBO"): Marcacion => ({
  empleado_codigo: cod,
  empleado_nombre: nom,
  ocurrio_en: new Date(`${fecha}T${hhmm}:00-05:00`).toISOString(),
});

const horario = (over: Partial<HorarioPersona> = {}): HorarioPersona => ({
  empleado_codigo: "6", entrada: "08:00", salida: "17:00", almuerzo_minutos: 30, ...over,
});

const correr = (marcaciones: Marcacion[], extra: Partial<Parameters<typeof armarReporte>[0]> = {}) =>
  armarReporte({
    marcaciones, horarios: [horario()], justificaciones: [],
    feriados: new Map(), desde: "2026-07-13", hasta: "2026-07-13", ...extra,
  });

describe("🔴 Regla 1 — tolerancia CONFIGURABLE (hoy 10 min), y luego se cuenta DESDE las 8:00", () => {
  // 🩸 Arrancó en 5 y la contable la subió a 10 (6-ago-2026). El número ya no
  // vive acá: sale de `asistencia_reglas`, con este valor por defecto.
  it("por defecto son 10 minutos", () => expect(TOLERANCIA_MIN).toBe(10));

  it("8:09 no es tarde", () => {
    expect(correr([marca("2026-07-13", "08:09"), marca("2026-07-13", "17:00")])[0].dias[0].tardeMin).toBe(0);
  });

  it("8:10 justo no es tarde (la tolerancia incluye el minuto 10)", () => {
    expect(correr([marca("2026-07-13", "08:10"), marca("2026-07-13", "17:00")])[0].dias[0].tardeMin).toBe(0);
  });

  it("⚠️ 8:11 son ONCE minutos, no uno", () => {
    // Si contara desde las 8:10 daría 1, y le enseñaría a todos que la entrada
    // es 8:10. Ese es el punto de la regla.
    expect(correr([marca("2026-07-13", "08:11"), marca("2026-07-13", "17:00")])[0].dias[0].tardeMin).toBe(11);
  });

  it("el caso real de Kevin Lubo: 08:16 → 16 minutos", () => {
    // iVMS reporta "10 min" porque redondea a bloques de 10. El nuestro es exacto.
    expect(correr([marca("2026-07-13", "08:16"), marca("2026-07-13", "16:50")])[0].dias[0].tardeMin).toBe(16);
  });
});

describe("🔴 Regla 2 — almuerzo: se mide con las 4 marcas", () => {
  it("30 minutos por defecto", () => expect(ALMUERZO_DEFAULT_MIN).toBe(30));

  it("Kevin el 24-jul: 12:22 a 13:04 son 42 min → 12 de exceso", () => {
    const r = correr([
      marca("2026-07-13", "08:00"), marca("2026-07-13", "12:22"),
      marca("2026-07-13", "13:04"), marca("2026-07-13", "17:00"),
    ]);
    expect(r[0].dias[0].excesoAlmuerzoMin).toBe(12);
  });

  it("con 2 marcas NO se inventa exceso: no hay almuerzo que medir", () => {
    const r = correr([marca("2026-07-13", "08:00"), marca("2026-07-13", "17:00")]);
    expect(r[0].dias[0].excesoAlmuerzoMin).toBe(0);
  });

  it("60 minutos configurados no marcan exceso al tomar 60", () => {
    const r = correr(
      [marca("2026-07-13","08:00"), marca("2026-07-13","12:00"),
       marca("2026-07-13","13:00"), marca("2026-07-13","17:00")],
      { horarios: [horario({ almuerzo_minutos: 60 })] },
    );
    expect(r[0].dias[0].excesoAlmuerzoMin).toBe(0);
  });
});

describe("🔴 Regla 3 — extras: mínimo 15 min y NETAS del atraso del día", () => {
  it("el mínimo es 15", () => expect(EXTRA_MINIMO_MIN).toBe(15));

  it("quedarse 10 minutos no es hora extra", () => {
    expect(correr([marca("2026-07-13","08:00"), marca("2026-07-13","17:10")])[0].dias[0].extraMin).toBe(0);
  });

  it("quedarse 40 minutos sí", () => {
    expect(correr([marca("2026-07-13","08:00"), marca("2026-07-13","17:40")])[0].dias[0].extraMin).toBe(40);
  });

  it("⚠️ el que llegó tarde y se fue tarde RECUPERÓ, no hizo extra", () => {
    // Kevin el 27-jul: entró 08:12 (12 tarde) y salió 19:12 (132 brutos).
    // 132 - 12 = 120. Sin esta resta se le pagaría el atraso.
    const r = correr([marca("2026-07-13","08:12"), marca("2026-07-13","19:12")]);
    expect(r[0].dias[0].tardeMin).toBe(12);
    expect(r[0].dias[0].extraMin).toBe(120);
  });

  it("si el atraso se come toda la extra, queda en 0 (nunca negativa)", () => {
    const r = correr([marca("2026-07-13","09:00"), marca("2026-07-13","17:30")]);
    expect(r[0].dias[0].extraMin).toBe(0);
  });

  it("la salida es POR PERSONA: el de 4:30 que sale 17:00 hizo 30", () => {
    const r = correr(
      [marca("2026-07-13","08:00"), marca("2026-07-13","17:00")],
      { horarios: [horario({ salida: "16:30" })] },
    );
    expect(r[0].dias[0].extraMin).toBe(30);
  });
});

describe("🔴 Regla 5 — el día mal marcado SUMA, y además se marca", () => {
  // 🩸 Decisión de Daniel, CONTRARIA a lo que yo recomendé: *"quiero que sume lo
  // que marca la persona pero si se detecta anomalía que también marque para
  // revisar… es responsabilidad de ellos"*.
  const angela21 = [
    marca("2026-07-13", "12:41", "3", "ANGELA GARCIA"),
    marca("2026-07-13", "13:07", "3", "ANGELA GARCIA"),
    marca("2026-07-13", "17:04", "3", "ANGELA GARCIA"),
  ];

  it("el caso real: no marcó al entrar → 281 minutos de atraso, y SUMAN", () => {
    const r = correr(angela21, { horarios: [horario({ empleado_codigo: "3" })] });
    expect(r[0].dias[0].tardeMin).toBe(281);
    expect(r[0].resumen.minutosTarde).toBe(281);
  });

  it("y el día queda marcado para revisar", () => {
    expect(correr(angela21, { horarios: [horario({ empleado_codigo: "3" })] })[0].dias[0].revisar).toBe(true);
  });

  it("⚠️ el resumen dice CUÁNTOS de esos minutos vienen de días mal marcados", () => {
    // Para que nadie descuente 281 minutos sin haber mirado de dónde salen.
    const r = correr(angela21, { horarios: [horario({ empleado_codigo: "3" })] });
    expect(r[0].resumen.minutosTardeDeDiasARevisar).toBe(281);
    expect(r[0].resumen.diasARevisar).toBe(1);
  });

  it("un día con las 4 marcas NO se marca para revisar", () => {
    const r = correr([
      marca("2026-07-13","08:00"), marca("2026-07-13","12:30"),
      marca("2026-07-13","13:00"), marca("2026-07-13","17:00"),
    ]);
    expect(r[0].dias[0].revisar).toBe(false);
  });
});

describe("🔴 Regla 4 — ausencias, feriados y justificaciones", () => {
  const rango = { desde: "2026-07-13", hasta: "2026-07-17" };

  it("un día hábil sin marcas es ausencia", () => {
    const r = armarReporte({
      marcaciones: [marca("2026-07-13","08:00"), marca("2026-07-13","17:00")],
      horarios: [horario()], justificaciones: [], feriados: new Map(), ...rango,
    });
    expect(r[0].resumen.ausenciasSinJustificar).toBe(4); // 14, 15, 16 y 17
  });

  it("un feriado NO es ausencia de nadie", () => {
    const r = armarReporte({
      marcaciones: [marca("2026-07-13","08:00"), marca("2026-07-13","17:00")],
      horarios: [horario()], justificaciones: [],
      feriados: new Map([["2026-07-14", "Feriado de prueba"]]), ...rango,
    });
    expect(r[0].resumen.ausenciasSinJustificar).toBe(3);
    expect(r[0].dias.find((d) => d.fecha === "2026-07-14")?.feriado).toBe("Feriado de prueba");
  });

  it("una justificación por RANGO cubre todos sus días", () => {
    const r = armarReporte({
      marcaciones: [marca("2026-07-13","08:00"), marca("2026-07-13","17:00")],
      horarios: [horario()],
      justificaciones: [{ empleado_codigo: "6", desde: "2026-07-14", hasta: "2026-07-16", motivo: "Vacaciones" }],
      feriados: new Map(), ...rango,
    });
    expect(r[0].resumen.ausenciasJustificadas).toBe(3);
    expect(r[0].resumen.ausenciasSinJustificar).toBe(1); // solo el 17
  });

  it("el sábado y el domingo no cuentan como ausencia", () => {
    // 18 y 19 de julio 2026 son sábado y domingo.
    const r = armarReporte({
      marcaciones: [marca("2026-07-17","08:00"), marca("2026-07-17","17:00")],
      horarios: [horario()], justificaciones: [], feriados: new Map(),
      desde: "2026-07-17", hasta: "2026-07-19",
    });
    expect(r[0].dias).toHaveLength(1);
    expect(r[0].resumen.ausenciasSinJustificar).toBe(0);
  });
});

describe("el corte de día es de Panamá", () => {
  it("las 20:00 de Panamá siguen siendo el mismo día", () => {
    expect(diaPanama("2026-07-14T01:00:00.000Z")).toBe("2026-07-13");
  });

  it("los segundos se redondean al minuto, no se discute por segundos", () => {
    expect(minutosDelDia("2026-07-13T13:05:31.000Z")).toBe(8 * 60 + 6);
    expect(minutosDelDia("2026-07-13T13:05:29.000Z")).toBe(8 * 60 + 5);
  });
});

describe("⚠️ la salida sugerida usa la MEDIANA, no el promedio", () => {
  it("un día que se quedó hasta las 21:00 no mueve la sugerencia", () => {
    const salidas = [16 * 60 + 35, 16 * 60 + 40, 16 * 60 + 38, 21 * 60];
    expect(salidaSugerida(salidas)).toBe("16:30");
  });

  it("Ángela sale 17:04 casi siempre → 17:00, no el 16:30 que dice iVMS", () => {
    expect(salidaSugerida([17 * 60 + 4, 17 * 60, 17 * 60 + 6, 16 * 60 + 39])).toBe("17:00");
  });
});

describe("el total de planilla junta las tres pérdidas", () => {
  it("tarde + exceso de almuerzo + salida temprana", () => {
    const r = correr(
      [marca("2026-07-13","08:20"), marca("2026-07-13","12:00"),
       marca("2026-07-13","12:50"), marca("2026-07-13","16:40")],
      { horarios: [horario({ salida: "17:00" })] },
    );
    const d = r[0].dias[0];
    expect(d.tardeMin).toBe(20);
    expect(d.excesoAlmuerzoMin).toBe(20);
    expect(d.salidaTempranaMin).toBe(20);
    expect(r[0].resumen.tiempoNoTrabajadoMin).toBe(60);
  });
});

describe("🔴 con UNA sola marca no se inventa la salida", () => {
  // 🩸 Lo destapó el export histórico de enero-julio: 995 días, TODOS con solo
  // la hora de entrada (la columna Salida venía en "-"). El motor tomaba esa
  // misma marca como entrada Y como salida, así que Roxana entrando 07:04
  // aparecía saliendo 9 horas temprano.
  //
  // NO contradice la regla 5: contar el atraso de una entrada real es contar lo
  // que la persona marcó. Inventarle una salida a partir de esa MISMA marca es
  // usar un dato dos veces para dos cosas distintas.
  const unaSola = correr([marca("2026-07-13", "07:04")]);

  it("la salida queda vacía, no repetida", () => {
    expect(unaSola[0].dias[0].entrada).toBe("07:04");
    expect(unaSola[0].dias[0].salida).toBeNull();
  });

  it("NO se le cuenta salida temprana", () => {
    expect(unaSola[0].dias[0].salidaTempranaMin).toBe(0);
  });

  it("ni horas extra ni tiempo trabajado", () => {
    expect(unaSola[0].dias[0].extraMin).toBe(0);
    expect(unaSola[0].dias[0].trabajadoMin).toBe(0);
  });

  it("pero el ATRASO sí cuenta: esa marca es real", () => {
    const tarde = correr([marca("2026-07-13", "08:20")]);
    expect(tarde[0].dias[0].tardeMin).toBe(20);
  });

  it("y el día queda marcado para revisar", () => {
    expect(unaSola[0].dias[0].revisar).toBe(true);
  });

  it("con DOS marcas la salida sí se calcula", () => {
    const dos = correr([marca("2026-07-13", "08:00"), marca("2026-07-13", "16:00")]);
    expect(dos[0].dias[0].salida).toBe("16:00");
    expect(dos[0].dias[0].salidaTempranaMin).toBe(60);
  });
});
