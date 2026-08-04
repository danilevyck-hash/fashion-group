// ─────────────────────────────────────────────────────────────────────────────
// Lector del Excel de iVMS-4200 — con el formato REAL.
//
// 🩸 LA PRIMERA VERSIÓN ASUMIÓ UN FORMATO QUE NO EXISTE. Se escribió sin un
// archivo de muestra, suponiendo una lista de marcaciones sueltas. Daniel mandó
// tres exportes reales el 4-ago-2026 y el formato es otro:
//
//   fila 1  │ "Detalles de asistencia"          ← TÍTULO, no encabezados
//   fila 2  │ ID de persona │ Nombre │ Departamento │ Fecha │ … │ Entrada │ Salida
//   fila 3  │ 8 │ BRICEIDA MONTERO │ CONFECCIONES BOSTON │ 2026-07-13 │ … │ 07:59:33 │ 12:42:13
//   fila 4  │ "Hora de entrada: 2026-07-13 " │ …    ← FILA DE DETALLE, basura
//
// Tres cosas rompían el lector viejo: los encabezados NO están en la fila 1;
// hay una fila de resumen intercalada entre cada dato (185 de 408 filas en el
// archivo de Boston); y **no es una marcación por fila, es una JORNADA** con la
// fecha en una columna y las horas en otras dos.
//
// Todos los datos de este archivo salen de esos tres exportes.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  buscarEncabezados,
  instantePanama,
  idDeContenido,
  importarMatriz,
  type Matriz,
} from "@/lib/asistencia/importar-excel";

// Recorte literal del archivo "MARCACION DEL 13 DE JULIO AL 27 DE JULIO 2026".
const CAB = [
  "ID de persona", "Nombre", "Departamento", "Fecha", "Turno", "Horario",
  "Estado de asistencia", "Entrada", "Salida", "Entrada con retraso",
  "Salida temprana", "Asistió", "Ausente", "Trabajado",
];
const REAL: Matriz = [
  ["Detalles de asistencia", null, null, null, null, null, null, null, null],
  CAB,
  ["8", "BRICEIDA MONTERO", "CONFECCIONES BOSTON", "2026-07-13", "8 A 430", "8A5(08:00:00-17:00:00)", "Temprano", "07:59:33", "12:42:13"],
  ["Hora de entrada: 2026-07-13 ", "Hora de salida: 2026-07-13 1", "Duración de la asistencia:4H", null, null, null, null, null, null],
  ["8", "BRICEIDA MONTERO", "CONFECCIONES BOSTON", "2026-07-14", "8 A 430", "8A5(08:00:00-17:00:00)", "Temprano", "08:06:51", "16:39:07"],
  ["Hora de entrada: 2026-07-14 ", "Hora de salida: 2026-07-14 1", "Duración de la asistencia:4H", null, null, null, null, null, null],
  // Día sin turno: iVMS pone "-" en entrada y salida.
  ["15", "YULICAR CORONA", "CONFECCIONES BOSTON", "2026-07-19", "", "", "Programación sin turnos", "-", "-"],
];

describe("🔴 los encabezados NO están en la fila 1", () => {
  it("los encuentra en la fila 2, debajo del título", () => {
    expect(buscarEncabezados(REAL)).toBe(1);
  });

  it("si estuvieran en la 1, también los encuentra", () => {
    expect(buscarEncabezados([CAB, ["8", "X", "Y", "2026-07-13"]])).toBe(0);
  });
});

describe("🔴 las filas de detalle intercaladas no son datos", () => {
  it("las saltea y las cuenta aparte, sin llamarlas descartes", () => {
    const r = importarMatriz("RELOJ_FG", REAL);
    expect(r.filasDeDetalle).toBe(2);
    // Nada de "Hora de entrada: …" se coló como empleado.
    expect(r.filas.every((f) => !f.empleado_codigo?.startsWith("Hora"))).toBe(true);
  });
});

describe("🔴 una JORNADA da DOS marcaciones", () => {
  const r = importarMatriz("RELOJ_FG", REAL);

  it("entrada y salida se guardan por separado", () => {
    const deBriceida = r.filas.filter((f) => f.empleado_codigo === "8");
    expect(deBriceida).toHaveLength(4); // 2 días × (entrada + salida)
    expect(deBriceida.map((f) => f.tipo)).toEqual(["Entrada", "Salida", "Entrada", "Salida"]);
  });

  it("la hora es de PANAMÁ: 07:59:33 → 12:59:33 UTC", () => {
    expect(r.filas[0].ocurrio_en).toBe("2026-07-13T12:59:33.000Z");
  });

  it("guarda el departamento, que dice a qué empresa pertenece", () => {
    expect(r.filas[0].raw).toMatchObject({ departamento: "CONFECCIONES BOSTON" });
  });

  it("guarda el estado que reporta el reloj", () => {
    expect(r.filas[0].raw).toMatchObject({ estado: "Temprano" });
  });
});

