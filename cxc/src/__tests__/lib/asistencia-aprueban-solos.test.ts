/* Candado de `aprueban-solos.ts` (19-nov-2026, Daniel: «sin aprobar horas extras»).
 * El 309 cobra sus extras y su domingo sin aprobación y no frena el cierre;
 * otro colaborador, con los MISMOS días, sigue igual; y un «no» guardado manda.
 * Motor real (`armarPlanilla`), fechas fijas. */
import { describe, it, expect } from "vitest";

import { REGLAS_DEFAULT } from "@/lib/asistencia/config";
import { armarPlanilla, type FichaPlanilla } from "@/lib/asistencia/planilla";
import type { PersonaReporte, DiaReporte } from "@/lib/asistencia/reporte";
import { estaAprobado, estaRechazado, indexarAprobaciones, type Aprobacion } from "@/lib/asistencia/aprobaciones";
import { conAprobadosSolos } from "@/lib/asistencia/aprueban-solos";
import { frenosParaCerrar } from "@/lib/asistencia/planilla-guardada";

const DESDE = "2026-08-16";
const HASTA = "2026-08-31";
const MARTES = "2026-08-25";
const DOMINGO = "2026-08-30";

function dia(fecha: string, salida: string, extraMin: number): DiaReporte {
  return {
    fecha,
    marcas: ["08:00:00", "12:00:00", "12:30:00", `${salida}:00`],
    marcasIds: ["a", "b", "c", "d"],
    entrada: "08:00:00", salida: `${salida}:00`,
    tardeMin: 0, excesoAlmuerzoMin: 0, salidaTempranaMin: 0,
    extraMin, trabajadoMin: 480, revisar: false,
  } as unknown as DiaReporte;
}
const persona = (codigo: string): PersonaReporte => ({
  codigo, nombre: `P${codigo}`, salida: "17:00", almuerzoMin: 30,
  dias: [dia(MARTES, "17:30", 30), dia(DOMINGO, "17:00", 0)],
  resumen: { diasTrabajados: 2, ausenciasSinJustificar: 0 },
}) as unknown as PersonaReporte;
const ficha = (codigo: string): FichaPlanilla => ({
  codigo, nombre: `P${codigo}`, salarioMensual: 1000, jornadaSemanal: 40, empresa: "fashion_wear",
});

/** Lo mismo que hace la ruta de la Planilla con lo que devuelve `leerAprobaciones`. */
function cuadro(guardadas: Aprobacion[]) {
  const apr = indexarAprobaciones(conAprobadosSolos(guardadas, DESDE, HASTA));
  const si = new Set<string>(); const no = new Set<string>();
  for (const [k, a] of apr) { if (estaAprobado(a)) si.add(k); if (estaRechazado(a)) no.add(k); }
  const lineas = armarPlanilla({
    personas: [persona("309"), persona("1")],
    fichas: new Map([["309", ficha("309")], ["1", ficha("1")]]),
    jornadaDiariaMin: () => 480, reglas: REGLAS_DEFAULT, empresa: null,
    exigirAprobacionExtra: true, diasExtraAprobados: si, diasExtraNo: no,
  });
  const de = (c: string) => lineas.find((l) => l.codigo === c)!;
  return { de, frenos: frenosParaCerrar(lineas) };
}

describe("aprueban solos: el 309", () => {
  it("cobra extra y domingo sin aprobación; el 1 no, y solo el 1 frena el cierre", () => {
    const { de, frenos } = cuadro([]);
    expect(de("309").dinero!.extraDiurno).toBeGreaterThan(0);
    expect(de("309").dinero!.domingos).toBeGreaterThan(0);
    expect(de("1").dinero!.extraDiurno).toBe(0);
    expect(de("1").dinero!.domingos).toBe(0);
    const freno = frenos.find((f) => f.tipo === "horas-extra");
    expect(freno?.codigos).toEqual(["1"]);
  });

  it("un «no» guardado sigue mandando", () => {
    const no: Aprobacion = {
      codigo: "309", fecha: DOMINGO, aprobado: false, decision: "no",
      minutosVistos: 480, por: "x", cuando: null,
    };
    const { de } = cuadro([no]);
    expect(de("309").dinero!.domingos).toBe(0);
    expect(de("309").dinero!.extraDiurno).toBeGreaterThan(0);
  });
});
