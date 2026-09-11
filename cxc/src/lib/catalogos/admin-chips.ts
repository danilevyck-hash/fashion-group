// ─────────────────────────────────────────────────────────────────────────────
// UNA sola fila de chips para la pantalla «Administrar» de los catálogos
// (6-sep-2026). Módulo PURO: sin React, sin red, sin Supabase.
//
// 🩸 Antes había CINCO tarjetas arriba —`232 Productos · 0 Sin foto · 162
// Footwear · 54 Apparel · 16 Accessories`— y justo debajo los MISMOS números
// otra vez, como chips de filtro. Los mismos datos, dos veces, y en inglés.
//
// Ahora es una fila y nada más:
//
//     Todos 232 · Calzado 162 · Ropa 54 · Accesorios 16 · Sin foto 0 · Escondidos 1
//
// 🔴 LOS NÚMEROS SE CALCULAN, NUNCA SE ESCRIBEN A MANO.
// 🔴 LOS NOMBRES DE CATEGORÍA SALEN DEL MAPA QUE YA EXISTE POR MARCA
//    (`theme.filtros.categoryOptions`, el MISMO que usa el catálogo público),
//    no de una traducción escrita en la pantalla. Reebok ya lo tiene en
//    español (Calzado · Ropa · Accesorios); Tommy y Calvin lo tienen en el
//    vocabulario de Switch a propósito (ver `tommy-nombres.ts`), y eso no se
//    toca desde acá: dos listas para la misma pregunta terminan diciendo cosas
//    distintas.
//
// ⚠️ Joybees no tiene columna de categoría (`categoryOptions` está vacía), así
// que su fila queda en `Todos · Sin foto · Escondidos`. Es lo mismo que ya
// pasaba en su filtro: no se le inventa una clasificación.
// ─────────────────────────────────────────────────────────────────────────────

/** Lo mínimo que un producto necesita para contar en un chip. */
export interface ProductoDeChip {
  image_url?: string | null;
  /** Toggle «Esconder» del admin. `true` = escondido a mano. */
  oculto_manual?: boolean | null;
  /** Lo que el sync decidió (`false` = apagado por Switch, o escondido a mano). */
  active?: boolean | null;
}

/**
 * ¿Este producto entra a la pantalla de administrar?
 *
 * Lo que el sync APAGÓ (`active = false` sin esconder) no: no está en el
 * catálogo y no hay nada que administrarle. Lo ESCONDIDO A MANO sí, aunque
 * esconder también apague `active`.
 *
 * 🩸 Hasta el 11-sep-2026 la pantalla filtraba `active !== false` a secas, y
 * como esconder pone `active = false` Y `oculto_manual = true`, tiraba las dos
 * cosas juntas: el chip «Escondidos» daba siempre 0, nunca se dibujaba y
 * «Mostrar» era código inalcanzable. 25 productos (Tommy 16 · Calvin 6 ·
 * Joybees 2 · Reebok 1) solo volvían tocando la base a mano.
 */
export function seAdministra(p: ProductoDeChip): boolean {
  return p.active !== false || estaEscondido(p);
}

export interface OpcionCategoria {
  value: string;
  label: string;
}

export interface ChipAdmin {
  key: string;
  label: string;
  count: number;
}

export const CHIP_TODOS = "todos";
export const CHIP_SIN_FOTO = "sin-foto";
export const CHIP_ESCONDIDOS = "escondidos";
/** Los chips de categoría van prefijados para no chocar con los tres de arriba. */
export const PREFIJO_CATEGORIA = "cat:";

/** ¿Está escondido a mano? Una sola definición para toda la pantalla. */
export function estaEscondido(p: ProductoDeChip): boolean {
  return p.oculto_manual === true;
}

/** ¿Tiene foto puesta? Una sola definición para toda la pantalla. */
export function tieneFoto(p: ProductoDeChip): boolean {
  return !!(p.image_url && p.image_url.trim());
}

/**
 * Las categorías del tema, sin la opción «Todos» (que en el desplegable era el
 * valor vacío y acá es su propio chip). Se DERIVA de la lista del catálogo: si
 * mañana el público gana una categoría, este chip aparece solo.
 */
export function categoriasDeLaMarca(categoryOptions: readonly OpcionCategoria[]): OpcionCategoria[] {
  return categoryOptions.filter((o) => o.value !== "");
}

/**
 * La fila entera, con el número adentro de cada chip.
 *
 * - «Todos» y las categorías cuentan lo VISIBLE (lo escondido no ensucia el
 *   número que se usa para trabajar).
 * - «Sin foto» sale siempre, aunque valga 0: es la cola de trabajo del módulo y
 *   ver el 0 es la confirmación de que está al día.
 * - «Escondidos» sale SOLO si hay alguno — un chip que al tocarlo deja la lista
 *   vacía no es un filtro, es un callejón.
 */
export function chipsDelCatalogo<T extends ProductoDeChip>(
  productos: readonly T[],
  categorias: readonly OpcionCategoria[],
  categoriaDe: (p: T) => string | null | undefined,
): ChipAdmin[] {
  const visibles = productos.filter((p) => !estaEscondido(p));
  const escondidos = productos.length - visibles.length;

  const chips: ChipAdmin[] = [{ key: CHIP_TODOS, label: "Todos", count: visibles.length }];
  for (const c of categorias) {
    chips.push({
      key: PREFIJO_CATEGORIA + c.value,
      label: c.label,
      count: visibles.filter((p) => (categoriaDe(p) ?? "") === c.value).length,
    });
  }
  chips.push({
    key: CHIP_SIN_FOTO,
    label: "Sin foto",
    count: visibles.filter((p) => !tieneFoto(p)).length,
  });
  if (escondidos > 0) {
    chips.push({ key: CHIP_ESCONDIDOS, label: "Escondidos", count: escondidos });
  }
  return chips;
}

/**
 * ¿Este producto entra en el chip elegido?
 *
 * 🔴 ESCONDER SIGUE SIENDO ESCONDER: lo escondido a mano NO aparece en ningún
 * chip salvo en «Escondidos». Ni en «Todos», ni en una categoría, ni en «Sin
 * foto» — que es justo donde un escondido sin foto se colaría a que alguien le
 * suba una foto y lo devuelva al catálogo sin querer.
 */
export function pasaElChip<T extends ProductoDeChip>(
  p: T,
  chip: string,
  categoriaDe: (p: T) => string | null | undefined,
): boolean {
  if (chip === CHIP_ESCONDIDOS) return estaEscondido(p);
  if (estaEscondido(p)) return false;
  if (chip === CHIP_SIN_FOTO) return !tieneFoto(p);
  if (chip.startsWith(PREFIJO_CATEGORIA)) {
    return (categoriaDe(p) ?? "") === chip.slice(PREFIJO_CATEGORIA.length);
  }
  return true;
}

/**
 * El chip que viene de la URL, validado contra los que HOY existen. Un valor
 * viejo o inventado —`?ver=escondidos` cuando ya no queda ninguno— cae en
 * «Todos», nunca en una pantalla vacía sin explicación.
 */
export function chipValido(bruto: string | null | undefined, chips: readonly ChipAdmin[]): string {
  const v = (bruto ?? "").trim();
  return chips.some((c) => c.key === v) ? v : CHIP_TODOS;
}
