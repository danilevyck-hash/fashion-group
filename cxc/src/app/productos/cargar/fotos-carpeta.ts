// Prepara las fotos de la carpeta local para pegarlas en el Excel del pedido.
// Es la única parte que toca el navegador (canvas); el emparejado y la
// geometría viven en `lib/depurador/fotos-excel.ts` (puro) y el armado del ZIP
// en `lib/depurador/fotos-xlsx.ts`.
//
// 🔑 LAS FOTOS NO SE SUBEN A NINGÚN LADO. Se leen de la carpeta local que la
// persona elige, se achican en el navegador y se pegan dentro del .xlsx que se
// descarga. La carpeta real vive en OneDrive, son 4.742 archivos y ~800 MB:
// subirlas sería otro problema (almacenamiento, sincronización, permisos) que
// nadie pidió. Acá no hay un solo `fetch`.

import { compressImage } from "@/app/reclamos/components/fotoUpload";
import {
  CAJA_FOTO_PX,
  encajar,
  type ParFoto,
} from "@/lib/depurador/fotos-excel";
import type { FotoParaExcel } from "@/lib/depurador/fotos-xlsx";

/** Lado mayor de la miniatura que se incrusta. Se pide a `compressImage` en vez
 *  de escribir un segundo compresor. 300 px es el doble de los ~104 px que mide
 *  la celda: se ve nítida en pantalla y al imprimir, y pesa ~10-20 KB. */
export const FOTO_LADO_PX = 300;
/** Calidad JPEG de la miniatura. */
export const FOTO_CALIDAD = 0.72;

export interface ResultadoFotos {
  /** Listas para incrustar, en orden de fila. */
  fotos: FotoParaExcel[];
  /** Códigos que tenían archivo pero no se pudo leer la imagen (archivo dañado). */
  fallidas: string[];
  /** Códigos que quedaron con foto de verdad (los demás dicen NO IMAGEN). */
  conFoto: Set<string>;
  /** Peso total de las miniaturas incrustadas, en bytes. */
  bytes: number;
}

/** Mide una imagen ya comprimida. Se decodifica aparte porque `compressImage`
 *  devuelve un File y no sus dimensiones, y sin ellas no se puede conservar la
 *  proporción al encajarla en la celda. */
async function medir(file: File): Promise<{ w: number; h: number }> {
  if (typeof createImageBitmap === "function") {
    const bmp = await createImageBitmap(file);
    const r = { w: bmp.width, h: bmp.height };
    bmp.close();
    return r;
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<{ w: number; h: number }>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve({ w: el.naturalWidth, h: el.naturalHeight });
      el.onerror = () => reject(new Error("no se pudo leer la imagen"));
      el.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Achica y mide las fotos emparejadas. `pares[i]` corresponde a la fila `i + 1`
 * de la hoja (la fila 0 es el encabezado).
 *
 * ⚠️ Una foto que no se puede leer NO deja la celda en blanco: su código sale de
 * `conFoto`, así que la celda dice "NO IMAGEN" — que es la verdad. Dejarla vacía
 * se vería igual que "no se pegó y nadie se dio cuenta".
 */
export async function prepararFotos(
  pares: readonly ParFoto<File>[],
  onProgreso?: (hechas: number, total: number) => void,
): Promise<ResultadoFotos> {
  const total = pares.filter((p) => p.foto !== null).length;
  const fotos: FotoParaExcel[] = [];
  const fallidas: string[] = [];
  const conFoto = new Set<string>();
  let bytes = 0;
  let hechas = 0;
  // El mismo artículo puede venir en dos PO distintas → dos filas con la MISMA
  // foto. Se achica una sola vez y las dos filas comparten los bytes (el ZIP
  // también los guarda una sola vez, ver `incrustarFotosEnXlsx`).
  const yaHecha = new Map<File, { bytes: Uint8Array; w: number; h: number }>();

  for (let i = 0; i < pares.length; i++) {
    const par = pares[i];
    if (!par.foto) continue;
    try {
      let listo = yaHecha.get(par.foto);
      if (!listo) {
        const chica = await compressImage(par.foto, { maxDimension: FOTO_LADO_PX, quality: FOTO_CALIDAD });
        const { w, h } = await medir(chica);
        listo = { bytes: new Uint8Array(await chica.arrayBuffer()), w, h };
        yaHecha.set(par.foto, listo);
        bytes += listo.bytes.byteLength;
      }
      const caja = encajar(listo.w, listo.h, CAJA_FOTO_PX);
      fotos.push({
        fila: i + 1, // +1 porque la fila 0 es el encabezado
        bytes: listo.bytes,
        anchoPx: caja.ancho,
        altoPx: caja.alto,
        offsetXPx: caja.offsetX,
        offsetYPx: caja.offsetY,
      });
      conFoto.add(par.codigo);
    } catch {
      fallidas.push(par.codigo);
    }
    hechas++;
    onProgreso?.(hechas, total);
    // Le devuelve el hilo al navegador cada 10 fotos para que la barra de
    // progreso avance de verdad en vez de congelarse hasta el final.
    if (hechas % 10 === 0) await new Promise((r) => setTimeout(r, 0));
  }

  return { fotos, fallidas, conFoto, bytes };
}
