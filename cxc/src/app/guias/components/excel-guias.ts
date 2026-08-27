// ─────────────────────────────────────────────────────────────────────────────
// EL EXCEL DE GUÍAS — **UNA FILA POR ENVÍO** (25-ago-2026).
//
// Daniel, punto 7: *"Pasa a una fila por ENVÍO: cada una con su N° de
// transportista, su cliente y su factura"*.
//
// 🩸 LO QUE PASABA: una fila por GUÍA, con todo apretado en la misma celda.
// GT-229 salía con `725, 724, 726` en «N° Guía Transp.», los tres clientes
// resumidos como *"America Clasic y 3 mas"* y las facturas de los cuatro
// envíos pegadas con comas en un solo cuadrito. Este reporte es el que se usa
// para RECLAMARLE AL TRANSPORTISTA, y para eso hay que poder cruzar **su**
// número con **esa** factura y **ese** cliente. Con los tres amontonados no se
// puede: no se sabe cuál va con cuál.
//
// 🔴 LO QUE NO CAMBIÓ, y es lo que hace que el reporte siga siendo el mismo:
//   · **Las columnas de antes están todas** — N° Guía · Fecha · Transportista ·
//     Cliente · Empresa · Facturas · Bultos · Estado · N° Guía Transp.
//   · **Los bultos siguen sumando lo mismo.** El total de abajo es el de
//     siempre: la suma por guía y la suma por envío dan el mismo número, porque
//     `total_bultos` se calcula sumando los renglones.
//   · **El N° del transportista sale de LOS RENGLONES**, con la herencia de la
//     cabecera para las guías viejas y el `"0"` pelado tratado como vacío
//     (`numeroTranspImpreso`) — las mismas dos reglas que aplican el papel, el
//     PDF y el chip ámbar. Lo que cambia es que ahora cada fila lleva **el
//     suyo**, no la lista de todos.
//   · Los colores de estado, la banda navy del total y el helper estándar
//     (`src/lib/excel-export.ts`) siguen igual.
//
// ⚠️ UNA GUÍA SIN RENGLONES SIGUE SALIENDO, en una fila con los campos del
// envío vacíos. Que una guía desaparezca de un reporte porque le falta el
// detalle es peor que verla vacía: así se sabe que existe y que le falta algo.
// ─────────────────────────────────────────────────────────────────────────────

import {
  buildReportSheet,
  workbookFromSheets,
  downloadWorkbook,
  exportFilename,
  fmtFechaExcel,
  CASA_PALETTE,
  type ReportCell,
  type ReportColumn,
} from "@/lib/excel-export";
import XLSX from "xlsx-js-style";
import { numeroTranspImpreso } from "@/lib/guias/modo-despacho";
import type { Guia, GuiaItem } from "./types";

function fmtGuia(n: number) {
  return `GT-${String(n).padStart(3, "0")}`;
}

// El rojo de "Rechazada" se fue con el rechazo (14-ago-2026): ese estado ya no
// se puede crear desde la app y no existe en producción (0 de 186 guías).
function estadoColor(estado: string | undefined): string {
  return estado === "Completada" ? "15803D" : "C2410C";
}

const COLUMNS: ReportColumn[] = [
  { header: "N° Guía", wch: 12 },
  { header: "Fecha", wch: 12 },
  { header: "Transportista", wch: 20 },
  // La columna NUEVA: dice cuál de los envíos de la guía es esta fila. Sin
  // ella, cuatro filas seguidas con el mismo GT-229 se leen como un error del
  // reporte en vez de como los cuatro destinos de un mismo viaje.
  { header: "Envío", wch: 8, align: "right" },
  { header: "Cliente", wch: 24 },
  { header: "Destino", wch: 20 },
  { header: "Empresa", wch: 20 },
  { header: "Facturas", wch: 28 },
  { header: "Bultos", wch: 10, align: "right" },
  { header: "N° Guía Transp.", wch: 18 },
  { header: "Estado", wch: 16 },
];

/** Las celdas de UNA fila: la guía a la izquierda, el envío a la derecha. */
function filaDeEnvio(
  g: Guia,
  item: GuiaItem | null,
  posicion: number | null,
  totalEnvios: number,
): ReportCell[] {
  return [
    { v: fmtGuia(g.numero), fg: CASA_PALETTE.pri, bold: true, sz: 10 },
    { v: fmtFechaExcel(g.fecha), fg: "555555", sz: 9 },
    g.transportista || "",
    // "2 de 4" dice de un vistazo cuántos envíos lleva la guía, así que un
    // renglón salteado se ve sin tener que contar filas.
    { v: posicion === null ? "" : `${posicion} de ${totalEnvios}`, sz: 9, fg: "888888" },
    { v: item?.cliente || "", sz: 9, fg: "444444" },
    { v: item?.direccion || "", sz: 9, fg: "666666" },
    { v: item?.empresa || "", sz: 9, fg: "555555" },
    { v: item?.facturas || "", sz: 9, fg: "666666" },
    item?.bultos || 0,
    // 🔴 EL N° DE **ESTA** LÍNEA, no la lista de los de la guía. Es lo que hace
    // que el reporte sirva para reclamar: este número, esta factura, este
    // cliente, en la misma fila. La herencia de la cabecera y el "0" pelado los
    // resuelve `numeroTranspImpreso`, igual que el papel.
    {
      v: numeroTranspImpreso(item?.numero_guia_transp, g.numero_guia_transp) || "—",
      sz: 9,
      fg: "555555",
    },
    { v: g.estado || "", sz: 9, fg: estadoColor(g.estado) },
  ];
}

/** Construcción pura de la hoja (sin DOM) — testeable. */
export function buildGuiasSheet(guias: Guia[]): XLSX.WorkSheet {
  const rows: ReportCell[][] = [];
  let envios = 0;

  for (const g of guias) {
    const items = g.guia_items || [];
    if (items.length === 0) {
      rows.push(filaDeEnvio(g, null, null, 0));
      continue;
    }
    items.forEach((item, i) => {
      envios++;
      rows.push(filaDeEnvio(g, item, i + 1, items.length));
    });
  }

  // El total de bultos es el MISMO de siempre: `total_bultos` de cada guía ya
  // es la suma de sus renglones, así que sumar por guía o por envío da igual.
  // Se sigue sumando por guía a propósito — una guía sin renglones cargados
  // conserva su total, y contarla por envío la dejaría en cero.
  const totalBultos = guias.reduce((s, g) => s + (g.total_bultos || 0), 0);

  return buildReportSheet({
    columns: COLUMNS,
    rows,
    totals: [
      `${guias.length} guías`,
      null,
      null,
      `${envios} envíos`,
      null,
      null,
      null,
      null,
      totalBultos,
      null,
      null,
    ],
  });
}

export function exportGuiasExcel(guias: Guia[]) {
  const wb = workbookFromSheets([{ name: "Guías", ws: buildGuiasSheet(guias) }]);
  downloadWorkbook(wb, exportFilename("guias-transporte"));
}
