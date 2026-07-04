import { getBultoSize } from "./joybees-bulto";

export interface JoybeesOrderItemForTotal {
  quantity: number;
  unit_price: number;
}

/**
 * unit_price está guardado por pieza; el cliente compra por bulto. Joybees es
 * 100% footwear → bulto = 12 (getBultoSize). Fórmula única de total de pedidos
 * Joybees, espejo de calculateReebokOrderTotal pero sin category (todo bulto 12).
 */
export function calculateJoybeesOrderTotal(items: JoybeesOrderItemForTotal[]): number {
  if (!Array.isArray(items)) return 0;
  return items.reduce(
    (sum, item) => sum + item.quantity * getBultoSize() * item.unit_price,
    0,
  );
}
