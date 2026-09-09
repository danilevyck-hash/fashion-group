// Depurador · veredicto de una descripción nueva contra el catálogo.
//
// Antes, TODA descripción que no estuviera en el catálogo de su marca abría la
// alarma bloqueante. Eran demasiadas y casi todas inofensivas. La regla de
// Daniel (25-ago-2026), textual:
//
//   1. «Girls-Short Knit debe de pasar si antes del guion ya existe en
//      cualquiera de las 3 marcas y lo que viene despues tambien». Sobre las
//      combinaciones raras con las dos mitades exactas: «no me da miedo, ya
//      que la marca nunca mandaria eso» → PASA, no se alerta.
//   2. «Lo que me preocupa es que sea por ejemplo tshirts y diga tshirt y lo
//      deje pasar» → la casi-gemela SIEMPRE alerta, y la alerta muestra cuál
//      es la gemela existente al lado.
//   3. «Lo del espacio si me da miedo. Debe de ser con uno» → toda descripción
//      que se guarde pasa por normalizarEspacios(); y si lo único que la
//      diferencia de una que ya existe son espacios o mayúsculas, se usa la
//      que ya existe (veredicto "ya-existe": no se crea una gemela).
//
// ⚠️ Consecuencia buscada de la regla 1: si las DOS mitades son exactas, pasa
// aunque el conjunto se parezca a otra del catálogo (ej. "Newborn-T-Shirts L/S"
// con "Newborn-T-Shirts S/S" ya catalogada). Es la decisión de Daniel: las
// mitades exactas ganan sobre el parecido.
//
// ── 8-sep-2026 · LAS DOS MITADES SOLO VALEN DENTRO DE LA MISMA MARCA ─────────
//
// 🩸 La regla 1 estaba TAPANDO a la regla 2, que es justo lo que a Daniel le
// preocupaba. `veredictoDescripcion("Men-Polos S/S Core", …)` devolvía **pasa**:
// la mitad «Men» existe en TH Menswear y la mitad «Polos S/S Core» existe —pero
// en TH KIDS (`Boys-Polos S/S Core`)—, así que «las dos mitades existen» y la
// casi-gemela real, `Men-Polo S/S Core` (singular, TH Menswear), nunca se
// llegaba a mirar.
//
// Costó plata: en Fashion Wear conviven `Men-Polo S/S Core` (28 artículos ·
// 4.361 piezas) y `Men-Polos S/S Core` (37 · 3.027) — 7.388 piezas de la misma
// prenda partidas en dos, con los estilos MW0MW32346 y MW0MW32347 escritos de
// las dos formas al mismo precio.
//
// Daniel eligió la opción «b»: las mitades cuentan SOLO si existen dentro de la
// MISMA marca que se está evaluando. Con eso «Polos S/S Core» ya no se
// encuentra en TH Menswear y la descripción cae en alerta, mostrando la gemela.
//
// ⚠️ NO cambió nada más: «ya-existe» (misma descripción con otros espacios o
// mayúsculas) y `normalizarEspacios` siguen mirando TODO el catálogo, y la
// casi-gemela COMPLETA también. Lo único que se acotó es el ALCANCE de las
// mitades.

import type { CatalogoDescripciones, Cell } from "./logic";

/** ÚNICA normalización de espacios de una descripción del catálogo.
 *  NFKC (NBSP → espacio normal) + colapsar toda corrida de whitespace a un
 *  solo espacio + trim. TODOS los caminos de escritura a
 *  `depurador_descripciones` pasan por acá (y la base lo refuerza con un CHECK,
 *  migración 20260826120000). Conserva la caja original: la unicidad la da el
 *  índice lower(marca), lower(descripcion). */
