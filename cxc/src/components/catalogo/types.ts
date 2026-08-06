// Tipos compartidos de la capa UI del motor de catálogos (PR-2).
// `CatalogoProducto` es el SUPERSET estructural de los productos de las marcas:
// products de Reebok (components/reebok/supabase.Product) y joybees_products
// (groupByModel.JoybeesProduct) le asignan sin cast. Los campos por-marca son
// opcionales; cada componente lee solo lo que su feature flag habilita.

export interface CatalogoProducto {
  id: string;
  sku: string | null;
  name: string;
  price: number | null;
  image_url: string | null;
  category?: string;
  gender?: string | null;
  sub_category?: string | null;
  color?: string | null;
  badge?: string | null;
  description?: string | null;
  active?: boolean;
  on_sale?: boolean;
  created_at?: string;
  /** Joybees: stock en la fila del producto. */
  stock?: number;
  popular?: boolean;
  is_regalia?: boolean;
  /**
   * Tommy: piezas por bulto de ESTE estilo. Vacío = 12 (el default de la
   * marca). Sus bultos vienen de 8 o de 12 y no hay fuente de la que sacarlo
   * —ver `tommy-bulto.ts`—, por eso viaja pegado al producto.
   */
  bulto_pzas?: number | null;
  /** Reebok: stock desde Switch (pueden ser null pre-sync). */
  existencia?: number | null;
  disponibilidad?: number | null;
  /** Anotaciones del grid Reebok (suma de inventory por talla). */
  _stock?: number;
  _sizes?: string[];
}

export interface CatalogoCartItem {
  product_id: string;
  sku: string;
  name: string;
  image_url: string;
  quantity: number;
  unit_price: number;
  category?: string;
  /**
   * Tommy: piezas por bulto del estilo, copiadas del producto al agregarlo.
   * Viaja EN LA LÍNEA y no se vuelve a leer del producto: el carrito tiene que
   * seguir cotizando lo mismo aunque el estilo se re-marque mientras el cliente
   * arma el pedido.
   */
  bulto_pzas?: number | null;
  is_preorder?: boolean;
}

/** Foto del stock de UNA línea en el momento de confirmar el pedido del link
 *  (espejo de StockLineaCorta en lib/catalogo/confirmar-pedido). */
export interface StockLinea {
  product_id: string;
  name: string;
  sku: string;
  pedido_bultos: number;
  pedido_pzas: number;
  disponible_pzas: number;
  /** Piezas por bulto usadas al confirmar (Reebok 12/6, Joybees/Tommy 12). */
  bulto_pzas?: number;
}
