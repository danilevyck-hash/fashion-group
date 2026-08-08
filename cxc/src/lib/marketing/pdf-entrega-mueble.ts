// ============================================================================
// Marketing — COMPROBANTE DE ENTREGA DE MOBILIARIO (PDF).
//
// El papel que acompaña a un mueble cuando se entrega en una tienda. Se GENERA
// a partir de lo que la entrega ya guarda (no inventa datos): cliente, código
// de directorio, proyecto, marca a la que se carga el gasto, y el detalle de
// muebles con cantidad, precio unitario e importe.
//
// ⚠️ DISEÑO ELEGIDO POR DANIEL — no agregarle cosas "por las dudas".
// Llegó después de tres rondas de poda. Lo que él sacó explícitamente, y que NO
// se debe reponer:
//   · el resumen "56 unidades en 5 artículos"
//   · la nota "Montos sin ITBMS — el mobiliario no lo lleva"
//   · el bloque de firmas (NOMBRE / CÉDULA / FIRMA Y FECHA)
//   · el campo TIENDA (el cliente ya dice a quién se le entregó)
//   · la línea "RECIBIDO POR — NOMBRE, FIRMA Y FECHA"
//   · el subtítulo "Mobiliario" (el título ya lo dice)
//   · el pie de página (el logo ya dice Fashion Group y el número ya está arriba)
// Textual: *"tiene q ser asi de simple"*. La regla para cualquier agregado
// futuro es la que él viene aplicando: si no se puede decir para qué sirve en
// una frase, no va.
//
// Lo único que sobrevive fuera de eso son las NOTAS, y sólo cuando existen: no
// son adorno, son texto que alguien escribió en el formulario de la entrega, y
// tirarlo sería perder información. Con notas vacías (las 21 entregas de hoy)
// no se dibuja nada.
//
// ── LO QUE SÍ PIDIÓ AGREGAR DESPUÉS (ago-2026), y por qué no contradice la
//    poda de arriba ──────────────────────────────────────────────────────────
//   · **FOTO de cada mueble.** Textual: *"en la nota de entrega que vaya con
//     foto"*. Quien recibe en la tienda no sabe qué es un "Norte colgador";
//     con la foto sí. Es lo contrario de un adorno: es lo que hace que el
//     papel se pueda verificar contra la mercancía. Si un producto no tiene
//     foto, la celda queda vacía y el renglón se ve igual de bien.
//   · **PIEZAS y BULTOS en columnas separadas.** Textual: *"puedo mandar 30
//     norte colgador en 1 bulto. o 20 norte colgador en un bulto"*. Son dos
//     datos distintos: las piezas son la mercancía (y lo que descuenta el
//     inventario), los bultos son cuántos paquetes bajaron del camión, que es
//     justo lo que cuenta quien recibe. La columna "Cantidad" pasó a llamarse
//     "Piezas" para que nadie las confunda. Sin bultos anotados la celda va
//     en blanco, NUNCA en 0 (ver ./piezas-bultos.ts).
//
// ⚠️ OJO CON EL LOGO: `addImage` va envuelto en try/catch, así que si el base64
// estuviera mal el logo desaparecería SIN error (fue el bug del 26-jul-2026, a
// la cadena le faltaba un `=`). El candado del base64 es
// `src/__tests__/lib/pdf-logos.test.ts`; el de que ESTE documento efectivamente
// dibuje la imagen es `marketing-comprobante-entrega.test.ts`, que cuenta los
// XObject de imagen del PDF ya generado.
// ============================================================================

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { FG_LOGO_BASE64 } from "@/lib/pdf-logo";
import { textoBultos } from "./piezas-bultos";

const PAGE_W = 216; // Letter
const MARGIN = 15;
const ANCHO = PAGE_W - 2 * MARGIN;
const NAVY: [number, number, number] = [27, 58, 92];

/** Lado de la miniatura de la foto, en mm. Cuadrada para que la grilla cuadre. */
const FOTO_MM = 14;

export interface EntregaMuebleItemPdf {
  /** Nombre del mueble/artículo (mk_inventario_productos.nombre). */
  articulo: string;
  /**
   * PIEZAS entregadas. 🔴 Es lo que descuenta el inventario.
   * (El campo se sigue llamando `cantidad` para no romper a los llamadores.)
   */
  cantidad: number;
  /**
   * BULTOS en los que viajó el renglón. `null` = no se anotó → celda VACÍA.
   * 🔴 Informativo: no se convierte a piezas ni se le suma nada.
   */
  bultos?: number | null;
  precioUnitario: number;
  /**
   * Foto del mueble como data URL (`data:image/jpeg;base64,…`), ya bajada por
   * `entrega-comprobante.ts`. `null` = sin foto → celda vacía, sin hueco raro.
   */
  fotoDataUrl?: string | null;
}

