// ─────────────────────────────────────────────────────────────────────────────
// UN PDF QUE SE ABRE EN PESTAÑA NUEVA, NO QUE SE BAJA (18-sep-2026)
//
// Daniel: *«abrir el PDF en pestaña nueva (inline), no descargar. Igual que
// "Ver PDF" de Catálogos»* — desde ahí es un clic a imprimir, no se llena la
// carpeta de Descargas, y en el iPad abre el menú de compartir.
//
// 🔴 LA TRAMPA DE iOS, Y ES LA DE LA CASA. Safari solo deja abrir una ventana
// que nace DENTRO del gesto: si entre el clic y el `window.open` hay un
// `await` —el `import()` de jsPDF, o el POST que guarda la etiqueta—, la
// cuenta del gesto ya se cerró y la pestaña se bloquea sin decir nada. Es la
// misma piedra que ya está escrita en `imprimir-pdf.ts` («el `window.open`
// tiene que salir DENTRO del clic») y en la nota de entrega de Marketing («iOS
// bloquea la hoja de compartir si hay un `await` de red en el medio»).
//
// Por eso acá el orden es al revés de como se escribiría solo: **primero la
// pestaña vacía, después el trabajo lento**, y al final se le pone la
// dirección del blob.
//
// ⚠️ CATÁLOGOS ABRE UNA URL DEL SERVIDOR; ACÁ EL PDF SE ARMA EN EL NAVEGADOR.
// No se copió mal: allá hay una dirección antes del clic y acá no existe
// todavía, así que se abre la pestaña en blanco y se la manda al `bloburl`
// cuando el documento está listo. Mismo resultado para quien mira, otro camino.
//
// 🔴 Y SI NO SE PUEDE, EL PAPEL IGUAL SALE: pestaña bloqueada por el navegador
// → se intenta la abierta directa con la dirección ya en la mano, y si tampoco
// → se baja el archivo, como antes. Nunca se queda nadie sin sus etiquetas.
// ─────────────────────────────────────────────────────────────────────────────

/** Un PDF ya armado, listo para mostrarse o para bajarse. */
export interface PdfListo {
  /** La dirección del blob (`doc.output("bloburl")`). */
  url: string;
  /** La red de abajo: bajar el archivo si no hubo pestaña. */
  descargar: () => void;
}

/** Lo mínimo que este módulo le pide a una ventana abierta (para poder probarlo). */
export interface VentanaAbierta {
  location: { href: string };
  closed?: boolean;
  close?: () => void;
}

export type AbrirVentana = (url: string) => VentanaAbierta | null;

/** Cómo termina el intento. `"nada"` = no había PDF que mostrar. */
export type ResultadoPestana = "pestana" | "descarga" | "nada";

function abrirDeVerdad(url: string): VentanaAbierta | null {
  if (typeof window === "undefined") return null;
  return window.open(url, "_blank") as unknown as VentanaAbierta | null;
}

/**
 * Abre un PDF en una pestaña nueva.
 *
 * 🔴 `abrir("")` sale **antes** de esperar a `armar()`: ése es el invariante de
 * este módulo y hay candado que lo mira.
 *
 * `armar` devuelve `null` cuando no hay nada que mostrar (el servidor dijo que
 * no, faltó un dato): entonces la pestaña en blanco se cierra y no queda una
 * ventana vacía dando vueltas. Si `armar` revienta, la pestaña también se
 * cierra y el error sube tal cual — quien llama es el que sabe qué decir.
 */
export async function abrirPdfEnPestana(
  armar: () => Promise<PdfListo | null>,
  abrir: AbrirVentana = abrirDeVerdad,
): Promise<ResultadoPestana> {
  // 🔴 PRIMERO LA PESTAÑA, DENTRO DEL GESTO. No mover debajo del `await`.
  const ventana = abrir("");

  let pdf: PdfListo | null;
  try {
    pdf = await armar();
  } catch (e) {
    cerrar(ventana);
    throw e;
  }
  if (!pdf) {
    cerrar(ventana);
    return "nada";
  }

  if (ventana && !ventana.closed) {
    ventana.location.href = pdf.url;
    return "pestana";
  }

  // Red 1: algunos navegadores sí permiten la abierta directa con la dirección
  // ya en la mano (y en escritorio nunca hubo bloqueo).
  const segunda = abrir(pdf.url);
  if (segunda) return "pestana";

  // Red 2: sin pestaña, el archivo se baja. Es lo que hacía la Fase 1.
  pdf.descargar();
  return "descarga";
}

function cerrar(v: VentanaAbierta | null): void {
  try {
    v?.close?.();
  } catch {
    /* una ventana que ya no está no es un problema */
  }
}
