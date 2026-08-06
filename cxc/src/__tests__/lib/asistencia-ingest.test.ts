// ─────────────────────────────────────────────────────────────────────────────
// Normalización de marcaciones del reloj.
//
// Contexto: el DS-K1T804AEF no puede empujar eventos a una dirección web (solo
// habla el protocolo propio de Hikvision, verificado el 3-ago-2026 en el equipo
// real). Así que un agente en la oficina le PREGUNTA por rangos de fecha y
// manda lo que encuentra acá.
//
// ⚠️ LO QUE MÁS IMPORTA: el repaso nocturno vuelve a pedir días ya guardados
// para rellenar huecos. Si un evento se pudiera duplicar, las horas trabajadas
// se inflarían cada noche — el error más caro de este módulo. Por eso el
// `serialNo` es obligatorio y el lote se dedup antes de guardar.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  normalizarEventos,
  ultimoInstante,
  type EventoCrudo,
} from "@/lib/asistencia/ingest";

const ev = (over: Partial<EventoCrudo> = {}): EventoCrudo => ({
  serialNo: 1001,
  time: "2026-08-03T14:32:10-05:00",
  employeeNoString: "7",
  name: "ANDREA",
  attendanceStatus: "checkIn",
  ...over,
});

describe("🔴 sin serialNo NO se guarda", () => {
  it("descarta el evento y dice por qué", () => {
    const r = normalizarEventos("reloj_fg", [ev({ serialNo: undefined })]);
    expect(r.filas).toHaveLength(0);
    expect(r.descartados[0].motivo).toContain("serialNo");
  });

  it("guardarlo sería PEOR que perderlo: se duplicaría en cada repaso", () => {
    // Documenta la decisión: no hay rama que lo acepte "por si acaso".
    const r = normalizarEventos("reloj_fg", [ev({ serialNo: "" }), ev({ serialNo: null as never })]);
    expect(r.filas).toHaveLength(0);
    expect(r.descartados).toHaveLength(2);
  });
});

describe("🔴 el mismo lote no puede traer la llave dos veces", () => {
  it("dedup dentro del lote (el upsert falla si se repite)", () => {
    const r = normalizarEventos("reloj_fg", [ev(), ev(), ev({ serialNo: 1002 })]);
    expect(r.filas.map((f) => f.evento_id)).toEqual(["1001", "1002"]);
  });
});

describe("🔴 la hora se conserva con su zona", () => {
  it("14:32 en Panamá es 19:32 UTC — no se recorta el offset", () => {
    const r = normalizarEventos("reloj_fg", [ev()]);
    expect(r.filas[0].ocurrio_en).toBe("2026-08-03T19:32:10.000Z");
  });

  it("una fecha inválida se descarta, no se inventa", () => {
    const r = normalizarEventos("reloj_fg", [ev({ time: "ayer por la tarde" })]);
    expect(r.filas).toHaveLength(0);
    expect(r.descartados[0].motivo).toContain("fecha");
  });

  it("sin hora tampoco entra", () => {
    expect(normalizarEventos("reloj_fg", [ev({ time: undefined })]).filas).toHaveLength(0);
  });
});

describe("los campos del empleado", () => {
  it("lee código y nombre", () => {
    const f = normalizarEventos("reloj_fg", [ev()]).filas[0];
    expect(f.empleado_codigo).toBe("7");
    expect(f.empleado_nombre).toBe("ANDREA");
    expect(f.tipo).toBe("checkIn");
  });

  it("🔴 SIN código de empleado NO es una marcación — se descarta con motivo", () => {
    // 🩸 Antes se aceptaba y "la marcación valía igual". Medido al cargar julio
    // entero desde el reloj real: de 8.785 eventos, **5.845 (66%)** vienen sin
    // `employeeNoString` — huellas no reconocidas, puertas abiertas por dentro
    // y eventos del propio aparato. Guardarlos llenaba la tabla de filas con la
    // persona en blanco: 5.845 estorbando a 2.826 marcaciones de verdad.
    const r = normalizarEventos("reloj_fg", [
      ev({ employeeNoString: undefined, name: undefined, attendanceStatus: undefined }),
    ]);
    expect(r.filas).toHaveLength(0);
    expect(r.descartados).toHaveLength(1);
    expect(r.descartados[0].motivo).toContain("sin código de empleado");
  });

  it("⚠️ se descarta con MOTIVO, nunca en silencio", () => {
    // Si un día el reloj dejara de mandar el código de TODO el mundo, el conteo
    // de descartados lo grita; en silencio la asistencia quedaría vacía y nadie
    // sabría por qué.
    const r = normalizarEventos("reloj_fg", [ev({ employeeNoString: "" }), ev({ serialNo: 2, employeeNoString: "7" })]);
    expect(r.filas).toHaveLength(1);
    expect(r.descartados).toHaveLength(1);
  });

  it("el nombre y el tipo SÍ pueden faltar — el código es lo único obligatorio", () => {
    const f = normalizarEventos("reloj_fg", [
      ev({ name: undefined, attendanceStatus: undefined }),
    ]).filas[0];
    expect(f.empleado_codigo).toBe("7");
    expect(f.empleado_nombre).toBeNull();
    expect(f.tipo).toBeNull();
  });

  it("guarda el evento crudo para poder auditarlo después", () => {
    const crudo = ev({ campoRaro: "algo" });
    expect(normalizarEventos("reloj_fg", [crudo]).filas[0].raw).toEqual(crudo);
  });
});

describe("⚠️ dos relojes: el mismo serialNo NO es un duplicado", () => {
  it("el dispositivo viaja en cada fila y es parte de la llave", () => {
    const a = normalizarEventos("reloj_fg", [ev()]).filas[0];
    const b = normalizarEventos("reloj_acs", [ev()]).filas[0];
    expect(a.evento_id).toBe(b.evento_id);
    expect(a.dispositivo).not.toBe(b.dispositivo);
  });
});

describe("hasta dónde se leyó", () => {
  it("devuelve el instante MÁS NUEVO del lote", () => {
    const r = normalizarEventos("reloj_fg", [
      ev({ serialNo: 1, time: "2026-08-03T08:00:00-05:00" }),
      ev({ serialNo: 2, time: "2026-08-03T17:00:00-05:00" }),
      ev({ serialNo: 3, time: "2026-08-03T12:00:00-05:00" }),
    ]);
    expect(ultimoInstante(r.filas)).toBe("2026-08-03T22:00:00.000Z");
  });

  it("sin filas devuelve null (no se avanza el punto de lectura)", () => {
    expect(ultimoInstante([])).toBeNull();
  });
});
