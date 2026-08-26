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

/** Distancia de edición (Levenshtein) entre dos cadenas ya en minúsculas. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const fila = [i];
    for (let j = 1; j <= b.length; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      fila[j] = Math.min(fila[j - 1] + 1, prev[j] + 1, prev[j - 1] + costo);
    }
    prev = fila;
  }
  return prev[b.length];
}

/** true si las dos difieren SOLO por una "s" final en una o más palabras
 *  ("T-Shirt"/"T-Shirts", "Boys"/"Boy", "Short Knit"/"Shorts Knit"). */
function difiereSoloPorSFinal(a: string, b: string): boolean {
  if (a === b) return false;
  const pa = a.split(" ");
  const pb = b.split(" ");
  if (pa.length !== pb.length) return false;
  return pa.every((p, i) => p === pb[i] || `${p}s` === pb[i] || p === `${pb[i]}s`);
}

/** Casi-gemelas: lo que a Daniel le da miedo. Dos criterios, ambos sobre las
 *  claves ya normalizadas y en minúsculas:
 *   · difieren solo por una "s" final en alguna palabra (sin piso de largo:
 *     "Boy"/"Boys" tiene que alertar), o
 *   · Levenshtein ≤ 2 y AMBAS miden ≥ 6 caracteres (el piso evita que dos
 *     mitades cortas y sin relación se llamen gemelas). */
export function esCasiIgual(a: string, b: string): boolean {
  if (a === b) return false;
  if (difiereSoloPorSFinal(a, b)) return true;
  if (a.length >= 6 && b.length >= 6 && levenshtein(a, b) <= 2) return true;
  return false;
}

/* ── Índice del catálogo ──────────────────────────────────────────────────── */

interface IndiceCatalogo {
  /** clave → descripción tal cual está en el catálogo (primera aparición). */
  completas: Map<string, string>;
  /** clave de mitad izquierda → mitad tal cual. */
  izquierdas: Map<string, string>;
  /** clave de mitad derecha → mitad tal cual. */
  derechas: Map<string, string>;
}

const CACHE = new WeakMap<CatalogoDescripciones, IndiceCatalogo>();

/** Índice de TODAS las descripciones del catálogo, de TODAS las marcas
 *  («en cualquiera de las 3 marcas»). Cacheado por objeto de catálogo. */
export function indexarCatalogo(catalogo: CatalogoDescripciones): IndiceCatalogo {
  const hit = CACHE.get(catalogo);
  if (hit) return hit;
  const idx: IndiceCatalogo = { completas: new Map(), izquierdas: new Map(), derechas: new Map() };
  for (const lista of Object.values(catalogo)) {
    for (const cruda of lista ?? []) {
      const d = normalizarEspacios(cruda);
      if (!d) continue;
      const kd = clave(d);
      if (!idx.completas.has(kd)) idx.completas.set(kd, d);
      const izq = mitadIzq(d);
      const der = mitadDer(d);
      if (izq && !idx.izquierdas.has(izq.toLowerCase())) idx.izquierdas.set(izq.toLowerCase(), izq);
      if (der && !idx.derechas.has(der.toLowerCase())) idx.derechas.set(der.toLowerCase(), der);
    }
  }
  CACHE.set(catalogo, idx);
  return idx;
}

/** La gemela MÁS parecida a `k` dentro del mapa (null si ninguna lo es).
 *  Se busca la más cercana, no la primera: si "Mens-T-Shirts S/S" se parece a
 *  "Men-T-Shirts S/S" y a "Men-T-Shirts L/S", en pantalla tiene que salir la
 *  primera. Orden: primero las que difieren solo por una "s" final, después por
 *  distancia de edición. */
function buscarGemela(k: string, mapa: Map<string, string>): string | null {
  let mejor: string | null = null;
  let mejorPuntaje = Infinity;
  for (const [ck, original] of mapa) {
    if (!esCasiIgual(k, ck)) continue;
    const puntaje = difiereSoloPorSFinal(k, ck) ? 0 : levenshtein(k, ck);
    if (puntaje < mejorPuntaje) { mejor = original; mejorPuntaje = puntaje; }
    if (mejorPuntaje === 0) break;
  }
  return mejor;
}

/* ── El veredicto ─────────────────────────────────────────────────────────── */

/**
 * Decide qué hacer con una descripción entrante frente al catálogo actual.
 *
 *   "ya-existe" → normalizada es idéntica (sin distinguir mayúsculas) a una del
 *                 catálogo. Se usa la existente: no se crea nada, no se alerta.
 *   "pasa"      → las DOS mitades existen exactas en el catálogo (izquierda
 *                 contra izquierdas, derecha contra derechas, en cualquier
 *                 marca). No alerta.
 *   "alerta"    → todo lo demás, con el motivo de por qué.
 */
export function veredictoDescripcion(
  desc: Cell,
  catalogo: CatalogoDescripciones
): ResultadoVeredicto {
  const normalizada = normalizarEspacios(desc);
  const idx = indexarCatalogo(catalogo);

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

  const izqOk = idx.izquierdas.get(izq.toLowerCase());
  const derOk = idx.derechas.get(der.toLowerCase());

  // 3) Las dos mitades exactas → pasa sola (decisión de Daniel).
  if (izqOk && derOk) return { veredicto: "pasa", normalizada };

  // 4) Alerta. El motivo más importante: la casi-gemela.
  const gemelaCompleta = buscarGemela(clave(normalizada), idx.completas);
  if (gemelaCompleta) {
    return { veredicto: "alerta", normalizada, motivo: "casi-igual", texto: "casi igual a", gemela: gemelaCompleta };
  }

  if (!izqOk) {
    const g = buscarGemela(izq.toLowerCase(), idx.izquierdas);
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
    const g = buscarGemela(der.toLowerCase(), idx.derechas);
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
