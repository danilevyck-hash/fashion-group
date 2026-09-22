// ─────────────────────────────────────────────────────────────────────────────
// PDF de pedido de catálogo — CORE ISOMORFO (browser + server).
//
// Fuente ÚNICA del layout del PDF de pedido Reebok/Joybees. Antes había 6
// generadores (2 libs cliente, 2 inline en send-order, 1 inline en el detalle
// de pedido Reebok, 1 lib server); todos consolidados aquí. Los wrappers:
//   - order-pdf.ts        → server: fetch + downscale con sharp, retorna Buffer
//   - order-pdf-client.ts → browser: fetch + downscale con canvas, descarga
//
// Estilo por marca: Reebok = banda negra con logo + secciones Pedido/Pre-orden;
// Joybees = banda navy con el logo blanco. El TOTAL se dibuja UNA sola
// vez con doc.text al final (nunca foot de autotable → no se repite por página).
// ─────────────────────────────────────────────────────────────────────────────

import { jsPDF } from "jspdf";
import { resolverLineas, resumirPedido } from "./lineas-pedido";
import autoTable from "jspdf-autotable";
import { REEBOK_LOGO_BASE64, REEBOK_LOGO_WIDTH, REEBOK_LOGO_HEIGHT } from "@/lib/reebok-logo";
import { TOMMY_LOGO_BASE64, TOMMY_LOGO_WIDTH, TOMMY_LOGO_HEIGHT } from "@/lib/tommy-logo";
import { CALVIN_LOGO_BLANCO_BASE64, CALVIN_LOGO_WIDTH, CALVIN_LOGO_HEIGHT } from "@/lib/calvin-logo";
import { JOYBEES_LOGO_BLANCO_BASE64, JOYBEES_LOGO_WIDTH, JOYBEES_LOGO_HEIGHT } from "@/lib/joybees-logo";
import { sortReebokOrderItems } from "@/lib/reebok-order-sort";
import { precioTexto } from "@/lib/catalogo/precio";
import { DOCUMENTO_POR_DEFECTO, etiquetaDocumento } from "@/lib/catalogo/documento-switch";

export interface PdfOrderItem {
  sku: string;
  name: string;
  quantity: number; // bultos
  unit_price: number;
  image_url: string;
  is_preorder?: boolean;
  category: string;
  /** Tommy: piezas por bulto del estilo. Vacío = el default de la marca. */
  bulto_pzas?: number | null;
}

export interface OrderPdfOpts {
  marca: "reebok" | "joybees" | "tommy" | "calvin";
  orderNumber: string;
  clientName: string;
  createdAt: string;
  items: PdfOrderItem[];
  bultoSize: (category: string | null | undefined, bultoPzas?: number | null) => number;
  /** image_url → dataURL ya preparado (downscaled). Las ausentes se saltan. */
  images: Record<string, string>;
  /**
   * 🔴 LA PALABRA QUE ACOMPAÑA AL NÚMERO EN EL ENCABEZADO (25-ago-2026).
   * «Pedido» o «Cotización», y la decide quien conoce el envío a Switch —este
   * archivo solo DIBUJA. Ausente = «Pedido», que es lo que decía este PDF desde
   * el día uno y lo único que el sistema sabía crear antes del 24-ago-2026.
   *
   * Existe porque el papel MENTÍA: Daniel mandó TOM-027 como cotización, Switch
   * la aceptó, y el PDF que se le manda al cliente igual decía «Pedido:
   * TOM-027». Una cotización no aparta mercancía; el papel que dice «Pedido»
   * hace creer que sí. El NÚMERO no cambia, cambia la palabra.
   */
  documentoLabel?: string;
}

/** Lado máximo (px) al que se reduce cada foto antes de embeberla: se pinta a
 *  10 mm (~57 px) — 200 px da margen de sobra y reduce el PDF ~10-20x. */
export const ORDER_PDF_IMG_PX = 200;

// Precio del catálogo: `35` / `12.50` / `4,422` — sin `.00` y sin redondear.
const fmt = precioTexto;

