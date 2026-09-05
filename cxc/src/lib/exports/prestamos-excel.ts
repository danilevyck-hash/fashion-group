// Builder puro del export Excel de Préstamos (I11 — estilo de la casa).
// La route solo hace auth + fetch + workbookBuffer; esto es testeable en vitest.
//
// 🔴 LA CUENTA DEL SALDO NO SE REHACE ACÁ. Hasta el 5-sep-2026 este archivo
// tenía su propio `calcSaldo` —uno de los OCHO lugares que calculaban lo mismo—
// y ahora usa `calcularSaldoPrestamo`, la única. Un Excel que no coincida con la
// pantalla es peor que no tener Excel.
//
// ⚠️ SE FUE LA COLUMNA «Estado». Traducía `pendiente_aprobacion` y `rechazado`,
// dos valores que la pantalla no produce, y en las 443 filas decía siempre
// «Aprobado». Lo que espera aprobación no sale en el historial: no es plata
// todavía, y en un papel sin su contexto se leería como si lo fuera.

import XLSX from "xlsx-js-style";
import {
  MONEY_FMT,
  PCT_FMT,
  buildReportSheet,
  workbookFromSheets,
  type ReportCell,
} from "@/lib/excel-export";
import { fmtDate } from "@/lib/format";
import { etiquetaConcepto } from "@/lib/prestamos-conceptos";
import {
  NOMBRE_CUENTA,
  calcularSaldoPrestamo,
  cuentaDeMovimiento,
  type MovimientoParaSaldo,
} from "@/lib/prestamos-saldo";

export interface MovimientoRow extends MovimientoParaSaldo {
  id: string;
  fecha: string;
  notas: string | null;
  origen_pago?: string | null;
  created_at: string;
}

export interface EmpleadoRow {
  id: string;
  nombre: string;
  empresa: string | null;
  deduccion_quincenal: number;
  deduccion_dano?: number | null;
  prestamos_movimientos: MovimientoRow[];
}

export function buildPrestamosWorkbook(empleados: EmpleadoRow[]): XLSX.WorkBook {

  // ─── Hoja 1: Resumen ───────────────────────────────────────────────────────
  let totPrestado = 0, totPagado = 0, totSaldo = 0, totCuentaP = 0, totCuentaD = 0;
  const resumenRows: ReportCell[][] = empleados.map((emp) => {
    const s = calcularSaldoPrestamo(emp.prestamos_movimientos || []);
    totPrestado += s.prestado;
    totPagado += s.pagado;
    totSaldo += s.saldo;
    totCuentaP += s.cuentas.prestamo.saldo;
    totCuentaD += s.cuentas.dano.saldo;
    return [
      emp.nombre,
      emp.empresa || "",
      Number(emp.deduccion_quincenal),
      Number(emp.deduccion_dano ?? 0),
      s.cuentas.prestamo.saldo,
      s.cuentas.dano.saldo,
      s.prestado,
      s.pagado,
      s.saldo,
      s.pct / 100,
    ];
  });

  const wsResumen = buildReportSheet({
    columns: [
      { header: "Empleado", wch: 30 },
      { header: "Empresa", wch: 25 },
      { header: "Cuota préstamo", wch: 15, align: "right", fmt: MONEY_FMT },
      { header: "Cuota daño", wch: 13, align: "right", fmt: MONEY_FMT },
      { header: "Debe de préstamo", wch: 17, align: "right", fmt: MONEY_FMT },
      { header: "Debe de daño", wch: 15, align: "right", fmt: MONEY_FMT },
      { header: "Total prestado", wch: 16, align: "right", fmt: MONEY_FMT },
      { header: "Total pagado", wch: 16, align: "right", fmt: MONEY_FMT },
      { header: "Debe", wch: 14, align: "right", fmt: MONEY_FMT },
      { header: "% Progreso", wch: 12, align: "right", fmt: PCT_FMT },
    ],
    rows: resumenRows,
    totals: ["TOTALES", null, null, null, totCuentaP, totCuentaD, totPrestado, totPagado, totSaldo, null],
  });

  // ─── Hoja 2: Movimientos ───────────────────────────────────────────────────
  // Por empleado (ASC), luego movimientos (fecha DESC, created_at DESC).
  const movRows: ReportCell[][] = [];
  for (const emp of empleados) {
    const movs = [...(emp.prestamos_movimientos || [])]
      // Lo que espera aprobación NO es plata todavía: no va al historial.
      .filter((m) => m.estado === "aprobado" && m.deleted !== true)
      .sort((a, b) => {
        const f = b.fecha.localeCompare(a.fecha);
        if (f !== 0) return f;
        return (b.created_at || "").localeCompare(a.created_at || "");
      });
    for (const m of movs) {
      movRows.push([
        emp.nombre,
        emp.empresa || "",
        fmtDate(m.fecha.slice(0, 10)),
        etiquetaConcepto(m.concepto),
        NOMBRE_CUENTA[cuentaDeMovimiento(m)],
        Number(m.monto),
        m.origen_pago || "",
        m.notas || "",
      ]);
    }
  }

  const wsMovs = buildReportSheet({
    columns: [
      { header: "Empleado", wch: 30 },
      { header: "Empresa", wch: 25 },
      { header: "Fecha", wch: 12 },
      { header: "Concepto", wch: 22 },
      { header: "Cuenta", wch: 20 },
      { header: "Monto", wch: 14, align: "right", fmt: MONEY_FMT },
      { header: "De dónde salió", wch: 16 },
      { header: "Notas", wch: 40 },
    ],
    rows: movRows,
  });

  return workbookFromSheets([
    { name: "Resumen", ws: wsResumen },
    { name: "Movimientos", ws: wsMovs },
  ]);
}
