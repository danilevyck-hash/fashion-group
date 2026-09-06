// ============================================================================
// LOS DOS BOTONES DEL PAPEL: IMPRIMIR y COMPARTIR.
//
// Daniel, puntos 10 y 11: *"Imprimir → un botón que imprime directo"* ·
// *"Compartir → otro botón que manda el PDF"*.
//
// 🩸 ANTES ERA UNO SOLO Y NO HACÍA NINGUNA DE LAS DOS COSAS: «Imprimir» abría
// una pestaña con la vista previa, y adentro había que buscar «Imprimir» o
// «Compartir». Dos toques y un cambio de pantalla para cada tarea.
//
// 🔑 EL DOCUMENTO ES EL MISMO PARA LAS DOS. Se arma con `construirPdfGuia`, el
// generador de siempre — el papel impreso y el PDF que se manda por WhatsApp
// son byte por byte el mismo documento, salvo la orden de imprimirse que
// `autoPrint()` le agrega al que va a la impresora. No hay dos papeles.
//
// 🩸 EL PDF SE ARMA SIN NINGÚN `await` EN EL MEDIO, a propósito: Safari en iOS
// solo deja abrir la hoja de compartir (y una pestaña) DENTRO del gesto del
// toque, y un `await` de red hace que deje de contar como tal. Quien llame a
// estas dos funciones tiene que tener la guía COMPLETA en la mano —con sus
// renglones— antes del clic; pedirla acá sería perder el gesto.
// ============================================================================

// ⚠️ ESTE MÓDULO ARRASTRA jsPDF (~148 kB). Se pide con `await import(…)` desde
// donde se lo usa, NUNCA con un import de arriba: metido estático en `/guias` o
// en `/guias/[id]` —las dos pantallas que bodega abre desde el celular todo el
// día— la carga inicial pasaba de 196 kB a 344 kB. La pregunta barata («¿esta
// guía trae renglones?») vive aparte en `tiene-renglones.ts` justamente para
// que preguntarla no cueste el generador de PDF.
import { compartirArchivo, type ResultadoCompartir } from "@/lib/compartir-archivo";
import { fmtGuia } from "@/lib/format";
import { imprimirPdf } from "@/lib/imprimir-pdf";
import { construirPdfGuia, nombreArchivoGuia } from "./pdf-guia";
import { formatoParaCompartir } from "./compartir-formato";
import { construirPngGuia } from "./png-guia";
import type { Guia } from "@/app/guias/components/types";

// ⚠️ `precargarFirmasGuia` NO se re-exporta desde acá a propósito: las pantallas
// lo importan de `png-guia` DIRECTO, que no arrastra jsPDF. Pasarlo por este
// módulo obligaría a bajar el generador de PDF al abrir cada guía — justo lo
// que la nota de arriba viene evitando.

/**
 * Manda la guía a la impresora, sin pantalla intermedia.
 *
 * `autoPrint()` escribe la orden de imprimir ADENTRO del PDF: es lo que hace
 * que aparezca el diálogo solo, sin que nadie toque nada más.
 */
export function imprimirGuia(g: Guia): "dialogo" | "visor" | "bloqueado" {
  const doc = construirPdfGuia(g);
  doc.autoPrint();
  return imprimirPdf(doc.output("blob"));
}

/**
 * Abre la hoja de compartir del celular con la guía (WhatsApp, correo,
 * AirDrop). En escritorio —donde esa hoja no existe— la descarga, que es lo
 * correcto ahí y no un plan B pobre.
 *
 * 🔴 IMAGEN HASTA 6 RENGLONES, PDF DE AHÍ PARA ARRIBA (5-sep-2026). Daniel:
 * *«en el grupo de WhatsApp siempre ponen compartir cuando terminan (llega en
 * pdf)»* — y eligió la imagen con corte. Una imagen se lee DENTRO del chat;
 * un PDF hay que abrirlo. Medido: 94% de las guías tienen 6 renglones o menos.
 * El corte y su medición viven en `compartir-formato.ts`.
 *
 * ⚠️ EL BOTÓN SIGUE LLAMÁNDOSE «Compartir» Y DECIDE SOLO: no se le pregunta
 * nada a nadie. E **imprimir no cambió**: el papel es y sigue siendo el PDF.
 *
 * ⚠️ Sin canvas 2D (o si algo falla al dibujar) se cae al PDF de siempre. Se
 * arma antes de llamar a la hoja y sin un solo `await` en el medio — iOS lo
 * exige.
 */
export async function compartirGuia(g: Guia): Promise<ResultadoCompartir> {
  const archivo = archivoParaCompartir(g);
  return compartirArchivo(archivo, {
    title: `Guía ${fmtGuia(g.numero)}`,
    text: `Guía de transporte ${fmtGuia(g.numero)} — Fashion Group`,
  });
}

/** El archivo que sale por «Compartir». Síncrono a propósito (ver arriba). */
function archivoParaCompartir(g: Guia): File {
  if (formatoParaCompartir((g.guia_items ?? []).length) === "png") {
    const png = construirPngGuia(g);
    if (png) return png;
  }
  const blob = construirPdfGuia(g).output("blob");
  return new File([blob], nombreArchivoGuia(g), { type: "application/pdf" });
}

