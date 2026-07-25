import { getBultoSize } from "./tommy-bulto";

export interface TommyOrderItemForTotal {
  quantity: number;
  unit_price: number;
}

/**
 * unit_price está guardado por pieza; el cliente compra por bulto. Tommy es
 * 100% calzado → bulto = 12 (getBultoSize). Fórmula única de total de pedidos
 * Tommy, espejo de calculateJoybeesOrderTotal (sin category, todo bulto 12).
 */
export function calculateTommyOrderTotal(items: TommyOrderItemForTotal[]): number {
  if (!Array.isArray(items)) return 0;
  return items.reduce(
    (sum, item) => sum + item.quantity * getBultoSize() * item.unit_price,
    0,
  );
}
