// ============================================================================
// Guías — LA MISMA HOJA QUE SE IMPRIME, pero como archivo PDF.
//
// Pedido de Daniel: *"al finalizar una guia de despacho, quiero un boton de
// compartir guia (o pdf) o imagen asi se comparta por whatsapp u otros medios.
// de la misma manera que cuando estas en un documento y pones compartir."*
//
// 🩸 POR QUÉ UN PDF ARMADO A MANO Y NO UNA FOTO DE LA PANTALLA. La tentación
// era rasterizar el `#print-document` con html2canvas: sale "igual" sin
// escribir el documento dos veces. Se descartó por tres razones concretas:
//   1. La guía se manda por WhatsApp como RESPALDO de una entrega — una imagen
//      se recomprime, se ve borrosa en pantalla grande y no se puede imprimir.
//   2. html2canvas no está en el proyecto y no entiende varias cosas que el
//      documento ya usa; agregar una dependencia de render para un botón es
//      caro y frágil.
//   3. La hoja se ve dentro de `HojaEscalada`, que le aplica un `transform:
//      scale(...)` en pantalla. Fotografiar el DOM fotografía la ESCALA — el
//      archivo saldría del tamaño del celular de quien lo comparte.
//
// ⚠️ EL RIESGO DE ESTE ENFOQUE ES LA DERIVA: son dos dibujos del mismo papel
// (este archivo y `PrintDocument.tsx`), y si alguien agrega un campo allá y no
// acá, lo compartido deja de ser lo firmado. El candado es
// `src/__tests__/lib/guia-pdf-compartir.test.ts`, que lee los DOS archivos y
// exige que todo campo de la guía que `PrintDocument` pinta aparezca también
// acá. Un campo nuevo pone el build en ROJO hasta que se agregue a los dos.
//
// ⚠️ OJO CON EL LOGO Y LAS FIRMAS: `addImage` va en try/catch, así que un
// base64 roto haría desaparecer la imagen SIN error (fue el bug del 26-jul-2026
// en el comprobante de marketing). El candado del logo es `pdf-logos.test.ts`;
// el de que ESTE documento dibuje las firmas cuenta los XObject del PDF ya
// generado.
// ============================================================================

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { FG_LOGO_BASE64 } from "@/lib/pdf-logo";
import { fmtDate, fmtGuia } from "@/lib/format";
import { nombreDespachadoPor } from "@/lib/guias/despachado-por";
import { facturasParaElPapel } from "./numero-factura";
import { tintaDeLaCasilla } from "./casilla-en-blanco";
import { cedulaParaMostrar } from "./cedula";
import { observacionesVisibles } from "./observaciones";
import type { Guia } from "@/app/guias/components/types";
import {
  ETIQUETA_TIPO_DESPACHO,
  esEntregaDirecta,
  numeroTranspImpreso,
  numeroTranspUnicoImpreso,
  sinCeroPelado,
  tipoDespachoEfectivo,
} from "@/lib/guias/modo-despacho";
// 🔴 EL PAPEL NUEVO (24-sep-2026) VIVE EN UN MÓDULO PURO, y este archivo solo
// lo APLICA: el título, los rótulos, el orden de los renglones por cliente, qué
// firma va en qué caja y dónde cae el pie legal se deciden allá, detrás del
// interruptor `GUIA_PAPEL_2026_09`. Escribir esas reglas acá adentro sería
// dejarlas donde no se pueden probar solas ni apagar de un lugar.
import {
  AIRE_ANTES_DE_FIRMAS_MM,
  GUIA_PAPEL_2026_09,
  PIE_LEGAL_Y,
  TOPE_HOJA_NUEVA_MM,
  cabenLasFirmas,
  firmasDelPapel,
  renglonesDelPapel,
  rotuloColumnaNumeroTransp,
  rotuloDestino,
  rotuloNumeroGuia,
  rotuloNumeroTransp,
  seDibujaLaFilaTipo,
  tituloDelPapel,
} from "@/lib/guias/papel-2026-09";

const PAGE_W = 216; // Letter
const MARGIN = 15;
const ANCHO = PAGE_W - 2 * MARGIN;

