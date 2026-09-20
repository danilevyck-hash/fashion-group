// ─────────────────────────────────────────────────────────────────────────────
// EL EXCEL DE PROVEEDORES — LA MISMA FORMA QUE LA PANTALLA (20-sep-2026).
//
// 🔴 *«si así se ve el módulo, así mismo se debe de descargar»*. La pantalla
// pasó a ser las siete empresas con sus proveedores adentro, así que la hoja
// también: una fila por EMPRESA, en negrita, y debajo sus proveedores. Los
// cuatro tramos de edad y el «Por pagar», y al pie el total del grupo.
//
// 🩸 **Y LA FECHA VA COMO FECHA.** La columna «Último pago» decía «hace 13d»:
// un texto que no se puede ordenar, ni filtrar por rango, ni restar — y que
// además envejecía mal, porque el archivo guardado el mes pasado sigue
// diciendo «hace 13d». Ahora va la fecha real (`fmtFechaExcel`, dd/mm/yyyy),
// que es lo que el archivo puede afirmar para siempre.
//
// ⚠️ Sale lo que está EN PANTALLA, completo: las siete empresas, sus
// proveedores con saldo Y los que están en cero. Un archivo no se recorta por
// lo que esté plegado.
// ─────────────────────────────────────────────────────────────────────────────

import {
  buildReportSheet,
  workbookFromSheets,
  downloadWorkbook,
  fmtFechaExcel,
  MONEY_FMT,
  type ReportCell,
  type ReportColumn,
} from "@/lib/excel-export";
// Solo el TIPO: el valor XLSX vive dentro de @/lib/excel-export. Un import de
// valor acá volvería a anclar la librería al grafo de quien importe este módulo.
import type XLSX from "xlsx-js-style";
import { TRAMOS, TRAMOS_KEYS } from "@/lib/proveedores/tramos";
import { textoTambienEn, type CarteraCxp } from "@/lib/proveedores/por-empresa";

// Los encabezados de los tramos salen de la MISMA lista que la pantalla: una
// segunda copia es cómo la hoja termina diciendo tramos que ya no existen.
const COLUMNS: ReportColumn[] = [
  { header: "Empresa / Proveedor", wch: 38 },
  ...TRAMOS.map((t): ReportColumn => ({ header: t.label, wch: 14, align: "right", fmt: MONEY_FMT })),
  { header: "Por pagar", wch: 15, align: "right", fmt: MONEY_FMT },
  { header: "Le debes", wch: 14, align: "right", fmt: MONEY_FMT },
  { header: "Tienes a favor", wch: 14, align: "right", fmt: MONEY_FMT },
  { header: "Último pago", wch: 13, align: "right" },
  { header: "También en", wch: 34 },
];

/** Construcción pura de la hoja (sin DOM) — testeable. */
export function buildProveedoresSheet(cartera: CarteraCxp): XLSX.WorkSheet {
  const data: ReportCell[][] = [];

  for (const e of cartera.empresas) {
    data.push([
      { v: e.nombre, bold: true },
      ...TRAMOS_KEYS.map((k) => ({ v: e.tramos[k], bold: true })),
      { v: e.saldo.por_pagar, bold: true },
      { v: e.saldo.debes, bold: true },
      { v: e.saldo.a_favor, bold: true },
      null,
      null,
    ]);
    // Con saldo primero y los que están en cero después, igual que la pantalla.
    for (const p of [...e.proveedores, ...e.sin_saldo]) {
      data.push([
        // La sangría dice que cuelga de la empresa de arriba.
        { v: `    ${p.nombre}`, fg: "555555" },
        ...TRAMOS_KEYS.map((k) => p.tramos[k]),
        p.saldo.por_pagar,
        p.saldo.debes,
        p.saldo.a_favor,
        // 🔴 La FECHA, no «hace N días».
        { v: fmtFechaExcel(p.ultimo_pago_fecha), fg: "555555" },
        { v: textoTambienEn(p.tambien_en) ?? "", fg: "555555" },
      ]);
    }
  }

  return buildReportSheet({
    columns: COLUMNS,
    rows: data,
    totals: [
      "Total",
      ...TRAMOS_KEYS.map((k) => cartera.total.tramos[k]),
      cartera.total.saldo.por_pagar,
      cartera.total.saldo.debes,
      cartera.total.saldo.a_favor,
      null,
      null,
    ],
  });
}

export function exportProveedoresExcel(cartera: CarteraCxp) {
  const wb = workbookFromSheets([{ name: "Proveedores", ws: buildProveedoresSheet(cartera) }]);
  const date = new Date().toISOString().slice(0, 10);
  downloadWorkbook(wb, `Proveedores_${date}.xlsx`);
}
