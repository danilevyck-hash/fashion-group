// ─────────────────────────────────────────────────────────────────────────────
// «RECLAMOS VINCULADOS» DE LA FICHA DE UN PROVEEDOR — SE UNE POR (EMPRESA, CÓDIGO).
//
// 🔴 NADA SE UNE POR PARECIDO. Ni `ILIKE`, ni similitud, ni distancia de
// edición, ni «empieza con». Igualdad exacta sobre el par (empresa_key, código).
//
// Por qué el PAR y no el código solo: `122` es «American Fashion Wear, SA» en
// Fashion Wear y «LATIN FITNESS GROUP» en Active Shoes. Un código sin su empresa
// pega dos proveedores distintos en la misma ficha.
//
// Un reclamo SIN código no se pega a nadie. Es a propósito: antes que atarlo por
// el nombre a un proveedor que quizás no es, no aparece.
// ─────────────────────────────────────────────────────────────────────────────

import { empresaKeyDeReclamo } from "./empresas";

/** Una fila de `switch_proveedor_estadocuenta`: la empresa y el código de ahí. */
export interface ParProveedor {
  empresa_key: string;
  codigo: string | null;
}

/** Lo mínimo que un reclamo tiene que traer para poder cruzarse. */
export interface ReclamoVinculable {
  empresa?: string | null;
  proveedor_codigo?: string | null;
}

/**
 * Llave del par. `null` cuando falta cualquiera de los dos lados — así un
 * `undefined` de un lado nunca puede coincidir con un `undefined` del otro.
 */
export function clavePar(
  empresaKey: string | null | undefined,
  codigo: string | null | undefined,
): string | null {
  const e = (empresaKey ?? "").trim();
  const c = (codigo ?? "").trim();
  if (!e || !c) return null;
  return `${e}|${c}`;
}

/** El conjunto de pares (empresa, código) que son ESTE proveedor en Switch. */
export function paresDelProveedor(filas: readonly ParProveedor[]): Set<string> {
  const set = new Set<string>();
  for (const f of filas) {
    const k = clavePar(f.empresa_key, f.codigo);
    if (k) set.add(k);
  }
  return set;
}

/**
 * Los reclamos de ese proveedor, en el mismo orden en que llegaron.
 * `pares` sale de `paresDelProveedor()` con las filas de Switch de esa ficha.
 */
export function reclamosDelProveedor<T extends ReclamoVinculable>(
  reclamos: readonly T[],
  pares: ReadonlySet<string>,
): T[] {
  return reclamos.filter((r) => {
    const k = clavePar(empresaKeyDeReclamo(r.empresa), r.proveedor_codigo);
    return k !== null && pares.has(k);
  });
}
