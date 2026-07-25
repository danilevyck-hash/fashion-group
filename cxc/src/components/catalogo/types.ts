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
  is_preorder?: boolean;
}

export interface StockLinea {
  product_id: string;
  name: string;
  sku: string;
  pedido_bultos: number;
  pedido_pzas: number;
  disponible_pzas: number;
}
