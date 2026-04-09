export interface RItem {
  referencia: string;
  descripcion: string;
  talla: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  motivo: string;
  nro_factura: string;
  nro_orden_compra: string;
}

export interface Seguimiento {
  id: string;
  nota: string;
  autor: string;
  created_at: string;
}

export interface Foto {
  id: string;
  storage_path: string;
  url: string;
}

export interface Contacto {
  id: string;
  empresa: string;
  nombre: string;
  nombre_contacto: string;
  whatsapp: string;
  correo: string;
}

export interface Reclamo {
  id: string;
  nro_reclamo: string;
  empresa: string;
  proveedor: string;
  marca: string;
  nro_factura: string;
  nro_orden_compra: string;
  fecha_reclamo: string;
  estado: string;
  notas: string;
  created_at: string;
  updated_at?: string;
  reclamo_items?: RItem[];
  reclamo_seguimiento?: Seguimiento[];
  reclamo_fotos?: Foto[];
}

export type RView = "list" | "form" | "detail";
