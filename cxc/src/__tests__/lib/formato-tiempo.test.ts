// 🔴 Cómo se muestran los minutos de Asistencia (29-sep-2026). Solo el dibujo:
// el modo «min» tiene que ser idéntico a `fmtMin`, que es lo que sale en el Excel.
import { describe, it, expect } from "vitest";
import { formatoTiempo, modoTiempoValido } from "@/lib/asistencia/formato-tiempo";
import { fmtMin } from "@/lib/asistencia/reporte";

describe("formatoTiempo", () => {
  it("h:mm redondea al minuto", () => {
    expect(formatoTiempo(721.75, "hmm")).toBe("12:02");
    expect(formatoTiempo(958.23, "hmm")).toBe("15:58");
    expect(formatoTiempo(175.08, "hmm")).toBe("2:55");
    expect(formatoTiempo(104, "hmm")).toBe("1:44");
    expect(formatoTiempo(59.6, "hmm")).toBe("1:00");
    expect(formatoTiempo(5, "hmm")).toBe("0:05");
    expect(formatoTiempo(0, "hmm")).toBe("0:00");
    expect(formatoTiempo(-90, "hmm")).toBe("-1:30");
    expect(formatoTiempo(-0.2, "hmm")).toBe("0:00");
    expect(formatoTiempo(Number.NaN, "hmm")).toBe("0:00");
  });

  it("minutos es EXACTAMENTE fmtMin", () => {
    for (const v of [721.75, 958.23, 175.08, 104, 0, 9544.499999999998, 0.005, -3.1, Number.NaN]) {
      expect(formatoTiempo(v, "min")).toBe(fmtMin(v));
    }
    expect(formatoTiempo(721.75, "min")).toBe("721.75");
  });

  it("lo guardado que no sirve cae a h:mm", () => {
    expect(modoTiempoValido("min")).toBe("min");
    expect(modoTiempoValido("hmm")).toBe("hmm");
    expect(modoTiempoValido(null)).toBe("hmm");
    expect(modoTiempoValido("horas")).toBe("hmm");
  });
});
