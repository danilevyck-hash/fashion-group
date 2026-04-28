/**
 * Bulto size for Joybees products.
 * All Joybees products are footwear → 12 units per bulto.
 * Helper exists so future non-footwear additions can branch by category.
 */
export function getBultoSize(_category?: string): number {
  return 12;
}
