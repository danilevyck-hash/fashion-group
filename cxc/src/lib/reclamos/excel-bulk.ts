import XLSX from "xlsx-js-style";
import { buildReclamoSheet, type OpcionesHojaReclamo } from "@/lib/excel-reclamo";
import { reclamoTaxes, TASA_IMPORTACION, TASA_ITBMS, FACTOR_TOTAL } from "@/lib/reclamos/tax";
import { facturasEnPantalla } from "@/lib/reclamos/facturas";
import { fechaDeLaCabecera } from "@/lib/reclamos/papel";
import { fmtDate } from "@/lib/format";
import {
  buildReportSheet,
  workbookFromSheets,
  workbookBuffer,
  MONEY_FMT,
  type ReportCell,
} from "@/lib/excel-export";

interface ReclamoItem {
  referencia?: string;
  descripcion?: string;
  talla?: string;
  cantidad?: number;
  precio_unitario?: number;
  motivo?: string;
  nro_factura?: string;
  nro_orden_compra?: string;
}

interface ReclamoFoto {
  url?: string;
  storage_path: string;
}

interface ReclamoFull {
  id: string;
  nro_reclamo?: string;
  empresa?: string;
  proveedor?: string;
  marca?: string;
  nro_factura?: string;
  nro_orden_compra?: string;
  fecha_reclamo?: string;
  /** La fecha de la FACTURA del proveedor — la que mide los días y la que sale
   *  en las dos hojas del archivo (20-sep-2026). */
  fecha_factura?: string | null;
  estado?: string;
  notas?: string;
  factura_pdf_path?: string | null;
  reclamo_items?: ReclamoItem[];
  reclamo_fotos?: ReclamoFoto[];
}

interface Contacto {
  nombre?: string;
  /** El nombre de la persona con quien se habla — entra a la ficha del papel. */
  nombre_contacto?: string;
  correo?: string;
}

/**
 * Hoja "Resumen" — reporte tabular estándar de la casa (buildReportSheet).
 *
 * 🔴 SIN LAS DOS COLUMNAS DE LINKS (11-sep-2026, Daniel: *«sin links»*).
 * Llevaba «Factura PDF» —una URL firmada por un año contra el bucket privado—
 * y «Fotos» —la galería pública por token—, las dos dentro de un archivo que
 * se reenvía. La columna «# Fotos» SE QUEDA: es un dato, no un camino a un
 * archivo.
 *
 * 🔴 SIN LA COLUMNA «ESTADO» (20-sep-2026). Imprimía nuestras palabras de
 * adentro —«Creado» en 19 de los 33 reclamos vivos, «Pagado» en 14—, y las dos
 * le mienten a un proveedor extranjero: «Creado» no le dice nada, y «Pagado»
 * se lee al revés de lo que significa (acá quiere decir que el proveedor YA
 * acreditó; él puede entender que se le pagó a él). Adentro del sistema el
 * estado se sigue viendo igual: lo que cambia es el archivo que SALE.
 *
 * 🔴 UNA SOLA FECHA EN TODO EL ARCHIVO, LA DE LA FACTURA (20-sep-2026). Esta
 * hoja fechaba por `fecha_reclamo` y las hojas de detalle por `fecha_factura`:
 * dos reglas distintas adentro del mismo Excel. Manda la de la factura, que es
 * la que mide los días desde el rediseño — y sale por `fechaDeLaCabecera`, el
 * mismo módulo del papel, así que las dos hojas no se pueden volver a separar.
 * Escrita con el `fmtDate` de la casa («26 ago 2026»), igual que el detalle y
 * que el PDF.
 */
