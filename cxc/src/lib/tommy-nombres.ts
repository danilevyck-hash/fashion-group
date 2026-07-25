// ─────────────────────────────────────────────────────────────────────────────
// Parser de nombres del catálogo Tommy Hilfiger (empresa Switch fashion_shoes).
//
// Switch NO trae nombres reales: `descripcion` es genérica con 23 valores tipo
// "Women-Flip Flops" (verificado contra switch_articulo_diario 24-jul-2026) —
// el "nombre" real del producto es su código. El sync arma el name automático:
//
//     "{codigo} · {categoría} {género}"   →  "TH1234 · Sneakers Hombre"
//
// parseando la descripcion por el PRIMER guión:
//   prefijo = género  (Women / Men / Boys / Girls — case-insensitive: existe
//                      "women-Sneakers" real en los datos)
//   sufijo  = categoría (Sneakers / Flip Flops / Sandals / Shoes / Slippers /
//                      Boots)
//
// Los valores que NO parsean (basura contable tipo "MERCANCIA DEFECTUOSA",
// "THERMO", "RETENCION DE N/C" — que además el filtro marcaId=3 excluye del
// catálogo) caen al fallback: name = codigo (+ descripcion si la hay),
// category = "otros", gender = null.
//
// category/gender de tommy_products guardan los SLUGS (sneakers/flip_flops/…
// y women/men/boys/girls); los labels en español simple viven aquí y los usa
// el theme (chips de filtros, Excel, admin).
//
// Funciones PURAS (sin I/O) — testeadas en __tests__/lib/tommy-nombres.test.ts
// con los 23 valores reales.
// ─────────────────────────────────────────────────────────────────────────────

export type TommyGenero = "women" | "men" | "boys" | "girls";
export type TommyCategoria =
  | "sneakers"
  | "flip_flops"
  | "sandals"
  | "shoes"
  | "slippers"
  | "boots";

const GENEROS: Record<string, TommyGenero> = {
  women: "women",
  men: "men",
  boys: "boys",
  girls: "girls",
};

const CATEGORIAS: Record<string, TommyCategoria> = {
  sneakers: "sneakers",
  "flip flops": "flip_flops",
  "flip-flops": "flip_flops",
  sandals: "sandals",
  shoes: "shoes",
  slippers: "slippers",
  boots: "boots",
};

/** Labels en español simple por slug de género (UI/Excel/nombres). */
export const TOMMY_GENERO_LABEL: Record<string, string> = {
  women: "Mujer",
  men: "Hombre",
  boys: "Niño",
  girls: "Niña",
};

/** Labels por slug de categoría (UI/Excel/nombres). "Sneakers"/"Flip Flops" se
 *  quedan como se usan en Panamá; el resto en español simple. */
export const TOMMY_CATEGORIA_LABEL: Record<string, string> = {
  sneakers: "Sneakers",
  flip_flops: "Flip Flops",
  sandals: "Sandalias",
  shoes: "Zapatos",
  slippers: "Pantuflas",
  boots: "Botas",
  otros: "Otros",
};

export interface TommyDescripcionParse {
  genero: TommyGenero;
  categoria: TommyCategoria;
}

/** Parsea "Women-Flip Flops" → { genero: "women", categoria: "flip_flops" }.
 *  null si la descripcion no sigue el patrón género-categoría (basura contable
 *  o formato nuevo de Switch). Tolerante a mayúsculas y espacios sobrantes. */
export function parseTommyDescripcion(
  descripcion: string | null | undefined,
): TommyDescripcionParse | null {
  const d = (descripcion ?? "").trim();
  const idx = d.indexOf("-");
  if (idx <= 0) return null;
  const genero = GENEROS[d.slice(0, idx).trim().toLowerCase()];
  const categoria = CATEGORIAS[d.slice(idx + 1).trim().toLowerCase()];
  if (!genero || !categoria) return null;
  return { genero, categoria };
}

export interface TommyDerivedFields {
  name: string;
  /** Slug para tommy_products.category ("otros" si no parseó). */
  category: TommyCategoria | "otros";
  /** Slug para tommy_products.gender (null si no parseó). */
  gender: TommyGenero | null;
}

/** Campos derivados para el sync: name "{codigo} · {categoría} {género}" +
 *  category/gender parseados. Fallback si no parsea: name = codigo
 *  (+ descripcion cruda si existe), category "otros", gender null. */
export function buildTommyDerivedFields(
  codigo: string,
  descripcion: string | null | undefined,
): TommyDerivedFields {
  const cod = (codigo ?? "").trim();
  const p = parseTommyDescripcion(descripcion);
  if (!p) {
    const d = (descripcion ?? "").trim();
    return { name: d ? `${cod} · ${d}` : cod, category: "otros", gender: null };
  }
  return {
    name: `${cod} · ${TOMMY_CATEGORIA_LABEL[p.categoria]} ${TOMMY_GENERO_LABEL[p.genero]}`,
    category: p.categoria,
    gender: p.genero,
  };
}
