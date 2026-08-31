// ─────────────────────────────────────────────────────────────────────────────
// EL EXCEL DE APROBACIONES — se ESCRIBE y se vuelve a ABRIR.
//
// 🩸 Hasta el 31-ago-2026 no existía forma de sacar un archivo de «julio con
// estado»: la pestaña que muestra la aprobación no exportaba nada, y el Excel
// del Reporte trae los minutos SIN decir si se autorizaron.
//
// Este archivo no mira el objeto en memoria: arma el libro, lo escribe y lo
// relee con la librería de Excel. Lo que importa es qué queda en las celdas.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx-js-style";
import { workbookBytes } from "@/lib/excel-export";
import {
  construirExcelAprobaciones,
  nombreArchivoAprobaciones,
} from "@/lib/asistencia/aprobaciones-excel";
import type { DiaAprobacion } from "@/lib/asistencia/aprobaciones";

/** Datos con la forma REAL de producción (quincena 1-15 ago 2026). */
const DIAS: DiaAprobacion[] = [
  {
    fecha: "2026-08-03", etiqueta: "lun 3 ago", semana: "2026-08-03", minutos: 81.9,
    gente: [
      { codigo: "1", etiqueta: "ALEJANDRA CAMAÑO", empresa: "confecciones_boston",
        empresaEtiqueta: "Confecciones Boston", salida: "17:41", minutos: 40.83,
        diurnoMin: 40.83, nocturnoMin: 0, aprobado: true, por: "Contabilidad",
        cuando: "2026-08-26T14:02:11.501+00:00", minutosVistos: 40 },
      { codigo: "11", etiqueta: "JULIO GARAY", empresa: "vistana",
        empresaEtiqueta: "Vistana International", salida: "17:41", minutos: 41.07,
        diurnoMin: 35.07, nocturnoMin: 6, aprobado: false, por: null,
        cuando: null, minutosVistos: null },
    ],
  },
];

function abrir(dias: DiaAprobacion[] = DIAS) {
  const wb = construirExcelAprobaciones({ dias, desde: "2026-08-01", hasta: "2026-08-15" });
  // Viaje completo: bytes → parser. Mirar el objeto en memoria no prueba que el
  // archivo salga bien.
  const leido = XLSX.read(workbookBytes(wb), { type: "array" });
  const ws = leido.Sheets[leido.SheetNames[0]];
  // 🩸 El `numFmt` hay que mirarlo en la hoja ANTES de escribir: al releer, el
  // parser devuelve el valor y el texto ya formateado (`w`) pero NO restaura
  // `z`. Comprobarlo sobre `ws` daba `undefined` y parecía un bug del Excel.
  const antes = wb.Sheets[wb.SheetNames[0]];
  return { wb, leido, ws, antes, filas: XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { header: 1 }) as unknown as unknown[][] };
}

describe("la hoja", () => {
  it("se llama «Horas extra» y es la única", () => {
    const { leido } = abrir();
    expect(leido.SheetNames).toEqual(["Horas extra"]);
  });

  it("los encabezados están en la FILA 1, con el estado y quién aprobó", () => {
    const { filas } = abrir();
    expect(filas[0]).toEqual([
      "Persona", "Código", "Empresa", "Fecha", "Salida",
      "Extra 1.25 (min)", "Extra 1.50 (min)", "Total (min)",
      "Estado", "Aprobó", "Cuándo",
    ]);
  });

  it("🔴 UNA FILA POR PERSONA Y DÍA, no una por día", () => {
    const { filas } = abrir();
    // 1 día con 2 personas → 2 filas de datos (+ encabezado + TOTAL).
    expect(filas[1][0]).toBe("ALEJANDRA CAMAÑO");
    expect(filas[2][0]).toBe("JULIO GARAY");
  });

  it("el nombre del archivo lleva el rango elegido", () => {
    expect(nombreArchivoAprobaciones("2026-07-01", "2026-07-31"))
      .toBe("Horas extra 2026-07-01 a 2026-07-31.xlsx");
  });
});

