/**
 * Mapeo de género del catálogo Reebok — única fuente de verdad (NO duplicar).
 *
 * La data cruda (tabla `products`) guarda valores heterogéneos del CSV/forma:
 *   unisex, male, women, female, kids  (verificado 2026-05-30, 218 filas).
 *
 * MAPEO FINAL:
 *   Hombre → male, men, hombre, unisex
 *   Mujer  → women, female, mujer, dama   (SIN unisex)
 *   Niños  → kids, niño/nino, junior
 *   Todos  → todo
 *
 * Matching robusto: case-insensitive, SIN acentos (se normalizan tildes), y por
 * RAÍZ/INCLUSIÓN — así "Niño", "NINOS", "niños", "Women", "DAMA" caen en su grupo
 * sin enumerar cada forma. El ORDEN importa: Mujer se evalúa ANTES que Hombre para
 * que "female" (que contiene "male") y "women" (que contiene "men") no caigan en
 * Hombre. unisex es su propio grupo; sale de Mujer y queda solo en Hombre (lo
 * decide matchesGenderFilter).
 *
 * REGLA: un valor crudo que NO cae en ningún grupo NO se asigna por defecto —
 * se loguea (console.warn, una vez por valor) para detectarlo.
 */

export type GenderGroup = "hombre" | "mujer" | "ninos" | "unisex";

// Raíces por grupo, en ORDEN de evaluación (Mujer y Niños antes que Hombre para
// resolver las colisiones de inclusión female⊃male y women⊃men).
const GROUP_ROOTS: Array<{ group: GenderGroup; roots: string[] }> = [
  { group: "mujer", roots: ["wom", "female", "mujer", "dama"] },
  // boy/girl: slugs del catálogo Tommy (boys/girls, parseados de la descripcion
  // de Switch) — caen en Niños. Aditivo: la data Reebok no usa esas formas.
  { group: "ninos", roots: ["nino", "kid", "junior", "boy", "girl"] },
  { group: "hombre", roots: ["male", "men", "hombre"] },
  { group: "unisex", roots: ["unisex"] },
];

const _warned = new Set<string>();

/** lowercase + trim + colapsa espacios + quita tildes (NFD). */
function canonical(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "") // quita marcas diacriticas (tildes; n-tilde -> n)
    .replace(/\s+/g, " ");
}

/** Normaliza un valor crudo de género a su grupo canónico, o null si no se contempla. */
export function normalizeGender(raw: string | null | undefined): GenderGroup | null {
  if (raw == null) return null;
  const key = canonical(String(raw));
  if (key === "") return null;
  for (const { group, roots } of GROUP_ROOTS) {
    if (roots.some(r => key.includes(r))) return group;
  }
  if (!_warned.has(key)) {
    _warned.add(key);
    console.warn(
      `[reebok-gender] valor de género NO contemplado: ${JSON.stringify(raw)} — no se asigna a ningún grupo. Agregar la raíz en src/lib/reebok-gender.ts`,
    );
  }
  return null;
}

// Valor del botón de filtro (CatalogFilters) → grupos canónicos que debe mostrar.
// unisex solo en Hombre; Mujer NO incluye unisex.
const FILTER_TO_GROUPS: Record<string, GenderGroup[]> = {
  male: ["hombre", "unisex"],
  female: ["mujer"],
  kids: ["ninos"],
};

/** ¿El producto (por su género crudo) cae bajo el filtro seleccionado? "" = Todos. */
export function matchesGenderFilter(rawGender: string | null | undefined, filterValue: string): boolean {
  if (!filterValue) return true;
  const groups = FILTER_TO_GROUPS[filterValue];
  if (!groups) {
    console.warn(`[reebok-gender] filtro de género no contemplado: ${JSON.stringify(filterValue)}`);
    return false;
  }
  const g = normalizeGender(rawGender);
  return g !== null && groups.includes(g);
}

const GROUP_LABEL: Record<GenderGroup, string> = { hombre: "Hombre", mujer: "Mujer", ninos: "Ninos", unisex: "Unisex" };
const GROUP_ORDER: Record<GenderGroup, number> = { hombre: 0, mujer: 1, ninos: 2, unisex: 3 };

/** Clave de agrupación canónica; desconocido → "otros" (no se mezcla con un grupo real). */
export function genderGroupKey(rawGender: string | null | undefined): string {
  return normalizeGender(rawGender) ?? "otros";
}

/** Label de display del grupo; desconocido → "Otros". */
export function genderGroupLabel(rawGender: string | null | undefined): string {
  const g = normalizeGender(rawGender);
  return g ? GROUP_LABEL[g] : "Otros";
}

/** Orden de display del grupo; desconocido → al final. */
export function genderGroupOrder(rawGender: string | null | undefined): number {
  const g = normalizeGender(rawGender);
  return g ? GROUP_ORDER[g] : 9;
}

// Label del valor de botón de filtro (male/female/kids), para subtítulos/PDF.
const FILTER_LABEL: Record<string, string> = { male: "Hombre", female: "Mujer", kids: "Ninos" };
export function genderFilterLabel(filterValue: string): string {
  return FILTER_LABEL[filterValue] || filterValue;
}
