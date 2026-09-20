/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CAJA — LAS CATEGORÍAS SE CREAN DESDE EL FORMULARIO, Y QUEDAN PARA TODOS
 * (20-sep-2026).
 *
 * Daniel, textual: *«la categoría está, y si algún momento hay una categoría
 * nueva, pon el más para configurarla y que los que tengan el módulo las puedan
 * crear para siempre en todos los usuarios»*.
 *
 * 🔴 UNA CATEGORÍA NUEVA ES DEL EQUIPO, NO DEL NAVEGADOR DE QUIEN LA CREÓ —
 * mismo trato que los destinos y los transportistas de Guías: vive en la base
 * (`caja_categorias`), la crea cualquiera que tenga el módulo, y el borrado es
 * SOFT y FIRMADO, nunca un DELETE.
 *
 * 🔴 LA REPETIDA SE RECHAZA POR CLAVE EXACTA, JAMÁS POR PARECIDO. «Alimentación»
 * y «alimentacion» son la misma; «Material» y «Materiales» son DOS — juntarlas
 * pediría distancia de edición, que este repo tiene prohibida con nombres.
 *
 * Módulo PURO: sin I/O, sin React.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** Cómo se guarda una categoría: «alimentación» → «Alimentación». */
export function normalizarCategoria(nombre: string | null | undefined): string {
  const t = String(nombre ?? "").trim().replace(/\s+/g, " ");
  if (!t) return t;
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

/**
 * La clave con la que se decide si dos categorías son la MISMA: minúsculas, sin
 * acentos y sin espacios de más. Igualdad exacta sobre eso y nada más.
 */
export function claveCategoria(nombre: string | null | undefined): string {
  return String(nombre ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}

/** ¿Esta categoría ya está en la lista? (clave exacta, nunca por parecido) */
export function yaEstaLaCategoria(nombre: string | null | undefined, lista: string[]): boolean {
  const clave = claveCategoria(nombre);
  if (!clave) return false;
  return lista.some((c) => claveCategoria(c) === clave);
}

/** Qué falta para poder crearla. `null` = se puede. */
export function motivoParaNoCrear(nombre: string | null | undefined, lista: string[]): string | null {
  const limpio = normalizarCategoria(nombre);
  if (!limpio) return "Escribe el nombre de la categoría.";
  if (limpio.length > 40) return "El nombre es muy largo: usa 40 letras o menos.";
  if (yaEstaLaCategoria(limpio, lista)) return `«${limpio}» ya está en la lista.`;
  return null;
}
