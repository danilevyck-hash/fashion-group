// ─────────────────────────────────────────────────────────────────────────────
// MARKETING › «+ REGISTRAR GASTO» — EL PDF ENTRA POR LA PUERTA.
// (módulo PURO: sin React, sin fetch, sin Storage)
//
// Daniel, textual (10-sep-2026): *«Marketing PDF, que sea como la factura,
// porque es una factura en PDF que con AI lee los campos y lo rellena solo.»*
//
// 🔑 LA IA YA EXISTÍA Y NO SE VOLVIÓ A ESCRIBIR: `/api/marketing/ia/leer-factura`
// lee el PDF y devuelve Nº de factura, fecha, proveedor, concepto, subtotal e
// ITBMS. Lo que faltaba era que el PDF pudiera entrar DESDE LA PUERTA (el paso
// del cliente y la marca), en vez de obligar a llegar al paso 3 para subirlo.
//
// 🩸 Y faltaba algo más, medido en el código: desde esta puerta la IA **no
// corría nunca**. `FacturaForm` la dispara solo si le pasan `onUploadPdfForIA`,
// y el ÚNICO que se lo pasaba era `FacturasSection` (la pantalla del proyecto).
// Por «Registrar gasto» el PDF se subía y los seis campos se tecleaban a mano.
//
// 🔴 TODO CUELGA DE UN INTERRUPTOR, APAGADO. Con `MARKETING_PDF_EN_LA_PUERTA`
// en `false` la puerta es EXACTAMENTE la de hoy: el campo dice «Foto», acepta
// solo imágenes y el PDF se sigue pidiendo en el paso 3. Se prende poniendo la
// constante en `true` — un solo lugar, sin migración ni datos que arreglar.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 🔴 EL INTERRUPTOR — un solo lugar. Nació APAGADO (10-sep-2026) y Daniel lo
 * PRENDIÓ el mismo día: *«prende marketing»*. En `false`, «Registrar gasto»
 * vuelve a ser la pantalla de antes, campo por campo.
 */
export const MARKETING_PDF_EN_LA_PUERTA = true;

/**
 * El tope de la factura en PDF, en MB. Es el MISMO número que ya usaba el
 * paso 3 (`PdfUploader`, que lo tenía escrito a mano): la puerta no puede
 * dejar pasar lo que el paso siguiente rechaza.
 */
export const MAX_PDF_MB = 10;

/** El mensaje del archivo pesado, uno solo para la puerta y para el paso 3. */
export function mensajeArchivoPesado(maxMb: number): string {
  return `El archivo pesa más de ${maxMb} MB. Intenta uno más liviano.`;
}

/**
 * ¿Es un PDF? Exacto y normalizado, nunca por parecido: el tipo que manda el
 * navegador o, si viene vacío (pasa en Android), la extensión del nombre.
 */
export function esPdf(nombre: string, tipoMime: string): boolean {
  if ((tipoMime ?? "").trim().toLowerCase() === "application/pdf") return true;
  return (nombre ?? "").trim().toLowerCase().endsWith(".pdf");
}

/** ¿Es una imagen? El mismo criterio del `accept` de siempre. */
export function esImagen(tipoMime: string): boolean {
  return (tipoMime ?? "").trim().toLowerCase().startsWith("image/");
}

/** Lo que el campo de la puerta ACEPTA. Derivado del interruptor, nunca escrito dos veces. */
export function aceptaDeLaPuerta(encendido: boolean = MARKETING_PDF_EN_LA_PUERTA): string {
  return encendido ? "image/*,application/pdf" : "image/*";
}

/** El rótulo del campo. */
export function rotuloDeLaPuerta(encendido: boolean = MARKETING_PDF_EN_LA_PUERTA): string {
  return encendido ? "Foto o factura" : "Foto";
}

/** El rótulo del botón que abre el selector de archivos. */
export function rotuloBotonDeLaPuerta(encendido: boolean = MARKETING_PDF_EN_LA_PUERTA): string {
  return encendido ? "Subir foto o factura" : "Subir foto";
}

/** Lo mínimo de un archivo que este módulo necesita mirar (así se prueba sin `File`). */
export interface ArchivoElegido {
  name: string;
  type: string;
  size: number;
}

export type ClaseDeArchivo =
  /** Una foto: el camino de siempre, se cuelga como `foto_factura`/`foto_proyecto`. */
  | { ok: true; clase: "foto" }
  /** La factura en PDF: la lee la IA y se cuelga como `pdf_factura`. */
  | { ok: true; clase: "pdf" }
  /** No entra, y se dice POR QUÉ y QUÉ HACER. */
  | { ok: false; mensaje: string };

/**
 * Qué es lo que soltaron en la puerta.
 *
 * 🔴 Con el interruptor apagado, un PDF NO entra — y el mensaje dice el camino
 * de hoy (subirlo en el paso siguiente), nunca un «tipo de archivo inválido»
 * pelado. El `accept` del campo ya lo filtra en el navegador; esto es la
 * segunda cerradura, la que sirve cuando alguien arrastra el archivo.
 */
export function clasificarArchivoDeLaPuerta(
  archivo: ArchivoElegido,
  encendido: boolean = MARKETING_PDF_EN_LA_PUERTA,
  maxMb: number = MAX_PDF_MB,
): ClaseDeArchivo {
  const nombre = archivo?.name ?? "";
  const tipo = archivo?.type ?? "";
  if (esPdf(nombre, tipo)) {
    if (!encendido) {
      return {
        ok: false,
        mensaje: "Aquí solo entra una foto. La factura en PDF se sube en el paso siguiente.",
      };
    }
    if ((archivo?.size ?? 0) > maxMb * 1024 * 1024) {
      return { ok: false, mensaje: mensajeArchivoPesado(maxMb) };
    }
    return { ok: true, clase: "pdf" };
  }
  if (esImagen(tipo)) return { ok: true, clase: "foto" };
  return {
    ok: false,
    mensaje: encendido
      ? "Ese archivo no se puede subir aquí. Sube una foto o la factura en PDF."
      : "Ese archivo no se puede subir aquí. Sube una foto.",
  };
}

// ─── Cada gasto con su prueba, según el camino ───────────────────────────────
//
// Daniel, textual (10-sep-2026): *«cada gasto con su prueba, según el camino —
// Compra → factura obligatoria; Impulsadora → comprobante obligatorio. Así
// ningún gasto queda sin respaldo, y no le pides factura a quien no la tiene.»*
//
// 🔴 Vive detrás del MISMO interruptor: con `MARKETING_PDF_EN_LA_PUERTA` en
// `false` la factura sigue siendo OPCIONAL, exactamente como hoy.
// ⚠️ Impulsadora ya exigía su comprobante (en su propio modal, que no se tocó)
// y Mueble no cambia.

/** Lo que le falta al gasto para poder guardarse, o `null` si no falta nada. */
export function faltaLaFactura(
  hayPdf: boolean,
  obligatorio: boolean,
): string | null {
  if (!obligatorio || hayPdf) return null;
  return "Falta la factura en PDF";
}
