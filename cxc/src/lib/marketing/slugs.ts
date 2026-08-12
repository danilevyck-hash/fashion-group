// ============================================================================
// Marketing — los SLUGS de las URLs de tres niveles (12-ago-2026).
//
//   /marketing                       → nivel 1 (marcas)
//   /marketing/calvin-klein          → nivel 2 (los períodos de la marca)
//   /marketing/calvin-klein/mid-2026 → nivel 3 (el detalle del período)
//
// 🔑 LA MARCA SE RESUELVE POR DOS CAMINOS: el slug de su NOMBRE (el link
// lindo, el del mockup aprobado) y su CÓDIGO (`ck`, `th`…). El nombre es
// EDITABLE — French Connection se renombró a Karl Lagerfeld el 11-ago-2026 —
// así que un link guardado con el nombre viejo muere con el rename; el del
// código sobrevive siempre. Los links que genera la app usan el nombre
// (compartibles y legibles); el código queda como el camino estable.
//
// 🔑 EL PERÍODO va por el slug de su NOMBRE ("mid 2026" → `mid-2026`), que es
// como Daniel lo reconoce. `actual` es un alias PERMANENTE del período
// abierto de la marca: sobrevive al cierre (apunta al abierto que haya hoy),
// y es a donde salta el nivel 2 cuando la marca tiene un solo período. Si dos
// períodos de la misma marca llegaran a llamarse igual, el más nuevo se queda
// con el slug limpio y los demás llevan sufijo `-2`, `-3`… (determinístico:
// el orden de las secciones ya es del más nuevo al más viejo).
//
// Módulo PURO. Sin base, sin I/O.
// ============================================================================

import {
  MARCAS_BLOQUE,
  MULTIFASHION_KEY,
  SIN_BLOQUE,
  esMarcaCodigo,
  nombreDeBloque,
  type BloqueKey,
  type MarcaParaBloque,
} from "./bloques";

/** Alias permanente del período ABIERTO de una marca. */
export const SLUG_PERIODO_ACTUAL = "actual";

/** Slug del bucket "sin marca asignada" (con guion: es una URL, no una key). */
const SLUG_SIN_BLOQUE = "sin-marca";

/** "Calvin Klein" → "calvin-klein" · "Período 2026" → "periodo-2026". */
export function slugDeNombre(nombre: string): string {
  return String(nombre ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** El slug con el que la app ENLAZA a una marca (el nombre, legible). */
export function slugDeMarca(
  key: string,
  marcas: ReadonlyArray<MarcaParaBloque> = [],
): string {
  if (key === MULTIFASHION_KEY) return MULTIFASHION_KEY;
  if (key === SIN_BLOQUE) return SLUG_SIN_BLOQUE;
  const nombre = slugDeNombre(nombreDeBloque(key, marcas));
  return nombre || String(key).toLowerCase();
}

/**
 * A qué bloque apunta el segmento `[marca]` de la URL.
 *
 * Acepta, en este orden: el CÓDIGO (`ck`, `TH`), los dos buckets
 * (`multifashion`, `sin-marca`/`sin_bloque`) y el slug del NOMBRE actual
 * (`calvin-klein`). Un valor desconocido devuelve `null` — la página lo trata
 * como "esa marca no existe", nunca lo adivina.
 */
export function bloqueDeSlug(
  slug: string,
  marcas: ReadonlyArray<MarcaParaBloque> = [],
): BloqueKey | null {
  const crudo = String(slug ?? "").trim();
  if (!crudo) return null;
  const up = crudo.toUpperCase();
  if (esMarcaCodigo(up)) return up;
  const low = crudo.toLowerCase();
  if (low === MULTIFASHION_KEY) return MULTIFASHION_KEY;
  if (low === SLUG_SIN_BLOQUE || low === SIN_BLOQUE) return SIN_BLOQUE;
  // Por nombre: se compara contra el slug de CADA marca conocida. El listado
  // sale de MARCAS_BLOQUE (fuente única) — nada de códigos escritos a mano.
  const normalizado = slugDeNombre(crudo);
  if (!normalizado) return null;
  for (const m of MARCAS_BLOQUE) {
    if (slugDeMarca(m.key, marcas) === normalizado) return m.key;
  }
  return null;
}

/**
 * Asigna slugs ÚNICOS a una lista de secciones ya ordenada (abierto primero,
 * cerrados del más nuevo al más viejo). El primero que reclame un nombre se
 * queda con el slug limpio; los siguientes llevan `-2`, `-3`…
 */
export function asignarSlugsDePeriodo<T extends { nombre: string }>(
  secciones: ReadonlyArray<T>,
): Array<T & { slug: string }> {
  const usados = new Map<string, number>();
  return secciones.map((s) => {
    const base = slugDeNombre(s.nombre) || "periodo";
    const n = usados.get(base) ?? 0;
    usados.set(base, n + 1);
    return { ...s, slug: n === 0 ? base : `${base}-${n + 1}` };
  });
}