const TEXTO_LEGAL =
  "La firma del transportista constituye aceptación expresa de la mercancía detallada en este " +
  "documento, en la cantidad y condición indicadas. Cualquier faltante o daño no reportado al " +
  "momento de la recepción será responsabilidad exclusiva del transportista.";

/** Nombre del archivo: se ve en el chat de WhatsApp, así que dice qué es. */
export function nombreArchivoGuia(g: Guia): string {
  return `Guia-${fmtGuia(g.numero)}-${String(g.fecha ?? "").slice(0, 10)}.pdf`;
}

/** Dos columnas de "ETIQUETA: valor" con línea de puntos, como el papel. */
function bloqueCampos(doc: jsPDF, campos: Array<[string, string]>, yInicio: number): number {
  const colW = ANCHO / 2;
  let y = yInicio;
  doc.setFontSize(8);
  campos.forEach(([etiqueta, valor], i) => {
    const x = MARGIN + (i % 2) * colW;
    doc.setFont("helvetica", "bold");
    doc.text(etiqueta, x, y);
    const anchoEtiqueta = doc.getTextWidth(etiqueta) + 2;
    doc.setFont("helvetica", "normal");
    doc.text(valor || "", x + anchoEtiqueta, y);
    // 🔴 La casilla VACÍA sale con la raya marcada, para escribirla a mano
    // (19-sep-2026): la misma regla —y la misma función— que la hoja impresa.
    doc.setDrawColor(tintaDeLaCasilla(valor));
    doc.line(x + anchoEtiqueta, y + 1, x + colW - 6, y + 1);
    if (i % 2 === 1) y += 7;
  });
  if (campos.length % 2 === 1) y += 7;
  return y;
}

/** Una firma: nombre, imagen (si la hay) y la línea de "nombre y firma". */
function bloqueFirma(
  doc: jsPDF,
  x: number,
  y: number,
  colW: number,
  opts: {
    titulo: string;
    nombre: string;
    cedula?: string | null;
    firma?: string | null;
    pie: string;
  },
): void {
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text(opts.titulo.toUpperCase(), x, y);
  doc.setFont("helvetica", "normal");

  let cursor = y + 8;
  doc.text(`NOMBRE: ${opts.nombre || ""}`, x, cursor);
  if (!opts.nombre) {
    doc.setDrawColor(150);
    doc.line(x + 18, cursor + 1, x + colW - 6, cursor + 1);
  }
  cursor += 7;

  if (opts.cedula !== undefined) {
    doc.text(`CÉDULA: ${opts.cedula || ""}`, x, cursor);
    if (!opts.cedula) {
      doc.setDrawColor(150);
      doc.line(x + 17, cursor + 1, x + colW - 6, cursor + 1);
    }
    cursor += 7;
  }

  // 🩸 3 mm de aire ANTES de la firma. La imagen se dibuja HACIA ARRIBA desde
  // su línea (una firma se apoya en el renglón, no cuelga de él), y sin este
  // aire el trazo cruzaba por encima de "CEDULA: 9-70013387" en la columna del
  // receptor — que es justo el dato que alguien va a querer leer si hay un
  // reclamo. Se vio recién al mirar el PDF renderizado; el texto extraído no lo
  // muestra, porque solapar dos cosas no cambia ni una letra.
  cursor += 3;
  doc.text("FIRMA:", x, cursor);
  if (opts.firma) {
    try {
      // 12 mm de alto ≈ los 40 px de la hoja impresa.
      //
      // ⚠️ "FAST" no es cosmético: las firmas salen de un canvas a resolución de
      // pantalla y pesan cientos de KB cada una. Sin comprimir, la guía real
      // GT-188 daba un archivo de 1,4 MB — para mandar por WhatsApp desde el
      // celular de un bodeguero, con datos móviles.
      doc.addImage(opts.firma, "PNG", x + 15, cursor - 8, 40, 12, undefined, "FAST");
    } catch {
      /* firma ilegible: queda la línea vacía, nunca se rompe el documento */
    }
  } else {
    doc.setDrawColor(150);
    doc.line(x + 15, cursor + 1, x + colW - 6, cursor + 1);
  }
  cursor += 8;

  doc.setFontSize(7);
  doc.setTextColor(150);
  doc.text(opts.pie, x, cursor);
  doc.setTextColor(0);
}

