import { reebokServer } from "@/lib/reebok-supabase-server";

/**
 * Devuelve un Map<product_id, category> consultando la tabla `products`
 * del Supabase de Reebok en una sola query batch.
 *
 * Para items cuyo product_id no esté en `products` (producto borrado o sku
 * sin match), no habrá entry en el Map. Los consumidores deben aplicar un
 * fallback seguro (apparel=6) en vez de asumir footwear=12, para evitar
 * inflar el cobro al cliente.
 */
export async function fetchReebokCategoryMap(
  productIds: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const unique = [...new Set(productIds.filter((id): id is string => !!id))];
  if (unique.length === 0) return new Map();
  const { data } = await reebokServer
    .from("products")
    .select("id, category")
    .in("id", unique);
  return new Map((data || []).map((p) => [p.id as string, p.category as string]));
}
