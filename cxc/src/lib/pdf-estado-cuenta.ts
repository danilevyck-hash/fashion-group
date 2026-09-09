// ─────────────────────────────────────────────────────────────────────────────
// EL ESTADO DE CUENTA QUE SE LE MANDA AL CLIENTE — CON LA FORMA DE SWITCH
// (9-sep-2026).
//
// Daniel, textual: *«el sistema debe de mandar el estado de cuenta tal cual como
// sale en Switch cuando descargas el historial. Mismos números, mismos nombres,
// mismo todo!!!!»* — y, preguntado si copiábamos la historia completa o solo la
// FORMA con los documentos abiertos, eligió lo segundo. Es lo mismo que hace el
// botón del avioncito de Switch, que «envía el estado de cuenta pendiente».
//
// 🩸 CÓMO ESTABA. El papel llevaba seis columnas propias —Documento · Tipo ·
// Fecha · Días · Monto · Saldo—, ninguna de las diez de Switch, y le decía al
// cliente un número que él no podía parear con el papel que ya recibe de
// nosotros. Además salía con el nombre en MAYÚSCULAS («CITY MALL PASO CANOA»),
// porque la pantalla le pasaba el nombre NORMALIZADO, que existe para parear y
// no para leerse.
//
// 🔴 LAS CINCO DECISIONES DE DANIEL, respetadas una por una:
//   1. Solo los documentos ABIERTOS. Medido en D-25 · Fashion Wear: 31 contra
//      los 1.354 que imprime Switch, y el total cuadra igual — $130.699,36.
//   2. LOS TRES TRAMOS de la pantalla, no los ocho de Switch.
//   3. Un documento por compañía, como ya era.
//   4. TODOS los documentos: nada se pliega por ser de menos de $50.
//   5. El nombre como lo escribe Switch, no en mayúsculas.
//
// Las decisiones viven en `lib/cxc/estado-cuenta-switch.ts` (puro) y el dibujo
// en `lib/cxc/pdf-estado-cuenta-hoja.ts`. Acá solo se arman los dos papeles.
// ─────────────────────────────────────────────────────────────────────────────

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { FICHA_CLIENTE_VACIA, type EstadoCuenta } from "@/lib/cxc/estado-cuenta-tipos";
import { monto, nombreDelPapel } from "@/lib/cxc/estado-cuenta-switch";
import {
  MARGEN,
  FOOTER_RESERVA_MM,
  dibujarCabeza,
  dibujarFichaCliente,
  dibujarDocumentos,
  dibujarPie,
  dibujarRecibidoConforme,
  dibujarPieDeLaCasa,
} from "@/lib/cxc/pdf-estado-cuenta-hoja";

/** Y de arranque de un bloque, saltando de página si no cabe entero. */
export function yParaTotal(doc: jsPDF, y: number, alto = 9): number {
  const h = doc.internal.pageSize.getHeight();
  if (y + alto > h - FOOTER_RESERVA_MM) {
    doc.addPage();
    return 20;
  }
  return y;
}

/**
 * Dibuja el estado de cuenta de UN cliente: una hoja por compañía, cada una con
 * su cabeza, su ficha, sus documentos, sus tres tramos, su Total General y su
 * «RECIBIDO CONFORME». Devuelve el total del cliente.
 *
 * 🔴 UNA COMPAÑÍA POR HOJA, siempre — la decisión 3 de Daniel. Con una sola
 * compañía (el caso del correo, que manda un PDF por empresa) es una hoja y
 * nada cambia.
 */
function dibujarCliente(doc: jsPDF, data: EstadoCuenta, nombreDeLaPantalla: string): number {
  const nombre = nombreDelPapel(data.clienteNombre, nombreDeLaPantalla);
  // Falla ABIERTO: sin ficha del cliente el papel sale igual, con esas líneas en
  // blanco. Un estado de cuenta que no se puede generar es peor que uno al que
  // le falta el teléfono.
  const ficha = data.cliente ?? FICHA_CLIENTE_VACIA;
  let total = 0;

  data.empresas.forEach((emp, i) => {
    if (i > 0) doc.addPage();
    let y = dibujarCabeza(doc, emp.empresa_key, emp.empresa_nombre);
    y = dibujarFichaCliente(doc, y, nombre, data.codigo, ficha);
    const docs = dibujarDocumentos(doc, y, emp);
    total += docs.total;
    y = dibujarPie(doc, docs.y, emp, docs.total);
    dibujarRecibidoConforme(doc, y);
  });

  return Math.round(total * 100) / 100;
}

