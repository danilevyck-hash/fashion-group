export interface GuiaItem {
  id?: string;
  // Identidad ESTABLE de la fila mientras el formulario está abierto. No existe
  // en la base: la genera el cliente y la API la ignora (arma sus filas campo
  // por campo). Sirve para dos cosas que el índice de posición hacía mal:
  //   1. el `key` de React — con `key={idx}` borrar una fila hace que React
  //      reuse el DOM de la de abajo y el texto salta de fila;
  //   2. las marcas de "campo tocado" y los errores de validación, que con
  //      `item-<idx>-campo` se quedaban pegados a la fila equivocada al borrar.
  uid?: string;
  orden: number;
  cliente: string;
  // Código del cliente en el directorio (clientes_master), formato D-XXX.
  // "" / undefined = línea "sin vincular" (texto libre conservado en `cliente`).
  cliente_codigo?: string;
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
  motivo_rechazo?: string;
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
