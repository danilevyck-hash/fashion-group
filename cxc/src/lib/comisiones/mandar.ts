// ─────────────────────────────────────────────────────────────────────────────
// 🔴 MANDARLE LA COMISIÓN AL VENDEDOR — LA HOJA DE COMPARTIR DEL TELÉFONO,
//    COMO EN GUÍAS (25-sep-2026, la «9r», corregida el mismo día).
//
// Daniel, textual, mirando la hoja de tres botones: *«¿Copiar link y WhatsApp
// es necesario? Si se me abre el PDF como en Guías, se manda a su chat y ya;
// así quitas esos botones extra»*.
//
// 🩸 QUÉ SE FUE, Y POR QUÉ. La primera versión abría una hoja NUESTRA con tres
// salidas —Correo · WhatsApp · Copiar el link—. Eran tres caminos para lo mismo,
// y dos de ellos pedían un cajón de Storage (`comisiones-papeles`) que **nunca
// existió**: el link se firmaba contra un cajón inexistente. El teléfono ya
// tiene esa lista, es la suya, está en español y la persona la conoce — WhatsApp
// y el correo salen ahí, sin que nosotros los dibujemos.
//
// 🔴 ES EXACTAMENTE LO QUE HACE «COMPARTIR» DE GUÍAS (`lib/guias/papel-de-la-
// guia.ts`): se arma el PDF y se le entrega al sistema. En el celular sale la
// hoja de compartir; en la computadora —donde esa hoja no existe— se DESCARGA,
// que ahí es lo correcto y no un plan B pobre.
//
// 🔴 EL PDF ES EL MISMO QUE BAJA «DESCARGAR». No hay un segundo generador: lo
// arma `construirPdfComision`, el de siempre. Si el papel cambia, cambia el que
// se manda, sin tocar este archivo.
//
// 🩸 EL ARCHIVO SE ARMA SIN UN SOLO `await` EN EL MEDIO, a propósito: Safari en
// iOS solo abre la hoja de compartir DENTRO del gesto del toque, y un `await` de
// red hace que deje de contarlo como tal (la misma regla de la nota de entrega
// de Mobiliario). Por eso `archivoDeLaComision` es SÍNCRONA y quien la llama
// tiene el detalle ya cargado.
//
// 🔑 NO HAY CORREO PROPIO, y no es un olvido. Guías tampoco lo ofrece: el correo
// es una de las opciones de la hoja del teléfono. Y el sistema no guarda el
// correo de ningún vendedor (`comision_vendedor_tasa` y `comision_vendedor_alias`
// solo tienen el nombre), así que pedirlo a mano era un formulario de más.
// ─────────────────────────────────────────────────────────────────────────────

import { compartirArchivo, type ResultadoCompartir } from "@/lib/compartir-archivo";
import { construirPdfComision } from "./pdf-comision";
import type { HojaReporte } from "./reporte-comision";

/**
 * 🩸 EL CAJÓN QUE NO SE CREÓ. `comisiones-papeles` era el bucket privado donde
 * iba a vivir el papel mientras durara el link firmado de 30 días. **No existe
 * en Storage y ya no hace falta**: con la hoja de compartir el archivo va del
 * teléfono al chat sin pasar por ningún cajón. Se deja escrito acá —sin un solo
 * lector— para que nadie lo vuelva a inventar creyendo que falta.
 */
export const CAJON_QUE_NO_SE_CREO = "comisiones-papeles";

/** El título que ve la hoja de compartir. Corto: es lo que se lee arriba. */
export function tituloDeLoQueSeComparte(vendedor: string, periodo: string): string {
  return `Comisión de ${periodo} — ${vendedor}`;
}

/** El texto que acompaña al archivo en el chat o en el correo. */
export function textoDeLoQueSeComparte(vendedor: string, periodo: string): string {
  return `${vendedor} — comisión de ${periodo}. Fashion Group`;
}

/**
 * El archivo que sale por «Mandar»: **el PDF, siempre**, el mismo de
 * «Descargar». Síncrona a propósito (ver arriba).
 */
export function archivoDeLaComision(hojas: HojaReporte[], nombreSinExtension: string): File {
  const blob = construirPdfComision(hojas).output("blob");
  return new File([blob], `${nombreSinExtension}.pdf`, { type: "application/pdf" });
}

/**
 * Abre la hoja de compartir del celular con el papel de la comisión (WhatsApp,
 * correo, AirDrop). En la computadora lo descarga.
 *
 * Devuelve `"cancelado"` cuando la persona cierra la hoja sin elegir nada: no es
 * un error y no se muestra como tal.
 */
export async function compartirComision(
  hojas: HojaReporte[],
  nombreSinExtension: string,
  vendedor: string,
  periodo: string,
): Promise<ResultadoCompartir> {
  const archivo = archivoDeLaComision(hojas, nombreSinExtension);
  return compartirArchivo(archivo, {
    title: tituloDeLoQueSeComparte(vendedor, periodo),
    text: textoDeLoQueSeComparte(vendedor, periodo),
  });
}

/** Lo que se dice cuando el papel quedó bajado (computadora, o sin hoja). */
export const PAPEL_DESCARGADO = "Listo, el papel se bajó";
