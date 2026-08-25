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
import type { Guia } from "@/app/guias/components/types";

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
 * Abre la hoja de compartir del celular con el PDF de la guía (WhatsApp,
 * correo, AirDrop). En escritorio —donde esa hoja no existe— lo descarga, que
 * es lo correcto ahí y no un plan B pobre.
 */
export async function compartirGuia(g: Guia): Promise<ResultadoCompartir> {
  const blob = construirPdfGuia(g).output("blob");
  const archivo = new File([blob], nombreArchivoGuia(g), { type: "application/pdf" });
  return compartirArchivo(archivo, {
    title: `Guía ${fmtGuia(g.numero)}`,
    text: `Guía de transporte ${fmtGuia(g.numero)} — Fashion Group`,
  });
}

