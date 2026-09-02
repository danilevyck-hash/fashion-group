/**
 * Mapeo de género del catálogo — LECTURA. Única fuente de verdad (NO duplicar).
 * La comparten Reebok y Joybees (`marcas-ui.tsx` → `REEBOK_GENERO`).
 *
 * ⚠️ ESTE ARCHIVO NO CLASIFICA: TRADUCE. Traduce el valor GUARDADO en la tabla
 * al grupo que pintan los chips. Quién decide qué se guarda es el sync, con el
 * mapa de su marca (`reebok-clasificacion.ts`). Confundir las dos cosas fue
 * exactamente el bug del 2-sep-2026: el mapa de lectura estaba bien y el dato
 * llegaba inventado, así que la pantalla mostraba fielmente una mentira.
 *
 * La data cruda de `products` guarda valores heterogéneos acumulados por años:
 *   unisex, male, women, female, kids  (verificado 2026-05-30, 218 filas; el
 *   2-sep-2026 seguían siendo esos 5 sobre 391 filas). Desde el 2-sep el sync
 *   escribe solo `male`/`female`/`kids` y el sentinel `sin_clasificar`, pero las
 *   formas viejas se siguen entendiendo: la tabla no se reescribe de golpe.
 *
 * MAPEO:
 *   Hombre → male, men, hombre, unisex
 *   Mujer  → women, female, mujer, dama   (SIN unisex)
 *   Niños  → kids, niño/nino, junior, boys, girls
 *   Adultos → adults, adults_m            (formas históricas de Joybees)
 *   Todos  → todo
 *
 * Matching robusto: case-insensitive, SIN acentos (se normalizan tildes), y por
 * RAÍZ/INCLUSIÓN — así "Niño", "NINOS", "niños", "Women", "DAMA" caen en su grupo
 * sin enumerar cada forma. El ORDEN importa: Mujer se evalúa ANTES que Hombre para
 * que "female" (que contiene "male") y "women" (que contiene "men") no caigan en
 * Hombre. unisex es su propio grupo; sale de Mujer y queda solo en Hombre (lo
 * decide matchesGenderFilter).
 *
 * 🔴 REGLA: un valor crudo que NO cae en ningún grupo NO se asigna por defecto —
 * cae en "otros", o sea visible en «Todos» y bajo NINGÚN chip.
 *
 * 🩸 ACÁ HABÍA UN `console.warn` "por valor no contemplado" Y NO SERVÍA DE NADA:
 * este módulo lo importa el catálogo público, así que ese mensaje salía en la
 * consola del navegador del CLIENTE, que nadie abre jamás. Un aviso que no llega
 * a nadie no es un aviso. El aviso de verdad vive del lado del servidor, en el
 * sync, y sale por 🔧 SISTEMA: `src/lib/catalogos/clasificacion-aviso.ts`.
 */

export type GenderGroup = "hombre" | "mujer" | "ninos" | "unisex";

// Raíces por grupo, en ORDEN de evaluación (Mujer y Niños antes que Hombre para
// resolver las colisiones de inclusión female⊃male y women⊃men).
const GROUP_ROOTS: Array<{ group: GenderGroup; roots: string[] }> = [
  { group: "mujer", roots: ["wom", "female", "mujer", "dama"] },
  // boy/girl: slugs del catálogo Tommy (boys/girls, parseados de la descripcion
  // de Switch) — caen en Niños. Aditivo: la data Reebok no usa esas formas.
  { group: "ninos", roots: ["nino", "kid", "junior", "boy", "girl"] },
  // 🩸 `adults` y `adults_m` son las formas HISTÓRICAS de Joybees y estaban sin
  // mapear: `normalizeGender` devolvía null y los 17 productos que las usan
  // (10 `adults_m` + 7 `adults` de los 83 de Joybees, medido el 2-sep-2026)
  // caían en el grupo "otros" — sin label, sin orden y fuera de todo chip. La
  // raíz "adult" cubre las dos formas.
  // ⚠️ La grilla de Joybees se dibuja AGRUPADA y usa `getDisplaySection`
  // (`groupByModel.ts`), no esta función, así que ahí no se veían mal; lo que
  // estaba mal era toda otra superficie que pasara por acá.
  //
  // Caen en `unisex`, que es el grupo que el chip "Hombre" ya muestra: `adults`
  // no dice ningún género y `adults_m` era el placeholder que el sync ponía a
  // TODO producto nuevo de Joybees, así que tampoco lo dice de verdad. Meterlos
  // en `hombre` sería afirmar algo que ese slug no afirma; dejarlos afuera sería
  // esconderlos. `unisex` es exactamente "adulto, sin género declarado".
  { group: "unisex", roots: ["adult"] },
  { group: "hombre", roots: ["male", "men", "hombre"] },
  { group: "unisex", roots: ["unisex"] },
];

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
  // Sin grupo. NO se avisa desde acá (ver la nota del `console.warn` en la
  // cabecera): quien avisa es el sync, del lado del servidor.
  return null;
}

/**
 * Valor del botón de filtro (CatalogFilters) → grupos canónicos que debe mostrar.
 *
 * 🔴 **UN PRODUCTO EN UN SOLO LUGAR.** Daniel, textual: *«no quiero nunca que
 * mismos productos salgan en dos lados»*. Un producto tiene UN género crudo, que
 * cae en UN grupo; para que además caiga bajo UN solo chip, **estas listas tienen
 * que ser DISJUNTAS entre sí**. Hay candado que recorre el catálogo REAL y falla
 * si un artículo aparece bajo dos chips (`catalogo-un-solo-lugar.test.ts`).
 *
 * `unisex` en "Hombre" **se revisó y SE QUEDA** (2-sep-2026). Ya no es la regla
 * de clasificación —desde el arreglo, el sync resuelve el UNISEX de Switch a
 * `male` antes de guardarlo, así que Reebok no escribe `unisex` nunca más—, pero
 * la tabla arrastra 91 filas con ese valor y Joybees lo usa vivo. Es la red de
 * seguridad de lectura para la MISMA decisión de Daniel: *«yo compro lo que me
 * venden como unisex, o sea hombre»*. Quitarlo hoy escondería esos 91 productos
 * de todos los chips sin que nadie lo pida.
 *
 * 🔑 Y NO duplica: `unisex` está en "Hombre" y en ningún otro. El día que alguien
 * lo agregue también a `female` "para que se vean en los dos", el candado se
 * pone rojo — que es justo lo que Daniel pidió que no pase.
 */
export const FILTER_TO_GROUPS: Record<string, GenderGroup[]> = {
  male: ["hombre", "unisex"],
  female: ["mujer"],
  kids: ["ninos"],
};

/** ¿El producto (por su género crudo) cae bajo el filtro seleccionado? "" = Todos. */
export function matchesGenderFilter(rawGender: string | null | undefined, filterValue: string): boolean {
  if (!filterValue) return true;
  const groups = FILTER_TO_GROUPS[filterValue];
  // Un chip que no existe no muestra nada: mostrar todo sería peor (el usuario
  // creería que filtró). No se loguea — corre en el navegador del cliente.
  if (!groups) return false;
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