describe("🔴 el ESTADO, que es para lo que existe este archivo", () => {
  it("dice «Aprobado» / «Sin aprobar» con todas las letras", () => {
    const { filas } = abrir();
    expect(filas[1][8]).toBe("Aprobado");
    expect(filas[2][8]).toBe("Sin aprobar");
  });

  it("la aprobada trae quién y cuándo; la que no, ninguno de los dos", () => {
    const { filas } = abrir();
    expect(filas[1][9]).toBe("Contabilidad");
    expect(filas[1][10]).toBe("2026-08-26");
    expect(filas[2][9]).toBe("");
    expect(filas[2][10]).toBe("");
  });

  it("⚠️ una aprobada SIN firma no inventa una: la celda queda vacía", () => {
    const sinFirma: DiaAprobacion[] = [{
      ...DIAS[0],
      gente: [{ ...DIAS[0].gente[0], por: null, cuando: null }],
    }];
    const { filas } = abrir(sinFirma);
    expect(filas[1][8]).toBe("Aprobado");
    expect(filas[1][9]).toBe("");
  });
});

describe("🔴 los minutos son NÚMEROS, no texto", () => {
  it("las tres columnas de minutos vienen como number", () => {
    const { filas } = abrir();
    for (const col of [5, 6, 7]) {
      expect(typeof filas[1][col], `columna ${col}`).toBe("number");
    }
    expect(filas[1][5]).toBeCloseTo(40.83, 2);
    expect(filas[1][7]).toBeCloseTo(40.83, 2);
  });

  it("y llevan numFmt de dos decimales — se miden al segundo", () => {
    const { antes, ws } = abrir();
    expect((antes["F2"] as { z?: string }).z).toBe("0.00");
    expect((antes["H2"] as { z?: string }).z).toBe("0.00");
    // Y al releer, Excel ya lo aplicó: el texto de la celda son dos decimales.
    expect((ws["F2"] as { w?: string }).w).toBe("40.83");
  });

  it("el diurno y el nocturno viajan SEPARADOS (1.25 y 1.50 se pagan distinto)", () => {
    const { filas } = abrir();
    expect(filas[2][5]).toBeCloseTo(35.07, 2);
    expect(filas[2][6]).toBeCloseTo(6, 2);
  });
});

describe("el pie", () => {
  it("cuenta días-persona y separa aprobadas de las que no", () => {
    const { filas } = abrir();
    // Fila 4 (0-indexada): el layout de la casa deja una vacía antes del total.
    const tot = filas[4];
    expect(String(tot[0])).toContain("TOTAL · 2 días-persona");
    expect(String(tot[8])).toBe("1 aprobadas · 1 sin aprobar");
    expect(tot[7]).toBeCloseTo(81.9, 2);
  });

  it("🔴 y una nota al pie dice cuántos minutos NO se pagaron", () => {
    const { ws } = abrir();
    const txt = Object.keys(ws)
      .filter((k) => !k.startsWith("!"))
      .map((k) => String((ws[k] as { v?: unknown }).v ?? ""))
      .join(" | ");
    expect(txt).toContain("sin aprobar por 41.07 minutos");
    expect(txt).toContain("la planilla NO los pagó");
  });

  it("⚠️ con todo aprobado NO se dibuja esa nota — un aviso que siempre está no se lee", () => {
    const todo: DiaAprobacion[] = [{
      ...DIAS[0],
      gente: [{ ...DIAS[0].gente[0] }],
    }];
    const { ws } = abrir(todo);
    const txt = Object.keys(ws)
      .filter((k) => !k.startsWith("!"))
      .map((k) => String((ws[k] as { v?: unknown }).v ?? ""))
      .join(" | ");
    expect(txt).not.toContain("la planilla NO los pagó");
  });
});

describe("el archivo sale usable", () => {
  it("filtro desde A1, y NO se traga la fila de totales ni la nota", () => {
    const { antes } = abrir();
    const ref = (antes["!autofilter"] as { ref: string }).ref;
    expect(ref.startsWith("A1")).toBe(true);
    // El filtro llega hasta la última fila de DATOS (la 3): si abarcara el
    // total o la nota, filtrar por «Sin aprobar» los escondería.
    expect(ref).toBe("A1:K3");
  });

  it("sin días, no revienta: hoja vacía con sus encabezados", () => {
    const { filas } = abrir([]);
    expect(filas[0][0]).toBe("Persona");
  });
});
