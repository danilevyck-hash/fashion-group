/**
 * Bulto size for Tommy Hilfiger products.
 * All Tommy products are footwear → 12 units per bulto (decisión Daniel
 * 24-jul-2026, paridad Joybees). Helper exists so future non-footwear
 * additions can branch by category.
 */
export function getBultoSize(_category?: string | null): number {
  return 12;
}