/**
 * Arma el PDF de la guía. Es un espejo de `PrintDocument.tsx` — mismo título,
 * mismos campos, misma tabla, mismas firmas y el mismo texto legal.
 */
function nuevoDocumento(): jsPDF {
  return new jsPDF({ unit: "mm", format: "letter", orientation: "portrait" });
}

/**
 * Dibuja UNA guía en la página ACTUAL del documento.
 *
 * 🔑 Se extrajo de `construirPdfGuia` sin tocar una sola línea de lo que
 * dibuja: lo único que se le sacó fue el `new jsPDF()` del principio y el
 * `return` del final. Es lo que permite meter varias guías en un solo PDF
 * (una por página) **sin escribir un segundo generador** — dos papeles que se
 * parecen es uno que se corrige y otro que se queda viejo, y acá el que se
 * quedaría viejo es el que alguien firma.
 */
function dibujarGuiaEnPdf(doc: jsPDF, g: Guia): void {
  const items = g.guia_items ?? [];
  const bultos = items.reduce((s, i) => s + (i.bultos || 0), 0);
  // Ver `PrintDocument.tsx`: el modo sale de `modo_entrega` mientras la guía no
  // haya salido, porque `tipo_despacho` trae DEFAULT 'externo' en la base.
  const esDirecta = esEntregaDirecta(g);

  // ── Encabezado ────────────────────────────────────────────────────────────
  try {
    doc.addImage(FG_LOGO_BASE64, "PNG", MARGIN, 12, 10, 10, undefined, "FAST");
  } catch {
    /* sin logo el documento sigue siendo válido */
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  // 🔴 EL TÍTULO DICE DE QUÉ GUÍA SE TRATA: «GUÍA DE TRANSPORTE EXTERNO» o
  // «GUÍA DE ENTREGA DIRECTA». Decía «INTERIOR» en las dos, que no distinguía
  // nada y por eso hacía falta además la fila «TIPO».
  doc.text(tituloDelPapel(g), PAGE_W / 2, 19, { align: "center" });

  // ── Datos de la guía ──────────────────────────────────────────────────────
  const campos: Array<[string, string]> = [
    [rotuloNumeroGuia(), fmtGuia(g.numero)],
    ["FECHA:", fmtDate(g.fecha)],
    ["TRANSPORTISTA:", g.transportista ?? ""],
  ];
  // En entrega directa no hay placa que declarar (nuestro propio camión), y un
  // "0" no es una placa: es lo que alguien tecleó para pasar la validación.
  if (!esDirecta) campos.push(["PLACA / VEHÍCULO:", sinCeroPelado(g.placa)]);
  campos.push(["DESPACHADO POR:", nombreDespachadoPor(g.entregado_por)]);
  // La fila «TIPO» se retira con el papel nuevo: lo dice el título.
  if (seDibujaLaFilaTipo()) {
    campos.push(["TIPO:", ETIQUETA_TIPO_DESPACHO[tipoDespachoEfectivo(g)]]);
  }
  // ⚠️ Solo se anuncia arriba cuando hay UN número en toda la guía; con varios
  // por línea, un encabezado con uno de ellos mentiría. Ver `PrintDocument`.
  const transpUnico = numeroTranspUnicoImpreso(items, g.numero_guia_transp);
  if (!esDirecta && transpUnico) campos.push([rotuloNumeroTransp(), transpUnico]);
  if (esDirecta && g.nombre_chofer) campos.push(["CHOFER:", g.nombre_chofer]);

  let y = bloqueCampos(doc, campos, 32);

  doc.setDrawColor(180);
  doc.line(MARGIN, y - 2, PAGE_W - MARGIN, y - 2);

  // ── Detalle ───────────────────────────────────────────────────────────────
  // 🔴 LOS RENGLONES DEL MISMO CLIENTE VAN JUNTOS, y el nombre se repite en
  // TODOS (Daniel: *«que se repita para que no haya confusión»*). El orden y la
  // marca de "primero de su cliente" las decide `renglonesDelPapel`; acá solo
  // se dibujan. La numeración `#` es 1..N sobre el orden NUEVO, y el total de
  // bultos no se toca: se suma sobre los mismos renglones.
  const renglones = renglonesDelPapel(items);
  autoTable(doc, {
    startY: y + 2,
    margin: { left: MARGIN, right: MARGIN },
    head: [
      esDirecta
        ? ["#", "CLIENTE", rotuloDestino(), "EMPRESA", "FACTURA(S)", "BULTOS"]
        : ["#", "CLIENTE", rotuloDestino(), "EMPRESA", "FACTURA(S)", "BULTOS", rotuloColumnaNumeroTransp()],
    ],
    body: [
      ...renglones.map(({ item: it }, i) => {
        const fila = [
          String(i + 1),
          it.cliente ?? "",
          it.direccion ?? "",
          it.empresa ?? "",
          facturasParaElPapel(it.facturas),
          it.bultos ? String(it.bultos) : "",
        ];
        // La columna del transportista no se dibuja en entrega directa: no hay
        // transportista que le dé un número a cada envío.
        if (!esDirecta) fila.push(numeroTranspImpreso(it.numero_guia_transp, g.numero_guia_transp));
        return fila;
      }),
      [
        { content: "TOTAL DE BULTOS DESPACHADOS", colSpan: 5, styles: { halign: "right" as const, fontStyle: "bold" as const } },
        { content: String(bultos), styles: { halign: "center" as const, fontStyle: "bold" as const } },
        ...(esDirecta ? [] : [""]),
      ],
    ],
    styles: { fontSize: 7, cellPadding: 1.5, lineColor: [180, 180, 180], lineWidth: 0.1 },
    headStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: "bold", fontSize: 7 },
    columnStyles: esDirecta
      ? { 0: { cellWidth: 7, halign: "center" }, 5: { cellWidth: 13, halign: "center" } }
      : {
          0: { cellWidth: 7, halign: "center" },
          5: { cellWidth: 13, halign: "center" },
          6: { cellWidth: 24 },
        },
    // 🔴 UNA RAYA GRIS FINA ENTRE CLIENTES. No es una fila vacía inventada —eso
    // le sumaría un renglón a un documento que se cuenta— sino un trazo sobre
    // el borde superior de la primera fila de cada grupo, salvo la primera de
    // toda la tabla, que ya la separa el encabezado.
    didDrawCell: (data) => {
      if (!GUIA_PAPEL_2026_09) return;
      if (data.section !== "body" || data.column.index !== 0) return;
      if (data.row.index === 0) return;
      if (!renglones[data.row.index]?.primeroDeSuGrupo) return;
      doc.setDrawColor(140);
      doc.setLineWidth(0.4);
      doc.line(MARGIN, data.cell.y, PAGE_W - MARGIN, data.cell.y);
      doc.setLineWidth(0.1);
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 8;

  // ── Observaciones ─────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("OBSERVACIONES GENERALES DEL ENVÍO", MARGIN, y);
  doc.setFont("helvetica", "normal");
  // Sin la línea del cierre en bloque del 3-ago-2026 (54 guías): el papel dice
  // lo que la persona escribió, no el rastro de una operación técnica.
  const textoObs = observacionesVisibles(g.observaciones);
  const obs = doc.splitTextToSize(textoObs, ANCHO - 4);
  const altoObs = Math.max(12, obs.length * 4 + 4);
  doc.setDrawColor(180);
  doc.rect(MARGIN, y + 2, ANCHO, altoObs);
  if (textoObs) doc.text(obs, MARGIN + 2, y + 7);
  // 🔴 LAS FIRMAS QUEDAN PEGADAS DEBAJO DE OBSERVACIONES, y el pie legal al pie
  // de la hoja. Antes las firmas caían donde terminara la tabla y el pie estaba
  // clavado en `y = 250`: en una guía corta quedaba un hueco enorme entre las
  // dos cosas, y en una larga la tabla se les venía encima.
  y += altoObs + (GUIA_PAPEL_2026_09 ? AIRE_ANTES_DE_FIRMAS_MM : 14);

  // 🔴 CON VARIAS HOJAS, LAS FIRMAS Y EL PIE LEGAL VAN EN LA ÚLTIMA. `autoTable`
  // pagina solo y deja el documento en la última hoja que dibujó; si lo que
  // queda de esa hoja no alcanza para el bloque de firmas, se abre una.
  if (GUIA_PAPEL_2026_09 && !cabenLasFirmas(y)) {
    doc.addPage();
    y = TOPE_HOJA_NUEVA_MM;
  }

  // ── Firmas ────────────────────────────────────────────────────────────────
  // 🔴 CADA FIRMA BAJO SU RÓTULO. En transportista externo salían cruzadas —la
  // del transportista bajo «Despachado por» y la de quien despacha bajo
  // «Recibido Conforme — Transportista»—; en entrega directa estaban bien y no
  // se mueven. La regla y su medición viven en `papel-2026-09.ts`.
  const firmas = firmasDelPapel(g);
  const colW = ANCHO / 2 - 6;
  bloqueFirma(doc, MARGIN, y, colW, {
    titulo: esDirecta ? "Chofer" : "Despachado por",
    nombre: esDirecta ? (g.nombre_chofer ?? "") : nombreDespachadoPor(g.entregado_por),
    firma: firmas.izquierda,
    pie: "Nombre y firma",
  });
  bloqueFirma(doc, MARGIN + ANCHO / 2 + 6, y, colW, {
    titulo: esDirecta ? "Recibido por — Cliente" : "Recibido Conforme — Transportista",
    nombre: g.receptor_nombre ?? "",
    // Con guiones al imprimirla; lo guardado no se toca.
    cedula: cedulaParaMostrar(g.cedula),
    firma: firmas.derecha,
    pie: "Nombre, cédula y firma",
  });

  // ── Pie legal ─────────────────────────────────────────────────────────────
  const pieY = GUIA_PAPEL_2026_09 ? PIE_LEGAL_Y : 250;
  doc.setDrawColor(220);
  doc.line(MARGIN, pieY, PAGE_W - MARGIN, pieY);
  doc.setFontSize(6.5);
  doc.setTextColor(150);
  doc.text(doc.splitTextToSize(TEXTO_LEGAL, ANCHO), PAGE_W / 2, pieY + 5, { align: "center" });
  doc.setTextColor(0);

}

/** El PDF de UNA guía, exactamente el de siempre. */
export function construirPdfGuia(g: Guia): jsPDF {
  const doc = nuevoDocumento();
  dibujarGuiaEnPdf(doc, g);
  return doc;
}

/**
 * 🔴 UN SOLO PDF CON VARIAS GUÍAS — una por página, en el orden recibido.
 *
 * 🩸 «Imprimir todas» abría **una pestaña por guía** y adentro de cada una
 * había que apretar Imprimir. El navegador bloquea todas menos la primera, así
 * que se seleccionaban 8 guías esperando 8 papeles y salía UNA pestaña. Ahora
 * se baja un solo documento con las 8, listo para mandar a la impresora.
 *
 * ⚠️ Con una sola guía devuelve EXACTAMENTE el mismo documento que
 * `construirPdfGuia` (mismo generador, misma página, sin hoja de más): no hay
 * un "modo lote" que dibuje distinto. Sin guías devuelve el documento vacío y
 * quien llama decide qué hacer — inventar una hoja en blanco sería peor.
 */
export function construirPdfGuias(guias: readonly Guia[]): jsPDF {
  const doc = nuevoDocumento();
  guias.forEach((g, i) => {
    // La primera va en la página que el documento ya trae: una `addPage()` de
    // más deja una hoja en blanco al principio de todo lo que se imprima.
    if (i > 0) doc.addPage();
    dibujarGuiaEnPdf(doc, g);
  });
  return doc;
}

/** Cómo se llama el archivo cuando lleva varias guías adentro. */
export function nombreArchivoGuias(guias: readonly Guia[]): string {
  if (guias.length === 1) return nombreArchivoGuia(guias[0]);
  return `Guias-${guias.length}-${new Date().toISOString().slice(0, 10)}.pdf`;
}
