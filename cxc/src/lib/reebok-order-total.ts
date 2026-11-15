import { getBultoSize } from "./reebok-bulto";

export interface ReebokOrderItemForTotal {
  quantity: number;
  unit_price: number;
  category?: string;
  /** El bulto escrito en el renglón (desde el 15-nov-2026). Manda si viene. */
  bulto_pzas?: number | null;
}

/**
 * unit_price está guardado por pieza; el cliente compra por bulto
 * (el escrito en el renglón; sin él, footwear=12 y lo demás 6 — la regla
 * con la que se pidió todo renglón viejo). Esta es la única fórmula de total
 * para pedidos públicos Reebok.
 */
export function calculateReebokOrderTotal(items: ReebokOrderItemForTotal[]): number {
  if (!Array.isArray(items)) return 0;
  return items.reduce(
    (sum, item) =>
      sum + item.quantity * getBultoSize(item.category || "footwear", item.bulto_pzas) * item.unit_price,
    0
  );
}
