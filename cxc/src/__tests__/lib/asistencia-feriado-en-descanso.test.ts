/* Candado de `valorFeriados` (19-nov-2026, Daniel: «debe ser automático»).
 * El feriado trabajado vale ×2,5 el día SIEMPRE: en día laborable el sueldo
 * trae el día y se suma ×1,5 (igual que antes); en su día de descanso se suma
 * ×2,5. El domingo trabajado que no es feriado sigue ×1,5. Motor real. */
import { describe, it, expect } from "vitest";

import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import { armarPlanilla, centavos, type FichaPlanilla } from "@/lib/asistencia/planilla";
import type { PersonaReporte, DiaReporte } from "@/lib/asistencia/reporte";

function dia(fecha: string, habil: boolean, feriado: string | null): DiaReporte {
  return {
    fecha, habil, feriado,
    marcas: ["08:00:00", "12:00:00", "12:30:00", "16:30:00"],
    marcasIds: ["a", "b", "c", "d"],
    entrada: "08:00:00", salida: "16:30:00",
    tardeMin: 0, excesoAlmuerzoMin: 0, salidaTempranaMin: 0,
    extraMin: 0, trabajadoMin: 480, revisar: false,
  } as unknown as DiaReporte;
}

function linea(d: DiaReporte) {
  const p = {
    codigo: "9", nombre: "P9", salida: "16:30", almuerzoMin: 30, dias: [d],
    resumen: { diasTrabajados: 1, ausenciasSinJustificar: 0 },
  } as unknown as PersonaReporte;
  const ficha: FichaPlanilla = {
    codigo: "9", nombre: "P9", salarioMensual: 774, jornadaSemanal: 48, empresa: "american_classic",
  };
  const [l] = armarPlanilla({
    personas: [p], fichas: new Map([["9", ficha]]), jornadaDiariaMin: () => 480,
    reglas: REGLAS_DEFAULT, empresa: null, exigirAprobacionExtra: false,
  });
  return l.dinero!;
}

describe("feriado trabajado ×2,5 el día", () => {
  it("feriado en domingo (20-dic-2026): 8 h × rata × 2,5", () => {
    const d = linea(dia("2026-12-20", false, "Día de Duelo Nacional"));
    expect(d.feriados).toBe(centavos(8 * 2.5 * d.rataHora!));
    expect(d.domingos).toBe(0);
  });

  it("feriado en día laborable: igual que hoy, ×1,5 encima del sueldo", () => {
    const d = linea(dia("2026-12-08", true, "Día de la Madre"));
    expect(d.feriados).toBe(centavos(8 * 1.5 * d.rataHora!));
  });

  it("domingo normal trabajado: sigue ×1,5", () => {
    const d = linea(dia("2026-12-13", false, null));
    expect(d.domingos).toBe(centavos(8 * 1.5 * d.rataHora!));
    expect(d.feriados).toBe(0);
  });
});
