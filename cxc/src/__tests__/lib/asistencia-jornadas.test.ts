// ─────────────────────────────────────────────────────────────────────────────
// De marcaciones sueltas a jornadas (día por empleado con horas).
//
// ⚠️ LOS DOS RIESGOS:
//   1. Agrupar por el día UTC → todo lo marcado después de las 7 p.m. de Panamá
//      caería en el día siguiente y las jornadas saldrían partidas.
//   2. Depender de `attendanceStatus` para saber qué es entrada y qué salida →
//      ese campo viene VACÍO en muchas configuraciones del reloj. Se usa la
//      primera y la última marcación del día, que funciona etiquete o no.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { armarJornadas, resumir, diaPanama, horaPanama } from "@/lib/asistencia/jornadas";

const m = (ocurrio_en: string, codigo = "7", nombre: string | null = "ANDREA") => ({
  empleado_codigo: codigo,
  empleado_nombre: nombre,
  ocurrio_en,
  tipo: null,
});

describe("🔴 el día se corta en Panamá, no en UTC", () => {
  it("las 20:00 de Panamá (01:00 UTC del día siguiente) siguen siendo el mismo día", () => {
    // 2026-08-04T01:00:00Z = 3-ago 20:00 en Panamá
    expect(diaPanama("2026-08-04T01:00:00.000Z")).toBe("2026-08-03");
  });

  it("una jornada de 8am a 8pm NO se parte en dos días", () => {
    const j = armarJornadas([
      m("2026-08-03T13:00:00.000Z"), // 08:00 Panamá
      m("2026-08-04T01:00:00.000Z"), // 20:00 Panamá, mismo día laboral
    ]);
    expect(j).toHaveLength(1);
    expect(j[0].dia).toBe("2026-08-03");
    expect(j[0].horas).toBe(12);
  });

  it("la hora se muestra en Panamá", () => {
    expect(horaPanama("2026-08-03T13:02:00.000Z")).toBe("08:02");
  });
});

describe("🔴 entrada y salida sin depender de la etiqueta del reloj", () => {
  it("la primera del día es entrada y la última salida", () => {
    const j = armarJornadas([
      m("2026-08-03T22:31:00.000Z"), // 17:31
      m("2026-08-03T13:02:00.000Z"), // 08:02  ← llega desordenada a propósito
      m("2026-08-03T17:00:00.000Z"), // 12:00 (almuerzo)
    ]);
    expect(j).toHaveLength(1);
    expect(horaPanama(j[0].entrada)).toBe("08:02");
    expect(horaPanama(j[0].salida!)).toBe("17:31");
    expect(j[0].marcaciones).toHaveLength(3);
  });

  it("las horas se cuentan de la primera a la última", () => {
    const j = armarJornadas([m("2026-08-03T13:00:00.000Z"), m("2026-08-03T22:00:00.000Z")]);
    expect(j[0].horas).toBe(9);
  });

  it("redondea a 2 decimales", () => {
    const j = armarJornadas([m("2026-08-03T13:00:00.000Z"), m("2026-08-03T21:20:00.000Z")]);
    expect(j[0].horas).toBe(8.33);
  });
});

describe("⚠️ una sola marcación: falta la salida, no es un error", () => {
  it("se marca incompleta y sin horas, en vez de inventar 0", () => {
    const j = armarJornadas([m("2026-08-03T13:00:00.000Z")]);
    expect(j[0].incompleta).toBe(true);
    expect(j[0].salida).toBeNull();
    expect(j[0].horas).toBeNull();
  });

  it("no suma horas al total", () => {
    const r = resumir(armarJornadas([m("2026-08-03T13:00:00.000Z")]));
    expect(r.horasTotales).toBe(0);
    expect(r.incompletas).toBe(1);
  });
});

describe("agrupa por empleado y por día", () => {
  it("dos empleados el mismo día son dos jornadas", () => {
    const j = armarJornadas([
      m("2026-08-03T13:00:00.000Z", "7", "ANDREA"),
      m("2026-08-03T22:00:00.000Z", "7", "ANDREA"),
      m("2026-08-03T13:05:00.000Z", "8", "ANGELA"),
      m("2026-08-03T22:05:00.000Z", "8", "ANGELA"),
    ]);
    expect(j).toHaveLength(2);
    expect(resumir(j).empleados).toBe(2);
    expect(resumir(j).dias).toBe(1);
  });

  it("el mismo empleado en dos días son dos jornadas", () => {
    const j = armarJornadas([
      m("2026-08-03T13:00:00.000Z"),
      m("2026-08-03T22:00:00.000Z"),
      m("2026-08-04T13:00:00.000Z"),
      m("2026-08-04T22:00:00.000Z"),
    ]);
    expect(j).toHaveLength(2);
    expect(resumir(j)).toMatchObject({ empleados: 1, dias: 2, horasTotales: 18 });
  });

  it("rescata el nombre aunque falte en la primera fila del día", () => {
    const j = armarJornadas([
      m("2026-08-03T13:00:00.000Z", "7", null),
      m("2026-08-03T22:00:00.000Z", "7", "ANDREA"),
    ]);
    expect(j[0].empleadoNombre).toBe("ANDREA");
  });

  it("lo más reciente va primero", () => {
    const j = armarJornadas([
      m("2026-08-01T13:00:00.000Z"),
      m("2026-08-05T13:00:00.000Z"),
      m("2026-08-03T13:00:00.000Z"),
    ]);
    expect(j.map((x) => x.dia)).toEqual(["2026-08-05", "2026-08-03", "2026-08-01"]);
  });
});
