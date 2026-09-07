// ─────────────────────────────────────────────────────────────────────────────
// La ÚNICA lista de la pantalla «Administrar» (6-sep-2026). Módulo PURO.
//
// 🩸 Antes eran DOS pestañas — «Faltan foto» y «Catálogo completo» — y la que
// abría por defecto era la de fotos. En Reebok, con 0 productos sin foto, lo
// primero que se veía al entrar era «Ningún producto activo sin foto» y dos
// cajas de arrastre: dos pantallas de alto para llegar a nada, y había que
// tocar la otra pestaña para ver los productos. Ahora hay UNA lista y «Faltan
// foto» es un chip más (ver `admin-chips.ts`).
//
// El ORDEN es el de una cola de trabajo, no el de una vitrina: primero lo que
// tiene existencia (es lo que se vende, y es a lo que le falta la foto que
// importa), después por nombre, y el CÓDIGO desempata.
//
// 🔴 El desempate por código NO es adorno: con 19 nombres para 498 productos
// —99 «Women-Flip Flops» en Tommy— `localeCompare` devuelve 0 para bloques
// enteros y el orden lo terminaba decidiendo la base. Ver `orden-codigo.ts`.
// ─────────────────────────────────────────────────────────────────────────────

import { compararCodigos } from "./orden-codigo";

export interface ProductoDeLista {
  sku: string | null;
  name: string;
  /** Reebok/Tommy/Calvin traen `disponibilidad`; Joybees solo `stock`. */
  disponibilidad?: number | null;
  stock?: number | null;
}

/** Lo vendible de un producto, sin importar cómo lo llame su marca. */
export function disponibleDe(p: ProductoDeLista): number {
  return p.disponibilidad ?? p.stock ?? 0;
}

/** ¿El producto coincide con lo que se escribió en el buscador? Nombre o código. */
export function coincideBusqueda(p: ProductoDeLista, busqueda: string): boolean {
  const q = busqueda.trim().toLowerCase();
  if (!q) return true;
  return p.name.toLowerCase().includes(q) || (p.sku || "").toLowerCase().includes(q);
}

/**
 * Orden de la lista: con existencia primero, después por nombre, y el código
 * desempata. Devuelve una copia — nunca ordena el arreglo que le pasan.
 */
export function ordenarParaTrabajar<T extends ProductoDeLista>(productos: readonly T[]): T[] {
  return [...productos].sort((a, b) => {
    const da = disponibleDe(a) > 0 ? 1 : 0;
    const db = disponibleDe(b) > 0 ? 1 : 0;
    if (da !== db) return db - da;
    return a.name.localeCompare(b.name, "es", { sensitivity: "base" }) || compararCodigos(a.sku, b.sku);
  });
}
