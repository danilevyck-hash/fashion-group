/**
 * Bulto size by product category.
 * Footwear = 12 units per bulto, Apparel/Accessories = 6 units per bulto.
 */
export function getBultoSize(category: string): number {
  return category === "footwear" ? 12 : 6;
}
