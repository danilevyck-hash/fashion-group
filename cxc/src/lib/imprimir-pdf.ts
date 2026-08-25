// ============================================================================
// IMPRIMIR UN PDF DIRECTO, sin pantalla intermedia.
//
// Daniel, punto 10: *"Imprimir → un botón que imprime directo"*.
//
// 🩸 LO QUE PASABA: «Imprimir» abría una PESTAÑA NUEVA con una vista previa de
// la guía, y ahí adentro había que buscar otro botón «Imprimir». Dos toques y
// un cambio de pantalla para mandar un papel a la impresora — con el camión
// esperando.
//
// 🔑 EL ARCHIVO QUE SE IMPRIME ES EL MISMO QUE SE COMPARTE. Se manda a la
// impresora el PDF de `pdf-guia.ts`, no la pantalla: la vista previa vive
// dentro de `HojaEscalada`, que le aplica un `transform: scale(...)`, así que
// `window.print()` sobre el DOM depende de en qué aparato se está mirando.
// Un PDF sale igual desde cualquier lado.
//
// 🩸 Y HAY DOS CAMINOS PORQUE HAY DOS MUNDOS, no por gusto:
//
//   · **Escritorio** — el PDF se carga en un `<iframe>` escondido y el propio
//     documento pide imprimirse (`autoPrint()` escribe esa orden ADENTRO del
//     PDF). El diálogo de impresión aparece encima de la guía: no se cambia de
//     pantalla y no hay pestaña que cerrar después.
//
//   · **iPhone y iPad** — Safari NO ejecuta esa orden dentro de un iframe: el
//     PDF se queda ahí quieto y no pasa nada. Ahí se abre el visor del sistema,
//     que trae su propio botón de imprimir/compartir (AirPrint). Es un toque
//     igual, y es el único camino que de verdad llega a la impresora.
//     ⚠️ El `window.open` tiene que salir DENTRO del clic: con un `await` en el
//     medio Safari deja de contarlo como gesto y lo bloquea como popup. Por eso
//     el PDF se arma sincrónicamente, sin `await`, antes de abrir nada.
// ============================================================================

/** Cuánto se deja el iframe en la página antes de sacarlo (ms). */
const VIDA_DEL_IFRAME = 60_000;

/**
 * ¿Estamos en un iPhone/iPad?
 *
 * ⚠️ El iPad moderno se anuncia como "Macintosh" en Safari, así que mirar solo
 * el nombre lo daría por escritorio y le mostraríamos un iframe que nunca
 * imprime. Se lo distingue por tener pantalla táctil.
 */
export function esIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return /Mac/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1;
}

/**
 * Manda un PDF a la impresora.
 *
 * @param blob  el PDF ya armado (`doc.output("blob")` con `autoPrint()` puesto).
 * @returns `"dialogo"` si se abrió el diálogo de impresión acá mismo,
 *          `"visor"` si se abrió el visor del sistema (iOS),
 *          `"bloqueado"` si el navegador impidió abrirlo.
 */
export function imprimirPdf(blob: Blob): "dialogo" | "visor" | "bloqueado" {
  const url = URL.createObjectURL(blob);

  if (esIOS()) {
    const w = window.open(url, "_blank");
    // La URL no se revoca enseguida: el visor todavía la está leyendo.
    setTimeout(() => URL.revokeObjectURL(url), VIDA_DEL_IFRAME);
    return w ? "visor" : "bloqueado";
  }

  const iframe = document.createElement("iframe");
  // No `display:none`: hay navegadores que no cargan un iframe oculto del todo.
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.setAttribute("aria-hidden", "true");
  iframe.src = url;
  document.body.appendChild(iframe);
  // Se saca solo: dejar un iframe por cada impresión llena la página de
  // documentos invisibles en una jornada de bodega.
  setTimeout(() => {
    iframe.remove();
    URL.revokeObjectURL(url);
  }, VIDA_DEL_IFRAME);
  return "dialogo";
}
