// ─────────────────────────────────────────────────────────────────────────────
// Parser de nombres del catálogo Tommy Hilfiger (empresa Switch fashion_shoes).
//
// Switch trae `descripcion` genérica con 23 valores tipo "Women-Flip Flops"
// (verificado contra switch_articulo_diario 24-jul-2026). ESE es el nombre del
// producto: se muestra TAL CUAL, en el vocabulario de Switch.
//
//     name = "{Género}-{Categoría}"   →  "Women-Slippers", "Men-Flip Flops"
//
// (Decisión Daniel 25-jul-2026. ANTES el sync armaba "{codigo} · {categoría}
// {género}" traducido al español — el código salía DUPLICADO en la card, porque
// ya vive en su propia píldora de SKU como en Reebok/Joybees. Se eliminó.)
//
// Se parsea la descripcion por el PRIMER guión:
//   prefijo = género  (Women / Men / Boys / Girls — case-insensitive: existe
//                      "women-Sneakers" real en los datos)
//   sufijo  = categoría (Sneakers / Flip Flops / Sandals / Shoes / Slippers /
//                      Boots)
//
// El name se re-arma desde los labels canónicos en vez de copiar la descripcion
// byte a byte: son las MISMAS palabras de Switch, solo con la capitalización
// normalizada — así "women-Sneakers" no rompe la vista con una sección en
// minúscula al lado de "Women-Sandals". Todo lo demás sale intacto.
//
// Los valores que NO parsean (basura contable tipo "MERCANCIA DEFECTUOSA",
// "THERMO", "RETENCION DE N/C" — que además el filtro marcaId=3 excluye del
// catálogo) caen al fallback: name = descripcion cruda (o el codigo si no hay
// descripcion), category = "otros", gender = null.
//
// category/gender de tommy_products guardan los SLUGS (sneakers/flip_flops/…
// y women/men/boys/girls); los labels que muestra la UI viven aquí y los usa el
// theme (chips de filtros, encabezados de sección, Excel, admin).
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

/** Labels por slug de género — el vocabulario de Switch, sin traducir
 *  (UI/Excel/nombres). Los usa MARCA_THEME.tommy. */
export const TOMMY_GENERO_LABEL: Record<string, string> = {
  women: "Women",
  men: "Men",
  boys: "Boys",
  girls: "Girls",
};

/** Labels por slug de categoría — el vocabulario de Switch, sin traducir
 *  (UI/Excel/nombres). "Otros" es el catch-all, no viene de Switch. */
export const TOMMY_CATEGORIA_LABEL: Record<string, string> = {
  sneakers: "Sneakers",
  flip_flops: "Flip Flops",
  sandals: "Sandals",
  shoes: "Shoes",
  slippers: "Slippers",
  boots: "Boots",
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

/** Campos derivados para el sync: name = la descripcion de Switch ("{Género}-
 *  {Categoría}") + category/gender parseados. Fallback si no parsea: name =
 *  descripcion cruda (o el codigo si viene vacía), category "otros", gender
 *  null. El CÓDIGO nunca entra al nombre: vive en su píldora de SKU. */
export function buildTommyDerivedFields(
  codigo: string,
  descripcion: string | null | undefined,
): TommyDerivedFields {
  const cod = (codigo ?? "").trim();
  const p = parseTommyDescripcion(descripcion);
  if (!p) {
    const d = (descripcion ?? "").trim();
    return { name: d || cod, category: "otros", gender: null };
  }
  return {
    name: `${TOMMY_GENERO_LABEL[p.genero]}-${TOMMY_CATEGORIA_LABEL[p.categoria]}`,
    category: p.categoria,
    gender: p.genero,
  };
}