describe("🔴 un día sin marcaje NO inventa una jornada", () => {
  it('entrada y salida en "-" no generan filas', () => {
    const r = importarMatriz("RELOJ_FG", REAL);
    expect(r.filas.some((f) => f.empleado_codigo === "15")).toBe(false);
  });

  it("y se reporta con el motivo, no en silencio", () => {
    const r = importarMatriz("RELOJ_FG", REAL);
    expect(r.descartadas.some((x) => x.motivo.includes("sin turno programado"))).toBe(true);
  });

  // 🩸 Medido en los archivos reales: 18 ausencias venían rotuladas
  // "Entrada con retraso/Temprano" —que se lee como que SÍ llegó— mientras la
  // columna Ausente decía 8h30 y Trabajado 0. Ese campo es la REGLA DEL TURNO,
  // no lo que pasó. Repetirlo en el motivo hacía que un descarte correcto
  // pareciera un error del lector.
  it("una ausencia se llama ausencia, aunque el estado diga otra cosa", () => {
    const r = importarMatriz("RELOJ_FG", [
      [...CAB],
      ["6", "KEVIN LUBO", "FASHION WEAR", "2026-07-19", "", "", "Entrada con retraso/Temprano",
       "-", "-", "", "", "0Hora(s)0 mín.", "8Hora(s)30 mín."],
    ]);
    expect(r.filas).toHaveLength(0);
    const m = r.descartadas[0].motivo;
    expect(m).toContain("no vino");
    expect(m).toContain("8Hora(s)30 mín.");
    expect(m).not.toContain("Entrada con retraso");
  });
});

describe("🔴 el id sale del contenido — es lo que evita duplicar", () => {
  it("subir el MISMO archivo dos veces da las mismas llaves", () => {
    const a = importarMatriz("RELOJ_FG", REAL).filas.map((f) => f.evento_id);
    const b = importarMatriz("RELOJ_FG", REAL).filas.map((f) => f.evento_id);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length); // sin repetidos dentro del archivo
  });

  it("si entrada y salida caen en el mismo segundo, colapsan en UNA fila", () => {
    // Pasa cuando la persona marcó una sola vez: iVMS repite la hora en ambas.
    const r = importarMatriz("RELOJ_FG", [
      CAB,
      ["9", "X", "DEP", "2026-07-13", "", "", "Temprano", "08:00:00", "08:00:00"],
    ]);
    expect(r.filas).toHaveLength(1);
  });

  it("distinto empleado o distinto instante → distinto id", () => {
    const base = idDeContenido("8", "2026-07-13T12:59:33.000Z");
    expect(idDeContenido("9", "2026-07-13T12:59:33.000Z")).not.toBe(base);
    expect(idDeContenido("8", "2026-07-13T12:59:34.000Z")).not.toBe(base);
  });
});

describe("fecha + hora en columnas separadas", () => {
  it("junta 2026-07-13 con 07:59:33 en hora de Panamá", () => {
    expect(instantePanama("2026-07-13", "07:59:33")).toBe("2026-07-13T12:59:33.000Z");
  });

  it("acepta dd/mm/yyyy", () => {
    expect(instantePanama("13/07/2026", "07:59:33")).toBe("2026-07-13T12:59:33.000Z");
  });

  it("acepta hora sin segundos", () => {
    expect(instantePanama("2026-07-13", "08:00")).toBe("2026-07-13T13:00:00.000Z");
  });

  it("acepta celdas que Excel entregó como Date", () => {
    expect(instantePanama(new Date(2026, 6, 13), new Date(2026, 6, 13, 7, 59, 33)))
      .toBe("2026-07-13T12:59:33.000Z");
  });

  it("una fecha u hora imposible NO se inventa", () => {
    expect(instantePanama("no es fecha", "07:59:33")).toBeNull();
    expect(instantePanama("2026-07-13", "-")).toBeNull();
    expect(instantePanama("2026-07-13", null)).toBeNull();
  });
});

describe("⚠️ no confundir columnas parecidas", () => {
  it('"Entrada" NO se confunde con "Entrada con retraso"', () => {
    const r = importarMatriz("RELOJ_FG", REAL);
    expect(r.columnas.entrada).toBe(CAB.indexOf("Entrada"));
    expect(r.columnas.salida).toBe(CAB.indexOf("Salida"));
  });

  it("reconoce los encabezados en inglés", () => {
    const r = importarMatriz("RELOJ_FG", [
      ["Person ID", "Name", "Department", "Date", "Check-in", "Check-out"],
      ["8", "X", "DEP", "2026-07-13", "08:00:00", "17:00:00"],
    ]);
    expect(r.filas).toHaveLength(2);
  });
});