/**
 * 🔴 EL PAPEL ES CARTA, COMO TODO EL PAPEL DE LA CASA (20-sep-2026).
 *
 * 🩸 Éste era el ÚNICO PDF del sistema en A4: `new jsPDF("portrait")` sin
 * `format`, y el default de jsPDF es A4. Los otros catorce generadores dicen
 * `format: "letter"` (uno `legal`), incluido el PDF del catálogo de este mismo
 * módulo. El cliente imprime este papel —en Panamá no hay A4 en la bandeja— y
 * la impresora le recortaba el borde.
 *
 * 🔴 Y EL ANCHO YA NO SE ESCRIBE A MANO: había cuatro bandas de color dibujadas
 * contra el ancho de A4 y dos textos anclados a su margen derecho. Sobre carta
 * (215,9 mm) esas bandas habrían quedado 6 mm cortas, con una franja blanca al
 * borde derecho de cada hoja. Ahora todo sale de `medidasDeLaHoja`, que le
 * pregunta el tamaño al documento.
 */
export const MARGEN_MM = 14;

/**
 * 🔴 NINGUNA HOJA SE QUEDA SIN DECIR DE QUIÉN ES (22-sep-2026).
 *
 * 🩸 Medido sobre los papeles REALES que recibió el cliente
 * (`pdf-pedido-reebok-PED-024.pdf`, que adentro es PED-023): la hoja 1 llevaba
 * la banda de la marca, «Cliente: Nova Lux, S.A.», «Pedido: PED-023» y la
 * fecha; las hojas 2 y 3 traían la fila de encabezados de la tabla **y nada
 * más**, sin número, sin cliente, sin fecha y **sin numeración de página**. Si
 * al cliente se le suelta la hoja 3, no hay forma de saber de qué pedido es —
 * ni cuántas hojas eran.
 *
 * Por eso la cabecera se dibuja en CADA página (la misma función, en el mismo
 * sitio: y = 26) y cada hoja cierra con «Página N de M». La numeración se
 * escribe al final, cuando ya se sabe cuántas hojas son.
 */
export const TOP_CONTENIDO_MM = 30;

/**
 * 🔴 EL TOTAL NO SE VA SOLO A UNA HOJA EN BLANCO (22-sep-2026).
 *
 * 🩸 En `pdf-cotizacion-tommy.pdf` la hoja 2 traía DOS líneas —«20 bultos · 224
 * piezas» y «$10,064»— y el **92 % de la hoja en blanco**: la tabla terminó
 * pegada al borde de la hoja 1 y el guard de salto mandó el total a una página
 * nueva, solo.
 *
 * El arreglo no es mover el total: es **reservar su lugar**. La tabla nunca
 * baja de `alto − ALTO_PIE_MM`, así que el total y la firma SIEMPRE caben
 * debajo del último renglón. El guard de salto se queda como red de seguridad
 * —ya no tiene que dispararse—.
 *
 * La cuenta: el total va en `finalY + 8`, la firma en `finalY + 18`, y
 * «Página N de M» vive fijo en `alto − 10`. Para que la firma no lo pise hace
 * falta `finalY + 18 < alto − 13`, o sea 31 mm de aire.
 */
export const ALTO_PIE_MM = 31;

/** El ancho y el alto REALES de la hoja del documento, en milímetros. */
export function medidasDeLaHoja(doc: jsPDF): { ancho: number; alto: number; derecha: number } {
  const ancho = doc.internal.pageSize.getWidth();
  return { ancho, alto: doc.internal.pageSize.getHeight(), derecha: ancho - MARGEN_MM };
}

/** Ancho útil (mm) del nombre del cliente antes de chocar con "Pedido:" (x=90),
 *  descontando la etiqueta "Cliente: " y 2 mm de aire. */
export const CLIENT_NAME_MAX_MM = 90 - 14 - 2;

/** Recorta el nombre del cliente con "…" para que quepa en su columna. */
export function fitClientName(doc: jsPDF, name: string): string {
  const label = doc.getTextWidth("Cliente: ");
  const max = CLIENT_NAME_MAX_MM - label;
  if (doc.getTextWidth(name) <= max) return name;
  let out = name;
  while (out.length > 1 && doc.getTextWidth(out + "…") > max) out = out.slice(0, -1);
  return out.trimEnd() + "…";
}

