export interface GuiaItem {
  id?: string;
  orden: number;
  cliente: string;
  direccion: string;
  empresa: string;
  facturas: string;
  bultos: number;
  numero_guia_transp: string;
}

export type ModoEntrega = "transportista" | "entrega_directa";

export interface Guia {
  id: string;
  numero: number;
  fecha: string;
  // Display label resuelto por la API (transportistaLabel). Optional porque
  // las respuestas pueden venir sin él si el JOIN falla; el form ya no lo
  // escribe en DB — usa modo_entrega + transportista_id.
  transportista?: string;
  modo_entrega?: ModoEntrega;
  transportista_id?: string | null;
  placa: string;
  observaciones: string;
  total_bultos: number;
  item_count: number;
  monto_total: number;
  estado: string;
  receptor_nombre?: string;
  cedula?: string;
  firma_base64?: string;
  firma_entregador_base64?: string;
  entregado_por?: string;
  numero_guia_transp?: string;
  tipo_despacho?: string;
  nombre_chofer?: string;
  guia_items?: GuiaItem[];
}

export interface Transportista {
  id: string;
  nombre: string;
  activo: boolean;
}

export type View = "list" | "form" | "print";
