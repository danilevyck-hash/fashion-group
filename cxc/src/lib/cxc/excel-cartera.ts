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
  ROTULO_TOTAL_GENERAL,
  ROTULO_TOTAL_POR_COBRAR,
  rotuloSaldoAFavor,
  totalDeLasFilas,
  totalGeneral,
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

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EL SALDO A FAVOR TIENE SU PROPIO BLOQUE, Y LA HOJA CIERRA CON EL TOTAL DE
// LA PANTALLA (20-sep-2026).
//
// 🩸 El Excel decía **$4.244.028,67** y la pantalla **$4.242.821,12**: los **5
// clientes con saldo a favor** ($1.207,55) salían de la hoja sin que nada lo
// dijera. Ahora la hoja lleva, en ese orden: los que se cobran · una fila «Total
// por cobrar» · el rótulo «Saldo a favor (N)» · sus renglones · y al pie, fuera
// del filtro, el «Total general» — el número de la pantalla.
//
// ⚠️ Sin nadie a favor la hoja sale EXACTAMENTE como antes: sus filas y una sola
// fila «Total».
// ─────────────────────────────────────────────────────────────────────────────

/** Una celda de texto en negrita, para los rótulos de bloque de adentro de la tabla. */
const fuerte = (v: string): ReportCell => ({ v, bold: true });

/** La fila que suma un bloque, con el rótulo en la columna del cliente. */
function filaDeSuma(rotulo: string, antes: number, t: { t0: number; t1: number; t2: number; total: number }): ReportCell[] {
  const vacias: ReportCell[] = Array.from({ length: antes }, () => "");
  return [...vacias, fuerte(rotulo), { v: t.t0, bold: true }, { v: t.t1, bold: true }, { v: t.t2, bold: true }, { v: t.total, bold: true }];
}

/** «Total por cliente»: un renglón por cliente. */
export function libroTotalPorCliente(filas: FilaCliente[], aFavor: FilaCliente[], titulo: string) {
  const columns: ReportColumn[] = [
    { header: "Código", wch: 10 },
    { header: "Cliente", wch: 38 },
    ...COLS_TRAMO,
  ];
  const renglon = (f: FilaCliente): ReportCell[] => [f.codigo, f.nombre, f.t0, f.t1, f.t2, f.total];
  const rows: ReportCell[][] = filas.map(renglon);
  if (aFavor.length > 0) {
    rows.push(filaDeSuma(ROTULO_TOTAL_POR_COBRAR, 1, totalDeLasFilas(filas)));
    rows.push(["", fuerte(rotuloSaldoAFavor(aFavor.length))]);
    for (const f of aFavor) rows.push(renglon(f));
  }
  const t = aFavor.length > 0 ? totalGeneral(filas, aFavor) : totalDeLasFilas(filas);
  const ws = buildReportSheet({
    titulo,
    columns,
    rows,
    totals: ["", aFavor.length > 0 ? ROTULO_TOTAL_GENERAL : "Total", t.t0, t.t1, t.t2, t.total],
  });
  return workbookFromSheets([{ name: "Cartera", ws }]);
}

/** «Detallado por compañía»: un renglón por cliente Y compañía. */
export function libroPorCompania(bloques: BloqueCliente[], aFavor: BloqueCliente[], titulo: string) {
  const columns: ReportColumn[] = [
    { header: "Código", wch: 10 },
    { header: "Cliente", wch: 38 },
    { header: "Compañía", wch: 22 },
    ...COLS_TRAMO,
  ];
  const rows: ReportCell[][] = [];
  const renglones = (lista: BloqueCliente[]) => {
    for (const b of lista) {
      for (const e of b.empresas) {
        rows.push([b.codigo, b.nombre, e.empresa, e.t0, e.t1, e.t2, e.total]);
      }
    }
  };
  renglones(bloques);
  if (aFavor.length > 0) {
    rows.push(filaDeSuma(ROTULO_TOTAL_POR_COBRAR, 2, totalDeLasFilas(bloques)));
    rows.push(["", "", fuerte(rotuloSaldoAFavor(aFavor.length))]);
    renglones(aFavor);
  }
  const t = aFavor.length > 0 ? totalGeneral(bloques, aFavor) : totalDeLasFilas(bloques);
  const ws = buildReportSheet({
    titulo,
    columns,
    rows,
    totals: ["", "", aFavor.length > 0 ? ROTULO_TOTAL_GENERAL : "Total", t.t0, t.t1, t.t2, t.total],
  });
  return workbookFromSheets([{ name: "Cartera por compañía", ws }]);
}
