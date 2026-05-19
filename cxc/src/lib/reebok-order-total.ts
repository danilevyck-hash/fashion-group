import { getBultoSize } from "./reebok-bulto";

export interface ReebokOrderItemForTotal {
  quantity: number;
  unit_price: number;
  category?: string;
}

/**
 * unit_price está guardado por pieza; el cliente compra por bulto
 * (footwear=12, apparel/accessories=6). Esta es la única fórmula de total
 * para pedidos públicos Reebok.
 */
export function calculateReebokOrderTotal(items: ReebokOrderItemForTotal[]): number {
  if (!Array.isArray(items)) return 0;
  return items.reduce(
    (sum, item) =>
      sum + item.quantity * getBultoSize(item.category || "footwear") * item.unit_price,
    0
  );
}
