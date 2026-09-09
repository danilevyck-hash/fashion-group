// ─────────────────────────────────────────────────────────────────────────────
// LA REGLA DE TALLA DEL EAN REPRESENTATIVO — módulo PURO (8-sep-2026).
//
// Antes esto era una cadena de `if/else` dentro de `pickEAN` (logic.ts) y la
// pestaña «Reglas» tenía una tabla TECLEADA A MANO que decía ser su espejo. Ya
// se habían separado. Ahora hay UNA sola tabla: `pickEAN` decide con ella y la
// pantalla la dibuja. Cambiar la regla es cambiar esta lista.
//
// Sin base, sin red, sin `new Date()`.
// ─────────────────────────────────────────────────────────────────────────────

import { norm, type Cell } from "./celda";

// Palabras que indican prenda inferior (pantalón/short) → talla numérica de ropa
const BOTTOMS = ["SHORT", "PANT", "DENIM", "TROUSER", "JEAN", "CHINO", "BERMUDA", "JOGGER", "LEGGING", "SKIRT", "FALDA"];
// Palabras que indican calzado → talla numérica de zapato (distinta de ropa)
const FOOTWEAR = ["SNEAKER", "SANDAL", "SHOE", "BOOT", "FLIP FLOP", "FLIPFLOP", "SLIPPER", "ESPADRILLE", "LOAFER", "HEEL", "MULE", "FOOTWEAR", "CHANCLA", "ZAPATO", "BOTA", "TENIS", "MOCASIN"];
// 🩸 Palabras que van SIEMPRE a talla de LETRA, aunque adentro lleven una
// palabra de calzado o de pantalón (8-sep-2026).
//
// "SWIMSHO" vivía en FOOTWEAR desde el primer commit del módulo, así que
// "Men-Swimshorts" —descripción viva en TRES marcas (CK Swimwear, TH Menswear,
// TH Swimwear)— probaba la talla 41 de ZAPATO antes que nada. Daniel eligió que
// busque M, como el resto de la ropa. Sacarlo de FOOTWEAR a secas no alcanza:
// "SWIMSHORTS" contiene "SHORT", así que caería en BOTTOMS y pediría la 32.
// Esta familia gana a las dos.
const TALLA_LETRA = ["SWIMSHO"];

/* ── LA REGLA DE TALLA, COMO DATO (8-sep-2026) ────────────────────────────────
 *
 * Antes esto era una cadena de `if/else` dentro de `pickEAN` y la pestaña
 * «Reglas» tenía una tabla TECLEADA A MANO que decía ser su espejo. Ya se
 * habían separado. Ahora hay UNA sola tabla: `pickEAN` decide con ella y la
 * pantalla la dibuja. Cambiar la regla es cambiar esta lista.
 */

/** Familia de talla de una descripción: de qué se mide el artículo. */
export type FamiliaTalla = "letra" | "calzado" | "bottom";

/** Familias en ORDEN de prioridad: la primera que coincide manda.
 *  «letra» va primera porque gana a las otras dos (el short de baño). */
const FAMILIAS_TALLA: { id: FamiliaTalla; palabras: string[] }[] = [
  { id: "letra", palabras: TALLA_LETRA },
  { id: "calzado", palabras: FOOTWEAR },
  { id: "bottom", palabras: BOTTOMS },
];

/** De qué se mide un artículo según su descripción (null = ninguna familia). */
export function familiaDeTalla(catRaw: Cell): FamiliaTalla | null {
  const cat = norm(catRaw);
  for (const f of FAMILIAS_TALLA) if (f.palabras.some((w) => cat.includes(w))) return f.id;
  return null;
}