export function buildEstadoCuentaPDF(data: EstadoCuenta, nombre: string): { doc: jsPDF; filename: string } {
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  dibujarCliente(doc, data, nombre);
  dibujarPieDeLaCasa(doc);

  const iso = new Date().toISOString().slice(0, 10);
  return { doc, filename: `Estado-cuenta-${data.codigo}-${iso}.pdf` };
}

// ─────────────────────────────────────────────────────────────────────────────
// EL PDF DE UN CORREO COMPARTIDO — UNA HOJA POR CLIENTE Y UN RESUMEN AL FINAL.
//
// 🔴 POR QUÉ EXISTE (5-sep-2026). Trece clientes distintos comparten
// `oficina@citymoda.store` y deben $402.376,67 entre todos; los dos City Mall
// comparten `contabilidad@citymall.com.pa` con $480.784,72. Mandar un correo por
// CLIENTE le pone trece mensajes en la bandeja a la misma persona el mismo
// minuto, cada uno con un pedazo del saldo y ninguno con la cuenta completa.
//
// ⚠️ Los números salen de `fetchEstadoCuentaData`, exactamente los mismos que el
// PDF de un cliente solo: acá no se recalcula nada, solo se ordena en hojas —
// cada cliente entra por `dibujarCliente`, la MISMA función.
// ─────────────────────────────────────────────────────────────────────────────

export interface ClienteDelLote {
  data: EstadoCuenta;
  nombre: string;
}

export function buildEstadoCuentaLotePDF(clientes: ClienteDelLote[]): { doc: jsPDF; filename: string } {
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const w = doc.internal.pageSize.getWidth();
  let total = 0;

  clientes.forEach((cliente, i) => {
    // Cada cliente empieza en su propia hoja: quien recibe el correo tiene que
    // poder arrancarle la página a uno sin cortar a otro por la mitad.
    if (i > 0) doc.addPage();
    total += dibujarCliente(doc, cliente.data, cliente.nombre);
  });

  // El resumen de todos, solo si hay más de uno: con un cliente sería el mismo
  // número dos veces seguidas.
  if (clientes.length > 1) {
    doc.addPage();
    let y = 20;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(17, 24, 39);
    doc.text("Resumen", MARGEN, y);
    y += 6;
    autoTable(doc, {
      startY: y,
      margin: { left: MARGEN, right: MARGEN, bottom: FOOTER_RESERVA_MM },
      head: [["Cliente", "Código", "Total"]],
      body: clientes.map((c) => [
        nombreDelPapel(c.data.clienteNombre, c.nombre),
        c.data.codigo,
        monto(c.data.total),
      ]),
      styles: { font: "helvetica", fontSize: 8, cellPadding: 2, textColor: [17, 24, 39] },
      headStyles: { fillColor: [243, 244, 246], textColor: [107, 114, 128], fontStyle: "bold", fontSize: 7 },
      columnStyles: {
        0: { cellWidth: "auto" },
        1: { cellWidth: 26 },
        2: { halign: "right", cellWidth: 30, fontStyle: "bold" },
      },
    });
    // @ts-expect-error lastAutoTable lo agrega el plugin en runtime
    y = doc.lastAutoTable.finalY + 8;
    y = yParaTotal(doc, y);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(17, 24, 39);
    doc.text(`Total General: ${monto(Math.round(total * 100) / 100)}`, w - MARGEN, y, { align: "right" });
  }

  dibujarPieDeLaCasa(doc);

  const iso = new Date().toISOString().slice(0, 10);
  const filename = clientes.length === 1
    ? `Estado-cuenta-${clientes[0].data.codigo}-${iso}.pdf`
    : `Estado-cuenta-${clientes.length}-clientes-${iso}.pdf`;
  return { doc, filename };
}
