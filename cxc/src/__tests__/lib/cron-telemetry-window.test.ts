// Ventana "success de hoy" de los colaterales de la reconciliación.
//
// Incidente 17-jul-2026: acs-resumen-diario corre 01:00 UTC (20:00 Panamá del
// día anterior). Su heartbeat (~01:01 UTC) caía ANTES del inicio del día Panamá
// (05:00 UTC), así que findMissingColaterales lo declaraba "sin correr" TODOS
// los días y la primera pasada de reconciliación re-enviaba el resumen con
// prefijo "(recuperado)" aunque el original sí salió. Mismo falso positivo en
// cleanup-packing-lists (03:00 UTC), silencioso por ser idempotente.
import { describe, it, expect } from "vitest";
import { colateralDayStartIso } from "@/lib/fecha-panama";

describe("colateralDayStartIso", () => {
  const nowPasada14 = new Date("2026-07-17T14:00:00Z"); // pasada de reconciliación

  it("default: inicio del día Panamá (05:00 UTC)", () => {
    expect(colateralDayStartIso(false, nowPasada14)).toBe("2026-07-17T05:00:00.000Z");
  });

  it("earlyUtcRun: inicio del día UTC (00:00Z)", () => {
    expect(colateralDayStartIso(true, nowPasada14)).toBe("2026-07-17T00:00:00.000Z");
  });

  it("entre 00:00 y 05:00 UTC el día Panamá sigue siendo ayer, el UTC ya es hoy", () => {
    const madrugada = new Date("2026-07-17T02:00:00Z"); // 21:00 Panamá del 16
    expect(colateralDayStartIso(false, madrugada)).toBe("2026-07-16T05:00:00.000Z");
    expect(colateralDayStartIso(true, madrugada)).toBe("2026-07-17T00:00:00.000Z");
  });

  it("incidente 17-jul: heartbeat de la 01:01 UTC cuenta como success de hoy con earlyUtcRun (con la ventana Panamá NO contaba → duplicado)", () => {
    const heartbeatOriginal = "2026-07-17T01:01:00.000Z"; // run normal de la 01:00
    expect(heartbeatOriginal >= colateralDayStartIso(true, nowPasada14)).toBe(true); // fix
    expect(heartbeatOriginal >= colateralDayStartIso(false, nowPasada14)).toBe(false); // bug que causaba el "(recuperado)"
  });

  it("earlyUtcRun sigue detectando la pérdida real: heartbeat de ayer queda fuera", () => {
    const heartbeatAyer = "2026-07-16T14:21:00.000Z"; // último success = recover de ayer
    expect(heartbeatAyer >= colateralDayStartIso(true, nowPasada14)).toBe(false);
  });
});