/** Un caso de la regla de talla del EAN representativo. */
export interface CasoTalla {
  id: string;
  /** Cómo se llama el caso en pantalla. */
  caso: string;
  /** Cómo se reconoce, en palabras (es lo que lee la persona). */
  detecta: string;
  /** La talla que se prueba PRIMERO en este caso. */
  talla: string;
  /** Familia que exige (null = no mira de qué se mide). */
  familia: FamiliaTalla | null;
  /** Género que exige (null = cualquiera). */
  genero: "men" | "women" | "kids" | null;
  /** true = se lleva el turno: ningún otro caso exclusivo se suma después. */
  exclusiva: boolean;
}

/** La talla que se prueba SIEMPRE al final: la ropa se mide en letra. */
export const TALLA_POR_DEFECTO = "M";

/** Los casos de la regla de talla, EN ORDEN. Es la fuente única: `pickEAN`
 *  arma con esto la lista de tallas a probar y la pestaña «Reglas» la dibuja. */
export const CASOS_TALLA: CasoTalla[] = [
  {
    id: "kids",
    caso: "Kids",
    detecta: "género o descripción con Kids (Boys/Girls/Toddler van por la regla general)",
    talla: "8",
    familia: null,
    genero: "kids",
    exclusiva: false, // no se lleva el turno: después se prueba el caso que toque
  },
  {
    id: "bano",
    caso: "Short de baño",
    detecta: "descripción con Swimshorts — aunque diga «short», se mide en letra",
    talla: TALLA_POR_DEFECTO,
    familia: "letra",
    genero: null,
    exclusiva: true,
  },
  {
    id: "calzado-hombre",
    caso: "Calzado hombre",
    detecta: "descripción con palabra de calzado (sneaker, sandal, shoe…) + Men",
    talla: "41",
    familia: "calzado",
    genero: "men",
    exclusiva: true,
  },
  {
    id: "calzado-dama",
    caso: "Calzado dama",
    detecta: "descripción con palabra de calzado + Women",
    talla: "37",
    familia: "calzado",
    genero: "women",
    exclusiva: true,
  },
  {
    id: "bottom-hombre",
    caso: "Pantalón / short hombre",
    detecta: "descripción con short, pant, denim, jean, chino… + Men",
    talla: "32",
    familia: "bottom",
    genero: "men",
    exclusiva: true,
  },
  {
    id: "bottom-dama",
    caso: "Pantalón / short dama",
    detecta: "descripción con short, pant, denim, jean, chino… + Women",
    talla: "27",
    familia: "bottom",
    genero: "women",
    exclusiva: true,
  },
];

/** Fila de cierre de la tabla en pantalla: lo que NO cae en ningún caso. */
export const CASO_TALLA_RESTO: Pick<CasoTalla, "caso" | "detecta" | "talla"> = {
  caso: "Resto (tops, ropa interior, accesorios…)",
  detecta: "todo lo demás",
  talla: TALLA_POR_DEFECTO,
};

/** Las tallas a probar, en orden, para una descripción + género.
 *  Sale de CASOS_TALLA — no hay una segunda copia de la regla. */
export function tallasAProbar(catRaw: Cell, genRaw: Cell): string[] {
  const cat = norm(catRaw), gen = norm(genRaw);
  const familia = familiaDeTalla(cat);
  const rasgos = {
    men: (cat.includes("MEN") && !cat.includes("WOMEN")) || gen === "MEN",
    women: cat.includes("WOMEN") || gen === "WOMEN",
    // Kids: a veces viene con tallas USA (M) y a veces Europa (8, 10, 12) →
    // se intenta "8" primero y se cae a "M". Solo KIDS literal (Boys/Girls/
    // Toddler siguen en la regla general).
    kids: cat.includes("KIDS") || gen === "KIDS",
  };

  const order: string[] = [];
  let turnoTomado = false;
  for (const c of CASOS_TALLA) {
    if (c.exclusiva && turnoTomado) continue;
    if (c.familia !== null && c.familia !== familia) continue;
    if (c.genero !== null && !rasgos[c.genero]) continue;
    order.push(c.talla);
    if (c.exclusiva) turnoTomado = true;
  }
  order.push(TALLA_POR_DEFECTO);
  return order.filter((t, i) => order.indexOf(t) === i);
}
