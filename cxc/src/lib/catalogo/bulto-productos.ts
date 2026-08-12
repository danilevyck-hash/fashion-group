// ─────────────────────────────────────────────────────────────────────────────
// Categoría y PIEZAS POR BULTO de los productos de un pedido — un solo lugar.
//
// 🩸 EL BUG QUE ESTO EVITA (6-ago-2026). Daniel marcó `FM0FM05537YBS` en 8
// piezas, el catálogo mostró 8, agregó 1 bulto… y el pedido TOM-003 se guardó
// en **$456 (12 × $38)** y el payload a Switch salió con **`cantidad: "12.0000"`**.
// Debía ser $304 y 8.
//
// La causa no fue el cálculo: fue que la MISMA consulta estaba escrita seis
// veces —`select("id, category")` en el checkout, en el envío a Switch, en el
// PDF, en el correo, en la confirmación del pedido público— y arreglar una no
// arreglaba las otras. Yo mismo arreglé la del envío y di el tema por cerrado;
// el checkout, que es el camino que Daniel usa, siguió mandando 12.
//
// Por eso acá se leen las DOS cosas juntas: quien necesita la categoría para el
// bulto necesita también las piezas, siempre. Pedir una sin la otra es el bug.
//
// ⚠️ Esto es el camino del DINERO: Switch trabaja en PIEZAS y el pedido en
// bultos, así que el tamaño equivocado factura de más o de menos, y encima
// queda escrito en el total del pedido.
// ─────────────────────────────────────────────────────────────────────────────

/** Cliente Supabase mínimo — el tipo real varía por marca. */
interface DbLike {
  from(table: string): {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    select(cols: string): { in(col: string, values: string[]): Promise<{ data: any; error: { message?: string } | null }> };
  };
}

export interface MapasDeBulto {
  /** product_id → category (para las marcas que ramifican por categoría). */
  categoryByProduct: Map<string, string>;
  /** product_id → piezas por bulto guardadas. `null` = el default de la marca. */
  bultoPzasByProduct: Map<string, number | null>;
}

/**
 * Lee categoría + piezas por bulto de los productos de un pedido.
 *
 * ⚠️ FALLBACK PRE-MIGRACIÓN: `bulto_pzas` (Tommy) puede no existir todavía —el
 * DDL 20260806120000 lo corre Daniel a mano—. Si falta, se relee sin ella y la
 * marca cae en su default: el pedido sale como salía antes en vez de quedarse
 * trabado. Solo se reintenta cuando el error NOMBRA la columna; ante cualquier
 * otro error se devuelven mapas vacíos, que también degradan al default.
 */
export async function leerCategoriaYBulto(
  db: DbLike,
  productsTable: string,
  productIds: string[],
): Promise<MapasDeBulto> {
  const vacio: MapasDeBulto = { categoryByProduct: new Map(), bultoPzasByProduct: new Map() };
  const ids = [...new Set(productIds.filter(Boolean))];
  if (ids.length === 0) return vacio;

  const leer = (cols: string) => db.from(productsTable).select(cols).in("id", ids);
  let { data, error } = await leer("id, category, bulto_pzas");
  if (error?.message?.includes("bulto_pzas")) {
    ({ data, error } = await leer("id, category"));
  }
  if (error || !data) return vacio;

  const filas = data as Array<{ id: string; category: string | null; bulto_pzas?: number | null }>;
  return {
    categoryByProduct: new Map(filas.map((p) => [String(p.id), p.category ?? ""])),
    bultoPzasByProduct: new Map(filas.map((p) => [String(p.id), p.bulto_pzas ?? null])),
  };
}

/**
 * PRECIO DE LISTA del catálogo por producto (`<marca>_products.price`).
 *
 * 🩸 Para qué: la pantalla del pedido avisa INLINE cuando el precio editado a
 * mano difiere del de lista (`15 ← lista $16.50`). Daniel lo pidió mirando la
 * tabla mientras editaba: *"porque lo cazaria en ese modal y no antes? en esta
 * foto la hubiese cazado no?"*. El precio de lista YA está en la base local
 * —el catálogo se alimenta de Switch— así que el aviso NO cuesta una llamada
 * al ERP: es una lectura más de la misma tabla que ya se consulta.
 *
 * Va aparte de `leerCategoriaYBulto` a propósito: esa función existe para que
 * nadie pida la categoría sin las piezas (ver la cabecera), y el precio no
 * forma parte de ese par. Mezclarlos obligaría a tocar su cadena de fallbacks,
 * que es el camino del dinero.
 *
 * FAIL-OPEN: cualquier error devuelve un mapa vacío → no se muestra el aviso.
 * Un precio de lista que no se pudo leer no puede inventar una diferencia.
 */
export async function leerPreciosLista(
  db: DbLike,
  productsTable: string,
  productIds: string[],
): Promise<Map<string, number>> {
  const ids = [...new Set(productIds.filter(Boolean))];
  if (ids.length === 0) return new Map();
  try {
    const { data, error } = await db.from(productsTable).select("id, price").in("id", ids);
    if (error || !data) return new Map();
    const filas = data as Array<{ id: string; price: number | string | null }>;
    const out = new Map<string, number>();
    for (const f of filas) {
      const n = Number(f.price);
      if (Number.isFinite(n) && n > 0) out.set(String(f.id), n);
    }
    return out;
  } catch {
    return new Map();
  }
}
