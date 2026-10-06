// Guías › «Pedidos» impresos (6-oct-2026). Daniel: poder IMPRIMIR la lista para
// dársela a bodega cuando alguien no tiene celular. Mismo papel de la casa que
// Comisiones (`pdf-chrome`), en blanco y negro, hoja carta. Sin montos: la
// pantalla tampoco los tiene. Un bloque por empresa con su título, para que
// bodega pueda separar la hoja; por pedido, «Entregado por» y «Recibido por»
// para firmar, y al pie de cada bloque la entrega de la hoja con fecha. Se abre en otra pestaña pidiendo imprimir, como
// la nota de entrega (`autoPrint`).

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  ALTO_CABECERA,
  ALTO_CONTINUACION,
  MARGEN,
  PIE,
  asegurarEspacio,
  cabecera,
  finDeTabla,
  piePorHoja,
  textoDePdf,
} from "@/lib/comisiones/pdf-chrome";
import { nombreCortoEmpresa } from "@/lib/empresa-mapping";
import { agruparPorEmpresa, haceDias, vendedorEnPantalla, type PedidoBodega } from "./pedidos-bodega";

const NEGRO: [number, number, number] = [0, 0, 0];
const BLANCO: [number, number, number] = [255, 255, 255];
export const COLUMNAS_PEDIDOS_IMPRESOS = ["Antigüedad", "N° de pedido", "Cliente", "Vendedor", "Entregado por", "Recibido por"] as const;
/** Al pie de cada bloque: la entrega de la hoja entera, firmada a mano. */
export const PIE_DE_BLOQUE = "Entregado por ______________________ · Recibido por ______________________ · Fecha ____________";

export function construirPdfPedidos(titulo: string, pedidos: readonly PedidoBodega[], hoy: string): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  cabecera(doc, titulo);
  let y = ALTO_CABECERA;
  for (const g of agruparPorEmpresa(pedidos)) {
    // Título + encabezado + un renglón juntos: que el título no quede huérfano al pie.
    y = asegurarEspacio(doc, y, 26);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...NEGRO);
    doc.text(textoDePdf(`${nombreCortoEmpresa(g.empresa_key)} · ${g.pedidos.length}`), MARGEN, y + 4);
    autoTable(doc, {
      startY: y + 6,
      margin: { top: ALTO_CONTINUACION, left: MARGEN, right: MARGEN, bottom: PIE },
      theme: "plain", // sin cebra: blanco y negro
      head: [COLUMNAS_PEDIDOS_IMPRESOS.map(textoDePdf)],
      // Las dos últimas van vacías: se firman a mano.
      body: g.pedidos.map((p) =>
        [haceDias(p.fecha, hoy), p.secuencial, p.cliente_nombre, vendedorEnPantalla(p.vendedor_nombre), "", ""].map(textoDePdf),
      ),
      styles: { font: "helvetica", fontSize: 8, cellPadding: 2, textColor: NEGRO, lineColor: NEGRO, lineWidth: 0.1, valign: "middle" },
      headStyles: { fillColor: BLANCO, textColor: NEGRO, fontStyle: "bold", fontSize: 7.5, lineWidth: { bottom: 0.4 } },
      // Renglón alto: hay que poder firmar.
      // Sin relleno: el de la fila siguiente tapaba la raya de abajo.
      bodyStyles: { minCellHeight: 10, lineWidth: { bottom: 0.1 } },
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 24 },
        3: { cellWidth: 28 },
        4: { cellWidth: 30, lineWidth: { bottom: 0.1, left: 0.1 } },
        5: { cellWidth: 30, lineWidth: { bottom: 0.1, left: 0.1 } },
      },
    });
    y = asegurarEspacio(doc, finDeTabla(doc) + 8, 6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...NEGRO);
    doc.text(PIE_DE_BLOQUE, MARGEN, y);
    y += 12;
  }
  piePorHoja(doc);
  return doc;
}
