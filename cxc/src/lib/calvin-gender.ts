/**
 * Taxonomía de GÉNERO del catálogo Calvin Klein — propia de la marca, espejo
 * de la de Tommy (`tommy-gender.ts`): las dos son marcas PVH y Switch les habla
 * el MISMO vocabulario. Medido contra producción el 12-ago-2026 (vistana,
 * marcaId 8): las 13 descripciones reales usan Women / Men / Boys / Girls.
 *
 * Calvin NO usa la taxonomía de Reebok (que colapsa boys y girls en un único
 * grupo "Niños" y etiqueta en español): acá los cuatro géneros salen del guión
 * de la descripcion ("Women-Sandals") y se muestran TAL CUAL — Women, Men,
 * Boys, Girls — en los chips de filtro, en los encabezados de sección
 * ("SANDALS — WOMEN") y en el PDF del catálogo.
 *
 * `calvin_products.gender` guarda los SLUGS women/men/boys/girls (los escribe
 * el sync desde `lib/calvin-nombres.ts`); null/no reconocido → grupo "otros".
 *
 * OJO con las colisiones por inclusión: "female" contiene "male" y "women"
 * contiene "men". Por eso aquí el matching es por IGUALDAD sobre una tabla de
 * alias, nunca por `includes` (a diferencia de reebok-gender, que resuelve las
 * colisiones con un orden de evaluación).
 *
 * Funciones PURAS (sin I/O). El tema de la marca (MARCA_THEME.calvin.genero)
 * las cablea; ningún componente las importa directo.
 */

export type CalvinGenderGroup = "women" | "men" | "boys" | "girls";

/** Valor crudo (o alias razonable) → slug canónico. Igualdad exacta. */
const ALIAS: Record<string, CalvinGenderGroup> = {
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

const LABEL: Record<CalvinGenderGroup, string> = {
  women: "Women",
  men: "Men",
  boys: "Boys",
  girls: "Girls",
};

const ORDER: Record<CalvinGenderGroup, number> = { women: 0, men: 1, boys: 2, girls: 3 };

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
export function normalizeCalvinGender(raw: string | null | undefined): CalvinGenderGroup | null {
  if (raw == null) return null;
  return ALIAS[canonical(String(raw))] ?? null;
}

/** ¿El producto cae bajo el chip de filtro seleccionado? "" = Todos. */
export function matchesCalvinGenderFilter(
  rawGender: string | null | undefined,
  filterValue: string,
): boolean {
  if (!filterValue) return true;
  return normalizeCalvinGender(rawGender) === normalizeCalvinGender(filterValue);
}

/** Clave de agrupación; desconocido → "otros" (no se mezcla con un grupo real). */
export function calvinGenderGroupKey(rawGender: string | null | undefined): string {
  return normalizeCalvinGender(rawGender) ?? "otros";
}

/** Label de display en el vocabulario de Switch; desconocido → "Otros". */
export function calvinGenderGroupLabel(rawGender: string | null | undefined): string {
  const g = normalizeCalvinGender(rawGender);
  return g ? LABEL[g] : "Otros";
}

/** Orden de display; desconocido → al final. */
export function calvinGenderGroupOrder(rawGender: string | null | undefined): number {
  const g = normalizeCalvinGender(rawGender);
  return g ? ORDER[g] : 9;
}

/** Label del valor del chip (para subtítulos del PDF). */
export function calvinGenderFilterLabel(filterValue: string): string {
  return calvinGenderGroupLabel(filterValue);
}

/** Secciones del PDF del catálogo plano, en orden canónico. */
export const CALVIN_PDF_GENDER_SECTIONS = [
  { key: "women", label: "WOMEN" },
  { key: "men", label: "MEN" },
  { key: "boys", label: "BOYS" },
  { key: "girls", label: "GIRLS" },
  { key: "otros", label: "OTROS" },
];
