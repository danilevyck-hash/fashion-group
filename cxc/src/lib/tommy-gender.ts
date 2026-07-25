/**
 * Taxonomía de GÉNERO del catálogo Tommy Hilfiger — propia de la marca.
 *
 * Tommy NO usa la taxonomía de Reebok (`reebok-gender.ts`, que colapsa boys y
 * girls en un único grupo "Niños" y etiqueta en español). El catálogo Tommy
 * habla el mismo vocabulario que Switch: los cuatro géneros salen del guión de
 * la descripcion ("Women-Slippers") y se muestran TAL CUAL — Women, Men, Boys,
 * Girls — tanto en los chips de filtro como en los encabezados de sección
 * ("SLIPPERS — WOMEN") y en el PDF del catálogo.
 *
 * `tommy_products.gender` guarda los SLUGS women/men/boys/girls (los escribe el
 * sync desde `lib/tommy-nombres.ts`); null/no reconocido → grupo "otros".
 *
 * OJO con las colisiones por inclusión: "female" contiene "male" y "women"
 * contiene "men". Por eso aquí el matching es por IGUALDAD sobre una tabla de
 * alias, nunca por `includes` (a diferencia de reebok-gender, que resuelve las
 * colisiones con un orden de evaluación).
 *
 * Funciones PURAS (sin I/O). El tema de la marca (MARCA_THEME.tommy.genero) las
 * cablea; ningún componente las importa directo.
 */

export type TommyGenderGroup = "women" | "men" | "boys" | "girls";

/** Valor crudo (o alias razonable) → slug canónico. Igualdad exacta. */
const ALIAS: Record<string, TommyGenderGroup> = {
  women: "women",
  woman: "women",
  female: "women",
  mujer: "women",
  men: "men",
  man: "men",
  male: "men",
  hombre: "men",
  boys: "boys",
  boy: "boys",
  nino: "boys",
  girls: "girls",
  girl: "girls",
  nina: "girls",
};

const LABEL: Record<TommyGenderGroup, string> = {
  women: "Women",
  men: "Men",
  boys: "Boys",
  girls: "Girls",
};

const ORDER: Record<TommyGenderGroup, number> = { women: 0, men: 1, boys: 2, girls: 3 };

/** lowercase + trim + sin tildes (n-tilde → n), para tolerar "Niño"/"NIÑA". */
function canonical(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ");
}

/** Slug canónico del género, o null si no se reconoce. */
export function normalizeTommyGender(raw: string | null | undefined): TommyGenderGroup | null {
  if (raw == null) return null;
  return ALIAS[canonical(String(raw))] ?? null;
}

/** ¿El producto cae bajo el chip de filtro seleccionado? "" = Todos. */
export function matchesTommyGenderFilter(
  rawGender: string | null | undefined,
  filterValue: string,
): boolean {
  if (!filterValue) return true;
  return normalizeTommyGender(rawGender) === normalizeTommyGender(filterValue);
}

/** Clave de agrupación; desconocido → "otros" (no se mezcla con un grupo real). */
export function tommyGenderGroupKey(rawGender: string | null | undefined): string {
  return normalizeTommyGender(rawGender) ?? "otros";
}

/** Label de display en el vocabulario de Switch; desconocido → "Otros". */
export function tommyGenderGroupLabel(rawGender: string | null | undefined): string {
  const g = normalizeTommyGender(rawGender);
  return g ? LABEL[g] : "Otros";
}

/** Orden de display; desconocido → al final. */
export function tommyGenderGroupOrder(rawGender: string | null | undefined): number {
  const g = normalizeTommyGender(rawGender);
  return g ? ORDER[g] : 9;
}

/** Label del valor del chip (para subtítulos del PDF). */
export function tommyGenderFilterLabel(filterValue: string): string {
  return tommyGenderGroupLabel(filterValue);
}

/** Secciones del PDF del catálogo plano, en orden canónico. */
export const TOMMY_PDF_GENDER_SECTIONS = [
  { key: "women", label: "WOMEN" },
  { key: "men", label: "MEN" },
  { key: "boys", label: "BOYS" },
  { key: "girls", label: "GIRLS" },
  { key: "otros", label: "OTROS" },
];
