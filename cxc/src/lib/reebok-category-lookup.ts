import { reebokServer } from "@/lib/reebok-supabase-server";
import { inEnTandas } from "@/lib/supabase-paginado";

/**
 * Devuelve un Map<product_id, category> consultando la tabla `products`
 * del Supabase de Reebok, en tandas (con ~640 ids la base contesta Bad Request).
 *
 * Para items cuyo product_id no esté en `products` (producto borrado o sku
 * sin match), no habrá entry en el Map. Los consumidores deben aplicar un
 * fallback seguro de 6 en vez de asumir 12, para no inflar el cobro: un
 * renglón VIEJO (sin bulto escrito) lee el fallback `apparel` con la regla de
 * entonces (6), y uno NUEVO sin categoría conocida se escribe de 6
 * (`bultoReebokNuevo`). La ropa con categoría va de 12 desde el 15-nov-2026.
 *
 * 🔴 Un error de lectura SE LANZA: antes se ignoraba y todo el pedido caía al
 * fallback de 6 en silencio, cambiando el cobro sin que nadie se enterara.
 */
export async function fetchReebokCategoryMap(
  productIds: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const unique = [...new Set(productIds.filter((id): id is string => !!id))];
  if (unique.length === 0) return new Map();
  const { data, error } = await inEnTandas<{ id: string; category: string }>(unique, (tanda) =>
    reebokServer.from("products").select("id, category").in("id", tanda),
  );
  if (error) throw new Error(`products (categoría Reebok): ${error.message}`);
  return new Map((data || []).map((p) => [p.id as string, p.category as string]));
}
