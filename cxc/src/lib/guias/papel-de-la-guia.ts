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
 * Abre la hoja de compartir del celular con la guía (WhatsApp, correo,
 * AirDrop). En escritorio —donde esa hoja no existe— la descarga, que es lo
 * correcto ahí y no un plan B pobre.
 *
 * 🔴 SIEMPRE EL PDF, EN LOS DOS APARATOS (9-sep-2026). Daniel: *«en guía,
 * quiero todo PDF, quita lo de PNG que lo enredó»*. Hasta ese día el celular
 * mandaba una IMAGEN si la guía tenía 6 renglones o menos: dos documentos con
 * dos formas para la misma guía, y cuál salía dependía del aparato y del largo
 * — cosas que quien toca el botón no ve. Lo que se comparte y lo que se imprime
 * son ahora el MISMO archivo. La decisión sigue viviendo en el módulo puro
 * `compartir-formato.ts`, con su medición conservada.
 *
 * ⚠️ EL BOTÓN SIGUE LLAMÁNDOSE «Compartir» Y NO PREGUNTA NADA. E **imprimir no
 * cambió**: el papel es y sigue siendo el PDF.
 *
 * 🩸 El archivo se arma sin un solo `await` en el medio: Safari en iOS solo
 * abre la hoja de compartir DENTRO del gesto del toque, y un `await` de red
 * hace que deje de contarlo como tal.
 */
export async function compartirGuia(g: Guia): Promise<ResultadoCompartir> {
  const archivo = archivoParaCompartir(g);
  return compartirArchivo(archivo, {
    title: `Guía ${fmtGuia(g.numero)}`,
    text: `Guía de transporte ${fmtGuia(g.numero)} — Fashion Group`,
  });
}

/**
 * El archivo que sale por «Compartir»: **el PDF, siempre**. Síncrono a
 * propósito (ver arriba).
 *
 * 🔄 Hasta el 9-sep-2026 acá se preguntaba el formato (`formatoParaCompartir`)
 * y el aparato (`aparatoDeQuienMira`) para decidir entre la imagen y el PDF.
 * Ya no hay dos formatos que decidir, así que no se pregunta nada: dejar la
 * pregunta escrita cuando la respuesta es una sola es cómo se lee un camino que
 * no existe. Los dos módulos siguen en su sitio, retirados y con su medición.
 */
function archivoParaCompartir(g: Guia): File {
  const blob = construirPdfGuia(g).output("blob");
  return new File([blob], nombreArchivoGuia(g), { type: "application/pdf" });
}
