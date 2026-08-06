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