export function normalizarEspacios(desc: Cell): string {
  return String(desc ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
}

/** Clave de comparación de una descripción COMPLETA: normalizada, en
 *  minúsculas y sin espacios pegados al guion. Así "men -Heavyweight" y
 *  "Men-Heavyweight" caen en la misma clave: es la misma descripción escrita
 *  con otros espacios, no una gemela nueva (regla 3 de Daniel). */
function clave(desc: Cell): string {
  return normalizarEspacios(desc).toLowerCase().replace(/\s*-\s*/g, "-");
}

/** Mitad izquierda = lo que va ANTES del PRIMER guion (espejo de buildRubro).
 *  Solo el primer guion separa: "Men-Pant Non-Denim" → "Men". */
function mitadIzq(desc: string): string {
  const i = desc.indexOf("-");
  return (i === -1 ? desc : desc.slice(0, i)).trim();
}

/** Mitad derecha = TODO lo que va después del PRIMER guion, con sus guiones
 *  internos (espejo de buildSubrubro): "Men-T-Shirts S/S" → "T-Shirts S/S". */
function mitadDer(desc: string): string {
  const i = desc.indexOf("-");
  return (i === -1 ? "" : desc.slice(i + 1)).trim();
}

export type Veredicto = "ya-existe" | "pasa" | "alerta";

export type MotivoAlerta =
  /** Casi igual a una del catálogo (singular/plural, una letra). */
  | "casi-igual"
  /** Una de las mitades es casi igual a una mitad conocida. */
  | "casi-igual-mitad"
  /** Alguna mitad no existe ni se parece a nada del catálogo. */
  | "mitad-nueva"
  /** Sin guion, guion al borde, vacía. */
  | "formato";

export interface ResultadoVeredicto {
  veredicto: Veredicto;
  /** La descripción ya normalizada — la que se guardaría. */
  normalizada: string;
  /** Código de motivo (solo si veredicto = "alerta"). */
  motivo?: MotivoAlerta;
  /** Motivo en una línea corta, en español, para mostrar en pantalla. */
  texto?: string;
  /** La gemela del catálogo a mostrar al lado (motivos casi-igual*). */
  gemela?: string;
  /** La fila del catálogo que se debe usar (veredicto = "ya-existe"). */
  existente?: string;
}

/* ── Parecido ─────────────────────────────────────────────────────────────── */

/** true si las dos difieren SOLO por una "s" final en una o más palabras
 *  ("T-Shirt"/"T-Shirts", "Boys"/"Boy", "Short Knit"/"Shorts Knit"). */
function difiereSoloPorSFinal(a: string, b: string): boolean {
  if (a === b) return false;
  const pa = a.split(" ");
  const pb = b.split(" ");
  if (pa.length !== pb.length) return false;
  return pa.every((p, i) => p === pb[i] || `${p}s` === pb[i] || p === `${pb[i]}s`);
}

/** Casi-gemelas: lo que a Daniel le da miedo, «que sea por ejemplo tshirts y
 *  diga tshirt y lo deje pasar». UN solo criterio: las dos difieren SOLO por
 *  una "s" final en alguna palabra. Sin piso de largo — "Boy"/"Boys" tiene que
 *  alertar igual que "T-Shirt"/"T-Shirts".
 *
 *  ⛔ La distancia de edición (Levenshtein ≤ 2) se PROBÓ y se SACÓ el 26-ago.
 *  Medida contra las 509 descripciones vivas de CK+TH+KL, disparó 9 veces y las
 *  9 eran falsas: emparejaba prendas legítimamente distintas, no typos —
 *  "Men-Shirts"→"Men-T-Shirts" (72 art.), "Men-Polos L/S"→"Men-Polos S/S"
 *  (27 art.), "Boys-Shirts"→"Boys-Skirts" (4 art.). Una camisa no es una
 *  camiseta y manga larga no es manga corta: la diferencia es una PRENDA, no
 *  una letra comida.
 *
 *  Sacarla NO deja pasar nada: no cambia ni un veredicto (se verificó contra
 *  las 509 reales + 4.000 mutaciones sintéticas del catálogo). El parecido solo
 *  elige la ETIQUETA — cuando una mitad no existe, la alerta salta igual y
 *  ahora dice la verdad: «mitad nueva: «Shirts»». NO reponer sin volver a
 *  medir. */
export function esCasiIgual(a: string, b: string): boolean {
  if (a === b) return false;
  return difiereSoloPorSFinal(a, b);
}

/* ── Índice del catálogo ──────────────────────────────────────────────────── */

/** Las dos mitades conocidas de un conjunto de descripciones. */
export interface MitadesConocidas {
  /** clave de mitad izquierda → mitad tal cual. */
  izquierdas: Map<string, string>;
  /** clave de mitad derecha → mitad tal cual. */
  derechas: Map<string, string>;
}

interface IndiceCatalogo {
  /** clave → descripción tal cual está en el catálogo (primera aparición). */
  completas: Map<string, string>;
  /** clave de mitad izquierda → mitad tal cual (TODAS las marcas). */
  izquierdas: Map<string, string>;
  /** clave de mitad derecha → mitad tal cual (TODAS las marcas). */
  derechas: Map<string, string>;
  /** Las mismas mitades, pero SEPARADAS por marca (clave marcaKey). Es lo que
   *  mira la regla de las dos mitades desde el 8-sep-2026. */
  porMarca: Map<string, MitadesConocidas>;
}

/** Clave de marca del índice: insensible a caja y a espacios (espejo de
 *  `marcaKey` de logic.ts, replicado aquí para no acoplar los dos módulos). */
function claveMarca(marca: Cell): string {
  return String(marca ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

const CACHE = new WeakMap<CatalogoDescripciones, IndiceCatalogo>();

/** Índice del catálogo: las descripciones COMPLETAS de todas las marcas juntas
 *  (para «ya-existe» y la casi-gemela) y las MITADES separadas por marca (para
 *  la regla de las dos mitades). Cacheado por objeto de catálogo. */
export function indexarCatalogo(catalogo: CatalogoDescripciones): IndiceCatalogo {
  const hit = CACHE.get(catalogo);
  if (hit) return hit;
  const idx: IndiceCatalogo = {
    completas: new Map(), izquierdas: new Map(), derechas: new Map(), porMarca: new Map(),
  };
  for (const [marca, lista] of Object.entries(catalogo)) {
    const km = claveMarca(marca);
    let deLaMarca = idx.porMarca.get(km);
    if (!deLaMarca) {
      deLaMarca = { izquierdas: new Map(), derechas: new Map() };
      idx.porMarca.set(km, deLaMarca);
    }
    for (const cruda of lista ?? []) {
      const d = normalizarEspacios(cruda);
      if (!d) continue;
      const kd = clave(d);
      if (!idx.completas.has(kd)) idx.completas.set(kd, d);
      const izq = mitadIzq(d);
      const der = mitadDer(d);
      if (izq && !idx.izquierdas.has(izq.toLowerCase())) idx.izquierdas.set(izq.toLowerCase(), izq);
      if (der && !idx.derechas.has(der.toLowerCase())) idx.derechas.set(der.toLowerCase(), der);
      if (izq && !deLaMarca.izquierdas.has(izq.toLowerCase())) deLaMarca.izquierdas.set(izq.toLowerCase(), izq);
      if (der && !deLaMarca.derechas.has(der.toLowerCase())) deLaMarca.derechas.set(der.toLowerCase(), der);
    }
  }
  CACHE.set(catalogo, idx);
  return idx;
}

/** La gemela de `k` dentro del mapa (null si ninguna lo es). Con un solo
 *  criterio —la "s" final— no hay grados de parecido que desempatar: la
 *  primera que cumple es la que se muestra. */
function buscarGemela(k: string, mapa: Map<string, string>): string | null {
  for (const [ck, original] of mapa) {
    if (esCasiIgual(k, ck)) return original;
  }
  return null;
}

/* ── El veredicto ─────────────────────────────────────────────────────────── */

/**
 * 🔴 EL INTERRUPTOR de la regla del 8-sep-2026 (mitades acotadas a la marca).
 *
 * En `false` el veredicto es EXACTAMENTE el de siempre: las mitades se buscan
 * en todo el catálogo. En `true`, solo dentro de la marca que se evalúa.
 *
 * Está en `true` porque se MIDIÓ contra producción antes de encenderlo: de las
 * 360 descripciones vivas del inventario (con existencia > 0, cruzadas a su
 * marca real) solo TRES cambian de veredicto, y las tres son gemelas de verdad.
 * Ver `scripts/_medir-veredicto-por-marca.mjs`.
 */
export const MITADES_POR_MARCA = true;

/**
 * Decide qué hacer con una descripción entrante frente al catálogo actual.
 *
 *   "ya-existe" → normalizada es idéntica (sin distinguir mayúsculas) a una del
 *                 catálogo. Se usa la existente: no se crea nada, no se alerta.
 *   "pasa"      → las DOS mitades existen exactas DENTRO DE SU MARCA (izquierda
 *                 contra izquierdas, derecha contra derechas). No alerta.
 *   "alerta"    → todo lo demás, con el motivo de por qué.
 *
 * `marca` es la marca bajo la que entra la descripción. Sin ella —o con el
 * interruptor apagado— las mitades se buscan en todo el catálogo, que es como
 * se comportaba hasta el 8-sep-2026.
 */
export function veredictoDescripcion(
  desc: Cell,
  catalogo: CatalogoDescripciones,
  marca?: Cell
): ResultadoVeredicto {
  const normalizada = normalizarEspacios(desc);
  const idx = indexarCatalogo(catalogo);
  // Las mitades contra las que se compara: las de SU marca, o las de todo el
  // catálogo si no se dijo la marca o el interruptor está apagado.
  const deLaMarca = marca !== undefined && marca !== null && MITADES_POR_MARCA
    ? idx.porMarca.get(claveMarca(marca))
    : undefined;
  const mitades: MitadesConocidas = deLaMarca ?? { izquierdas: idx.izquierdas, derechas: idx.derechas };

  if (!normalizada) {
    return { veredicto: "alerta", normalizada, motivo: "formato", texto: "descripción vacía" };
  }

  // 1) ¿Ya está? (mismas letras, cambian solo espacios o mayúsculas)
  const existente = idx.completas.get(clave(normalizada));
  if (existente) return { veredicto: "ya-existe", normalizada, existente };

  // 2) Formato: tiene que ser Mitad-Mitad.
  const i = normalizada.indexOf("-");
  if (i === -1) {
    return { veredicto: "alerta", normalizada, motivo: "formato", texto: "sin guion" };
  }
  const izq = mitadIzq(normalizada);
  const der = mitadDer(normalizada);
  if (!izq || !der) {
    return { veredicto: "alerta", normalizada, motivo: "formato", texto: "guion al borde" };
  }

  const izqOk = mitades.izquierdas.get(izq.toLowerCase());
  const derOk = mitades.derechas.get(der.toLowerCase());

  // 3) Las dos mitades exactas → pasa sola (decisión de Daniel).
  if (izqOk && derOk) return { veredicto: "pasa", normalizada };

  // 4) Alerta. El motivo más importante: la casi-gemela.
  const gemelaCompleta = buscarGemela(clave(normalizada), idx.completas);
  if (gemelaCompleta) {
    return { veredicto: "alerta", normalizada, motivo: "casi-igual", texto: "casi igual a", gemela: gemelaCompleta };
  }

  if (!izqOk) {
    const g = buscarGemela(izq.toLowerCase(), mitades.izquierdas);
    if (g) {
      return {
        veredicto: "alerta",
        normalizada,
        motivo: "casi-igual-mitad",
        texto: "casi igual a",
        gemela: `${g}-${der}`,
      };
    }
  }
  if (!derOk) {
    const g = buscarGemela(der.toLowerCase(), mitades.derechas);
    if (g) {
      return {
        veredicto: "alerta",
        normalizada,
        motivo: "casi-igual-mitad",
        texto: "casi igual a",
        gemela: `${izq}-${g}`,
      };
    }
  }

  // 5) Mitad nueva: no existe ni se parece a nada.
  const cuales = !izqOk && !derOk ? `«${izq}» y «${der}»` : !izqOk ? `«${izq}»` : `«${der}»`;
  return {
    veredicto: "alerta",
    normalizada,
    motivo: "mitad-nueva",
    texto: `${!izqOk && !derOk ? "mitades nuevas" : "mitad nueva"}: ${cuales}`,
  };
}
