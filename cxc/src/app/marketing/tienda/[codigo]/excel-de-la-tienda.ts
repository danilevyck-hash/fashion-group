// ============================================================================
// EL EXCEL DE UNA TIENDA (23-sep-2026, Tiendas y Marcas). Sin React.
//
// Baja lo que está en pantalla: los gastos VIVOS de la tienda, por fecha, con
// su tipo, su marca y su monto. 🔴 Sale por `workbookBlob` (regla de todo el
// sistema: encabezados en la fila 1, filtro desde A1, panel fijo). Ningún
// número se calcula acá aparte de la fila de total, que es la misma regla de
// `pieDeLaFicha` (solo lo reportado).
// ============================================================================

import {
  MONEY_FMT,
  buildReportSheet,
  downloadWorkbook,
  exportFilename,
  workbookFromSheets,
} from "@/lib/excel-export";
import type { FilaDeTienda } from "@/lib/marketing/vista-tienda";
import { lineaDelGasto, ordenarPorFecha, pieDeLaFicha, rotuloCortoDeTipo } from "@/lib/marketing/tiendas-y-marcas";

function fechaDe(f: FilaDeTienda): Date | null {
  const s = String(f.fecha ?? "");
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return null;
  const d = new Date(`${s.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function descargarExcelDeLaTienda(nombre: string, codigo: string, vivas: ReadonlyArray<FilaDeTienda>): void {
  const filas = ordenarPorFecha(vivas);
  const pie = pieDeLaFicha(vivas);
  const ws = buildReportSheet({
    columns: [
      { header: "Fecha", wch: 12, fmt: "dd/mm/yyyy" },
      { header: "Tipo", wch: 20 },
      { header: "Gasto", wch: 46 },
      { header: "Detalle", wch: 40 },
      { header: "Marca", wch: 18 },
      { header: "Se reporta", wch: 11, align: "center" },
      { header: "Total", wch: 14, align: "right", fmt: MONEY_FMT },
    ],
    rows: filas.map((f) => {
      const { titulo, detalle } = lineaDelGasto(f);
      return [
        { fecha: fechaDe(f) },
        rotuloCortoDeTipo(f.tipo),
        titulo,
        detalle,
        f.marcaNombre,
        f.seReporta ? "Sí" : "No",
        f.monto,
      ];
    }),
    totals: ["Total reportado", null, null, null, null, null, pie.total],
  });
  const base = ["marketing", codigo || "general", nombre].filter(Boolean).join("-").replace(/[\\/:*?"<>|]+/g, "-");
  downloadWorkbook(workbookFromSheets([{ name: "Gastos", ws }]), exportFilename(base));
}
