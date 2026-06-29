export interface RItem {
  referencia: string;
  descripcion: string;
  talla: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  motivo: string;
  /** Men/Women/Kids/Accessories. "" = aún sin elegir (form nuevo); null en
   *  ítems históricos previos al campo. Obligatorio al crear/editar. */
  genero: string;
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

/** Foto seleccionada en el formulario ANTES de guardar el reclamo. Vive en estado
 *  local (preview con object URL) hasta que, al Guardar, se sube al reclamo recién
 *  creado. `status` da feedback real por foto (nunca un spinner colgado). */
export interface LocalFoto {
  localId: string;
  file: File;
  previewUrl: string;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
  uploaded?: Foto; // registro del server una vez subida (id/path para borrar)
}

export interface Contacto {
  id: string;
  empresa: string;
  nombre: string;
  nombre_contacto: string;
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
  reclamo_settlements?: Settlement[];
  /** Monto reclamado congelado al marcar Pagado (para % recuperado estable). */
  monto_reclamado_snapshot?: number | null;
  /** Comprobante del paso "En proceso": foto (obligatoria) + nota opcional. */
  comprobante_url?: string | null;
  comprobante_path?: string | null;
  comprobante_nota?: string | null;
  /** Path interno del PDF de factura en el bucket privado (1:1 con el reclamo). */
  factura_pdf_path?: string | null;
  /** Signed URL temporal (TTL 1h) del PDF de factura; solo lo arma el GET del detalle. */
  factura_pdf_url?: string | null;
}

/** Una recuperación / nota de crédito de un reclamo (settlement fraccionado). */
export interface Settlement {
  id: string;
  reclamo_id: string;
  monto: number;
  nota_credito: string | null;
  nota_credito_ccte_id: number | null;
  fecha: string;
  deleted?: boolean;
}

export type RView = "list" | "form" | "detail";
