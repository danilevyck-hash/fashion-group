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

// Estados de la UI: solo abierto / cerrado.
// 'cerrado' es el valor nuevo (CHECK ampliado). Los proyectos legacy en
// 'enviado'/'cobrado' siguen en DB y se LEEN como 'cerrado' vía
// normalizarEstadoProyecto() (nunca se reescriben). Al cerrar desde la UI se
// escribe 'cerrado'; al reabrir, 'abierto'.
export type EstadoProyecto = "abierto" | "cerrado";

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
  // Zona libre: si true, total = subtotal × 1.15 (ITBMS forzado a 0).
  // Si false, total = subtotal + itbms (comportamiento clásico).
  tiene_importacion: boolean;
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
  // Empresa interna del grupo que paga el otro 50% (mk_factura_marcas).
  // null para marcas internas (Joybees) o filas legacy sin backfill.
  // Ausente para mk_proyecto_marcas (legacy) — esa tabla no tiene la columna.
  empresa_pagadora_codigo?: string | null;
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
  // Empresa interna del grupo que paga el otro 50% (override del default
  // mk_marcas.empresa_codigo). Marcas internas (Joybees) lo ignoran.
  empresaPagadoraCodigo?: string | null;
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
  fecha_inicio?: string; // "YYYY-MM-DD"
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
  tieneImportacion?: boolean;
}

export interface UpdateFacturaInput {
  numeroFactura?: string;
  fechaFactura?: string;
  proveedor?: string;
  concepto?: string;
  subtotal?: number;
  itbms?: number;
  tieneImportacion?: boolean;
}

export interface CreateAdjuntoInput {
  proyectoId?: string;
  facturaId?: string;
  tipo: TipoAdjunto;
  url: string;
  nombreOriginal?: string;
  sizeBytes?: number;
}

// ----------------------------------------------------------------------------
// Inventario de muebles + entregas por proyecto
// ----------------------------------------------------------------------------
// Modelo plano: productos con stock_total disponible (no histórico). Cada
// entrega tiene N items (una fila por producto entregado) con un array
// `reparto` de tuplas (marca_id, empresa_codigo, cantidad).
//
// Reglas de reparto:
//   - Marca externa (Tommy/Calvin/Reebok): 50/50 entre marca y empresa_codigo
//     pagadora interna. La empresa default = mk_marcas.empresa_codigo pero
//     se puede override por entrega/item.
//   - Marca interna (Joybees): 100% va a la marca, empresa interna no aplica.
// El monto de la entrega se SUMA al total del proyecto sin línea separada.

export interface MkInventarioProducto {
  id: string;
  nombre: string;
  precio: number;
  stock_total: number; // unidades disponibles ahora mismo (no histórico).
  created_at: string;
  updated_at: string;
}

// Tupla en jsonb `reparto`: marca + empresa pagadora interna + cantidad.
// `empresa` es codigo string ('fashion_wear', 'vistana', etc.) o null si
// la marca es interna (no aplica empresa pagadora).
export interface RepartoItemEntry {
  marca_id: string;
  empresa: string | null;
  cantidad: number;
}

export interface MkEntregaItem {
  id: string;
  entrega_id: string;
  producto_id: string;
  reparto: RepartoItemEntry[];
  // DERIVADO al mapear desde la DB: agrega cantidades por marca_id.
  // No persiste en la tabla (la columna fue eliminada en el schema 2026-05).
  // Existe solo como compat para callers que aún leen el shape viejo.
  cantidad_por_marca: Record<string, number>;
  precio_unitario: number;
  created_at: string;
}

export interface MkEntregaMuebles {
  id: string;
  proyecto_id: string | null; // NULLABLE: entregas pendientes sin asignar
  total: number;
  // {"<marca_id>": <monto>} — claves son marca_id (uuid string).
  // Marcas externas reciben 50% de su parte; Joybees recibe 100%.
  total_por_marca: Record<string, number>;
  // {"<empresa_codigo>": <monto>} — claves son empresa_codigo (text key
  // de companies.ts). Suma del 50% interno de cada item externo.
  // Joybees no contribuye aquí (su 100% va completo a total_por_marca).
  total_por_empresa_interna: Record<string, number>;
  notas: string | null;
  created_at: string;
  updated_at: string;
}

export interface EntregaConItems extends MkEntregaMuebles {
  items: MkEntregaItem[];
}

// Inputs (mutations)
// Cada item viene con un array de tuplas {marcaId, empresa, cantidad}.
// `empresa` puede ser null (Joybees) o un codigo string para overrides
// (ej: marca Tommy con empresa "fashion_shoes" en vez del default).
// Si `empresa` es undefined, el backend lo deriva de marca.empresa_codigo.
export interface RepartoItemInput {
  marcaId: string;
  empresa?: string | null;
  cantidad: number;
}

export interface EntregaItemInput {
  productoId: string;
  // Shape nuevo (preferido).
  reparto?: RepartoItemInput[];
  // Compat shape legacy {"<marca_id>": <cantidad>}; el backend lo convierte
  // a `reparto` al recibir el body. Mantener mientras migramos UIs.
  cantidadPorMarca?: Record<string, number>;
}

export interface CreateEntregaInput {
  proyectoId?: string | null;
  items: EntregaItemInput[];
  notas?: string | null;
}

export interface UpdateEntregaInput {
  items: EntregaItemInput[];
  notas?: string | null;
}

export interface CreateProductoInput {
  nombre: string;
  precio: number;
  stockTotal: number;
}

export interface UpdateProductoInput {
  nombre?: string;
  precio?: number;
  stockTotal?: number;
}

