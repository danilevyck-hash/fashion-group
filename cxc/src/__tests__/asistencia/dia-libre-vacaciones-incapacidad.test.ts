// 30-sep-2026 · Daniel: «si está de vacaciones no debería de deber, ni
// incapacitado». Esos días no generan deuda de día libre.
import { describe, it, expect } from "vitest";
import { diasSinDeudaPorAusenciaJustificada } from "@/lib/asistencia/dia-libre-empresa";

describe("día libre · vacaciones e incapacidad no deben", () => {
  const set = diasSinDeudaPorAusenciaJustificada(
    [{ empleado_codigo: "18", desde: "2026-09-20", hasta: "2026-09-22" }],
    [
      { empleado_codigo: "23", desde: "2026-09-21", hasta: "2026-09-21", motivo: "Incapacidad" },
      { empleado_codigo: "15", desde: "2026-09-21", hasta: "2026-09-21", motivo: "Incapacidad", hora_desde: "08:00" },
      { empleado_codigo: "7", desde: "2026-09-21", hasta: "2026-09-21", motivo: "Escolares" },
    ],
  );
  it("vacaciones que cubren el día → no debe", () => expect(set.has("18|2026-09-21")).toBe(true));
  it("incapacidad de día entero → no debe", () => expect(set.has("23|2026-09-21")).toBe(true));
  it("un permiso por horas de incapacidad no quita el día libre", () => expect(set.has("15|2026-09-21")).toBe(false));
  it("otro motivo no cuenta", () => expect(set.has("7|2026-09-21")).toBe(false));
});
