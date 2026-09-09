// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LAS DOS DESCARGAS DE CUENTAS POR COBRAR, EN EXCEL (8-sep-2026).
//
// Por el estándar de la casa (`buildReportSheet` + `workbookBytes`): título en
// la fila 1, fila 2 VACÍA, encabezados en la 3 con **filtro** y **fila fija**, y
// los montos como NÚMERO con formato `$#,##0.00` — nunca el texto `"$1,234.56"`,
// que rompe sumar y ordenar.
//
// 🔴 EN EL DETALLADO, EL CÓDIGO Y EL NOMBRE SE REPITEN EN CADA RENGLÓN. En el
// papel las compañías van adentro del cliente; acá no: una hoja con el nombre
// puesto una sola vez no se puede filtrar por cliente ni pasar a tabla dinámica,
// que es para lo que se baja el Excel. Es la MISMA lista de `descargas.ts` —los
// dos formatos leen las mismas filas—, dibujada como la usa Excel.
//
// ⚠️ La fila de Total al pie queda FUERA del filtro (lo decide
// `buildReportSheet`): filtrar no la esconde ni la suma como si fuera un cliente.
// ─────────────────────────────────────────────────────────────────────────────
import {
  buildReportSheet,
  workbookFromSheets,
  MONEY_FMT,
  type ReportCell,
  type ReportColumn,
} from "@/lib/excel-export";
import { tramoLabel } from "@/lib/cxc-aging";
import {
  totalDeLasFilas,
  type BloqueCliente,
  type FilaCliente,
} from "./descargas";

/** Las tres columnas de tramo, con el nombre que usa toda la pantalla. */
const COLS_TRAMO: ReportColumn[] = [
  { header: tramoLabel("current"), wch: 16, align: "right", fmt: MONEY_FMT },
  { header: tramoLabel("watch"), wch: 18, align: "right", fmt: MONEY_FMT },
  { header: tramoLabel("overdue"), wch: 18, align: "right", fmt: MONEY_FMT },
  { header: "Total", wch: 16, align: "right", fmt: MONEY_FMT },
];

/** «Total por cliente»: un renglón por cliente. */
export function libroTotalPorCliente(filas: FilaCliente[], titulo: string) {
  const columns: ReportColumn[] = [
    { header: "Código", wch: 10 },
    { header: "Cliente", wch: 38 },
    ...COLS_TRAMO,
  ];
  const rows: ReportCell[][] = filas.map((f) => [f.codigo, f.nombre, f.t0, f.t1, f.t2, f.total]);
  const t = totalDeLasFilas(filas);
  const ws = buildReportSheet({
    titulo,
    columns,
    rows,
    totals: ["", "Total", t.t0, t.t1, t.t2, t.total],
  });
  return workbookFromSheets([{ name: "Cartera", ws }]);
}

/** «Detallado por compañía»: un renglón por cliente Y compañía. */
export function libroPorCompania(bloques: BloqueCliente[], titulo: string) {
  const columns: ReportColumn[] = [
    { header: "Código", wch: 10 },
    { header: "Cliente", wch: 38 },
    { header: "Compañía", wch: 22 },
    ...COLS_TRAMO,
  ];
  const rows: ReportCell[][] = [];
  for (const b of bloques) {
    for (const e of b.empresas) {
      rows.push([b.codigo, b.nombre, e.empresa, e.t0, e.t1, e.t2, e.total]);
    }
  }
  const t = totalDeLasFilas(bloques);
  const ws = buildReportSheet({
    titulo,
    columns,
    rows,
    totals: ["", "", "Total", t.t0, t.t1, t.t2, t.total],
  });
  return workbookFromSheets([{ name: "Cartera por compañía", ws }]);
}