function buildResumenSheet(reclamos: ReclamoFull[]): XLSX.WorkSheet {
  let grandSub = 0;
  let grandImp = 0;
  let grandItbms = 0;
  let grandTotal = 0;
  let grandFotos = 0;

  const rows: ReportCell[][] = reclamos.map((rec, idx) => {
    const items = rec.reclamo_items || [];
    const sub = items.reduce(
      (s, i) => s + (Number(i.cantidad) || 0) * (Number(i.precio_unitario) || 0),
      0,
    );
    // Impuestos por empresa (Active Shoes: importación 15%, sin ITBMS).
    const tx = reclamoTaxes(rec.empresa, sub);
    const nFotos = (rec.reclamo_fotos || []).length;
    grandSub += sub;
    grandImp += tx.importacion;
    grandItbms += tx.itbms;
    grandTotal += tx.total;
    grandFotos += nFotos;

    const fila: ReportCell[] = [
      { v: rec.nro_reclamo || "", bold: true },
      facturasEnPantalla(rec.nro_factura),
      fmtDate(fechaDeLaCabecera(rec) ?? ""),
      sub,
      tx.importacion,
      tx.itbms,
      { v: tx.total, bold: true },
      nFotos,
    ];
    return fila;
  });

  const ws = buildReportSheet({
    columns: [
      { header: "N° Reclamo", wch: 16 },
      { header: "Factura", wch: 18 },
      { header: "Fecha", wch: 14, align: "center" },
      { header: "Subtotal", wch: 14, align: "right", fmt: MONEY_FMT },
      { header: "Importación", wch: 14, align: "right", fmt: MONEY_FMT },
      { header: "ITBMS", wch: 14, align: "right", fmt: MONEY_FMT },
      { header: "Total", wch: 16, align: "right", fmt: MONEY_FMT },
      { header: "# Fotos", wch: 9, align: "center" },
    ],
    rows,
    totals: ["TOTAL GENERAL", null, null, grandSub, grandImp, grandItbms, grandTotal, grandFotos],
  });

  return ws;
}

function safeSheetName(name: string, used: Set<string>): string {
  let base = (name || "Reclamo").replace(/[\\/?*[\]:]/g, "_").slice(0, 31).trim() || "Reclamo";
  let candidate = base;
  let n = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = `_${n}`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
    n++;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

export async function buildBulkReclamosExcel(
  reclamos: ReclamoFull[],
  // Este parámetro no se usa: la empresa que sale en cada hoja es la DEL
  // RECLAMO (`rec.empresa`), no la del filtro — un lote puede traer reclamos de
  // una sola empresa, pero el papel tiene que decir la suya. Se conserva en la
  // firma porque la pasan las 3 rutas que arman este Excel.
  _empresa: string,
  contacto: Contacto | null,
  opts: OpcionesHojaReclamo = {},
): Promise<Buffer> {
  // 🔴 NO SE FIRMA NADA (11-sep-2026): el Excel ya no lleva links, así que
  // firmar una URL de un año contra el bucket privado sería regalar un acceso
  // por si acaso. Con esto se retiró `adjuntarFacturaUrls`, que quedó sin un
  // solo lector.
  const recs = reclamos;
  const used = new Set<string>();
  const sheets: { name: string; ws: XLSX.WorkSheet }[] = [];

  // La hoja "Resumen" solo aporta con 2+ reclamos (es un consolidado). Con un
  // solo reclamo el Excel lleva únicamente la hoja de ese reclamo.
  if (recs.length >= 2) {
    sheets.push({ name: safeSheetName("Resumen", used), ws: buildResumenSheet(recs) });
  }

  for (const rec of recs) {
    const items = (rec.reclamo_items || []) as Record<string, unknown>[];
    const fotos = (rec.reclamo_fotos || []) as ReclamoFoto[];
    const sheet = buildReclamoSheet(rec as unknown as Record<string, unknown>, items, fotos, {
      contacto: contacto ?? null,
    });
    sheets.push({ name: safeSheetName(rec.nro_reclamo || "Reclamo", used), ws: sheet });
  }

  return workbookBuffer(workbookFromSheets(sheets));
}

export function reclamoBulkConstants() {
  return { TASA_IMPORTACION, TASA_ITBMS, FACTOR_TOTAL };
}

export type { ReclamoFull, OpcionesHojaReclamo };