export interface EntregaMueblePdfData {
  /** UUID de la entrega. Sólo se usa como respaldo del número (ver abajo). */
  entregaId: string;
  /**
   * `mk_entregas_muebles.numero` — el correlativo que da el número ME-0001.
   * Null mientras la migración 20260730120000 no esté corrida.
   */
  numero?: number | null;
  /** Fecha de la entrega (created_at, ISO). */
  fecha: string;
  /** Nombre del cliente del directorio; si no hay, el texto libre de la tienda. */
  cliente: string;
  /** Código D-XXX del directorio, o null si el proyecto no está vinculado. */
  clienteCodigo: string | null;
  /** Texto libre de la tienda tal como está en el proyecto. */
  tienda: string;
  /** Nombre del proyecto ("Remodelacion", "Muebles"…). */
  proyecto: string;
  items: EntregaMuebleItemPdf[];
  /** Reparto del monto por marca, ya con nombre resuelto. */
  porMarca: Array<{ marca: string; monto: number }>;
  /** Total de la entrega (mk_entregas_muebles.total). Mobiliario NO lleva ITBMS. */
  total: number;
  notas: string | null;
}

function fmt(n: number): string {
  return (Number.isFinite(n) ? n : 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtFecha(iso: string): string {
  const d = (iso || "").slice(0, 10);
  const [y, m, day] = d.split("-");
  return day && m && y ? `${day}/${m}/${y}` : "—";
}

/**
 * Número de comprobante: `ME-0001`, correlativo y ESTABLE.
 *
 * Sale de `mk_entregas_muebles.numero`, que asigna una sequence en la base (ver
 * la migración 20260730120000). Daniel, textual: *"ME-A1E6B971 no debe de ser
 * tan generico"* — el resto de sus documentos son secuenciales (guías GT-042,
 * facturas 0000062726) y este era un hash del uuid.
 *
 * 4 dígitos porque hoy hay 21 entregas: sobra de acá a miles y no se ve
 * ridículo. Si algún día se pasa de 9999 el número sigue creciendo sin padding
 * (ME-10000) en vez de truncarse.
 *
 * RESPALDO: si `numero` viene vacío —la migración todavía no corrió— cae al
 * número viejo derivado del uuid, en vez de romperse o, peor, de imprimir todos
 * los comprobantes con el mismo número.
 */
export function numeroComprobante(d: {
  numero?: number | null;
  entregaId: string;
}): string {
  const n = Number(d?.numero);
  if (Number.isInteger(n) && n > 0) return `ME-${String(n).padStart(4, "0")}`;
  const hex = (d?.entregaId || "").replace(/-/g, "").slice(0, 8).toUpperCase();
  return `ME-${hex || "00000000"}`;
}

/** Nombre de archivo del comprobante dentro del ZIP / de la descarga. */
export function nombreArchivoComprobante(d: {
  entregaId: string;
  numero?: number | null;
  fecha: string;
}): string {
  return `${(d.fecha || "").slice(0, 10)} · Entrega de mobiliario ${numeroComprobante(d)}`;
}

/** Etiqueta gris chica + valor. Es el único patrón de campo del documento. */
function campo(
  doc: jsPDF,
  label: string,
  valor: string,
  x: number,
  y: number,
  ancho: number,
): void {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(140, 140, 140);
  doc.setCharSpace(0.5);
  doc.text(label.toUpperCase(), x, y);
  doc.setCharSpace(0);
  if (!valor) return;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(30, 30, 30);
  // Un nombre de cliente largo se parte en vez de pisar la columna de al lado.
  const lineas = doc.splitTextToSize(valor, ancho) as string[];
  doc.text(lineas.slice(0, 2), x, y + 7);
}

/** Construye el documento (sin escribirlo) — así el test puede inspeccionarlo. */
export function buildComprobanteEntregaDoc(d: EntregaMueblePdfData): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "letter" });

  // ── Banda: de quién es (logo), qué es (título), cuál es y de cuándo ───────
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, PAGE_W, 26, "F");
  try {
    doc.addImage(FG_LOGO_BASE64, "JPEG", MARGIN, 5.5, 15, 15);
  } catch {
    /* el candado del base64 vive en pdf-logos.test.ts */
  }

  const titleX = MARGIN + 15 + 7;
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setCharSpace(0.4);
  doc.text("COMPROBANTE DE ENTREGA", titleX, 16);
  doc.setCharSpace(0);

  doc.setFontSize(12.5);
  doc.text(numeroComprobante(d), PAGE_W - MARGIN, 12.5, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(178, 196, 214);
  doc.text(fmtFecha(d.fecha), PAGE_W - MARGIN, 19, { align: "right" });

  // ── Contexto: a quién, de qué obra, a qué marca se le carga ──────────────
  const col2 = MARGIN + ANCHO / 2;
  const colW = ANCHO / 2 - 6;

  campo(
    doc,
    "Entregado a",
    d.clienteCodigo ? `${d.cliente}  (${d.clienteCodigo})` : d.cliente || "—",
    MARGIN,
    40,
    colW,
  );
  campo(doc, "Proyecto", d.proyecto || "—", col2, 40, colW);

  // Con una sola marca alcanza el nombre (el total ya está abajo); con varias
  // hace falta el reparto, que es justo el dato que dice cuánto va a cada una.
  const marcas =
    d.porMarca.length === 0
      ? "Sin marca asignada"
      : d.porMarca.length === 1
        ? d.porMarca[0].marca
        : d.porMarca.map((m) => `${m.marca} $${fmt(m.monto)}`).join("  ·  ");
  campo(doc, "Marca del gasto", marcas, MARGIN, 57, ANCHO);

  // ── Detalle de los muebles ────────────────────────────────────────────────
  // La primera columna es la FOTO: autoTable no dibuja imágenes, así que la
  // celda va vacía y la imagen se pinta en `didDrawCell` sobre sus
  // coordenadas ya calculadas. Las filas sólo crecen cuando hay alguna foto
  // que mostrar — un comprobante sin fotos queda idéntico al de antes.
  const hayFotos = d.items.some((i) => !!i.fotoDataUrl);

  autoTable(doc, {
    startY: 71,
    margin: { left: MARGIN, right: MARGIN },
    head: [["", "Artículo", "Piezas", "Bultos", "Precio unitario", "Importe"]],
    body:
      d.items.length > 0
        ? d.items.map((i) => [
            "",
            i.articulo || "—",
            String(i.cantidad ?? 0),
            textoBultos(i.bultos),
            `$${fmt(i.precioUnitario)}`,
            `$${fmt((Number(i.cantidad) || 0) * (Number(i.precioUnitario) || 0))}`,
          ])
        : [
            [
              "",
              "Sin detalle de artículos registrado",
              "—",
              "",
              "—",
              `$${fmt(d.total)}`,
            ],
          ],
    styles: {
      fontSize: 9.5,
      cellPadding: 3,
      textColor: [40, 40, 40],
      valign: "middle",
    },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontSize: 8.5 },
    alternateRowStyles: { fillColor: [248, 249, 250] },
    columnStyles: {
      0: {
        cellWidth: hayFotos ? FOTO_MM + 4 : 0,
        cellPadding: 2,
        minCellHeight: hayFotos ? FOTO_MM + 4 : 0,
      },
      2: { halign: "center", cellWidth: 18 },
      3: { halign: "center", cellWidth: 18 },
      4: { halign: "right", cellWidth: 30 },
      5: { halign: "right", cellWidth: 30 },
    },
    didDrawCell: (data) => {
      if (data.section !== "body" || data.column.index !== 0) return;
      const foto = d.items[data.row.index]?.fotoDataUrl;
      if (!foto) return;
      // Centrada en su celda; "FAST" es la misma compresión que usan las
      // firmas de la guía de transporte (lib/guias/pdf-guia.ts).
      const x = data.cell.x + (data.cell.width - FOTO_MM) / 2;
      const y = data.cell.y + (data.cell.height - FOTO_MM) / 2;
      try {
        doc.addImage(foto, "JPEG", x, y, FOTO_MM, FOTO_MM, undefined, "FAST");
      } catch {
        // Una foto que jsPDF no sabe leer NO puede tumbar el comprobante:
        // el papel vale por los números, la foto es ayuda visual.
      }
    },
  });

  // ── Total ─────────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let y = (doc as any).lastAutoTable.finalY + 6;
  const boxW = 74;
  const boxX = PAGE_W - MARGIN - boxW;
  doc.setFillColor(...NAVY);
  doc.rect(boxX, y, boxW, 15, "F");
  doc.setTextColor(180, 195, 210);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setCharSpace(0.5);
  doc.text("TOTAL", boxX + 4, y + 5.5);
  doc.setCharSpace(0);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(`$${fmt(d.total)}`, boxX + boxW - 4, y + 11.5, { align: "right" });

  // ── Notas ─────────────────────────────────────────────────────────────────
  // Sólo si alguien escribió algo. No es decoración: es texto del formulario.
  if (d.notas && d.notas.trim()) {
    y += 25;
    campo(doc, "Notas", "", MARGIN, y, ANCHO);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(50, 50, 50);
    const lineas = doc.splitTextToSize(d.notas.trim(), ANCHO) as string[];
    doc.text(lineas.slice(0, 4), MARGIN, y + 7);
  }

  return doc;
}

/** Comprobante listo para servir o para meter en el ZIP. */
export function buildComprobanteEntregaPdf(d: EntregaMueblePdfData): Buffer {
  const doc = buildComprobanteEntregaDoc(d);
  return Buffer.from(doc.output("arraybuffer"));
}
