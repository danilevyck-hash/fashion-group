// ─────────────────────────────────────────────────────────────────────────────
// EL EXCEL DE APROBACIONES — el único archivo que dice si la extra se autorizó.
//
// 🩸 POR QUÉ HACÍA FALTA. La pestaña que MUESTRA el estado no exportaba nada, y
// el Excel que sí existe —el de Reporte— trae la columna «Extras» en minutos y
// **no dice una palabra sobre la aprobación**. O sea que no había forma de
// sacar un archivo de «julio, con estado»: había que mirarlo en pantalla, día
// por día.
//
// 🔑 NO ES UNA SEGUNDA CUENTA. Recibe los mismos `DiaAprobacion[]` que la
// pantalla ya tiene en la mano —los arma `armarDiasAprobacion` desde el MISMO
// `clasificarDia` que paga—, así que el archivo y la pantalla no pueden decir
// números distintos. Acá solo se acomodan en filas.
//
// 🔴 UNA FILA POR PERSONA Y DÍA, no por día. El día con 12 personas es 12 filas:
// el archivo se abre para filtrar por persona o por estado, y una celda que
// amontone doce nombres no se filtra. Es la misma decisión que el Excel de
// guías tomó al pasar a una fila por envío.
//
// ⚠️ LOS MINUTOS VAN COMO NÚMERO, con `numFmt`, nunca como texto. La regla de
// la casa es sobre la moneda pero vale igual acá: un «40.83» escrito como
// string no se suma en Excel, que es lo primero que alguien hace con esta hoja.
// ─────────────────────────────────────────────────────────────────────────────

import {
  buildReportSheet,
  workbookFromSheets,
  type ReportCell,
  type ReportColumn,
} from "@/lib/excel-export";
import type { DiaAprobacion } from "./aprobaciones";

/** Minutos con dos decimales: se miden AL SEGUNDO desde el 13-ago-2026. */
const MIN_FMT = "0.00";

const COLUMNAS: ReportColumn[] = [
  { header: "Persona", wch: 30 },
  { header: "Código", wch: 9, align: "center" },
  { header: "Empresa", wch: 22 },
  { header: "Fecha", wch: 12, align: "center" },
  { header: "Salida", wch: 8, align: "center" },
  { header: "Extra 1.25 (min)", wch: 15, align: "right", fmt: MIN_FMT },
  { header: "Extra 1.50 (min)", wch: 15, align: "right", fmt: MIN_FMT },
  { header: "Total (min)", wch: 12, align: "right", fmt: MIN_FMT },
  { header: "Estado", wch: 14, align: "center" },
  { header: "Aprobó", wch: 16 },
  { header: "Cuándo", wch: 12, align: "center" },
];

/** «2026-08-27T15:19:15.158+00:00» → «2026-08-27». Vacío si no hay dato. */
function soloDia(iso: string | null): string {
  return typeof iso === "string" && iso.length >= 10 ? iso.slice(0, 10) : "";
}

export interface OpcionesExcelAprobaciones {
  dias: readonly DiaAprobacion[];
  /** El rango que la persona tiene elegido EN PANTALLA. */
  desde: string;
  hasta: string;
}

/** El nombre del archivo lleva el rango: es lo que dice de qué período es. */
export function nombreArchivoAprobaciones(desde: string, hasta: string): string {
  return `Horas extra ${desde} a ${hasta}.xlsx`;
}

export function construirExcelAprobaciones(opts: OpcionesExcelAprobaciones) {
  const rows: ReportCell[][] = [];
  let apr = 0;
  let sin = 0;
  let minApr = 0;
  let minSin = 0;

  // El orden es el de la pantalla: por fecha, y dentro de la fecha como vino.
  for (const d of opts.dias) {
    for (const g of d.gente) {
      if (g.aprobado) { apr += 1; minApr += g.minutos; } else { sin += 1; minSin += g.minutos; }
      rows.push([
        g.etiqueta,
        g.codigo,
        g.empresaEtiqueta ?? g.empresa ?? "",
        d.fecha,
        g.salida ?? "",
        g.diurnoMin,
        g.nocturnoMin,
        g.minutos,
        // 🔴 La palabra entera, no un ✓. Quien abre esto filtra por texto.
        g.aprobado ? "Aprobado" : "Sin aprobar",
        // ⚠️ Solo si el dato existe. Una aprobación vieja puede no tener firma;
        // inventar «—» ahí haría creer que alguien la firmó.
        g.aprobado ? (g.por ?? "") : "",
        g.aprobado ? soloDia(g.cuando) : "",
      ]);
    }
  }

  const totals: ReportCell[] = [
    `TOTAL · ${apr + sin} ${apr + sin === 1 ? "día-persona" : "días-persona"}`,
    null, null, null, null,
    { v: opts.dias.reduce((a, d) => a + d.gente.reduce((b, g) => b + g.diurnoMin, 0), 0), fmt: MIN_FMT },
    { v: opts.dias.reduce((a, d) => a + d.gente.reduce((b, g) => b + g.nocturnoMin, 0), 0), fmt: MIN_FMT },
    { v: minApr + minSin, fmt: MIN_FMT },
    `${apr} aprobadas · ${sin} sin aprobar`,
    null, null,
  ];

  // 🔴 La nota dice lo único que el archivo no puede mostrar por sí solo y que
  // cambia una decisión: cuántos minutos NO se pagaron. Sin esto hay que sumar
  // a mano la columna filtrando por «Sin aprobar».
  const nota =
    sin > 0
      ? `${sin} día(s)-persona sin aprobar por ${minSin.toFixed(2)} minutos: la planilla NO los pagó.`
      : undefined;

  const ws = buildReportSheet({ columns: COLUMNAS, rows, totals, nota });
  return workbookFromSheets([{ name: "Horas extra", ws }]);
}
