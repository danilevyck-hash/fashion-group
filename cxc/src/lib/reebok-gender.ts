/**
 * Mapeo de género del catálogo Reebok — única fuente de verdad (NO duplicar).
 *
 * La data cruda (tabla `products`) guarda valores heterogéneos del CSV/forma:
 *   unisex, male, women, female, kids  (verificado 2026-05-30, 218 filas).
 * OJO: hay DOS valores para mujer — `women` (48) y `female` (8) — y `unisex`.
 *
 * El filtro de la UI (CatalogFilters) usa botones con valores male/female/kids.
 * Mapeo deseado (cara al cliente):
 *   Hombre (male)  → male  + unisex
 *   Mujer  (female)→ women + female + unisex
 *   Niños  (kids)  → kids
 *   Todos  ("")    → todo
 *
 * REGLA: case-insensitive + trim. Un valor crudo NO contemplado NO se asigna a
 * ningún grupo por defecto — se loguea (console.warn, una vez por valor) para
 * detectarlo, igual que la lección del bug de clasificación previo.
 */

export type GenderGroup = "hombre" | "mujer" | "ninos" | "unisex";

// Alias crudo (lowercase) → grupo canónico. Robusto a variantes esperables.
const ALIASES: Record<string, GenderGroup> = {
  male: "hombre", men: "hombre", man: "hombre", mens: "hombre", hombre: "hombre", h: "hombre", m: "hombre",
  female: "mujer", women: "mujer", woman: "mujer", womens: "mujer", "women's": "mujer", mujer: "mujer", dama: "mujer", w: "mujer", f: "mujer",
  kids: "ninos", kid: "ninos", ninos: "ninos", "niños": "ninos", nino: "ninos", "niño": "ninos", ninas: "ninos", child: "ninos", children: "ninos", boys: "ninos", girls: "ninos", junior: "ninos", infant: "ninos",
  unisex: "unisex", uni: "unisex",
};

const _warned = new Set<string>();

/** Normaliza un valor crudo de género a su grupo canónico, o null si no se contempla. */
export function normalizeGender(raw: string | null | undefined): GenderGroup | null {
  if (raw == null) return null;
  const key = String(raw).trim().toLowerCase().replace(/\s+/g, " ");
  if (key === "") return null;
  const g = ALIASES[key];
  if (!g) {
    if (!_warned.has(key)) {
      _warned.add(key);
      console.warn(
        `[reebok-gender] valor de género NO contemplado: ${JSON.stringify(raw)} — no se asigna a ningún grupo. Agregar el alias en src/lib/reebok-gender.ts`,
      );
    }
    return null;
  }
  return g;
}

// Valor del botón de filtro (CatalogFilters) → grupos canónicos que debe mostrar.
const FILTER_TO_GROUPS: Record<string, GenderGroup[]> = {
  male: ["hombre", "unisex"],
  female: ["mujer", "unisex"],
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
