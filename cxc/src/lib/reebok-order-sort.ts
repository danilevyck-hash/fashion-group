// Orden canónico de items dentro de un pedido interno Reebok (reebok_orders):
//   1) categoria: footwear → apparel → accessories
//   2) dentro de cada categoria: SKU ascendente A→Z
// Items sin categoria resoluble (category nula o desconocida) van al final.
// Helper unico: usar en detalle, PDF y correo. No replicar la logica.

const CATEGORY_ORDER: Record<string, number> = {
  footwear: 0,
  apparel: 1,
  accessories: 2,
};

export interface ReebokSortableItem {
  category?: string | null;
  sku?: string | null;
}

export function sortReebokOrderItems<T extends ReebokSortableItem>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const ca = CATEGORY_ORDER[a.category ?? ""] ?? 99;
    const cb = CATEGORY_ORDER[b.category ?? ""] ?? 99;
    if (ca !== cb) return ca - cb;
    return (a.sku ?? "").localeCompare(b.sku ?? "");
  });
}
