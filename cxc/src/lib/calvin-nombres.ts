// ─────────────────────────────────────────────────────────────────────────────
// Parser de nombres del catálogo Calvin Klein (empresa Switch vistana,
// artículos marcaId 8 = CK FOOTWEAR).
//
// Switch trae `descripcion` genérica con el MISMO patrón que Tommy (las dos son
// PVH). Medido contra producción el 12-ago-2026 sobre los 616 artículos de
// marcaId 8 — 13 valores reales, todos "{Género}-{Categoría}":
//   Women-Sneakers (187) · Women-Flip Flops (102) · Men-Sneakers (100) ·
//   Women-Sandals (79) · Men-Flip Flops (54) · Boys-Sneakers (41) ·
//   Girls-Sneakers (23) · Men-Slippers (12) · Boys-Flip Flops (8) ·
//   Girls-Flip Flops (5) · Women-Shoes (2) · Men-Sandals (2) · Girls-Sandals (1)
//
// ESE es el nombre del producto: se muestra TAL CUAL, en el vocabulario de
// Switch (el código nunca entra al nombre — vive en su píldora de SKU).
//
//     name = "{Género}-{Categoría}"   →  "Women-Sandals", "Boys-Flip Flops"
//
// Se parsea la descripcion por el PRIMER guión:
//   prefijo = género  (Women / Men / Boys / Girls — case-insensitive, misma
//                      tolerancia que Tommy)
//   sufijo  = categoría (Sneakers / Flip Flops / Sandals / Shoes / Slippers /
//                      Boots — "boots" no apareció en la medición pero se cubre
//                      igual: es vocabulario PVH y agregarlo no cuesta nada)
//
// El name se re-arma desde los labels canónicos en vez de copiar la descripcion
// byte a byte: son las MISMAS palabras de Switch, solo con la capitalización
// normalizada. Todo lo demás sale intacto.
//
// Los valores que NO parsean (basura contable) caen al fallback: name =
// descripcion cruda (o el codigo si no hay descripcion), category = "otros",
// gender = null. El filtro marcaId=8 ya excluye casi todo eso del catálogo.
//
// category/gender de calvin_products guardan los SLUGS (sneakers/flip_flops/…
// y women/men/boys/girls); los labels que muestra la UI viven aquí y los usa el
// theme (chips de filtros, encabezados de sección, Excel, admin).
//
// Funciones PURAS (sin I/O) — testeadas en __tests__/lib/calvin-nombres.test.ts
// con los 13 valores reales.
// ─────────────────────────────────────────────────────────────────────────────

export type CalvinGenero = "women" | "men" | "boys" | "girls";
export type CalvinCategoria =
  | "sneakers"
  | "flip_flops"
  | "sandals"
  | "shoes"
  | "slippers"
  | "boots";

const GENEROS: Record<string, CalvinGenero> = {
  women: "women",
  men: "men",
  boys: "boys",
  girls: "girls",
};

const CATEGORIAS: Record<string, CalvinCategoria> = {
  sneakers: "sneakers",
  "flip flops": "flip_flops",
  "flip-flops": "flip_flops",
  sandals: "sandals",
  shoes: "shoes",
  slippers: "slippers",
  boots: "boots",
};

/** Labels por slug de género — el vocabulario de Switch, sin traducir
 *  (UI/Excel/nombres). Los usa MARCA_THEME.calvin. */
export const CALVIN_GENERO_LABEL: Record<string, string> = {
  women: "Women",
  men: "Men",
  boys: "Boys",
  girls: "Girls",
};

/** Labels por slug de categoría — el vocabulario de Switch, sin traducir
 *  (UI/Excel/nombres). "Otros" es el catch-all, no viene de Switch. */
export const CALVIN_CATEGORIA_LABEL: Record<string, string> = {
  sneakers: "Sneakers",
  flip_flops: "Flip Flops",
  sandals: "Sandals",
  shoes: "Shoes",
  slippers: "Slippers",
  boots: "Boots",
  otros: "Otros",
};

export interface CalvinDescripcionParse {
  genero: CalvinGenero;
  categoria: CalvinCategoria;
}

/** Parsea "Women-Flip Flops" → { genero: "women", categoria: "flip_flops" }.
 *  null si la descripcion no sigue el patrón género-categoría (basura contable
 *  o formato nuevo de Switch). Tolerante a mayúsculas y espacios sobrantes. */
export function parseCalvinDescripcion(
  descripcion: string | null | undefined,
): CalvinDescripcionParse | null {
  const d = (descripcion ?? "").trim();
  const idx = d.indexOf("-");
  if (idx <= 0) return null;
  const genero = GENEROS[d.slice(0, idx).trim().toLowerCase()];
  const categoria = CATEGORIAS[d.slice(idx + 1).trim().toLowerCase()];
  if (!genero || !categoria) return null;
  return { genero, categoria };
}

export interface CalvinDerivedFields {
  name: string;
  /** Slug para calvin_products.category ("otros" si no parseó). */
  category: CalvinCategoria | "otros";
  /** Slug para calvin_products.gender (null si no parseó). */
  gender: CalvinGenero | null;
}

/** Campos derivados para el sync: name = la descripcion de Switch ("{Género}-
 *  {Categoría}") + category/gender parseados. Fallback si no parsea: name =
 *  descripcion cruda (o el codigo si viene vacía), category "otros", gender
 *  null. El CÓDIGO nunca entra al nombre: vive en su píldora de SKU. */
export function buildCalvinDerivedFields(
  codigo: string,
  descripcion: string | null | undefined,
): CalvinDerivedFields {
  const cod = (codigo ?? "").trim();
  const p = parseCalvinDescripcion(descripcion);
  if (!p) {
    const d = (descripcion ?? "").trim();
    return { name: d || cod, category: "otros", gender: null };
  }
  return {
    name: `${CALVIN_GENERO_LABEL[p.genero]}-${CALVIN_CATEGORIA_LABEL[p.categoria]}`,
    category: p.categoria,
    gender: p.genero,
  };
}
