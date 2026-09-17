// ─────────────────────────────────────────────────────────────────────────────
// EL ÁMBAR DE REEBOK QUE ASUSTABA Y NO DECÍA QUÉ HACER (17-sep-2026)
//
// 🩸 Medido sobre el despacho de ropa: el aviso marcaba **30 de 75 artículos**
// (T-SHIRTS 22 · BRA 3 · TOPS 3 · JACKETS 2) y decía «Estos artículos van a
// quedar sin categoría… Revísalos antes de subir el archivo».
//
// **No había nada que revisar.** Esas cuatro categorías vienen BIEN en el
// archivo de Reebok; lo que pasa es que el catálogo de la web todavía no las
// conoce (`CATEGORIA_POR_RUBRO`, en `src/lib/reebok-clasificacion.ts`, y su
// espejo `REEBOK_CATEGORY_ESPERADAS`). Con el 40 % de la lista en ámbar y sin
// nada que hacer, la próxima vez nadie lo lee — y ahí adentro van los avisos que
// sí hay que mirar.
//
// 🔴 LO QUE CAMBIA ES A QUIÉN LE HABLA CADA AVISO, NO QUÉ SE DETECTA.
// `valoresInesperados` no se tocó: sigue devolviendo las tres columnas. Acá se
// parte en dos, porque son dos problemas distintos:
//
//   · **CATEGORY** — el valor viene bien y falta del lado del catálogo. Es una
//     lista de categorías por agregar, no una lista de artículos por revisar.
//   · **GENDER y Department** — ahí el valor SÍ puede venir mal del proveedor.
//     Ese aviso NO cambia: mismo ámbar, mismo texto, misma lista de artículos.
// ─────────────────────────────────────────────────────────────────────────────

import type { ValorInesperado } from "./reebok";

/** El aviso de CATEGORY: qué categorías faltan y a cuántos productos afectan. */
export interface CategoriasQueFaltan {
  /** Las categorías del archivo que el catálogo no conoce, de más productos a
   *  menos (el orden en que `valoresInesperados` ya las entrega). */
  categorias: string[];
  /** Productos distintos afectados. Es el número que duele: sin categoría, el
   *  bulto se cobra de 6 y no de 12. */
  productos: number;
}

/**
 * 🔴 UNA CATEGORÍA VACÍA NO ES UNA CATEGORÍA QUE FALTE EN EL CATÁLOGO.
 *
 * `valoresInesperados` marca la celda vacía como `"(vacío)"` —y hace bien: es el
 * caso más peligroso, porque es lo que produce una columna renombrada—. Pero no
 * hay nada que «agregarle al catálogo» llamado «(vacío)»: ahí el dato falta en
 * el ARCHIVO y hay que mirarlo, igual que un GENDER raro.
 *
 * 🩸 Medido el 17-sep-2026 sobre los dos despachos de CALZADO: no traen la
 * columna `Category`, así que el respaldo le pone `SHOES` al footwear y deja
 * vacío el resto — y sin esta línea el aviso habría dicho «Falta 1 categoría en
 * el catálogo: (vacío)», que no significa nada y que nadie puede arreglar.
 */
const CATEGORIA_VACIA = "(vacío)";

const ES_CATEGORY = (v: ValorInesperado): boolean =>
  v.columna === "CATEGORY" && v.valor !== CATEGORIA_VACIA;

/**
 * Las CATEGORY que el catálogo no conoce. `null` cuando no falta ninguna — la
 * pantalla entonces no dibuja nada.
 *
 * Los productos se cuentan SIN REPETIR: un artículo tiene una sola CATEGORY,
 * pero contar la longitud de las listas y sumarlas daría un número inflado el
 * día que eso deje de ser cierto, y un total inflado es justo lo que se está
 * arreglando aquí.
 */
export function categoriasQueFaltan(inesperados: readonly ValorInesperado[]): CategoriasQueFaltan | null {
  const deCategory = inesperados.filter(ES_CATEGORY);
  if (deCategory.length === 0) return null;
  const productos = new Set<string>();
  for (const v of deCategory) for (const a of v.articulos) productos.add(a);
  return { categorias: deCategory.map((v) => v.valor), productos: productos.size };
}

/**
 * Lo que SIGUE siendo un ámbar de «revísalo»: Department y GENDER.
 *
 * ⚠️ Se filtra por «no es CATEGORY» y no por una lista de columnas escrita a
 * mano: el día que `ValorInesperado` gane una cuarta columna, esa columna entra
 * sola al aviso que pide revisar — que es el lado seguro. Una lista a mano la
 * dejaría afuera EN SILENCIO.
 */
export function inesperadosQueSeRevisan(inesperados: readonly ValorInesperado[]): ValorInesperado[] {
  return inesperados.filter((v) => !ES_CATEGORY(v));
}

/** «T-SHIRTS, BRA, TOPS y JACKETS» — la última con «y», como se habla. */
export function listaConY(valores: readonly string[]): string {
  if (valores.length === 0) return "";
  if (valores.length === 1) return valores[0];
  return `${valores.slice(0, -1).join(", ")} y ${valores[valores.length - 1]}`;
}
