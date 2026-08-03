// ─────────────────────────────────────────────────────────────────────────────
// Puente: marcaciones desde el Excel de iVMS-4200.
//
// Contexto (3-ago-2026): se perdió la contraseña de red del reloj y recuperarla
// depende de Hikvision. Mientras tanto se suben las marcaciones a mano, a la
// MISMA tabla que va a usar el agente automático.
//
// ⚠️ LOS DOS RIESGOS QUE ESTE ARCHIVO VIGILA:
//   1. Que el Excel y el agente dupliquen la misma marcación en el período de
//      transición → el id se deriva del CONTENIDO, no de un correlativo.
//   2. Que la hora se lea como UTC → una marcación de las 14:32 quedaría a las
//      09:32 y el reporte de horas saldría mal por 5 horas.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  detectarColumnas,
  instantePanama,
  idDeContenido,
  importarFilas,
} from "@/lib/asistencia/importar-excel";

describe("🔴 la hora es de PANAMÁ, no UTC", () => {
  it("14:32 del 3-ago se guarda como 19:32 UTC", () => {
    expect(instantePanama("2026-08-03 14:32:00")).toBe("2026-08-03T19:32:00.000Z");
  });

  it("acepta dd/mm/yyyy, que es como lo escribe iVMS en español", () => {
    expect(instantePanama("03/08/2026 14:32:00")).toBe("2026-08-03T19:32:00.000Z");
  });

  it("acepta sin segundos", () => {
    expect(instantePanama("03/08/2026 08:05")).toBe("2026-08-03T13:05:00.000Z");
  });

  it("si el dato YA trae zona, la respeta en vez de re-interpretarla", () => {
    expect(instantePanama("2026-08-03T14:32:00-05:00")).toBe("2026-08-03T19:32:00.000Z");
    expect(instantePanama("2026-08-03T19:32:00Z")).toBe("2026-08-03T19:32:00.000Z");
  });

  it("una fecha imposible NO se inventa", () => {
    expect(instantePanama("32/13/2026 99:99")).toBeNull();
    expect(instantePanama("ayer")).toBeNull();
    expect(instantePanama("")).toBeNull();
    expect(instantePanama(null)).toBeNull();
  });
});

describe("🔴 el id sale del CONTENIDO — es lo que evita duplicar", () => {
  it("el mismo empleado en el mismo instante da el MISMO id", () => {
    const a = idDeContenido("7", "2026-08-03T19:32:00.000Z");
    const b = idDeContenido("7", "2026-08-03T19:32:00.000Z");
    expect(a).toBe(b);
  });

  it("otro empleado, u otro instante, dan ids distintos", () => {
    const base = idDeContenido("7", "2026-08-03T19:32:00.000Z");
    expect(idDeContenido("8", "2026-08-03T19:32:00.000Z")).not.toBe(base);
    expect(idDeContenido("7", "2026-08-03T19:32:01.000Z")).not.toBe(base);
  });

  it("subir el MISMO archivo dos veces produce exactamente las mismas llaves", () => {
    const filas = [{ "No. de persona": "7", Nombre: "ANDREA", "Hora de asistencia": "03/08/2026 08:00" }];
    const cab = ["No. de persona", "Nombre", "Hora de asistencia"];
    const a = importarFilas("RELOJ_FG", filas, cab).filas.map((f) => f.evento_id);
    const b = importarFilas("RELOJ_FG", filas, cab).filas.map((f) => f.evento_id);
    expect(a).toEqual(b);
  });

  it("una fila repetida DENTRO del archivo entra una sola vez", () => {
    const f = { "No. de persona": "7", "Hora de asistencia": "03/08/2026 08:00" };
    const r = importarFilas("RELOJ_FG", [f, f, f], ["No. de persona", "Hora de asistencia"]);
    expect(r.filas).toHaveLength(1);
  });
});

describe("detecta las columnas aunque cambie el idioma o la versión", () => {
  it("encabezados en español de iVMS", () => {
    const c = detectarColumnas(["No. de persona", "Nombre", "Hora de asistencia", "Tipo de asistencia"]);
    expect(c.codigo).toBe("No. de persona");
    expect(c.nombre).toBe("Nombre");
    expect(c.fecha).toBe("Hora de asistencia");
    expect(c.tipo).toBe("Tipo de asistencia");
  });

  it("encabezados en inglés", () => {
    const c = detectarColumnas(["Person No.", "Name", "Attendance Time", "Attendance Status"]);
    expect(c.codigo).toBe("Person No.");
    expect(c.fecha).toBe("Attendance Time");
  });

  it("⚠️ no confunde 'Hora' suelta con 'Hora de asistencia'", () => {
    // "hora" está contenida en "hora de asistencia": si se eligiera por
    // "contiene", tomaría la columna equivocada.
    const c = detectarColumnas(["Hora de asistencia", "Hora"]);
    expect(c.fecha).toBe("Hora de asistencia");
  });

  it("ignora acentos y mayúsculas", () => {
    expect(detectarColumnas(["CÓDIGO", "FECHA"]).fecha).toBe("FECHA");
  });
});

describe("⚠️ nada se descarta en silencio", () => {
  const cab = ["No. de persona", "Nombre", "Hora de asistencia"];

  it("una fila sin fecha se reporta con su número de fila de Excel", () => {
    const r = importarFilas("RELOJ_FG", [{ "No. de persona": "7", "Hora de asistencia": null }], cab);
    expect(r.filas).toHaveLength(0);
    expect(r.descartadas[0]).toEqual({ fila: 2, motivo: "fecha/hora vacía o no reconocida" });
  });

  it("una fila sin empleado tampoco entra", () => {
    const r = importarFilas("RELOJ_FG", [{ "Hora de asistencia": "03/08/2026 08:00" }], cab);
    expect(r.descartadas[0].motivo).toContain("sin código ni nombre");
  });

  it("si no hay columna de fecha, lo dice fila por fila en vez de guardar basura", () => {
    const r = importarFilas("RELOJ_FG", [{ A: 1 }], ["A"]);
    expect(r.filas).toHaveLength(0);
    expect(r.descartadas[0].motivo).toContain("columna de fecha");
  });
});

describe("el caso completo", () => {
  it("un Excel típico de iVMS entra bien", () => {
    const r = importarFilas(
      "RELOJ_FG",
      [
        { "No. de persona": "7", Nombre: "ANDREA", "Hora de asistencia": "03/08/2026 08:02:11", "Tipo de asistencia": "Entrada" },
        { "No. de persona": "7", Nombre: "ANDREA", "Hora de asistencia": "03/08/2026 17:31:04", "Tipo de asistencia": "Salida" },
      ],
      ["No. de persona", "Nombre", "Hora de asistencia", "Tipo de asistencia"],
    );
    expect(r.filas).toHaveLength(2);
    expect(r.descartadas).toHaveLength(0);
    expect(r.filas[0]).toMatchObject({
      dispositivo: "RELOJ_FG",
      empleado_codigo: "7",
      empleado_nombre: "ANDREA",
      ocurrio_en: "2026-08-03T13:02:11.000Z",
      tipo: "Entrada",
    });
    // El crudo se conserva para poder auditar de dónde salió cada fila.
    expect(r.filas[0].raw).toHaveProperty("Nombre", "ANDREA");
  });
});
