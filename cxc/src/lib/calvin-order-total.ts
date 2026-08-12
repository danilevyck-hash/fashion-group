import { getBultoSize } from "./calvin-bulto";

export interface CalvinOrderItemForTotal {
  quantity: number;
  unit_price: number;
  category?: string;
  /** Piezas por bulto del estilo. Vacío = 12, el default de la marca. */
  bulto_pzas?: number | null;
}

/**
 * unit_price está guardado por pieza; el cliente compra por bulto. Calvin es
 * 100% calzado → bulto por producto (`bulto_pzas`, default 12 vía getBultoSize).
 * Fórmula única de total de pedidos Calvin, espejo de calculateTommyOrderTotal.
 */
export function calculateCalvinOrderTotal(items: CalvinOrderItemForTotal[]): number {
  if (!Array.isArray(items)) return 0;
  return items.reduce(
    (sum, item) => sum + item.quantity * getBultoSize(item.category, item.bulto_pzas) * item.unit_price,
    0,
  );
}
