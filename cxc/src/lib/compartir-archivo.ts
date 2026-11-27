// ============================================================================
// COMPARTIR UN ARCHIVO con la hoja nativa del celular (WhatsApp, correo, AirDrop).
//
// Daniel lo pidió así, textual: *"de la misma manera que cuando estas en un
// documento y pones compartir"*. O sea la hoja del sistema, no un menú nuestro
// con una lista de apps.
//
// 🩸 HAY QUE PREGUNTAR DOS COSAS, NO UNA. `navigator.share` existe en muchos
// navegadores que NO aceptan archivos (solo texto y links): preguntar solo por
// `navigator.share` y mandarle un archivo termina en un `share` que se abre
// vacío o que revienta. Por eso se pregunta también `canShare({ files })`, que
// es lo único que responde "este navegador comparte ARCHIVOS".
//
// 🩸 Y HAY QUE LLAMARLO DENTRO DEL CLIC. Safari en iOS exige que `share()` salga
// de un gesto del usuario; si primero se hace un `await` largo (armar el PDF,
// pedir datos al servidor) el navegador ya no lo considera parte del toque y lo
// bloquea con `NotAllowedError`. Por eso `compartirArchivo` recibe el archivo YA
// ARMADO: quien la llama tiene que construirlo antes, de forma sincrónica o con
// el resultado en mano.
//
// La bajada a descarga NO es un plan B pobre: en una computadora de escritorio
// es lo correcto, y ahí es donde `canShare` da false casi siempre.
// ============================================================================

import { aparatoDeQuienMira } from "@/lib/aparato";

export type ResultadoCompartir = "compartido" | "descargado" | "cancelado";

/** ¿Este navegador puede mandar ARCHIVOS a la hoja de compartir? */
export function puedeCompartirArchivos(archivo: File): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (typeof nav.share !== "function" || typeof nav.canShare !== "function") return false;
  try {
    return nav.canShare({ files: [archivo] });
  } catch {
    return false;
  }
}

/**
 * Lo mismo con VARIOS archivos (los PDF de un estado de cuenta, uno por
 * empresa) y un texto. Sin hoja de compartir, se descargan todos.
 */
export async function compartirArchivos(
  archivos: File[],
  datos?: { title?: string; text?: string },
): Promise<ResultadoCompartir> {
  const nav = typeof navigator === "undefined" ? null : (navigator as Navigator & { canShare?: (d: ShareData) => boolean });
  let puede = false;
  try {
    puede = !!nav && typeof nav.share === "function" && typeof nav.canShare === "function" && nav.canShare({ files: archivos });
  } catch {
    puede = false;
  }
  if (!puede) {
    archivos.forEach(descargarArchivo);
    return "descargado";
  }
  try {
    await navigator.share({ files: archivos, ...datos });
    return "compartido";
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") return "cancelado";
    archivos.forEach(descargarArchivo);
    return "descargado";
  }
}

/** Descarga el archivo (escritorio, o navegador sin hoja de compartir). */
export function descargarArchivo(archivo: File): void {
  const url = URL.createObjectURL(archivo);
  const a = document.createElement("a");
  a.href = url;
  a.download = archivo.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Se libera después del clic: revocarla en el mismo tick cancela la descarga
  // en algunos navegadores.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Abre la hoja de compartir con el archivo; si el navegador no comparte
 * archivos, lo descarga.
 *
 * Devuelve `"cancelado"` cuando la persona cierra la hoja sin elegir nada — no
 * es un error y no debe mostrarse como tal.
 */
export async function compartirArchivo(
  archivo: File,
  datos?: { title?: string; text?: string },
): Promise<ResultadoCompartir> {
  if (!puedeCompartirArchivos(archivo)) {
    descargarArchivo(archivo);
    return "descargado";
  }
  try {
    await navigator.share({ files: [archivo], ...datos });
    return "compartido";
  } catch (e) {
    // Cerrar la hoja sin elegir nada llega como AbortError. Es lo normal.
    if (e instanceof Error && e.name === "AbortError") return "cancelado";
    // Cualquier otra cosa (permiso denegado, gesto perdido): que igual se lleve
    // el archivo, que es lo que la persona quería.
    descargarArchivo(archivo);
    return "descargado";
  }
}

// ============================================================================
// 🔴 VER UN PDF (27-nov-2026). LA ÚNICA PUERTA PARA ABRIR UN PDF O UN BLOB.
//
// 🩸 LO QUE PASABA: «Ver PDF» de la confirmación del pedido era un enlace con
// `target="_blank"`. En la app INSTALADA en la pantalla de inicio del iPhone o
// del iPad (modo standalone) no existen las pestañas: la MISMA ventana de la app
// se iba al PDF, sin barra, sin «volver» y sin «compartir». Daniel tenía que
// cerrar la app de fondo. Igual con todo `window.open` a un `blob:` o a una
// dirección de la casa. (Una dirección de OTRO dominio —wa.me, el storage— sí
// se abre en el visor con «Listo»; esa no es la trampa.)
//
// 🔑 Por eso: con el DEDO (iPhone, iPad aunque diga «Macintosh», Android) el PDF
// va a la HOJA DE COMPARTIR, que deja verlo, mandarlo, imprimirlo y cerrarla.
// En la computadora, pestaña nueva; si el navegador la bloquea, se descarga.
// El archivo tiene que llegar YA ARMADO: ver la regla del gesto, arriba.
// Candado: `ver-pdf-una-puerta.test.ts`.
// ============================================================================

/** ¿Este aparato abre el PDF en la hoja de compartir (dedo + archivos)? */
export function pdfVaALaHoja(archivo: File): boolean {
  return aparatoDeQuienMira() === "celular" && puedeCompartirArchivos(archivo);
}

/** Abre una pestaña nueva. Solo la usan los caminos de COMPUTADORA. */
export function abrirPestana(url: string): Window | null {
  if (typeof window === "undefined") return null;
  return window.open(url, "_blank");
}

/**
 * Muestra un PDF ya armado. `imprimir` = en la computadora, además, pide el
 * diálogo de impresión al cargar (en el celular la hoja ya trae «Imprimir»).
 */
export async function verPdf(
  archivo: File,
  opciones: { imprimir?: boolean; title?: string } = {},
): Promise<ResultadoCompartir | "pestana"> {
  if (aparatoDeQuienMira() === "celular") {
    // Con dedo NUNCA se abre una ventana: sin hoja de compartir, se descarga.
    return compartirArchivo(archivo, opciones.title ? { title: opciones.title } : undefined);
  }
  const url = URL.createObjectURL(archivo);
  const ventana = abrirPestana(url);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  if (!ventana) {
    descargarArchivo(archivo);
    return "descargado";
  }
  if (opciones.imprimir) ventana.addEventListener("load", () => ventana.print(), { once: true });
  return "pestana";
}
