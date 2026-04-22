// ============================================================================
// Marketing module — TypeScript types
// Alineado con supabase/migrations/marketing.sql
// ============================================================================

export const EMPRESA_CODIGOS = [
  "vistana",
  "fashion_wear",
  "fashion_shoes",
  "active_shoes",
  "active_wear",
  "confecciones_boston",
  "joystep",
] as const;

export type EmpresaCodigo = (typeof EMPRESA_CODIGOS)[number];

export type EstadoProyecto = "abierto" | "enviado" | "cobrado";

// Tipo de marca:
//   'externa' — hay contraparte (Tommy, Calvin, Reebok) con quien compartir 50/50.
//   'interna' — Fashion Group absorbe 100% del gasto (ej: Joybees).
// Las marcas internas no se mezclan con externas en un mismo proyecto/factura.
export type TipoMarca = "externa" | "interna";

export type TipoAdjunto =
  | "pdf_factura"
  | "foto_proyecto"
  | "foto_factura"
  | "otro";

// ----------------------------------------------------------------------------
// Filas base (una tabla → una interface)
// ----------------------------------------------------------------------------

export interface MkMarca {
  id: string;
  nombre: string;
  codigo: string;
  empresa_codigo: EmpresaCodigo;
  tipo: TipoMarca; // Default 'externa' si la columna aún no existe en DB.
  activo: boolean;
  created_at: string;
}

export interface MkProyecto {
  id: string;
  nombre: string | null;
  tienda: string;
  fecha_inicio: string; // DATE ISO "YYYY-MM-DD"
  fecha_cierre: string | null;
  estado: EstadoProyecto;
  // Timestamps de transición (migrados desde mk_cobranzas al refactor)
  fecha_enviado: string | null;
  fecha_cobrado: string | null;
  notas: string | null;
  anulado_en: string | null;
  anulado_motivo: string | null;
  created_at: string;
  updated_at: string;
}

export interface MkProyectoMarca {
  id: string;
  proyecto_id: string;
  marca_id: string;
  porcentaje: number;
}

export interface MkFacturaMarca {
  id: string;
  factura_id: string;
  marca_id: string;
  porcentaje: number;
  created_at: string;
}

export interface MkFactura {
  id: string;
  proyecto_id: string;
  numero_factura: string;
  fecha_factura: string;
  proveedor: string;
  concepto: string;
  subtotal: number;
  itbms: number;
  total: number;
  anulado_en: string | null;
  anulado_motivo: string | null;
  created_at: string;
  updated_at: string;
}

export interface MkAdjunto {
  id: string;
  proyecto_id: string | null;
  factura_id: string | null;
  tipo: TipoAdjunto;
  url: string;
  nombre_original: string | null;
  size_bytes: number | null;
  created_at: string;
}

// ----------------------------------------------------------------------------
// Tipos compuestos (joins + agregados)
// ----------------------------------------------------------------------------

export interface MarcaConPorcentaje {
  marca: MkMarca;
  porcentaje: number;
}

export interface ProyectoConMarcas extends MkProyecto {
  marcas: MarcaConPorcentaje[];
}

export interface FacturaConAdjuntos extends MkFactura {
  adjuntos: MkAdjunto[];
}


export interface ProyectoResumen extends MkProyecto {
  marcas: MarcaConPorcentaje[];
  total_facturado: number;
  total_cobrable_marca: number; // monto cobrable a la marca filtrada (si aplica)
  conteo_facturas: number;
  conteo_fotos: number;
}

export interface AnuladoItem {
  tipo: "proyecto" | "factura";
  id: string;
  nombre: string;
  anulado_en: string;
  anulado_motivo: string | null;
}

// ----------------------------------------------------------------------------
// Inputs DTO (para mutations)
// ----------------------------------------------------------------------------

export interface MarcaPorcentajeInput {
  marcaId: string;
  porcentaje: number;
}

export interface CreateProyectoInput {
  tienda: string;
  nombre?: string;
  notas?: string;
  marcas: MarcaPorcentajeInput[];
}

export interface UpdateProyectoInput {
  tienda?: string;
  nombre?: string | null;
  notas?: string | null;
  estado?: EstadoProyecto;
}

export interface CreateFacturaInput {
  proyectoId: string;
  numeroFactura: string;
  fechaFactura: string;
  proveedor: string;
  concepto: string;
  subtotal: number;
  itbms?: number;
}

export interface UpdateFacturaInput {
  numeroFactura?: string;
  fechaFactura?: string;
  proveedor?: string;
  concepto?: string;
  subtotal?: number;
  itbms?: number;
}

export interface CreateAdjuntoInput {
  proyectoId?: string;
  facturaId?: string;
  tipo: TipoAdjunto;
  url: string;
  nombreOriginal?: string;
  sizeBytes?: number;
}

