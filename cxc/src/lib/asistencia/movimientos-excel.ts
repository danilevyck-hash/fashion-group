// ─────────────────────────────────────────────────────────────────────────────
// EL EXCEL DE «MOVIMIENTOS DE LA QUINCENA».
//
// 🔑 NO ES UNA SEGUNDA CUENTA. Recibe las MISMAS filas ya agrupadas que la
// pantalla tiene en la mano (`agruparMovimientos`), así que el archivo y la
// pantalla no pueden decir números distintos. Acá solo se acomodan en filas.
//
// 🔴 BAJA LO QUE ESTÁ EN PANTALLA, y eso incluye el filtro de empresa: las
// filas llegan ya recortadas. La empresa va además en el nombre del archivo
// (`nombreArchivoPorEmpresa`), como en el resto del módulo.
//
// ⚠️ LOS MONTOS VAN COMO NÚMERO, con `MONEY_FMT`, nunca como texto: lo primero
// que alguien hace con esta hoja es sumar una columna.
// ─────────────────────────────────────────────────────────────────────────────

import {
  MONEY_FMT,
  buildReportSheet,
  workbookFromSheets,
  type ReportCell,
  type ReportColumn,
} from "@/lib/excel-export";
import { capitalizarNombre } from "@/lib/nombre-en-pantalla";
import { nombreCortoEmpresa } from "@/lib/empresa-mapping";
import {
  NOMBRE_BLOQUE, rotuloDeLaVariacion,
  type FilaMovimiento, type MovimientosAgrupados,
} from "./movimientos-quincena";

const COLUMNAS: ReportColumn[] = [
  { header: "Bloque", wch: 15 },
  { header: "Colaborador", wch: 30 },
  { header: "Código", wch: 9, align: "center" },
  { header: "Empresa", wch: 22 },
  { header: "Concepto", wch: 24 },
  { header: "Monto", wch: 12, align: "right", fmt: MONEY_FMT },
  { header: "Fecha", wch: 12, align: "center" },
  { header: "Origen", wch: 18 },
];

function fila(f: FilaMovimiento, bloque: string): ReportCell[] {
  return [
    bloque,
    capitalizarNombre(f.nombre),
    f.codigo ?? "",
    f.empresa ? nombreCortoEmpresa(f.empresa) : "",
    f.etiqueta,
    f.monto,
    f.fecha,
    f.origenEtiqueta,
  ];
}

export interface OpcionesExcelMovimientos {
  agrupado: MovimientosAgrupados;
  /** «16 al 30 de agosto de 2026» — va en el título de la hoja. */
  etiquetaQuincena: string;
  /** «Todas» o el nombre corto de la empresa elegida. */
  etiquetaEmpresa: string;
}

/**
 * 🔴 UNA SOLA HOJA, CON LOS DOS BLOQUES UNO DEBAJO DEL OTRO y la columna
 * «Bloque» para separarlos. Dos hojas obligarían a sumar a mano para saber
 * cuánto se movió la deuda, que es justamente el número que no existía.
 */
export function construirExcelMovimientos(opts: OpcionesExcelMovimientos) {
  const { descuentos, deudas, resumen } = opts.agrupado;
  const rows: ReportCell[][] = [
    ...descuentos.map((f) => fila(f, NOMBRE_BLOQUE.descuento)),
    ...deudas.map((f) => fila(f, NOMBRE_BLOQUE.deuda)),
  ];

  const ws = buildReportSheet({
    columns: COLUMNAS,
    rows,
    titulo: `Movimientos de préstamos · ${opts.etiquetaQuincena} · ${opts.etiquetaEmpresa}`,
    // 🔴 EL PIE VA EN LA FILA DE TOTALES, que queda FUERA del filtro: filtrar
    // por bloque no lo esconde. Y dice las TRES cosas con las mismas palabras
    // de la pantalla — «creció» o «bajó», con el monto siempre en positivo.
    totals: [
      "Resumen",
      "", "", "",
      `${NOMBRE_BLOQUE.descuento} ${dinero(resumen.descuentos.total)} (${resumen.descuentos.cuantos})`
        + ` · ${NOMBRE_BLOQUE.deuda} ${dinero(resumen.deudas.total)} (${resumen.deudas.cuantos})`,
      Math.abs(resumen.variacion),
      "",
      rotuloDeLaVariacion(resumen.variacion),
    ],
  });

  return workbookFromSheets([{ name: "Movimientos", ws }]);
}

function dinero(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
