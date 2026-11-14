// n.º 12 (revisión 110): los Excel de Ventas con la forma del sistema,
// «Documento-Detalle-AAAA-MM-DD» (la de Guia-, Reclamo-, Pedido-), con la fecha
// de la DESCARGA en Panamá. Apagado (`VENTAS_EXCEL_NOMBRE_DEL_SISTEMA`), el
// nombre de antes.
import { hoyPanama } from "@/lib/fecha-panama";
import { VENTAS_EXCEL_NOMBRE_DEL_SISTEMA } from "@/lib/ui/revision-110-ventas";

/** «Ventas-Resumen-2026-11-14.xlsx». Cada parte se limpia de espacios y símbolos. */
export function nombreExcelVentas(partes: readonly string[], antes: string, hoy: string = hoyPanama()): string {
  if (!VENTAS_EXCEL_NOMBRE_DEL_SISTEMA) return antes;
  const limpias = partes
    .map((p) => p.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, ""))
    .filter(Boolean);
  return `${["Ventas", ...limpias].join("-")}-${hoy}.xlsx`;
}
