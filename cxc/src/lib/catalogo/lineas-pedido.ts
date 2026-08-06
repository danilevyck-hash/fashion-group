// ─────────────────────────────────────────────────────────────────────────────
// LAS LÍNEAS DE UN PEDIDO, RESUELTAS UNA SOLA VEZ.
//
// 🩸 POR QUÉ EXISTE, Y POR QUÉ ES UN ARREGLO DE RAÍZ Y NO OTRO PARCHE.
//
// El cliente pide en BULTOS y todo lo demás —Switch, el total, el PDF, el
// correo— trabaja en PIEZAS. Esa multiplicación, `bultos × piezas_por_bulto`,
// estaba escrita **ocho veces**, y cada copia era responsable de ir a buscarse
// el multiplicador por su cuenta. Cada copia era una oportunidad de olvidarlo.
//
// Y se olvidó. Daniel marcó `FM0FM05537YBS` en 8 piezas (6-ago-2026), el
// catálogo mostró 8, y el pedido TOM-003 se guardó en **$456 = 12 × $38** y
// salió a Switch con **`cantidad: "12.0000"`**. Peor: yo lo "arreglé" una vez
// tocando el envío a Switch y lo di por cerrado — pero `enviarPedidoSwitch`
// tiene TRES llamadores y el que Daniel usa no era ese. Dos arreglos, el bug
// intacto. Daniel, textual: *"no quiero que arregles con parches, sino arreglos
// de raiz"*.
//
// La raíz no era ninguno de los ocho lugares: era que hubiera ocho. Acá la
// multiplicación ocurre **una vez**. Los consumidores ya no reciben items
// crudos con un multiplicador aparte; reciben líneas con `piezas` y `subtotal`
// ya calculados, y no tienen nada que multiplicar ni nada que olvidar.
//
// El candado que lo sostiene es `src/__tests__/lib/lineas-pedido.test.ts`:
// barre el código de catálogos y pone el build en ROJO si alguien vuelve a
// escribir `quantity * bultoSize(...)` fuera de este archivo. Sin ese barrido
// esto sería una novena copia, no una raíz.
//
// PURO, sin I/O: los dos mapas se los pasa quien llama (los arma
// `leerCategoriaYBulto`). Así se puede probar el dinero sin base de datos.
// ─────────────────────────────────────────────────────────────────────────────

/** Item tal como sale de la tabla de items o del carrito. */
export interface ItemCrudo {
  product_id?: string;
  sku?: string | null;
  name?: string | null;
  image_url?: string | null;
  /** SIEMPRE en bultos. */
  quantity?: number | null;
  unit_price?: number | string | null;
  is_preorder?: boolean | null;
  /** Si ya viene resuelta (item enriquecido), se respeta. */
  category?: string | null;
  /** Si ya viene resuelta, se respeta. */
  bulto_pzas?: number | null;
}

export interface LineaResuelta {
  product_id: string;
  sku: string;
  name: string;
  image_url: string;
  is_preorder: boolean;
  category: string | undefined;
  /** Piezas por bulto que se USARON. Queda escrito para poder auditar después. */
  bulto_pzas: number;
  bultos: number;
  piezas: number;
  unit_price: number;
  subtotal: number;
}

export interface ResumenPedido {
  /** Cuántos productos distintos. En el negocio se les dice "referencias". */
  referencias: number;
  bultos: number;
  piezas: number;
  total: number;
}

export interface ContextoLineas {
  /** `cfg.bultoSize` / `theme.bulto` de la marca. */
  bultoSize: (category?: string | null, bultoPzas?: number | null) => number;
  categoryByProduct?: Map<string, string>;
  bultoPzasByProduct?: Map<string, number | null>;
  /** Categoría a usar cuando el producto no trae ninguna (Reebok la necesita). */
  fallbackCategory?: string | null;
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Resuelve las líneas de un pedido: categoría, piezas por bulto, piezas y
 * subtotal. **Es el único lugar del sistema donde se multiplica por el bulto.**
 *
 * Lo que ya viene en el item gana sobre el mapa: un item enriquecido —o la foto
 * de un pedido viejo— tiene que seguir valiendo lo que valía, aunque el
 * producto se haya re-marcado después.
 */
export function resolverLineas(items: readonly ItemCrudo[], ctx: ContextoLineas): LineaResuelta[] {
  return (items ?? []).map((i) => {
    const pid = String(i.product_id ?? "");
    const category =
      i.category ?? ctx.categoryByProduct?.get(pid) ?? ctx.fallbackCategory ?? undefined;
    const bultoPzas = i.bulto_pzas ?? ctx.bultoPzasByProduct?.get(pid) ?? null;

    const bulto = ctx.bultoSize(category, bultoPzas);
    const bultos = num(i.quantity);
    const piezas = bultos * bulto;
    const unit_price = num(i.unit_price);

    return {
      product_id: pid,
      sku: String(i.sku ?? ""),
      name: String(i.name ?? ""),
      image_url: String(i.image_url ?? ""),
      is_preorder: i.is_preorder === true,
      category: category ?? undefined,
      bulto_pzas: bulto,
      bultos,
      piezas,
      unit_price,
      subtotal: piezas * unit_price,
    };
  });
}

/**
 * Totales del pedido. `referencias` = productos distintos, que es como lo dice
 * Daniel y como lo cuenta bodega al armarlo.
 */
export function resumirPedido(lineas: readonly LineaResuelta[]): ResumenPedido {
  return {
    referencias: new Set(lineas.map((l) => l.product_id || l.sku)).size,
    bultos: lineas.reduce((s, l) => s + l.bultos, 0),
    piezas: lineas.reduce((s, l) => s + l.piezas, 0),
    // Se redondea al centavo UNA vez, al final: sumar subtotales ya redondeados
    // arrastra el error línea por línea.
    total: Math.round(lineas.reduce((s, l) => s + l.subtotal, 0) * 100) / 100,
  };
}

/** Atajo: resolver y resumir de una. */
export function resumirDesdeItems(items: readonly ItemCrudo[], ctx: ContextoLineas): ResumenPedido {
  return resumirPedido(resolverLineas(items, ctx));
}