export function buildOrderPdfDoc(opts: OrderPdfOpts): jsPDF {
  const { marca, orderNumber, clientName, createdAt, bultoSize, images } = opts;
  // La palabra del encabezado: la que le pasen, o la de siempre.
  const documentoLabel = opts.documentoLabel || etiquetaDocumento(DOCUMENTO_POR_DEFECTO);
  const items = marca === "reebok" ? sortReebokOrderItems(opts.items) : opts.items;

  const regularItems = items.filter((i) => !i.is_preorder);
  const preorderItems = items.filter((i) => i.is_preorder);

  const totalBultos = items.reduce((s, i) => s + i.quantity, 0);
  // Las piezas y el total NO se calculan acá: salen de la resolución única del
  // pedido (ver `lineas-pedido.ts`). Este archivo solo DIBUJA.
  const resumen = resumirPedido(resolverLineas(items, { bultoSize }));
  const totalPiezas = resumen.piezas;
  const total = resumen.total;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  // El ancho y el alto salen de la HOJA, nunca de un número escrito a mano.
  const hoja = medidasDeLaHoja(doc);
  const fechaLabel = new Date(createdAt + (createdAt.includes("T") ? "" : "T12:00:00"))
    .toLocaleDateString("es-PA", { day: "numeric", month: "long", year: "numeric" });

  /**
   * 🔴 LA CABECERA DE UNA HOJA — banda de la marca + de quién es el papel.
   *
   * Es la MISMA en la hoja 1 y en la 5: mismo alto, mismo `y = 26`, mismos tres
   * textos. Por eso es una función y no código suelto — dos copias se separan
   * solas y la que quede vieja es la que le miente al cliente sobre qué pedido
   * tiene en la mano.
   */
  function dibujarCabecera() {
    // Header por marca
    if (marca === "reebok") {
      doc.setFillColor(26, 26, 26);
      doc.rect(0, 0, hoja.ancho, 18, "F");
      try { doc.addImage(REEBOK_LOGO_BASE64, "PNG", 14, 5, REEBOK_LOGO_WIDTH, REEBOK_LOGO_HEIGHT); } catch { /* */ }
    } else if (marca === "tommy") {
      // 🔴 BANDA NAVY + EL WORDMARK DE COLOR SOBRE PLACA BLANCA (20-sep-2026).
      //
      // 🩸 Acá iba el wordmark BLANCO, y su banderita salía ROTA. Medido píxel a
      // píxel contra el arte de color: dentro del recuadro de la bandera
      // (x 389-466 de 900) el original tiene 4.004 píxeles opacos —1.105 blancos,
      // el resto navy y rojo— y la versión blanca tiene 3.051, TODOS blancos: las
      // 953 franjas BLANCAS de la bandera quedaron transparentes y lo navy y lo
      // rojo quedaron blancos. O sea que sobre la banda navy la bandera se leía al
      // revés, como un bloque blanco con muescas. La causa está en la regla del
      // generador (`scripts/_generar-logo-tommy.mjs`: alfa = oscuridad), que borra
      // justo lo blanco.
      //
      // El arreglo NO inventa un archivo: usa el wordmark OFICIAL de color sobre
      // una placa blanca, que es exactamente lo que ya hace la pantalla del pedido
      // público (`marcas-ui.tsx` → `pedidoPublico`). Una versión blanca correcta
      // pide el master REVERSADO de la marca, y ése lo tiene que mandar Daniel.
      doc.setFillColor(21, 35, 66);
      doc.rect(0, 0, hoja.ancho, 18, "F");
      const placa = { x: 12, y: 9 - TOMMY_LOGO_HEIGHT / 2 - 1.8, w: TOMMY_LOGO_WIDTH + 4, h: TOMMY_LOGO_HEIGHT + 3.6 };
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(placa.x, placa.y, placa.w, placa.h, 1.2, 1.2, "F");
      try { doc.addImage(TOMMY_LOGO_BASE64, "PNG", 14, 9 - TOMMY_LOGO_HEIGHT / 2, TOMMY_LOGO_WIDTH, TOMMY_LOGO_HEIGHT); } catch { /* */ }
    } else if (marca === "calvin") {
      // Banda negra Calvin + wordmark BLANCO (blanco/negro minimalista).
      doc.setFillColor(10, 10, 10);
      doc.rect(0, 0, hoja.ancho, 18, "F");
      try { doc.addImage(CALVIN_LOGO_BLANCO_BASE64, "PNG", 14, 9 - CALVIN_LOGO_HEIGHT / 2, CALVIN_LOGO_WIDTH, CALVIN_LOGO_HEIGHT); } catch { /* */ }
    } else {
      // Banda navy Joybees + logo BLANCO (el wordmark #404041 no se ve sobre navy).
      doc.setFillColor(26, 38, 86);
      doc.rect(0, 0, hoja.ancho, 18, "F");
      try { doc.addImage(JOYBEES_LOGO_BLANCO_BASE64, "PNG", 14, 9 - JOYBEES_LOGO_HEIGHT / 2, JOYBEES_LOGO_WIDTH, JOYBEES_LOGO_HEIGHT); } catch { /* */ }
    }
    doc.setFontSize(8); doc.setTextColor(255); doc.setFont("helvetica", "normal");
    doc.text("Fashion Group · Panamá", hoja.derecha, 12, { align: "right" });

    // Cliente / Pedido / Fecha en columnas FIJAS (14 / 90 / 150 mm): el nombre del
    // cliente se recorta al ancho disponible o se montaba encima de "Pedido:"
    // ("COMERCIAL EL MACHETAZO, S.A. — SUCURSAL VÍA ESPAÑA" pisaba el número de
    // pedido en el PDF que recibe el cliente).
    doc.setTextColor(100); doc.setFontSize(9);
    doc.text(`Cliente: ${fitClientName(doc, clientName)}`, 14, 26);
    doc.text(`${documentoLabel}: ${orderNumber}`, 90, 26);
    doc.text(`Fecha: ${fechaLabel}`, 150, 26);
  }

  // Las hojas que YA llevan su cabecera. autoTable avisa por tabla, no por
  // documento: con dos tablas (Pedido + Pre-orden) el aviso de "página 1"
  // llega dos veces sobre la MISMA hoja. Se lleva la cuenta contra el número
  // de página REAL del documento, que es el único que no se repite.
  const hojasConCabecera = new Set<number>();
  function cabeceraSiFalta() {
    const pagina = doc.getCurrentPageInfo().pageNumber;
    if (hojasConCabecera.has(pagina)) return;
    hojasConCabecera.add(pagina);
    dibujarCabecera();
  }
  cabeceraSiFalta();

  const headFill: [number, number, number] =
    marca === "reebok"
      ? [26, 26, 26]
      : marca === "tommy"
        ? [21, 35, 66]
        : marca === "calvin"
          ? [10, 10, 10]
          : [26, 38, 86];

  // `title` en null = tabla ÚNICA, sin encabezado. "Pedido" y "Pre-orden" sí
  // distinguen dos tablas y se quedan; el "Detalle" que se ponía cuando no hay
  // pre-órdenes rotulaba la única tabla del documento y se podó (12-ago-2026).
  function drawSectionTable(title: string | null, startY: number, sectionItems: PdfOrderItem[]) {
    if (title) {
      doc.setFontSize(10); doc.setTextColor(26); doc.setFont("helvetica", "bold");
      doc.text(title, 14, startY);
    }
    autoTable(doc, {
      // Sin rótulo la tabla sube, pero NO hasta donde estaba el texto: la línea
      // "Cliente / Pedido / Fecha" tiene su base en y=26 y pegarle la tabla la
      // pisaría. 30 deja 4 mm de aire y recupera igual el alto del rótulo.
      startY: title ? startY + 3 : startY - 2,
      head: [["", "Producto", "SKU", "Bultos", "Piezas", "Precio/u", "Subtotal"]],
      // Cada celda LEE de la línea resuelta: acá no se multiplica nada.
      body: resolverLineas(sectionItems, { bultoSize }).map((l) => [
        "", l.name, l.sku, String(l.bultos), String(l.piezas), `$${fmt(l.unit_price)}`, `$${fmt(l.subtotal)}`,
      ]),
      // 🔴 El aire de ARRIBA es para la cabecera que se repite, y el de ABAJO es
      // el lugar RESERVADO del total: la tabla nunca invade ninguno de los dos.
      // Sin decir nada, autoTable deja 14,1 mm por lado, y por eso la tabla
      // llegaba al borde y el total terminaba solo en una hoja nueva.
      margin: { top: TOP_CONTENIDO_MM, bottom: ALTO_PIE_MM },
      // La hoja nueva nace con la banda de la marca y con de quién es el papel,
      // ANTES de que se dibuje un solo renglón.
      willDrawPage: cabeceraSiFalta,
      styles: { fontSize: 8, cellPadding: 2, minCellHeight: 12 },
      headStyles: { fillColor: headFill, textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [249, 249, 249] },
      columnStyles: { 0: { cellWidth: 12, minCellHeight: 12 }, 3: { halign: "center" }, 4: { halign: "center" }, 5: { halign: "right" }, 6: { halign: "right" } },
      didDrawCell: (data: { row: { index: number; section: string }; column: { index: number }; cell: { x: number; y: number; height: number; width: number } }) => {
        if (data.column.index === 0 && data.row.section === "body") {
          const item = sectionItems[data.row.index];
          const b64 = item?.image_url ? images[item.image_url] : undefined;
          if (b64) {
            const imgSize = 10;
            try { doc.addImage(b64, "JPEG", data.cell.x + (data.cell.width - imgSize) / 2, data.cell.y + (data.cell.height - imgSize) / 2, imgSize, imgSize); } catch { /* */ }
          }
        }
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (doc as any).lastAutoTable.finalY;
  }

  let cursor = 32;
  if (regularItems.length > 0) {
    cursor = drawSectionTable(preorderItems.length > 0 ? "Pedido" : null, cursor, regularItems);
    cursor += 6;
  }
  if (preorderItems.length > 0) {
    cursor = drawSectionTable("Pre-orden", cursor, preorderItems);
  }
  // Total al pie — con guard de salto: si la tabla terminó pegada al borde,
  // el total pasa a una página nueva en vez de desaparecer fuera de la hoja.
  let fy = cursor + 8;
  if (fy + 12 > hoja.alto - 7) { doc.addPage(); fy = 20; }
  doc.setFontSize(10); doc.setTextColor(26); doc.setFont("helvetica", "bold");
  doc.text(`${totalBultos} bultos · ${totalPiezas} piezas`, 14, fy);
  doc.text(`$${fmt(total)}`, hoja.derecha, fy, { align: "right" });
  doc.setFontSize(7); doc.setTextColor(160); doc.setFont("helvetica", "normal");
  doc.text(
    marca === "reebok"
      ? "Fashion Group Panamá · Reebok Authorized Distributor"
      : marca === "tommy"
        ? "Fashion Group Panamá · Tommy Hilfiger"
        : marca === "calvin"
          ? "Fashion Group Panamá · Calvin Klein"
          : "Fashion Group Panamá · Joybees",
    14,
    fy + 10,
  );

  // 🔴 «Página N de M» EN TODAS LAS HOJAS, y se escribe al final porque hasta
  // acá no se sabe cuántas son. Va pegado al borde derecho, en el mismo gris
  // chico de la firma, bajo la banda reservada del pie.
  const hojas = doc.getNumberOfPages();
  doc.setFontSize(7); doc.setTextColor(160); doc.setFont("helvetica", "normal");
  for (let n = 1; n <= hojas; n++) {
    doc.setPage(n);
    doc.text(`Página ${n} de ${hojas}`, hoja.derecha, hoja.alto - 10, { align: "right" });
  }

  return doc;
}
