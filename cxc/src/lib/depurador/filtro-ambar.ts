// El desplegable de la vista previa de Calvin/Tommy/KL, y su opción «ámbar».
//
// 🩸 El aviso decía «5 estilo(s) en ámbar: la regla no encontró la talla
// esperada y usó la más chica. Revísalos en la tabla y ajusta la talla si hace
// falta» — y había que buscarlos A MANO entre 400 filas. El aviso pedía una
// acción que la pantalla no ofrecía.
//
// 🔴 UN SOLO MECANISMO DE FILTRADO. La tabla ya tiene un desplegable
// («Todas las descripciones»); «Ver solo esos N» NO agrega un segundo filtro:
// escribe un valor especial EN EL MISMO desplegable. Por eso el filtro se ve
// puesto, se puede quitar por donde se quitan los otros, y no hay dos estados
// que puedan contradecirse.

import { norm } from "./celda";

/** El valor del desplegable que significa «solo los que hay que revisar».
 *  Empieza con `__` para que no pueda chocar con una descripción del archivo:
 *  `normalizeDescripcion` nunca produce un texto así. */
export const FILTRO_AMBAR = "__ambar";

export interface FilaFiltrable {
  cols: Record<string, string | number | null>;
  /** true = la regla no halló la talla esperada y usó la más chica. */
  fallback: boolean;
}

/**
 * ¿Esta fila se ve con este filtro? PURA.
 *
 *   `""`            → todas
 *   `FILTRO_AMBAR`  → solo las que hay que revisar
 *   cualquier otro  → las de esa descripción, por IGUALDAD normalizada (nunca
 *                     por parecido: el desplegable ofrece las que existen).
 */
export function filaVisible(fila: FilaFiltrable, filtro: string): boolean {
  if (filtro === FILTRO_AMBAR) return fila.fallback;
  const q = norm(filtro);
  if (!q) return true;
  return norm(fila.cols["Descripción *"]) === q;
}

/** Lo que se escribe en «N de M» cuando el filtro está puesto. Con el filtro
 *  ámbar NO se muestra el valor crudo (`__ambar`) por ningún lado. */
export const rotuloFiltro = (filtro: string): string =>
  filtro === FILTRO_AMBAR ? "los que hay que revisar" : filtro;
